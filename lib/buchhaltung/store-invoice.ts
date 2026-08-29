/**
 * Erzeugt idempotent eine `invoices`-Row fuer eine Buchung, sodass die
 * "Alle Rechnungen"-Liste in /admin/buchhaltung gefuellt ist.
 *
 * Hintergrund: Die Rechnungs-PDF wird on-the-fly aus der bookings-Row
 * generiert (siehe /api/invoice/[bookingId]), aber bisher gab es keinen
 * persistenten Datensatz in `invoices`. Folge: die "Alle Rechnungen"-
 * Liste war leer, Mahn-/Bezahlt-Workflows konnten nicht greifen.
 *
 * Idempotent ueber UNIQUE-Constraint auf invoice_number → mehrfaches
 * Anlegen derselben Rechnung schlaegt mit 23505 fehl und wird hier als
 * "schon vorhanden" interpretiert.
 *
 * Rechnungsnummer-Format: `RE-YYWW-NNN` (analog zur Buchungsnummer),
 * abgeleitet vom Booking-ID-Prefix-Replace (C2R / BK / TEST-C2R → RE).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBerlinDateString } from '@/lib/timezone';

export interface BookingForInvoice {
  id: string;
  customer_email?: string | null;
  customer_name?: string | null;
  price_total?: number | null;
  price_rental?: number | null;
  price_accessories?: number | null;
  price_haftung?: number | null;
  shipping_price?: number | null;
  discount_amount?: number | null;
  duration_discount?: number | null;
  loyalty_discount?: number | null;
  coupon_code?: string | null;
  payment_intent_id?: string | null;
  status?: string | null;
  is_test?: boolean | null;
  created_at?: string | null;
}

export function deriveInvoiceNumber(bookingId: string): string {
  return bookingId.replace(/^(TEST-C2R|C2R|BK)-/, 'RE-');
}

/**
 * Legt die invoices-Row an. Falls bereits vorhanden, no-op.
 * Returns true wenn neu angelegt, false wenn schon da.
 */
export async function storeInvoiceForBooking(
  supabase: SupabaseClient,
  booking: BookingForInvoice,
  opts?: { taxMode?: 'kleinunternehmer' | 'regelbesteuerung'; taxRate?: number },
): Promise<boolean> {
  const invoiceNumber = deriveInvoiceNumber(booking.id);
  const gross = Number(booking.price_total ?? 0);
  if (gross <= 0) return false;

  const taxMode = opts?.taxMode ?? 'kleinunternehmer';
  const taxRate = opts?.taxRate ?? 0;
  const isRegel = taxMode === 'regelbesteuerung' && taxRate > 0;
  const net = isRegel ? Math.round((gross / (1 + taxRate / 100)) * 100) / 100 : gross;
  const tax = isRegel ? Math.round((gross - net) * 100) / 100 : 0;

  // Zahlstatus: Eine Buchung gilt nur dann als bezahlt, wenn weder der
  // payment_intent_id-Prefix noch der Buchungs-Status auf "Zahlung steht noch
  // aus" hindeuten. Konkret unbezahlt:
  //  - MANUAL-UNPAID-...  → manuelle Buchung mit Ueberweisung, noch nicht eingegangen
  //  - PENDING-...        → Express-Signup / verificationDeferred, Stripe lief nie
  //  - Booking-Status awaiting_payment / pending_verification → Stripe-Webhook
  //    hat die Zahlung noch nicht bestaetigt (Payment-Link, 3DS, etc.)
  // Ohne den Status-Check landeten `pending_verification`-Buchungen bisher
  // ueber den Backfill faelschlich als "paid" in der invoices-Tabelle.
  //
  // CHECK-Constraint auf invoices.status erlaubt nur ('paid','open','overdue',
  // 'cancelled','partially_paid'); payment_status nur ('open','paid','overdue',
  // 'cancelled','partial'). 'unpaid'/'sent' sind NICHT erlaubt — daher 'open'.
  const piId = (booking.payment_intent_id ?? '').toString();
  const bookingStatus = (booking.status ?? '').toString().toLowerCase();
  const isExplicitUnpaid = /MANUAL-UNPAID/i.test(piId);
  const isPendingPrefix = /^PENDING-/i.test(piId);
  const isAwaitingStatus = bookingStatus === 'awaiting_payment' || bookingStatus === 'pending_verification';
  const isUnpaid = isExplicitUnpaid || isPendingPrefix || isAwaitingStatus;
  const paymentStatus = isUnpaid ? 'open' : 'paid';
  const status = isUnpaid ? 'open' : 'paid';

  // payment_method aus payment_intent_id ableiten
  const paymentMethod = piId.startsWith('pi_')
    ? 'Kreditkarte via Stripe'
    : piId.startsWith('MANUAL-UNPAID-')
      ? 'Überweisung ausstehend'
      : piId.startsWith('MANUAL-')
        ? 'Bar / Sonstige'
        : piId.startsWith('PENDING-')
          ? 'Zahlung ausstehend'
          : 'Stripe';

  // Rechnungsdatum in Berlin-Zeit — `created_at` ist ein UTC-Timestamp. Das
  // rohe slice(0,10) haette eine Buchung vom 01.03. 00:30 Berlin (= 28.02.
  // 23:30 UTC) auf den Vormonat datiert; das PDF zeigt das Berliner Datum.
  const invoiceDate = getBerlinDateString(
    booking.created_at ? new Date(booking.created_at) : new Date(),
  );

  try {
    const { error } = await supabase.from('invoices').insert({
      booking_id: booking.id,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      net_amount: net,
      tax_amount: tax,
      gross_amount: gross,
      tax_mode: taxMode,
      tax_rate: taxRate,
      status,
      payment_status: paymentStatus,
      paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
      payment_method: paymentMethod,
      sent_to_email: booking.customer_email ?? null,
      is_test: booking.is_test === true,
    });
    if (error) {
      // 23505 = unique violation → schon vorhanden, kein Fehler
      if (error.code === '23505') return false;
      console.error('[store-invoice] Insert fehlgeschlagen:', error.message, { bookingId: booking.id });
      return false;
    }
    return true;
  } catch (err) {
    console.error('[store-invoice] Unerwarteter Fehler:', err, { bookingId: booking.id });
    return false;
  }
}

/**
 * Haelt die `invoices`-Zeile einer Buchung betragsmaessig aktuell.
 *
 * `storeInvoiceForBooking` legt die Zeile nur EINMAL an. Aendert sich der
 * Buchungsbetrag danach (Verlaengerung, Bestellbearbeitung), blieb der alte
 * Betrag stehen — Umsatzliste, Offene Posten und Mahnwesen rechneten mit
 * veralteten Zahlen. Diese Funktion zieht Netto/Steuer/Brutto nach.
 *
 * Zahlstatus, Rechnungsnummer und -datum bleiben unangetastet. Stornierte
 * Rechnungen werden nicht angefasst. Best-effort — wirft nie.
 */
export async function syncInvoiceAmountForBooking(
  supabase: SupabaseClient,
  booking: BookingForInvoice,
  opts?: { taxMode?: 'kleinunternehmer' | 'regelbesteuerung'; taxRate?: number },
): Promise<boolean> {
  try {
    const gross = Number(booking.price_total ?? 0);
    if (!Number.isFinite(gross) || gross <= 0) return false;

    const { data: rows, error } = await supabase
      .from('invoices')
      .select('id, gross_amount, status')
      .eq('booking_id', booking.id)
      .neq('status', 'cancelled');
    if (error) return false;
    if (!rows || rows.length === 0) {
      // Noch keine Rechnung vorhanden → regulaer anlegen.
      return await storeInvoiceForBooking(supabase, booking, opts);
    }
    // Mehrere aktive Rechnungen zu einer Buchung sind nicht vorgesehen — dann
    // lieber nichts anfassen, als Betraege zu vervielfachen.
    if (rows.length > 1) {
      console.warn('[store-invoice] Mehrere aktive Rechnungen zu Buchung', booking.id, '— Betrag nicht synchronisiert.');
      return false;
    }

    const row = rows[0] as { id: string; gross_amount: number | null };
    if (Math.abs(Number(row.gross_amount ?? 0) - gross) < 0.005) return false;

    const taxMode = opts?.taxMode ?? 'kleinunternehmer';
    const taxRate = opts?.taxRate ?? 0;
    const isRegel = taxMode === 'regelbesteuerung' && taxRate > 0;
    const net = isRegel ? Math.round((gross / (1 + taxRate / 100)) * 100) / 100 : gross;
    const tax = isRegel ? Math.round((gross - net) * 100) / 100 : 0;

    const { error: updErr } = await supabase
      .from('invoices')
      .update({ gross_amount: gross, net_amount: net, tax_amount: tax })
      .eq('id', row.id);
    if (updErr) {
      console.error('[store-invoice] Betrag-Sync fehlgeschlagen:', updErr.message, { bookingId: booking.id });
      return false;
    }
    return true;
  } catch (err) {
    console.error('[store-invoice] Betrag-Sync Fehler:', err, { bookingId: booking.id });
    return false;
  }
}

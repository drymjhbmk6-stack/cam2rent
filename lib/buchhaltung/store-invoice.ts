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

  // Zahlstatus: MANUAL-UNPAID = wartet auf Ueberweisung. Sonst (Stripe,
  // MANUAL-bezahlt) als paid markieren — der Customer hat ja bezahlt.
  const piId = (booking.payment_intent_id ?? '').toString();
  const isUnpaid = /MANUAL-UNPAID/i.test(piId);
  const paymentStatus = isUnpaid ? 'unpaid' : 'paid';
  const status = isUnpaid ? 'sent' : 'paid';

  // payment_method aus payment_intent_id ableiten
  const paymentMethod = piId.startsWith('pi_')
    ? 'Kreditkarte via Stripe'
    : piId.startsWith('MANUAL-UNPAID-')
      ? 'Überweisung ausstehend'
      : piId.startsWith('MANUAL-')
        ? 'Bar / Sonstige'
        : 'Stripe';

  const invoiceDate = (booking.created_at ?? new Date().toISOString()).slice(0, 10);

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

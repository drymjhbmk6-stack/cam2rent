/**
 * Stornierungsbeleg (Gutschrift) als PDF erzeugen + an den Kunden mailen,
 * sowie die Auto-Anlage einer Gutschrift beim Buchungs-Storno.
 *
 * Liegt bewusst getrennt von `credit-note-utils.ts`, weil hier der schwere
 * Stack (react-pdf + Mail + buildInvoiceData) gezogen wird.
 */

import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CreditNotePDF, type CreditNotePdfData } from '@/lib/credit-note-pdf';
import { buildInvoiceData } from '@/lib/build-invoice-data';
import { sendCreditNote } from '@/lib/email';
import { calculateTax, type TaxMode } from '@/lib/accounting/tax';
import { isTestMode } from '@/lib/env-mode';
import { nextCreditNoteNumber } from '@/lib/buchhaltung/credit-note-utils';
import { storeInvoiceForBooking, type BookingForInvoice } from '@/lib/buchhaltung/store-invoice';

function deToDate(value: unknown): string {
  const d = value ? new Date(value as string) : new Date();
  return d.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
  });
}

async function loadTaxConfig(
  supabase: SupabaseClient,
): Promise<{ taxMode: TaxMode; taxRate: number; ustId: string }> {
  const { data } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
  const map: Record<string, string> = {};
  for (const r of data ?? []) map[r.key] = r.value;
  return {
    taxMode: (map['tax_mode'] as TaxMode) || 'kleinunternehmer',
    taxRate: parseFloat(map['tax_rate'] || '19'),
    ustId: map['ust_id'] || '',
  };
}

/** Lädt Empfaengerdaten (Name/E-Mail/Adresse) + Bezug zur Originalrechnung. */
async function loadRecipientAndInvoiceRef(
  supabase: SupabaseClient,
  booking: Record<string, unknown> | null,
  invoiceId?: string | null,
): Promise<{
  customerName: string; customerEmail: string; customerAddress: string; ustId: string;
  invoiceNumber?: string; invoiceDate?: string;
}> {
  let customerName = '';
  let customerEmail = '';
  let customerAddress = '';
  let ustId = '';
  if (booking) {
    const inv = await buildInvoiceData(supabase, booking);
    customerName = inv.customerName || '';
    customerEmail = inv.customerEmail || '';
    customerAddress = inv.customerAddress || '';
    ustId = inv.ustId || '';
  }

  // Bezug Originalrechnung: explizite invoice_id (CN) ODER neueste der Buchung.
  let invRow: { invoice_number?: string; invoice_date?: string } | null = null;
  if (invoiceId) {
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number, invoice_date')
      .eq('id', invoiceId)
      .maybeSingle();
    invRow = data;
  } else if (booking?.id) {
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number, invoice_date')
      .eq('booking_id', booking.id as string)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    invRow = data;
  }
  const invoiceNumber = invRow?.invoice_number ?? undefined;
  const invoiceDate = invRow?.invoice_date ? deToDate(invRow.invoice_date) : undefined;
  return { customerName, customerEmail, customerAddress, ustId, invoiceNumber, invoiceDate };
}

/** Baut die PDF-Daten aus einer bestehenden credit_notes-Zeile. */
export async function buildCreditNotePdfDataFromRow(
  supabase: SupabaseClient,
  cn: Record<string, unknown>,
): Promise<CreditNotePdfData> {
  let booking: Record<string, unknown> | null = null;
  if (cn.booking_id) {
    const { data } = await supabase.from('bookings').select('*').eq('id', cn.booking_id as string).maybeSingle();
    booking = data ?? null;
  }
  const ref = await loadRecipientAndInvoiceRef(supabase, booking, (cn.invoice_id as string) ?? null);
  // Tatsaechlich erstatteter Betrag steht auf der Buchung (Cash/Stripe), NICHT
  // im credit_notes.gross_amount (= voller Stornobetrag).
  const refundedAmount = booking ? Math.max(0, Number(booking.refund_amount ?? 0)) : 0;
  return {
    creditNoteNumber: cn.credit_note_number as string,
    creditNoteDate: deToDate(cn.created_at),
    bookingId: (cn.booking_id as string) || undefined,
    invoiceNumber: ref.invoiceNumber,
    invoiceDate: ref.invoiceDate,
    customerName: ref.customerName || ((cn.customer_name as string) ?? ''),
    customerEmail: ref.customerEmail,
    customerAddress: ref.customerAddress,
    reason: (cn.reason as string) || undefined,
    grossAmount: Number(cn.gross_amount) || 0,
    netAmount: Number(cn.net_amount) || 0,
    taxAmount: Number(cn.tax_amount) || 0,
    taxMode: (cn.tax_mode as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
    taxRate: Number(cn.tax_rate) || 19,
    ustId: ref.ustId,
    refundedAmount,
    refunded: cn.refund_status === 'succeeded',
  };
}

/** Baut die PDF-Daten als Vorschau aus Buchung + Betraegen (noch keine CN). */
export async function buildCreditNotePreviewData(
  supabase: SupabaseClient,
  booking: Record<string, unknown>,
  args: { grossAmount: number; refundedAmount?: number; reason?: string },
): Promise<CreditNotePdfData> {
  const { taxMode, taxRate } = await loadTaxConfig(supabase);
  const taxCalc = calculateTax(args.grossAmount, taxMode, taxRate, 'gross');
  const ref = await loadRecipientAndInvoiceRef(supabase, booking, null);
  return {
    creditNoteNumber: 'Vorschau',
    creditNoteDate: deToDate(new Date().toISOString()),
    bookingId: (booking.id as string) || undefined,
    invoiceNumber: ref.invoiceNumber,
    invoiceDate: ref.invoiceDate,
    customerName: ref.customerName,
    customerEmail: ref.customerEmail,
    customerAddress: ref.customerAddress,
    reason: args.reason,
    grossAmount: taxCalc.gross,
    netAmount: taxCalc.net,
    taxAmount: taxCalc.tax,
    taxMode,
    taxRate,
    ustId: ref.ustId,
    refundedAmount: args.refundedAmount,
    refunded: false,
  };
}

export async function renderCreditNotePdfBuffer(data: CreditNotePdfData): Promise<Buffer> {
  return Buffer.from(
    await renderToBuffer(createElement(CreditNotePDF, { data }) as ReactElement<DocumentProps>),
  );
}

/**
 * Liefert das Stornierungsbeleg-PDF einer Buchung fuer den Mail-Anhang —
 * GARANTIERT, solange die Buchung einen Betrag hatte:
 *  - existiert bereits eine Gutschrift → deren echte Fassung,
 *  - sonst → eine aus den Buchungsdaten gebaute Fassung (wie die Vorschau).
 * Damit haengt der Beleg auch dann an der Mail, wenn die Gutschrift-Anlage
 * (z.B. wegen ausstehender Migration) scheitert. Best-effort: `null` bei
 * priceTotal<=0 oder Render-Fehler, wirft NICHT.
 */
export async function renderCancellationBelegPdf(
  supabase: SupabaseClient,
  booking: Record<string, unknown>,
  opts: { refundedAmount?: number; reason?: string } = {},
): Promise<{ buffer: Buffer; number: string } | null> {
  try {
    const priceTotal = Number(booking.price_total ?? 0);
    const { data: cn } = await supabase
      .from('credit_notes')
      .select('*')
      .eq('booking_id', booking.id as string)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cn && !(priceTotal > 0)) return null;

    const data = cn
      ? await buildCreditNotePdfDataFromRow(supabase, cn)
      : await buildCreditNotePreviewData(supabase, booking, {
          grossAmount: priceTotal,
          refundedAmount: opts.refundedAmount,
          reason: opts.reason,
        });
    if (opts.refundedAmount != null) {
      data.refundedAmount = priceTotal > 0
        ? Math.min(priceTotal, Math.max(0, opts.refundedAmount))
        : Math.max(0, opts.refundedAmount);
    }
    const buffer = await renderCreditNotePdfBuffer(data);
    const number = (cn?.credit_note_number as string) || data.creditNoteNumber || 'Storno';
    return { buffer, number };
  } catch (err) {
    console.error('[credit-note-document] renderCancellationBelegPdf fehlgeschlagen:', err, { bookingId: booking.id });
    return null;
  }
}

/**
 * Erzeugt das Stornierungsbeleg-PDF einer bestehenden Gutschrift und schickt
 * es (optional) per E-Mail an den Kunden der zugehoerigen Buchung.
 * Best-effort: faengt eigene Fehler ab (loggt nur), wirft NICHT.
 */
export async function dispatchCreditNoteDocument(
  supabase: SupabaseClient,
  creditNoteId: string,
  opts?: { sendEmail?: boolean },
): Promise<void> {
  try {
    const { data: cn } = await supabase
      .from('credit_notes')
      .select('*')
      .eq('id', creditNoteId)
      .maybeSingle();
    if (!cn) return;

    const pdfData = await buildCreditNotePdfDataFromRow(supabase, cn);
    const pdfBuffer = await renderCreditNotePdfBuffer(pdfData);

    if (opts?.sendEmail !== false && pdfData.customerEmail) {
      await sendCreditNote({
        bookingId: (cn.booking_id as string) || null,
        creditNoteNumber: cn.credit_note_number,
        customerName: pdfData.customerName,
        customerEmail: pdfData.customerEmail,
        grossAmount: pdfData.grossAmount,
        refundedAmount: pdfData.refundedAmount,
        reason: pdfData.reason,
        refunded: pdfData.refunded,
        pdfBuffer,
      });
    }
  } catch (err) {
    console.error('[credit-note-document] dispatch fehlgeschlagen:', err, { creditNoteId });
  }
}

/**
 * Legt beim Buchungs-Storno automatisch eine Gutschrift an (Status `sent`),
 * setzt die Originalrechnung auf `cancelled` und gibt die Gutschrift-ID
 * zurueck. Loest KEINEN Stripe-Refund aus — der ist im Storno-Pfad bereits
 * passiert; `refundStatus`/`stripeRefundId` werden nur durchgereicht.
 * Best-effort: gibt bei Fehler `null` zurueck, wirft NICHT.
 */
export async function createCancellationCreditNote(
  supabase: SupabaseClient,
  args: {
    bookingId: string;
    grossAmount: number;
    reason: string;
    refundStatus: string;
    stripeRefundId?: string | null;
  },
): Promise<string | null> {
  try {
    if (!(args.grossAmount > 0)) return null;

    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', args.bookingId)
      .maybeSingle();
    if (!booking) return null;

    const { taxMode, taxRate } = await loadTaxConfig(supabase);

    // Originalrechnung sicherstellen (idempotent) — fuer invoice_id-Bezug.
    let { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('booking_id', args.bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!invoice) {
      await storeInvoiceForBooking(supabase, booking as BookingForInvoice, { taxMode, taxRate });
      const r = await supabase
        .from('invoices')
        .select('id')
        .eq('booking_id', args.bookingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      invoice = r.data;
    }

    const taxCalc = calculateTax(args.grossAmount, taxMode, taxRate, 'gross');
    const testMode = await isTestMode();
    const number = await nextCreditNoteNumber(supabase);
    const nowIso = new Date().toISOString();

    const { data: cn, error } = await supabase
      .from('credit_notes')
      .insert({
        credit_note_number: number,
        invoice_id: invoice?.id ?? null,
        booking_id: args.bookingId,
        net_amount: taxCalc.net,
        tax_amount: taxCalc.tax,
        gross_amount: taxCalc.gross,
        tax_mode: taxMode,
        tax_rate: taxCalc.taxRate,
        reason: args.reason,
        reason_category: 'cancellation',
        status: 'sent',
        refund_status: args.refundStatus,
        stripe_refund_id: args.stripeRefundId ?? null,
        approved_at: nowIso,
        sent_at: nowIso,
        is_test: testMode,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[credit-note-document] Auto-Gutschrift Insert fehlgeschlagen:', error.message, { bookingId: args.bookingId });
      return null;
    }

    if (invoice?.id) {
      await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', invoice.id);
    }

    return cn.id;
  } catch (err) {
    console.error('[credit-note-document] createCancellationCreditNote fehlgeschlagen:', err, { bookingId: args.bookingId });
    return null;
  }
}

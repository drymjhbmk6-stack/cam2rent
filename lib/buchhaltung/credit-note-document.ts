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

    // Zugehoerige Buchung (fuer Empfaengeradresse, Steuer-Config, E-Mail).
    let booking: Record<string, unknown> | null = null;
    if (cn.booking_id) {
      const { data } = await supabase.from('bookings').select('*').eq('id', cn.booking_id).maybeSingle();
      booking = data ?? null;
    }

    // Bezug Originalrechnung.
    let invoiceNumber: string | undefined;
    let invoiceDate: string | undefined;
    if (cn.invoice_id) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number, invoice_date')
        .eq('id', cn.invoice_id)
        .maybeSingle();
      invoiceNumber = inv?.invoice_number ?? undefined;
      invoiceDate = inv?.invoice_date ? deToDate(inv.invoice_date) : undefined;
    }

    let customerName = (cn.customer_name as string) ?? '';
    let customerEmail = '';
    let customerAddress = '';
    let ustId = '';
    if (booking) {
      const inv = await buildInvoiceData(supabase, booking);
      customerName = inv.customerName || customerName;
      customerEmail = inv.customerEmail || '';
      customerAddress = inv.customerAddress || '';
      ustId = inv.ustId || '';
    }

    const refunded = cn.refund_status === 'succeeded';

    const pdfData: CreditNotePdfData = {
      creditNoteNumber: cn.credit_note_number,
      creditNoteDate: deToDate(cn.created_at),
      bookingId: (cn.booking_id as string) || undefined,
      invoiceNumber,
      invoiceDate,
      customerName,
      customerEmail,
      customerAddress,
      reason: (cn.reason as string) || undefined,
      grossAmount: Number(cn.gross_amount) || 0,
      netAmount: Number(cn.net_amount) || 0,
      taxAmount: Number(cn.tax_amount) || 0,
      taxMode: (cn.tax_mode as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
      taxRate: Number(cn.tax_rate) || 19,
      ustId,
      refunded,
    };

    const pdfBuffer = Buffer.from(
      await renderToBuffer(
        createElement(CreditNotePDF, { data: pdfData }) as ReactElement<DocumentProps>,
      ),
    );

    if (opts?.sendEmail !== false && customerEmail) {
      await sendCreditNote({
        bookingId: (cn.booking_id as string) || null,
        creditNoteNumber: cn.credit_note_number,
        customerName,
        customerEmail,
        grossAmount: pdfData.grossAmount,
        reason: pdfData.reason,
        refunded,
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

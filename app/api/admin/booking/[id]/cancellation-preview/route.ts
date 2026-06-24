import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { sendCancellationConfirmation, renderEmailPreview } from '@/lib/email';

/**
 * POST /api/admin/booking/[id]/cancellation-preview
 *
 * Liefert die gerenderte Storno-Kunden-E-Mail (HTML) + die Liste der PDFs,
 * die angehaengt wuerden — fuer die Vorschau vor dem Senden. Schreibt NICHTS
 * (kein Versand, kein Refund, keine Gutschrift).
 *
 * Body: { refund_amount?, refund_note?, attach_invoice? }
 *  - refund_amount fehlt → der bereits auf der Buchung gespeicherte Wert
 *    (fuer den Resend-Fall bei bereits stornierten Buchungen).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const priceTotal = Number(booking.price_total ?? 0);
  const rawRefund = body.refund_amount != null ? Number(body.refund_amount) : Number(booking.refund_amount ?? 0);
  const refundAmount = Math.max(0, Math.min(priceTotal, rawRefund || 0));
  const attachInvoice = body.attach_invoice === true;
  const refundNote = typeof body.refund_note === 'string' ? body.refund_note : undefined;

  // Gibt es (bereits) eine Gutschrift zu dieser Buchung?
  const { data: cn } = await supabase
    .from('credit_notes')
    .select('id')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const creditNoteExists = !!cn?.id;

  const { html } = await renderEmailPreview(sendCancellationConfirmation, {
    bookingId: booking.id,
    customerName: booking.customer_name ?? '',
    customerEmail: booking.customer_email ?? '',
    productName: booking.product_name,
    productId: booking.product_id,
    rentalFrom: booking.rental_from,
    rentalTo: booking.rental_to,
    days: booking.days,
    priceTotal,
    refundAmount,
    refundPercentage: priceTotal > 0 ? refundAmount / priceTotal : 0,
    refundNote,
  });

  const attachments: { key: 'invoice' | 'creditnote'; label: string }[] = [];
  if (attachInvoice && priceTotal > 0) {
    attachments.push({ key: 'invoice', label: 'Rechnung' });
  }
  // Stornierungsbeleg wird angehaengt, wenn eine Rueckerstattung erfolgt
  // (Storno-Fall) ODER bereits eine Gutschrift existiert (Resend-Fall).
  if (refundAmount > 0 || creditNoteExists) {
    attachments.push({ key: 'creditnote', label: 'Stornierungsbeleg' });
  }

  return NextResponse.json({
    emailHtml: html,
    attachments,
    customerEmail: booking.customer_email ?? '',
    refundAmount,
  });
}

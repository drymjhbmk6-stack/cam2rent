import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { sendCancellationConfirmation } from '@/lib/email';
import { renderCreditNotePdfForId } from '@/lib/buchhaltung/credit-note-document';
import { renderInvoicePdfBuffer } from '@/lib/invoice-pdf-buffer';

/**
 * POST /api/admin/booking/[id]/resend-cancellation
 *
 * Schickt fuer eine bereits stornierte Buchung die Storno-Mail erneut und —
 * falls eine Gutschrift existiert — den Stornierungsbeleg (PDF) erneut.
 * Loest KEINEN Stripe-Refund aus und legt KEINE neue Gutschrift an.
 *
 * Optional kann der **tatsaechlich erstattete Betrag** nachgetragen werden
 * (`refund_amount` im Body) — z.B. wenn manuell in Stripe erstattet wurde.
 * Dieser wird auf der Buchung gespeichert (`bookings.refund_amount`), als
 * `refund_status='manual'` auf der Gutschrift markiert und erscheint dann als
 * „Davon erstattet"-Zeile auf dem Beleg. Ohne `refund_amount` bleibt der
 * gespeicherte Wert.
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
  if (booking.status !== 'cancelled') {
    return NextResponse.json(
      { error: 'Erneutes Senden ist nur fuer stornierte Buchungen moeglich.' },
      { status: 400 },
    );
  }
  if (!booking.customer_email) {
    return NextResponse.json(
      { error: 'Keine Kunden-E-Mail hinterlegt.' },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const attachInvoice = body.attach_invoice === true;

  const priceTotal = Number(booking.price_total ?? 0);

  // Optional: tatsaechlich erstatteten Betrag nachtragen (z.B. manueller
  // Stripe-Refund). Wird auf der Buchung gespeichert + auf der Gutschrift als
  // `manual` markiert, damit der Beleg „Davon erstattet" korrekt zeigt.
  let refundAmount = Math.max(0, Math.min(priceTotal, Number(booking.refund_amount ?? 0)));
  if (body.refund_amount != null) {
    refundAmount = Math.max(0, Math.min(priceTotal, Number(body.refund_amount) || 0));
    const noteEntry = `Rueckerstattung erfasst: ${refundAmount.toFixed(2)} EUR (manuell)`;
    const existingNote = (booking.refund_note ?? '') as string;
    const { error: refUpdErr } = await supabase
      .from('bookings')
      .update({
        refund_amount: refundAmount,
        refund_note: existingNote ? `${existingNote} | ${noteEntry}` : noteEntry,
      })
      .eq('id', id);
    if (refUpdErr && /refund_amount|refund_note/i.test(refUpdErr.message || '')) {
      console.warn('[resend-cancellation] refund_amount/refund_note Migration steht aus.');
    }
  }

  // Stornierungsbeleg (Gutschrift) der Buchung suchen — das PDF wird DIREKT an
  // die Storno-Mail angehaengt (kein separater Gutschrift-Mailversand mehr),
  // damit es wie in der Vorschau ("Anhänge: Stornierungsbeleg") versprochen
  // beim Kunden ankommt.
  let creditNoteResent = false;
  let creditNotePdf: { buffer: Buffer; number: string } | null = null;
  const { data: cn } = await supabase
    .from('credit_notes')
    .select('id')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cn?.id) {
    // Erfassten Refund auf der Gutschrift markieren (informativ).
    if (body.refund_amount != null && refundAmount > 0) {
      await supabase.from('credit_notes').update({ refund_status: 'manual' }).eq('id', cn.id);
    }
    creditNotePdf = await renderCreditNotePdfForId(supabase, cn.id);
    creditNoteResent = !!creditNotePdf;
  }

  // Storno-Bestaetigung an den Kunden (mit dem gespeicherten Refund-Betrag),
  // optional mit Rechnungs-PDF-Anhang + Stornierungsbeleg-Anhang.
  let emailSent = false;
  try {
    const attachments: { filename: string; content: Buffer }[] = [];
    if (attachInvoice && priceTotal > 0) {
      try {
        attachments.push({ filename: `Rechnung-${booking.id}.pdf`, content: await renderInvoicePdfBuffer(supabase, booking) });
      } catch (e) {
        console.error('[resend-cancellation] Rechnungs-Anhang fehlgeschlagen:', e);
      }
    }
    if (creditNotePdf) {
      attachments.push({ filename: `Stornierungsbeleg-${creditNotePdf.number}.pdf`, content: creditNotePdf.buffer });
    }
    await sendCancellationConfirmation({
      bookingId: booking.id,
      customerName: booking.customer_name ?? '',
      customerEmail: booking.customer_email,
      productName: booking.product_name,
      productId: booking.product_id,
      rentalFrom: booking.rental_from,
      rentalTo: booking.rental_to,
      days: booking.days,
      priceTotal,
      refundAmount,
      refundPercentage: priceTotal > 0 ? refundAmount / priceTotal : 0,
    }, { attachments });
    emailSent = true;
  } catch (err) {
    console.error('[resend-cancellation] Storno-Mail fehlgeschlagen:', err);
  }

  await logAudit({
    action: 'booking.resend_cancellation',
    entityType: 'booking',
    entityId: id,
    changes: { emailSent, creditNoteResent, refundAmount },
    request: req,
  });

  return NextResponse.json({ ok: true, emailSent, creditNoteResent });
}

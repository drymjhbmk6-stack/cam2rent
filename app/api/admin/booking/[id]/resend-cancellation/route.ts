import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { sendCancellationConfirmation } from '@/lib/email';
import { dispatchCreditNoteDocument } from '@/lib/buchhaltung/credit-note-document';

/**
 * POST /api/admin/booking/[id]/resend-cancellation
 *
 * Schickt fuer eine bereits stornierte Buchung die Storno-Mail erneut und —
 * falls eine Gutschrift existiert — den Stornierungsbeleg (PDF) erneut.
 * Loest KEINEN Stripe-Refund aus und legt KEINE neue Gutschrift an. Nutzt den
 * bereits gespeicherten Rueckerstattungsbetrag (`bookings.refund_amount`).
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

  const priceTotal = Number(booking.price_total ?? 0);
  const refundAmount = Math.max(0, Math.min(priceTotal, Number(booking.refund_amount ?? 0)));

  // Storno-Bestaetigung an den Kunden (mit dem gespeicherten Refund-Betrag).
  let emailSent = false;
  try {
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
    });
    emailSent = true;
  } catch (err) {
    console.error('[resend-cancellation] Storno-Mail fehlgeschlagen:', err);
  }

  // Stornierungsbeleg (Gutschrift) erneut, falls vorhanden.
  let creditNoteResent = false;
  const { data: cn } = await supabase
    .from('credit_notes')
    .select('id')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cn?.id) {
    await dispatchCreditNoteDocument(supabase, cn.id, { sendEmail: true });
    creditNoteResent = true;
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

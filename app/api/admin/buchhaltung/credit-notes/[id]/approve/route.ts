import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { getStripe } from '@/lib/stripe';
import { getStripeSecretKey } from '@/lib/env-mode';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  // Gutschrift laden
  const { data: creditNote } = await supabase
    .from('credit_notes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!creditNote) {
    return NextResponse.json({ error: 'Gutschrift nicht gefunden.' }, { status: 404 });
  }

  if (creditNote.status !== 'pending_review') {
    return NextResponse.json({ error: 'Nur Entwürfe können freigegeben werden.' }, { status: 400 });
  }

  // Status auf approved setzen
  const { error: updateError } = await supabase
    .from('credit_notes')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Stripe-Refund auslösen falls Buchung per Stripe bezahlt
  let refundStatus = 'not_applicable';
  let stripeRefundId: string | null = null;

  if (creditNote.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('payment_intent_id')
      .eq('id', creditNote.booking_id)
      .maybeSingle();

    const stripeKey = await getStripeSecretKey();
    if (booking?.payment_intent_id && stripeKey) {
      try {
        const stripe = await getStripe();
        const refund = await stripe.refunds.create({
          payment_intent: booking.payment_intent_id,
          amount: Math.round(creditNote.gross_amount * 100), // Cent
          reason: 'requested_by_customer',
        });
        stripeRefundId = refund.id;
        refundStatus = refund.status === 'succeeded' ? 'succeeded' : 'pending';
      } catch (err) {
        refundStatus = 'failed';
        console.error('Stripe Refund Fehler:', err);
      }
    }
  }

  // Refund-Status aktualisieren
  await supabase
    .from('credit_notes')
    .update({
      stripe_refund_id: stripeRefundId,
      refund_status: refundStatus,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .eq('id', id);

  // Originalrechnung als storniert markieren
  if (creditNote.invoice_id) {
    await supabase
      .from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', creditNote.invoice_id);
  }

  await logAudit({
    action: 'credit_note.approve',
    entityType: 'credit_note',
    entityId: id,
    changes: { refundStatus, stripeRefundId },
    request: _req,
  });

  return NextResponse.json({ ok: true, refundStatus, stripeRefundId });
}

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

  // ATOMIC GUARD: UPDATE nur wenn Status noch pending_review. Verhindert
  // Doppel-Klick → Doppel-Refund. Wenn 0 Rows betroffen, hat eine andere
  // Anfrage die Gutschrift bereits freigegeben → 409.
  const { data: claimed, error: claimError } = await supabase
    .from('credit_notes')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending_review')
    .select('id')
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: 'Gutschrift wurde bereits bearbeitet.' },
      { status: 409 }
    );
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
    // Manuelle Buchungen haben payment_intent_id wie "MANUAL-..." — Stripe
    // wuerde mit 404 antworten. Refund nur fuer echte PaymentIntents.
    const isStripePI = !!booking?.payment_intent_id?.startsWith('pi_');
    if (isStripePI && stripeKey) {
      try {
        const stripe = await getStripe();
        const refund = await stripe.refunds.create(
          {
            payment_intent: booking!.payment_intent_id,
            amount: Math.round(creditNote.gross_amount * 100), // Cent
            reason: 'requested_by_customer',
          },
          { idempotencyKey: `cn-refund:${id}` }
        );
        stripeRefundId = refund.id;
        refundStatus = refund.status === 'succeeded' ? 'succeeded' : 'pending';
      } catch (err) {
        refundStatus = 'failed';
        console.error('Stripe Refund Fehler:', err);
      }
    }
  }

  // Sweep 7 Vuln 18 — bei Stripe-Refund-Fehler NICHT auf 'sent' flippen
  // und auch die Originalrechnung NICHT auf 'cancelled' setzen. Vorher: bei
  // Refund-Fail wurde der CN trotzdem sent + Invoice cancelled → USt-Voran-
  // meldung enthielt eine Gutschrift, ohne dass je Geld zurueckgegangen waere.
  const refundFailed = refundStatus === 'failed';
  await supabase
    .from('credit_notes')
    .update({
      stripe_refund_id: stripeRefundId,
      refund_status: refundStatus,
      status: refundFailed ? 'approved' : 'sent',
      sent_at: refundFailed ? null : new Date().toISOString(),
    })
    .eq('id', id);

  // Originalrechnung nur bei erfolgreichem Refund stornieren
  if (creditNote.invoice_id && !refundFailed) {
    await supabase
      .from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', creditNote.invoice_id);
  }

  // Bei Refund-Fehler Admin-Notification fuer Manual-Refund-Workflow
  if (refundFailed) {
    try {
      const { createAdminNotification } = await import('@/lib/admin-notifications');
      await createAdminNotification(supabase, {
        type: 'payment_failed',
        title: `Gutschrift ${id}: Stripe-Refund fehlgeschlagen`,
        message: `Manueller Refund noetig. Originalrechnung NICHT storniert, bis Refund erfolgt.`,
        link: `/admin/buchhaltung?tab=einnahmen&sub=gutschriften`,
      });
    } catch (notifErr) {
      console.error('CN-Refund-Fail Notification:', notifErr);
    }
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

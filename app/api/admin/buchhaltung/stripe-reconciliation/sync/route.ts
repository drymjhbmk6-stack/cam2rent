import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { getStripeSecretKey, isTestMode } from '@/lib/env-mode';

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { from, to } = body;

  if (!from || !to) {
    return NextResponse.json({ error: 'from und to erforderlich.' }, { status: 400 });
  }

  if (!(await getStripeSecretKey())) {
    return NextResponse.json({ error: 'Stripe API-Key nicht konfiguriert.' }, { status: 500 });
  }

  const stripe = await getStripe();
  const testMode = await isTestMode();
  const supabase = createServiceClient();

  // PaymentIntents von Stripe laden
  const fromTs = Math.floor(new Date(`${from}T00:00:00`).getTime() / 1000);
  const toTs = Math.floor(new Date(`${to}T23:59:59`).getTime() / 1000);

  let synced = 0;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Stripe.PaymentIntentListParams = {
      created: { gte: fromTs, lte: toTs },
      limit: 100,
    };
    if (startingAfter) params.starting_after = startingAfter;

    const paymentIntents = await stripe.paymentIntents.list(params);

    for (const pi of paymentIntents.data) {
      if (pi.status !== 'succeeded') continue;

      const amount = pi.amount / 100; // Cent → Euro

      // Gebühren aus Charge laden
      let fee = 0;
      let net = amount;
      let chargeId: string | null = null;

      if (pi.latest_charge && typeof pi.latest_charge === 'string') {
        try {
          const charge = await stripe.charges.retrieve(pi.latest_charge, {
            expand: ['balance_transaction'],
          });
          chargeId = charge.id;
          const bt = charge.balance_transaction;
          if (bt && typeof bt !== 'string') {
            fee = bt.fee / 100;
            net = bt.net / 100;
          }
        } catch {
          // Charge nicht gefunden — kein Fehler
        }
      }

      // Buchung verknüpfen
      const { data: booking } = await supabase
        .from('bookings')
        .select('id')
        .eq('payment_intent_id', pi.id)
        .maybeSingle();

      // Upsert in stripe_transactions
      const { error } = await supabase
        .from('stripe_transactions')
        .upsert(
          {
            stripe_payment_intent_id: pi.id,
            stripe_charge_id: chargeId,
            amount,
            fee,
            net,
            currency: pi.currency?.toUpperCase() || 'EUR',
            status: pi.status,
            payment_method: typeof pi.payment_method === 'string' ? pi.payment_method : null,
            booking_id: booking?.id || null,
            match_status: booking?.id ? 'matched' : 'unmatched',
            stripe_created_at: new Date(pi.created * 1000).toISOString(),
            synced_at: new Date().toISOString(),
            is_test: testMode,
          },
          { onConflict: 'stripe_payment_intent_id' }
        );

      if (!error) synced++;
    }

    hasMore = paymentIntents.has_more;
    if (paymentIntents.data.length > 0) {
      startingAfter = paymentIntents.data[paymentIntents.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  await logAudit({
    action: 'stripe.sync_run',
    entityType: 'stripe_transaction',
    changes: { from, to, synced },
    request: req,
  });

  return NextResponse.json({ synced });
}

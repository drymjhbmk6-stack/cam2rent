import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { isTestMode, getStripeSecretKey } from '@/lib/env-mode';
import { getStripe } from '@/lib/stripe';

/**
 * POST /api/admin/buchhaltung/stripe-reconciliation/import-fees
 * Importiert Stripe-Gebühren als Ausgaben (idempotent via source_type + source_id).
 * Erfasst sowohl Zahlungsgebühren (aus stripe_transactions) als auch
 * Rückerstattungsgebühren (direkt aus Stripe Balance-Transactions API).
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { from, to } = body;

  if (!from || !to) {
    return NextResponse.json({ error: 'from und to erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const testMode = await isTestMode();
  let imported = 0;

  // ── 1. Zahlungsgebühren aus stripe_transactions ────────────────────────────
  const { data: transactions } = await supabase
    .from('stripe_transactions')
    .select('id, stripe_payment_intent_id, fee, stripe_created_at, booking_id')
    .gt('fee', 0)
    .gte('stripe_created_at', `${from}T00:00:00`)
    .lte('stripe_created_at', `${to}T23:59:59`);

  for (const tx of transactions || []) {
    const { data: existing } = await supabase
      .from('expenses')
      .select('id')
      .eq('source_type', 'stripe_fee')
      .eq('source_id', tx.id)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase
      .from('expenses')
      .insert({
        expense_date: tx.stripe_created_at ? tx.stripe_created_at.split('T')[0] : from,
        category: 'stripe_fees',
        description: `Stripe-Gebühr für ${tx.stripe_payment_intent_id.slice(0, 20)}...`,
        vendor: 'Stripe',
        net_amount: tx.fee,
        tax_amount: 0,
        gross_amount: tx.fee,
        source_type: 'stripe_fee',
        source_id: tx.id,
        is_test: testMode,
      });

    if (!error) imported++;
  }

  // ── 2. Rückerstattungsgebühren direkt aus Stripe Balance-Transactions ──────
  // Stripe behält bei Refunds einen Teil der ursprünglichen Gebühr (z.B. 0,36 €).
  // Diese erscheinen als eigene Balance-Transactions vom Typ 'refund' mit fee > 0.
  let refundFeesImported = 0;

  if (await getStripeSecretKey()) {
    try {
      const stripe = await getStripe();
      const fromTs = Math.floor(new Date(`${from}T00:00:00`).getTime() / 1000);
      const toTs = Math.floor(new Date(`${to}T23:59:59`).getTime() / 1000);

      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const bts = await stripe.balanceTransactions.list({
          type: 'refund',
          created: { gte: fromTs, lte: toTs },
          limit: 100,
          expand: ['data.source'],
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

        for (const bt of bts.data) {
          // Nur wenn Stripe tatsächlich eine Gebühr einbehalten hat
          if (!bt.fee || bt.fee <= 0) continue;

          const feeEur = bt.fee / 100;

          // Idempotenz: source_type='stripe_refund_fee', source_id=balance_transaction_id
          const { data: existing } = await supabase
            .from('expenses')
            .select('id')
            .eq('source_type', 'stripe_refund_fee')
            .eq('source_id', bt.id)
            .maybeSingle();

          if (existing) continue;

          // Refund-ID aus der source ermitteln für die Beschreibung
          const refundId =
            bt.source && typeof bt.source !== 'string' && 'id' in bt.source
              ? (bt.source as { id: string }).id
              : bt.id;

          const { error } = await supabase
            .from('expenses')
            .insert({
              expense_date: new Date(bt.created * 1000).toISOString().split('T')[0],
              category: 'stripe_fees',
              description: `Stripe-Rückerstattungsgebühr für ${refundId.slice(0, 20)}...`,
              vendor: 'Stripe',
              net_amount: feeEur,
              tax_amount: 0,
              gross_amount: feeEur,
              source_type: 'stripe_refund_fee',
              source_id: bt.id,
              is_test: testMode,
            });

          if (!error) refundFeesImported++;
        }

        hasMore = bts.has_more;
        startingAfter = bts.data.length > 0 ? bts.data[bts.data.length - 1].id : undefined;
        if (!startingAfter) hasMore = false;
      }
    } catch {
      // Stripe nicht erreichbar — Zahlungsgebühren wurden trotzdem importiert
    }
  }

  imported += refundFeesImported;

  await logAudit({
    action: 'stripe.import_fees',
    entityType: 'expense',
    changes: {
      from,
      to,
      imported,
      paymentFees: (transactions || []).length,
      refundFeesImported,
    },
    request: req,
  });

  return NextResponse.json({
    imported,
    total: (transactions || []).length,
    refundFeesImported,
  });
}

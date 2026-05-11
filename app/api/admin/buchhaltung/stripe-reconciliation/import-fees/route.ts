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

  // ── 2. Rückerstattungsgebühren über Stripe Refunds API ───────────────────
  // Bei payment_refund-Balance-Transactions ist bt.fee negativ (Gegenbuchung).
  // Der Absolutwert ergibt den Betrag, den Stripe für die Rückerstattung
  // einbehält bzw. als Gebühr verrechnet — das ist der sichtbare Wert im
  // Stripe-Dashboard unter "Alle Aktivitäten".
  let refundFeesImported = 0;
  let refundFeeError: string | null = null;
  const diagRefunds: Array<{
    refund_id: string;
    payment_intent_id: string | null;
    refund_amount_eur: number;
    bt_fee_cents: number;
    fee_eur: number;
    skipped?: string;
  }> = [];

  if (await getStripeSecretKey()) {
    try {
      const stripe = await getStripe();
      const fromTs = Math.floor(new Date(`${from}T00:00:00`).getTime() / 1000);
      const toTs = Math.floor(new Date(`${to}T23:59:59`).getTime() / 1000);

      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const page = await stripe.refunds.list({
          created: { gte: fromTs, lte: toTs },
          limit: 100,
          expand: ['data.balance_transaction'],
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

        for (const refund of page.data) {
          const bt = refund.balance_transaction;
          if (!bt || typeof bt === 'string') continue;

          const piId =
            refund.payment_intent && typeof refund.payment_intent === 'string'
              ? refund.payment_intent
              : null;

          // bt.fee ist bei payment_refund-BTs negativ (Gegenbuchungsrichtung).
          // Math.abs() liefert den tatsächlichen Gebührenbetrag (z.B. 0,36 €).
          const feeCents = Math.abs(bt.fee);
          const feeEur = feeCents / 100;

          const diagEntry: (typeof diagRefunds)[0] = {
            refund_id: refund.id,
            payment_intent_id: piId,
            refund_amount_eur: refund.amount / 100,
            bt_fee_cents: bt.fee,
            fee_eur: feeEur,
          };
          diagRefunds.push(diagEntry);

          if (feeCents === 0) {
            diagEntry.skipped = 'fee_zero';
            continue;
          }

          // Idempotenz: source_type='stripe_refund_fee', source_id=balance_transaction_id
          const { data: existing } = await supabase
            .from('expenses')
            .select('id')
            .eq('source_type', 'stripe_refund_fee')
            .eq('source_id', bt.id)
            .maybeSingle();

          if (existing) {
            diagEntry.skipped = 'already_exists';
            continue;
          }

          const { error: insertError } = await supabase.from('expenses').insert({
            expense_date: new Date(refund.created * 1000).toISOString().split('T')[0],
            category: 'stripe_fees',
            description: `Stripe-Rückerstattungsgebühr ${refund.id.slice(0, 20)}`,
            vendor: 'Stripe',
            net_amount: feeEur,
            tax_amount: 0,
            gross_amount: feeEur,
            source_type: 'stripe_refund_fee',
            source_id: bt.id,
            is_test: testMode,
          });

          if (insertError) {
            diagEntry.skipped = `insert_error:${insertError.message}`;
            console.error('[import-fees] Insert-Fehler:', insertError);
          } else {
            refundFeesImported++;
          }
        }

        hasMore = page.has_more;
        startingAfter = page.data.length > 0 ? page.data[page.data.length - 1].id : undefined;
        if (!startingAfter) hasMore = false;
      }

      if (diagRefunds.length > 0) {
        console.log('[import-fees] Refunds:', JSON.stringify(diagRefunds));
      }
    } catch (err) {
      console.error('[import-fees] Stripe Refunds Fehler:', err);
      refundFeeError = err instanceof Error ? err.message : String(err);
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
    ...(refundFeeError ? { refundFeeError } : {}),
    ...(diagRefunds.length > 0 ? { diagRefunds } : {}),
  });
}

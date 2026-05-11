import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { isTestMode, getStripeSecretKey } from '@/lib/env-mode';
import { getStripe } from '@/lib/stripe';

/**
 * POST /api/admin/buchhaltung/stripe-reconciliation/import-fees
 * Importiert Stripe-Zahlungsgebühren als Ausgaben (idempotent via source_type + source_id).
 * Bei rückerstatteten Zahlungen wird die Gebühren-Gutschrift von Stripe abgezogen,
 * sodass nur die tatsächlichen Nettogebühren importiert werden.
 * Beispiel: Zahlung 0,87 € Gebühr, Rückerstattung gibt 0,36 € zurück → 0,51 € netto.
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
  let updated = 0;

  // ── Zahlungsgebühren aus stripe_transactions ─────────────────────────────
  const { data: transactions } = await supabase
    .from('stripe_transactions')
    .select('id, stripe_payment_intent_id, fee, stripe_created_at, booking_id, match_status')
    .gt('fee', 0)
    .gte('stripe_created_at', `${from}T00:00:00`)
    .lte('stripe_created_at', `${to}T23:59:59`);

  // ── Rückerstattungs-Gebühren-Gutschriften von Stripe laden ───────────────
  // Bei rückerstatteten Zahlungen erstattet Stripe einen Teil der Gebühr zurück
  // (bt.fee ist negativ bei payment_refund-BTs = Gutschrift).
  // Diese Gutschrift wird von der ursprünglichen Gebühr abgezogen → Nettobetrag.
  const feeRebateMap: Record<string, number> = {}; // payment_intent_id → Rabatt in EUR

  const refundedTxs = (transactions || []).filter(tx => tx.match_status === 'refunded');

  if (refundedTxs.length > 0 && (await getStripeSecretKey())) {
    try {
      const stripe = await getStripe();

      for (const tx of refundedTxs) {
        let startingAfter: string | undefined;
        let hasMore = true;
        let totalRebateCents = 0;

        while (hasMore) {
          const refunds = await stripe.refunds.list({
            payment_intent: tx.stripe_payment_intent_id,
            limit: 100,
            expand: ['data.balance_transaction'],
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          });

          for (const refund of refunds.data) {
            const bt = refund.balance_transaction;
            if (!bt || typeof bt === 'string') continue;
            // bt.fee < 0 = Stripe erstattet Teil der Gebühr zurück (Gutschrift)
            if (bt.fee < 0) {
              totalRebateCents += Math.abs(bt.fee);
            }
          }

          hasMore = refunds.has_more;
          startingAfter =
            refunds.data.length > 0 ? refunds.data[refunds.data.length - 1].id : undefined;
          if (!startingAfter) hasMore = false;
        }

        if (totalRebateCents > 0) {
          feeRebateMap[tx.stripe_payment_intent_id] = totalRebateCents / 100;
        }
      }
    } catch (err) {
      console.error('[import-fees] Stripe Refund-Gebühren-Lookup Fehler:', err);
      // Fallback: ohne Gutschriften fortfahren (Bruttobetrag wird importiert)
    }
  }

  // ── Gebühren importieren (netto nach Abzug der Gutschriften) ─────────────
  for (const tx of transactions || []) {
    const rebate = feeRebateMap[tx.stripe_payment_intent_id] || 0;
    const netFee = Math.round((tx.fee - rebate) * 100) / 100;

    if (netFee <= 0) continue;

    const { data: existing } = await supabase
      .from('expenses')
      .select('id, gross_amount')
      .eq('source_type', 'stripe_fee')
      .eq('source_id', tx.id)
      .maybeSingle();

    if (existing) {
      // Betrag aktualisieren wenn Rückerstattung seit letztem Import stattgefunden hat
      if (Math.abs((existing.gross_amount ?? 0) - netFee) > 0.001) {
        await supabase
          .from('expenses')
          .update({ net_amount: netFee, gross_amount: netFee })
          .eq('id', existing.id);
        updated++;
      }
      continue;
    }

    const { error } = await supabase.from('expenses').insert({
      expense_date: tx.stripe_created_at ? tx.stripe_created_at.split('T')[0] : from,
      category: 'stripe_fees',
      description: `Stripe-Gebühr für ${tx.stripe_payment_intent_id.slice(0, 20)}...`,
      vendor: 'Stripe',
      net_amount: netFee,
      tax_amount: 0,
      gross_amount: netFee,
      source_type: 'stripe_fee',
      source_id: tx.id,
      is_test: testMode,
    });

    if (!error) imported++;
  }

  await logAudit({
    action: 'stripe.import_fees',
    entityType: 'expense',
    changes: {
      from,
      to,
      imported,
      updated,
      paymentFees: (transactions || []).length,
      refundedWithRebate: Object.keys(feeRebateMap).length,
    },
    request: req,
  });

  return NextResponse.json({
    imported,
    updated,
    total: (transactions || []).length,
    refundedWithRebate: Object.keys(feeRebateMap).length,
  });
}

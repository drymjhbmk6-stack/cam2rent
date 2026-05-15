import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';
import { getStripe } from '@/lib/stripe';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

/**
 * POST /api/admin/buchhaltung/stripe-reconciliation/import-fees
 * Importiert Stripe-Zahlungsgebühren als Ausgaben (idempotent via source_type + source_id).
 *
 * Für jede Transaktion werden über stripe.refunds.list() alle Rückerstattungen
 * geladen (expand: balance_transaction). Die Gebühren-Gutschrift (negativer fee
 * auf dem Refund-Balancetransfer) wird vom Bruttobetrag abgezogen:
 *   z.B. 0,87 € − 0,36 € = 0,51 € effektive Gebühr.
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

  // Zahlungsgebühren aus stripe_transactions laden — Berlin-TZ-bewusst
  const fromIso = getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`;
  const toIso = getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`;
  const { data: transactions } = await supabase
    .from('stripe_transactions')
    .select('id, stripe_payment_intent_id, stripe_charge_id, fee, stripe_created_at, booking_id, match_status')
    .gt('fee', 0)
    .gte('stripe_created_at', fromIso)
    .lte('stripe_created_at', toIso);

  for (const tx of transactions || []) {
    // Idempotenz: bereits importiert? → überspringen
    const { data: existing } = await supabase
      .from('expenses')
      .select('id')
      .eq('source_type', 'stripe_fee')
      .eq('source_id', tx.id)
      .maybeSingle();

    if (existing) continue;

    // Effektive Gebühr ermitteln:
    // Stripe-Rückerstattungs-Balance-Transaktionen hängen an der REFUND-ID
    // (nicht an der Charge-ID), daher über stripe.refunds.list() mit expand.
    let effectiveFee: number = tx.fee;

    try {
      const stripe = await getStripe();

      // Alle Rückerstattungen für diesen PaymentIntent mit Balancetransfer laden
      const refunds = await stripe.refunds.list({
        payment_intent: tx.stripe_payment_intent_id,
        limit: 10,
        expand: ['data.balance_transaction'],
      });

      let refundFeeCredit = 0;
      for (const refund of refunds.data) {
        const bt = refund.balance_transaction;
        // balance_transaction ist expandiert → Objekt mit fee-Feld
        if (bt && typeof bt === 'object' && 'fee' in bt) {
          // fee ist negativ bei Rückerstattungen (Gutschrift von Stripe), z.B. -36 Cent
          refundFeeCredit += (bt as { fee: number }).fee / 100;
        }
      }

      if (refundFeeCredit < 0) {
        // Gutschrift abziehen: 0,87 + (−0,36) = 0,51
        effectiveFee = Math.max(0, tx.fee + refundFeeCredit);
      }
    } catch (err) {
      // Bei Stripe-API-Fehler: Bruttobetrag als Fallback
      console.error('[import-fees] Stripe-API-Fehler für', tx.stripe_payment_intent_id, err);
      effectiveFee = tx.fee;
    }

    // Gebühr als Ausgabe verbuchen
    const { error } = await supabase.from('expenses').insert({
      expense_date: tx.stripe_created_at ? tx.stripe_created_at.split('T')[0] : from,
      category: 'stripe_fees',
      description: `Stripe-Gebühr für ${tx.stripe_payment_intent_id.slice(0, 20)}...`,
      vendor: 'Stripe',
      net_amount: effectiveFee,
      tax_amount: 0,
      gross_amount: effectiveFee,
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
      paymentFees: (transactions || []).length,
    },
    request: req,
  });

  return NextResponse.json({
    imported,
    total: (transactions || []).length,
  });
}

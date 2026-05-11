import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';
import { getStripe } from '@/lib/stripe';

/**
 * POST /api/admin/buchhaltung/stripe-reconciliation/import-fees
 * Importiert Stripe-Zahlungsgebühren als Ausgaben (idempotent via source_type + source_id).
 *
 * Für jede Transaktion wird über die Stripe-API geprüft, ob es
 * Rückerstattungs-Balancetransaktionen (payment_refund) gibt.
 * Falls ja, wird der Gebühren-Credit abgezogen:
 *   z.B. 0,87 € Gebühr − 0,36 € Gutschrift = 0,51 € effektive Gebühr.
 * Falls keine Rückerstattung: Bruttobetrag wird importiert.
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

  // Zahlungsgebühren aus stripe_transactions laden
  const { data: transactions } = await supabase
    .from('stripe_transactions')
    .select('id, stripe_payment_intent_id, stripe_charge_id, fee, stripe_created_at, booking_id, match_status')
    .gt('fee', 0)
    .gte('stripe_created_at', `${from}T00:00:00`)
    .lte('stripe_created_at', `${to}T23:59:59`);

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
    // Immer Stripe-API prüfen ob es Rückerstattungs-Credits gibt —
    // unabhängig vom match_status, da z.B. 'unmatched' auch rückerstattet sein kann.
    let effectiveFee: number = tx.fee;

    if (tx.stripe_charge_id) {
      try {
        const stripe = await getStripe();
        // Alle Balance-Transaktionen für diese Charge (inkl. Refund-BTs)
        const bts = await stripe.balanceTransactions.list({
          source: tx.stripe_charge_id,
          limit: 10,
        });
        // payment_refund-BTs haben negativen fee (= Gebühren-Gutschrift von Stripe)
        let refundFeeCredit = 0;
        for (const bt of bts.data) {
          if (bt.type === 'payment_refund') {
            refundFeeCredit += bt.fee / 100; // Cent → Euro, Wert ist negativ
          }
        }
        if (refundFeeCredit < 0) {
          // Gutschrift abziehen (z.B. 0,87 + (−0,36) = 0,51)
          effectiveFee = Math.max(0, tx.fee + refundFeeCredit);
        }
      } catch (err) {
        // Bei Stripe-API-Fehler: Bruttobetrag als Fallback
        console.error('[import-fees] Stripe-API-Fehler:', err);
        effectiveFee = tx.fee;
      }
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

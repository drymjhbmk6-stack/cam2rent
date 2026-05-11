import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';

/**
 * POST /api/admin/buchhaltung/stripe-reconciliation/import-fees
 * Importiert Stripe-Zahlungsgebühren als Ausgaben (idempotent via source_type + source_id).
 * Nur Zahlungsgebühren aus stripe_transactions — Rückerstattungsgebühren sind
 * Gutschriften von Stripe (keine Ausgaben) und werden nicht importiert.
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

  // Zahlungsgebühren aus stripe_transactions
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

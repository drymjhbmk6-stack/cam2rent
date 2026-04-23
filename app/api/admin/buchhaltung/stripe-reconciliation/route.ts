import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  const supabase = createServiceClient();

  let query = supabase
    .from('stripe_transactions')
    .select('id, stripe_payment_intent_id, stripe_created_at, booking_id, amount, fee, net, match_status')
    .order('stripe_created_at', { ascending: false });

  if (from) query = query.gte('stripe_created_at', `${from}T00:00:00`);
  if (to) query = query.lte('stripe_created_at', `${to}T23:59:59`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const transactions = data || [];
  const matched = transactions.filter(t => t.match_status === 'matched' || t.match_status === 'manual').length;
  const unmatchedStripe = transactions.filter(t => t.match_status === 'unmatched').length;
  const totalFees = transactions.reduce((sum, t) => sum + (t.fee || 0), 0);

  // Buchungen ohne Stripe prüfen
  let unmatchedBooking = 0;
  if (from && to) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, payment_intent_id')
      .neq('status', 'cancelled')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`);

    const stripeIds = new Set(transactions.map(t => t.stripe_payment_intent_id));
    unmatchedBooking = (bookings || []).filter(b => b.payment_intent_id && !stripeIds.has(b.payment_intent_id)).length;
  }

  return NextResponse.json({
    transactions,
    summary: {
      total: transactions.length,
      matched,
      unmatched_stripe: unmatchedStripe,
      unmatched_booking: unmatchedBooking,
      total_fees: totalFees,
    },
  });
}

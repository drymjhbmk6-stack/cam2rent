import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const fromIso = from ? (getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`) : null;
  const toIso = to ? (getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`) : null;

  const supabase = createServiceClient();

  const txCols = 'id, stripe_payment_intent_id, stripe_created_at, booking_id, amount, fee, net, match_status, reconciliation_note';
  const buildTxQuery = (cols: string) => {
    let q = supabase
      .from('stripe_transactions')
      .select(cols)
      .order('stripe_created_at', { ascending: false });
    if (fromIso) q = q.gte('stripe_created_at', fromIso);
    if (toIso) q = q.lte('stripe_created_at', toIso);
    return q;
  };

  let { data, error } = await buildTxQuery(txCols);
  if (error && /reconciliation_note|column|schema cache|PGRST/i.test(error.message)) {
    // Migration supabase-bookings-refund.sql noch nicht durch.
    ({ data, error } = await buildTxQuery(txCols.replace(', reconciliation_note', '')));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // .select(<string-variable>) verliert die PostgREST-Typinferenz → Cast.
  type TxRow = {
    id: string; stripe_payment_intent_id: string; stripe_created_at: string;
    booking_id: string | null; amount: number; fee: number; net: number;
    match_status: string; reconciliation_note?: string | null;
  };
  const transactions = (data ?? []) as unknown as TxRow[];
  const matched = transactions.filter(t => t.match_status === 'matched' || t.match_status === 'manual').length;
  const unmatchedStripe = transactions.filter(t => t.match_status === 'unmatched').length;
  const totalFees = transactions.reduce((sum, t) => sum + (t.fee || 0), 0);

  // Buchungen ohne Stripe prüfen
  let unmatchedBooking = 0;
  if (fromIso && toIso) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, payment_intent_id')
      .neq('status', 'cancelled')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);

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

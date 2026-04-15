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
    .select('*')
    .order('stripe_created_at', { ascending: false });

  if (from) query = query.gte('stripe_created_at', `${from}T00:00:00`);
  if (to) query = query.lte('stripe_created_at', `${to}T23:59:59`);

  const { data } = await query;

  const lines = ['Datum;Stripe-PI;Buchungs-Nr.;Brutto;Gebühr;Netto;Status;Match-Status'];
  for (const tx of data || []) {
    lines.push([
      tx.stripe_created_at ? new Date(tx.stripe_created_at).toLocaleDateString('de-DE') : '',
      tx.stripe_payment_intent_id || '',
      tx.booking_id || '',
      (tx.amount || 0).toFixed(2).replace('.', ','),
      (tx.fee || 0).toFixed(2).replace('.', ','),
      (tx.net || 0).toFixed(2).replace('.', ','),
      tx.status || '',
      tx.match_status || '',
    ].join(';'));
  }

  const csv = '\uFEFF' + lines.join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="stripe-abgleich-${from || 'all'}-${to || 'all'}.csv"`,
    },
  });
}

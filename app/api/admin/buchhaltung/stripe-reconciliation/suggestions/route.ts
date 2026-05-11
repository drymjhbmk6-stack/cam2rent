import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * GET /api/admin/buchhaltung/stripe-reconciliation/suggestions?amount=X
 * Gibt Buchungen zurück, deren Gesamtbetrag ungefähr dem Stripe-Betrag entspricht
 * und die noch nicht manuell oder automatisch verknüpft sind.
 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const amountParam = req.nextUrl.searchParams.get('amount');
  const amount = amountParam ? parseFloat(amountParam) : null;

  const supabase = createServiceClient();

  // Alle bereits verknüpften Buchungs-IDs aus stripe_transactions
  const { data: matched } = await supabase
    .from('stripe_transactions')
    .select('booking_id')
    .not('booking_id', 'is', null)
    .in('match_status', ['matched', 'manual']);

  const matchedIds = new Set((matched || []).map((m) => m.booking_id).filter(Boolean));

  // Buchungen laden (nicht storniert, nicht Test)
  let query = supabase
    .from('bookings')
    .select('id, customer_name, customer_email, price_total, created_at, status')
    .eq('is_test', false)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(200);

  // Betrag-Filter: ±2 € Toleranz (Stripe-Gebühren können abweichen)
  if (amount !== null) {
    query = query
      .gte('price_total', amount - 2)
      .lte('price_total', amount + 2);
  }

  const { data: bookings } = await query;

  const suggestions = (bookings || [])
    .filter((b) => !matchedIds.has(b.id))
    .map((b) => ({
      id: b.id,
      customer_name: b.customer_name || b.customer_email || '—',
      price_total: b.price_total,
      created_at: b.created_at,
      status: b.status,
    }));

  return NextResponse.json({ suggestions });
}

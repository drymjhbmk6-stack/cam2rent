import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/alle-buchungen
 * Query params:
 *   status: 'confirmed' | 'shipped' | 'completed' | 'cancelled' | 'all' (default: all)
 *   limit: number (default: 100)
 *
 * Gibt alle Buchungen zurück, sortiert nach Erstellungsdatum (neueste zuerst).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') ?? 'all';
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);

  const supabase = createServiceClient();

  let query = supabase
    .from('bookings')
    .select(
      'id, product_name, rental_from, rental_to, days, price_total, deposit, status, delivery_mode, shipping_method, customer_email, customer_name, tracking_number, created_at, user_id, deposit_intent_id, deposit_status, suspicious, suspicious_reasons, original_rental_to, extended_at, contract_signed, contract_signed_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Supabase error:', error);
    return NextResponse.json({ error: 'Buchungen konnten nicht geladen werden.' }, { status: 500 });
  }

  // Blacklist-Status für Buchungen mit user_id anhängen
  const bookings = data ?? [];
  const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))];

  const blacklistMap = new Map<string, boolean>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, blacklisted')
      .in('id', userIds)
      .eq('blacklisted', true);

    if (profiles) {
      for (const p of profiles) {
        blacklistMap.set(p.id, true);
      }
    }
  }

  const enrichedBookings = bookings.map((b) => ({
    ...b,
    customer_blacklisted: b.user_id ? blacklistMap.has(b.user_id) : false,
  }));

  return NextResponse.json({ bookings: enrichedBookings });
}

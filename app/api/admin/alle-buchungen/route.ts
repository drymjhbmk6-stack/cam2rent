import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  // Untypisierter Handle: die neue Spalte booking_type ist (noch) nicht im
  // generierten Schema-Typ — ein dynamischer Select damit waere sonst als
  // GenericStringError typisiert.
  const sb = supabase as unknown as SupabaseClient;

  const COLS = 'id, product_name, rental_from, rental_to, days, price_total, deposit, status, delivery_mode, shipping_method, customer_email, customer_name, tracking_number, created_at, user_id, deposit_intent_id, deposit_status, suspicious, suspicious_reasons, original_rental_to, extended_at, contract_signed, contract_signed_at, is_test, ship_date_override, return_due_date_override';

  interface BookingRow {
    id: string;
    user_id: string | null;
    booking_type?: string;
    [k: string]: unknown;
  }
  type QResult = { data: BookingRow[] | null; error: { message: string } | null };

  const runQuery = (cols: string) => {
    let q = sb
      .from('bookings')
      .select(cols)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status !== 'all') q = q.eq('status', status);
    return q;
  };

  // Defensiver Retry-Stack: erst alle Spalten, sonst override-Spalten droppen,
  // sonst booking_type droppen. Migrationen koennen unabhaengig fehlen.
  const COLS_NO_OVERRIDE = COLS.replace(', ship_date_override, return_due_date_override', '');
  let res = (await runQuery(`${COLS}, booking_type`)) as unknown as QResult;
  if (res.error && /ship_date_override|return_due_date_override/i.test(res.error.message || '')) {
    res = (await runQuery(`${COLS_NO_OVERRIDE}, booking_type`)) as unknown as QResult;
  }
  if (res.error && /booking_type/i.test(res.error.message || '')) {
    res = (await runQuery(COLS_NO_OVERRIDE)) as unknown as QResult;
  }

  if (res.error) {
    console.error('Supabase error:', res.error);
    return NextResponse.json({ error: 'Buchungen konnten nicht geladen werden.' }, { status: 500 });
  }

  // Verkäufe (booking_type='kauf') gehören nicht in die Miet-Buchungsliste —
  // sie werden unter /admin/verkauf verwaltet.
  const bookings = (res.data ?? []).filter((b) => b.booking_type !== 'kauf');
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

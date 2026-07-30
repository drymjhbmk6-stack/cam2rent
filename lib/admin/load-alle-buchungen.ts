import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';

/**
 * Lädt alle Miet-Buchungen (ohne Verkäufe), sortiert nach Erstellungsdatum
 * (neueste zuerst), angereichert um `customer_blacklisted`.
 *
 * Geteilte Logik von `GET /api/admin/alle-buchungen` UND dem server-gerenderten
 * `/admin/buchungen`-Page. Eine Wahrheitsquelle → kein Divergieren zwischen
 * Client-Fetch und SSR.
 *
 * Wirft NIE — bei DB-Fehler kommt `{ bookings: [], error }` zurück, damit die
 * SSR-Page trotzdem rendert (der Client-Refetch heilt).
 */

export interface AlleBuchungenRow {
  id: string;
  user_id: string | null;
  booking_type?: string;
  customer_blacklisted?: boolean;
  [k: string]: unknown;
}

const COLS =
  'id, product_name, rental_from, rental_to, days, price_total, deposit, status, delivery_mode, shipping_method, customer_email, customer_name, shipping_address, tracking_number, tracking_url, label_url, return_label_url, created_at, user_id, deposit_intent_id, deposit_status, suspicious, suspicious_reasons, original_rental_to, extended_at, contract_signed, contract_signed_at, is_test, ship_date_override, return_due_date_override';

type QResult = { data: AlleBuchungenRow[] | null; error: { message: string } | null };

export async function loadAlleBuchungen(
  opts: { status?: string; limit?: number } = {},
): Promise<{ bookings: AlleBuchungenRow[]; error: string | null }> {
  const status = opts.status ?? 'all';
  const limit = opts.limit ?? 100;

  const supabase = createServiceClient();
  // Untypisierter Handle: booking_type ist (noch) nicht im generierten Schema.
  const sb = supabase as unknown as SupabaseClient;

  const runQuery = (cols: string) => {
    let q = sb.from('bookings').select(cols).order('created_at', { ascending: false }).limit(limit);
    if (status !== 'all') q = q.eq('status', status);
    return q;
  };

  // Defensiver Retry-Stack: erst alle Spalten, sonst override-Spalten droppen,
  // sonst booking_type droppen. Migrationen können unabhängig fehlen.
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
    return { bookings: [], error: 'Buchungen konnten nicht geladen werden.' };
  }

  // Verkäufe (booking_type='kauf') gehören nicht in die Miet-Buchungsliste.
  const bookings = (res.data ?? []).filter((b) => b.booking_type !== 'kauf');
  const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))] as string[];

  const blacklistMap = new Map<string, boolean>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, blacklisted')
      .in('id', userIds)
      .eq('blacklisted', true);
    if (profiles) {
      for (const p of profiles) blacklistMap.set(p.id as string, true);
    }
  }

  const enrichedBookings = bookings.map((b) => ({
    ...b,
    customer_blacklisted: b.user_id ? blacklistMap.has(b.user_id) : false,
  }));

  return { bookings: enrichedBookings, error: null };
}

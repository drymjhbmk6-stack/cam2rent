import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { isTestMode } from '@/lib/env-mode';
import { getBerlinDaysAgoISO } from '@/lib/timezone';

/**
 * GET /api/admin/booking-interest?days=30
 *
 * Aggregierte Nachfrage-Analyse aus der anonymen `booking_interest`-Telemetrie:
 * Top-Kameras, Top-Zubehoer, Verteilung der Mietdauer, Lieferart, Haftung.
 *
 * Permission: berichte (siehe middleware API_PATH_PERMISSIONS).
 */

interface InterestRow {
  product_id: string | null;
  product_name: string | null;
  set_id: string | null;
  set_name: string | null;
  accessories: { id: string; name: string; qty: number }[] | null;
  rental_days: number | null;
  delivery_mode: string | null;
  haftung: string | null;
  created_at: string;
}

function bumpName(map: Map<string, { name: string; count: number }>, key: string, name: string, by = 1) {
  const cur = map.get(key);
  if (cur) {
    cur.count += by;
    if (name && name !== key) cur.name = name;
  } else {
    map.set(key, { name: name || key, count: by });
  }
}

function topList(map: Map<string, { name: string; count: number }>, limit = 20) {
  return [...map.entries()]
    .map(([id, v]) => ({ id, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const daysParam = parseInt(req.nextUrl.searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  const supabase = createServiceClient();
  const testMode = await isTestMode();
  const since = getBerlinDaysAgoISO(days);

  const { data, error } = await supabase
    .from('booking_interest')
    .select('product_id, product_name, set_id, set_name, accessories, rental_days, delivery_mode, haftung, created_at')
    .eq('is_test', testMode)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    if (/booking_interest|relation|does not exist|schema cache|PGRST/i.test(error.message)) {
      return NextResponse.json({ migration_pending: true, total: 0, cameras: [], accessories: [], sets: [], duration: [], delivery: [], haftung: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as InterestRow[];

  const cameras = new Map<string, { name: string; count: number }>();
  const accessories = new Map<string, { name: string; count: number }>();
  const sets = new Map<string, { name: string; count: number }>();
  const durationBuckets: Record<string, number> = { '1': 0, '2-3': 0, '4-7': 0, '8-14': 0, '15-30': 0, '30+': 0 };
  const delivery: Record<string, number> = { versand: 0, abholung: 0 };
  const haftung: Record<string, number> = { premium: 0, standard: 0, none: 0 };

  for (const r of rows) {
    if (r.product_id) bumpName(cameras, r.product_id, r.product_name ?? r.product_id);
    if (r.set_id) bumpName(sets, r.set_id, r.set_name ?? r.set_id);
    if (Array.isArray(r.accessories)) {
      for (const a of r.accessories) {
        if (a?.id) bumpName(accessories, a.id, a.name ?? a.id, a.qty && a.qty > 0 ? a.qty : 1);
      }
    }
    const d = r.rental_days;
    if (typeof d === 'number' && d > 0) {
      if (d === 1) durationBuckets['1']++;
      else if (d <= 3) durationBuckets['2-3']++;
      else if (d <= 7) durationBuckets['4-7']++;
      else if (d <= 14) durationBuckets['8-14']++;
      else if (d <= 30) durationBuckets['15-30']++;
      else durationBuckets['30+']++;
    }
    if (r.delivery_mode === 'versand' || r.delivery_mode === 'abholung') delivery[r.delivery_mode]++;
    if (r.haftung && r.haftung in haftung) haftung[r.haftung]++;
  }

  return NextResponse.json({
    total: rows.length,
    days,
    cameras: topList(cameras),
    accessories: topList(accessories),
    sets: topList(sets),
    duration: Object.entries(durationBuckets).map(([bucket, count]) => ({ bucket, count })),
    delivery: Object.entries(delivery).map(([mode, count]) => ({ mode, count })),
    haftung: Object.entries(haftung).map(([option, count]) => ({ option, count })),
  });
}

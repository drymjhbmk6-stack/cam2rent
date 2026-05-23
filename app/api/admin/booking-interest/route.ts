import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { isTestMode } from '@/lib/env-mode';
import {
  getBerlinDaysAgoISO,
  getBerlinDayStartFromDateString,
  getBerlinDayEndFromDateString,
} from '@/lib/timezone';

/**
 * GET /api/admin/booking-interest
 *
 * Aggregierte Nachfrage-Analyse aus der anonymen `booking_interest`-Telemetrie:
 * Top-Kameras, Top-Zubehoer, Verteilung der Mietdauer, Lieferart, Haftung.
 *
 * Zeitraum-Auswahl (Praezedenz von oben nach unten):
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD  → freier Zeitraum (inkl. ganzem to-Tag)
 *   ?hours=24                       → rollende N Stunden zurueck (1..168)
 *   ?days=30                        → Berlin-Tages-Buckets (1..365, Default 30)
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

function parseRange(req: NextRequest): {
  since: string;
  until: string | null;
  mode: 'custom' | 'hours' | 'days';
  hours?: number;
  days?: number;
  from?: string;
  to?: string;
} {
  const params = req.nextUrl.searchParams;
  const fromStr = params.get('from');
  const toStr = params.get('to');
  if (fromStr && toStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr) && /^\d{4}-\d{2}-\d{2}$/.test(toStr) && fromStr <= toStr) {
    const since = getBerlinDayStartFromDateString(fromStr);
    const until = getBerlinDayEndFromDateString(toStr);
    if (since && until) {
      return { since, until, mode: 'custom', from: fromStr, to: toStr };
    }
  }

  const hoursParam = parseInt(params.get('hours') || '', 10);
  if (Number.isFinite(hoursParam) && hoursParam > 0 && hoursParam <= 168) {
    const since = new Date(Date.now() - hoursParam * 60 * 60 * 1000).toISOString();
    return { since, until: null, mode: 'hours', hours: hoursParam };
  }

  const daysParam = parseInt(params.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;
  return { since: getBerlinDaysAgoISO(days), until: null, mode: 'days', days };
}

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const range = parseRange(req);
  const supabase = createServiceClient();
  const testMode = await isTestMode();

  let query = supabase
    .from('booking_interest')
    .select('product_id, product_name, set_id, set_name, accessories, rental_days, delivery_mode, haftung, created_at')
    .eq('is_test', testMode)
    .gte('created_at', range.since)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (range.until) query = query.lte('created_at', range.until);

  const { data, error } = await query;

  if (error) {
    if (/booking_interest|relation|does not exist|schema cache|PGRST/i.test(error.message)) {
      return NextResponse.json({
        migration_pending: true,
        total: 0,
        cameras: [],
        accessories: [],
        sets: [],
        duration: [],
        delivery: [],
        haftung: [],
        range: { mode: range.mode, days: range.days, hours: range.hours, from: range.from, to: range.to },
      });
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
    range: { mode: range.mode, days: range.days, hours: range.hours, from: range.from, to: range.to },
    // backward-compat: alte UI las `days` direkt vom Root
    days: range.days,
    cameras: topList(cameras),
    accessories: topList(accessories),
    sets: topList(sets),
    duration: Object.entries(durationBuckets).map(([bucket, count]) => ({ bucket, count })),
    delivery: Object.entries(delivery).map(([mode, count]) => ({ mode, count })),
    haftung: Object.entries(haftung).map(([option, count]) => ({ option, count })),
  });
}

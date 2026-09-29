import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';
import { RESERVING_BOOKING_STATUSES } from '@/lib/booking-statuses';
import { loadBufferDays, isoAddDays } from '@/lib/booking-buffer';
import { getBerlinDateString } from '@/lib/timezone';
import {
  VACATION_SETTINGS_KEY,
  normalizeVacationConfig,
  invalidateVacationCache,
} from '@/lib/vacation-mode';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/urlaub
 * Urlaubszeiträume + pro kommendem Urlaub die bereits bestehenden Buchungen,
 * deren Versand/Rückgabe in den Urlaub fällt (die bleiben bestehen und müssen
 * vorher bzw. nachher erledigt werden).
 * Permission: tagesgeschaeft (middleware.ts).
 */
export async function GET() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', VACATION_SETTINGS_KEY)
    .maybeSingle();
  const { periods } = normalizeVacationConfig(data?.value);

  const today = getBerlinDateString();
  const upcoming = periods.filter((p) => p.to >= today);
  const affected: Record<string, { id: string; customer_name: string | null; product_name: string | null; rental_from: string; rental_to: string; status: string; delivery_mode: string | null }[]> = {};

  if (upcoming.length > 0) {
    try {
      const buf = await loadBufferDays(supabase, {
        versand_before: 2, versand_after: 2, abholung_before: 0, abholung_after: 1,
      });
      const maxBuf = Math.max(buf.versand_before, buf.versand_after, buf.abholung_before, buf.abholung_after);
      const globalTest = await isTestMode();
      const minFrom = upcoming.reduce((a, p) => (p.from < a ? p.from : a), upcoming[0].from);
      const maxTo = upcoming.reduce((a, p) => (p.to > a ? p.to : a), upcoming[0].to);
      let q = supabase
        .from('bookings')
        .select('id, customer_name, product_name, rental_from, rental_to, status, delivery_mode')
        .in('status', [...RESERVING_BOOKING_STATUSES])
        .lte('rental_from', isoAddDays(maxTo, maxBuf))
        .gte('rental_to', isoAddDays(minFrom, -maxBuf))
        .order('rental_from', { ascending: true })
        .limit(300);
      if (!globalTest) q = q.not('is_test', 'is', true);
      const { data: rows } = await q;
      for (const p of upcoming) {
        affected[p.id] = (rows ?? []).filter((b) => {
          const abh = b.delivery_mode === 'abholung';
          const ship = isoAddDays(b.rental_from, -(abh ? buf.abholung_before : buf.versand_before));
          const ret = isoAddDays(b.rental_to, abh ? buf.abholung_after : buf.versand_after);
          return ship <= p.to && ret >= p.from;
        });
      }
    } catch (e) {
      console.error('[urlaub] Buchungs-Lookup fehlgeschlagen:', e);
    }
  }

  return NextResponse.json({ periods, affected });
}

/**
 * PUT /api/admin/urlaub  Body: { periods: [{ id?, from, to, note? }] }
 * Ersetzt die komplette Liste.
 */
export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }
  const config = normalizeVacationConfig(body);
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('admin_settings')
    .upsert(
      { key: VACATION_SETTINGS_KEY, value: config, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  if (error) {
    console.error('[urlaub] Speichern fehlgeschlagen:', error);
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  invalidateVacationCache();
  await logAudit({
    action: 'vacation.update',
    entityType: 'settings',
    entityId: VACATION_SETTINGS_KEY,
    changes: { periods: config.periods },
    request: req,
  });
  return NextResponse.json({ periods: config.periods });
}

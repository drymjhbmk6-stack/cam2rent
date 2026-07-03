import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getBerlinDateString, getBerlinHour } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cookieloser Besucherzähler: zählt JEDEN Besuch, unabhängig vom
// Cookie-Consent. Speichert keinen Personenbezug (keine IP, keine visitor_id,
// kein Cookie) — nur pro Tag eine Zähl-Zeile in `site_visits`.

const visitLimiter = rateLimit({ maxAttempts: 30, windowMs: 60 * 1000 }); // 30/Min pro IP

const BOT_REGEX =
  /bot|crawler|spider|scraper|curl|wget|python|java|go-http|ruby|perl|phpunit|googlebot|bingbot|yandex|baidu|duckduckbot|slurp|semrush|ahref|mj12|dotbot/i;

// ── POST: einen Besuch zählen ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = visitLimiter.check(ip);
  if (!success) return NextResponse.json({ ok: true }); // leise ignorieren

  const ua = req.headers.get('user-agent') ?? '';
  if (BOT_REGEX.test(ua)) return NextResponse.json({ ok: true });

  // Admin-Self-Exclude (gleicher Marker wie /api/track) — eigene Test-Besuche
  // sollen den öffentlichen Zähler nicht hochtreiben.
  if (req.cookies.get('cam2rent_no_track')?.value === '1') {
    return NextResponse.json({ ok: true, skipped: 'admin' });
  }

  try {
    const supabase = createServiceClient();
    const now = new Date();
    const berlinDay = getBerlinDateString(now);
    const { error } = await supabase.rpc('increment_site_visit', {
      p_day: berlinDay,
    });
    // Defensiv: fehlt die Migration (Tabelle/RPC), wird der Besuch nur nicht
    // gezählt — die App bleibt unberührt.
    if (error && !/function|does not exist|schema cache|PGRST202/i.test(error.message)) {
      console.error('[visit] increment failed:', error.message);
    }

    // Stunden-Auflösung für das "nach Stunde"-Balkendiagramm (Grün = ohne
    // Cookies). Eigene Migration `supabase-site-visits-hourly.sql` — defensiv,
    // falls noch nicht ausgeführt.
    const { error: hErr } = await supabase.rpc('increment_site_visit_hourly', {
      p_day: berlinDay,
      p_hour: getBerlinHour(now),
    });
    if (hErr && !/function|does not exist|schema cache|PGRST202/i.test(hErr.message)) {
      console.error('[visit] hourly increment failed:', hErr.message);
    }
  } catch (err) {
    console.error('[visit] increment threw:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}

// ── GET: Gesamt- + Heute-Zähler (für die Startseiten-Anzeige) ───────────────
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('site_visits')
      .select('day, visits');

    if (error) {
      // Migration ausstehend → 0/0, kein Fehler an den Client.
      return NextResponse.json({ total: 0, today: 0 });
    }

    const today = getBerlinDateString();
    let total = 0;
    let todayCount = 0;
    for (const row of data ?? []) {
      const v = Number(row.visits) || 0;
      total += v;
      if (row.day === today) todayCount = v;
    }

    return NextResponse.json(
      { total, today: todayCount },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
    );
  } catch {
    return NextResponse.json({ total: 0, today: 0 });
  }
}

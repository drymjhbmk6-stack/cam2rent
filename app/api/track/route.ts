import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const trackLimiter = rateLimit({ maxAttempts: 60, windowMs: 60 * 1000 }); // 60 pro Min

const BOT_REGEX =
  /bot|crawler|spider|scraper|curl|wget|python|java|go-http|ruby|perl|phpunit|googlebot|bingbot|yandex|baidu|duckduckbot|slurp|semrush|ahref|mj12|dotbot/i;

function parseUserAgent(ua: string) {
  let device_type = 'desktop';
  if (/mobile/i.test(ua) && !/tablet|ipad/i.test(ua)) device_type = 'mobile';
  else if (/tablet|ipad/i.test(ua)) device_type = 'tablet';

  let browser = 'Andere';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/firefox\/[\d.]+/i.test(ua)) browser = 'Firefox';
  else if (/chrome\/[\d.]+/i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/safari\/[\d.]+/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';

  let os = 'Andere';
  if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  return { device_type, browser, os };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = trackLimiter.check(ip);
  if (!success) return NextResponse.json({ ok: true }); // Leise ignorieren

  const ua = req.headers.get('user-agent') ?? '';
  if (BOT_REGEX.test(ua)) return NextResponse.json({ ok: true });

  // Admin-Self-Exclude: wenn Cookie cam2rent_no_track=1 gesetzt ist (z.B. vom
  // Admin selbst beim Testen seiner eigenen Seite) → stumm verwerfen.
  // Cookie wird per UI in /admin/einstellungen gesetzt und hält 1 Jahr.
  if (req.cookies.get('cam2rent_no_track')?.value === '1') {
    return NextResponse.json({ ok: true, skipped: 'admin' });
  }

  const body = await req.json().catch(() => null);
  if (!body?.visitor_id || !body?.path) return NextResponse.json({ ok: false });

  const { device_type, browser, os } = parseUserAgent(ua);

  // Land aus Cloudflare-Header (cam2rent läuft hinter Cloudflare). ISO-2-Code,
  // z.B. "DE". "XX"/"T1" (unbekannt/Tor) und Nicht-2-Buchstaben → null.
  const cfCountry = (req.headers.get('cf-ipcountry') ?? '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(cfCountry) && cfCountry !== 'XX' && cfCountry !== 'T1'
    ? cfCountry
    : null;

  // Region (Bundesland) + Stadt — nur vorhanden, wenn der Cloudflare Managed
  // Transform „Add visitor location headers" aktiv ist (sonst null).
  const cleanGeo = (v: string | null): string | null => {
    const s = (v ?? '').trim().slice(0, 120);
    return s.length > 0 ? s : null;
  };
  const region = cleanGeo(req.headers.get('cf-region'));
  const city = cleanGeo(req.headers.get('cf-ipcity'));

  try {
    const supabase = createServiceClient();
    const row: Record<string, unknown> = {
      visitor_id: body.visitor_id,
      session_id: body.session_id ?? '',
      path: body.path,
      referrer: body.referrer || null,
      user_agent: ua,
      device_type,
      browser,
      os,
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      country,
      region,
      city,
    };
    let { error } = await supabase.from('page_views').insert(row);
    // Defensiv: Geo-Spalte(n) fehlen (Migration ausstehend) → die im Fehler
    // genannte Spalte strippen und erneut versuchen. Schleife deckt jede
    // Kombination aus fehlenden country/region/city-Spalten ab, ohne die
    // bereits vorhandenen Geo-Felder zu verlieren.
    let attempt = 0;
    while (error && attempt < 3 && /column|schema cache|PGRST204/i.test(error.message)) {
      const m = error.message.toLowerCase();
      let changed = false;
      for (const k of ['country', 'region', 'city'] as const) {
        if (k in row && m.includes(k)) { delete row[k]; changed = true; }
      }
      if (!changed) { delete row.country; delete row.region; delete row.city; }
      ({ error } = await supabase.from('page_views').insert(row));
      attempt++;
    }
    if (error) {
      // Mit Log (nicht stumm) — hilft Fehlerdiagnose z.B. bei fehlender Tabelle
      console.error('[track] page_views insert failed:', error.message);
    }
  } catch (err) {
    // Tracking darf die App nie kaputt machen, aber geloggt wird es
    console.error('[track] page_views insert threw:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}

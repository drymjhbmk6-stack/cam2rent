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

  const body = await req.json().catch(() => null);
  if (!body?.visitor_id || !body?.path) return NextResponse.json({ ok: false });

  const { device_type, browser, os } = parseUserAgent(ua);

  try {
    const supabase = createServiceClient();
    await supabase.from('page_views').insert({
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
    });
  } catch {
    // Silently fail — tracking should never break the app
  }

  return NextResponse.json({ ok: true });
}

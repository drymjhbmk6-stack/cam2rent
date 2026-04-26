import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { BUSINESS } from '@/lib/business-config';
import { fmtEuro } from '@/lib/format-utils';
import { getBerlinDayStart } from '@/lib/timezone';
import { getSiteUrl, getResendFromEmail } from '@/lib/env-mode';

// Platzhalter-Key, damit Modul-Import beim Build ohne RESEND_API_KEY nicht kippt.
const resend = new Resend(process.env.RESEND_API_KEY || 're_build_placeholder');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? BUSINESS.emailKontakt;

function pct(a: number, b: number): string {
  if (b === 0) return '0%';
  return `${Math.round((a / b) * 100)}%`;
}

function trend(current: number, previous: number): string {
  if (previous === 0) return '';
  const diff = current - previous;
  const p = Math.abs(Math.round((diff / previous) * 100));
  return diff >= 0 ? `<span style="color:#10b981">↑ ${p}%</span>` : `<span style="color:#ef4444">↓ ${p}%</span>`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const BASE_URL = await getSiteUrl();
  const FROM_EMAIL = await getResendFromEmail();

  // Yesterday range — Berlin-Mitternacht als UTC, sonst Timezone-Drift
  const yesterday = getBerlinDayStart(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const yesterdayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1);

  // Day before yesterday (fuer Vergleichs-Prozente)
  const dayBefore = getBerlinDayStart(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));

  const [ydViews, dbViews, ydBookings] = await Promise.all([
    supabase.from('page_views').select('session_id, visitor_id, path, device_type')
      .gte('created_at', yesterday.toISOString())
      .lte('created_at', yesterdayEnd.toISOString()),
    supabase.from('page_views').select('session_id, visitor_id')
      .gte('created_at', dayBefore.toISOString())
      .lt('created_at', yesterday.toISOString()),
    supabase.from('bookings').select('total_price, product_id')
      .gte('created_at', yesterday.toISOString())
      .lte('created_at', yesterdayEnd.toISOString())
      .neq('status', 'cancelled'),
  ]);

  const yd = ydViews.data ?? [];
  const db = dbViews.data ?? [];
  const bookings = ydBookings.data ?? [];

  const totalViews = yd.length;
  const prevViews = db.length;
  const uniqueVisitors = new Set(yd.map((r) => r.visitor_id)).size;
  const prevUnique = new Set(db.map((r) => r.visitor_id)).size;
  const sessions = new Set(yd.map((r) => r.session_id)).size;

  // Top 5 pages
  const pageMap = new Map<string, number>();
  for (const r of yd) pageMap.set(r.path, (pageMap.get(r.path) ?? 0) + 1);
  const topPages = Array.from(pageMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Bookings
  const bookingCount = bookings.length;
  const revenue = bookings.reduce((s, b) => s + (b.total_price ?? 0), 0);

  // Devices
  let desktop = 0, mobile = 0, tablet = 0;
  for (const r of yd) {
    if (r.device_type === 'mobile') mobile++;
    else if (r.device_type === 'tablet') tablet++;
    else desktop++;
  }

  const dateStr = yesterday.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Berlin' });

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>cam2rent Tagesbericht</title></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:Inter,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="margin-bottom:24px;">
      <div style="font-size:22px;font-weight:700;margin-bottom:4px;">
        <span style="color:#e2e8f0;">cam</span><span style="color:#06b6d4;">2</span><span style="color:#e2e8f0;">rent</span>
        <span style="color:#475569;font-size:16px;"> / Tagesbericht</span>
      </div>
      <div style="font-size:13px;color:#64748b;">${dateStr}</div>
    </div>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:16px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Seitenaufrufe</div>
        <div style="font-size:24px;font-weight:700;letter-spacing:-1px;">${totalViews}</div>
        <div style="font-size:11px;margin-top:4px;">${trend(totalViews, prevViews)}</div>
      </div>
      <div style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:16px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Unique Visitors</div>
        <div style="font-size:24px;font-weight:700;letter-spacing:-1px;">${uniqueVisitors}</div>
        <div style="font-size:11px;margin-top:4px;">${trend(uniqueVisitors, prevUnique)}</div>
      </div>
      <div style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:16px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Sessions</div>
        <div style="font-size:24px;font-weight:700;letter-spacing:-1px;">${sessions}</div>
      </div>
    </div>

    <!-- Bookings -->
    <div style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:#22d3ee;">Buchungen gestern</div>
      <div style="display:flex;gap:24px;">
        <div>
          <div style="font-size:10px;color:#64748b;margin-bottom:4px;">BUCHUNGEN</div>
          <div style="font-size:22px;font-weight:700;color:#10b981;">${bookingCount}</div>
        </div>
        <div>
          <div style="font-size:10px;color:#64748b;margin-bottom:4px;">UMSATZ</div>
          <div style="font-size:22px;font-weight:700;color:#06b6d4;">${fmtEuro(revenue)}</div>
        </div>
        <div>
          <div style="font-size:10px;color:#64748b;margin-bottom:4px;">CONVERSION</div>
          <div style="font-size:22px;font-weight:700;color:#e2e8f0;">${pct(bookingCount, sessions)}</div>
        </div>
      </div>
    </div>

    <!-- Top Pages -->
    <div style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;">Top 5 Seiten</div>
      ${topPages.map(([path, views], i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;${i < topPages.length - 1 ? 'border-bottom:1px solid #1e293b;' : ''}">
          <span style="font-family:monospace;font-size:12px;color:#22d3ee;">${path}</span>
          <span style="font-weight:600;font-size:13px;">${views}</span>
        </div>
      `).join('')}
    </div>

    <!-- Devices -->
    <div style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;">Geräte-Verteilung</div>
      <div style="display:flex;gap:20px;font-size:13px;">
        <span>🖥 Desktop <strong style="color:#06b6d4;">${pct(desktop, totalViews)}</strong></span>
        <span>📱 Mobile <strong style="color:#8b5cf6;">${pct(mobile, totalViews)}</strong></span>
        <span>📟 Tablet <strong style="color:#f59e0b;">${pct(tablet, totalViews)}</strong></span>
      </div>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${BASE_URL}/admin/analytics" style="display:inline-block;background:#06b6d4;color:white;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px;">
        → Dashboard öffnen
      </a>
    </div>

    <div style="text-align:center;font-size:11px;color:#334155;">
      cam2rent Analytics — Self-Hosted · DSGVO-konform · Keine Cookies
    </div>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: `cam2rent <${FROM_EMAIL}>`,
    replyTo: ADMIN_EMAIL,
    to: ADMIN_EMAIL,
    subject: `📊 cam2rent Tagesbericht — ${dateStr}`,
    html,
  });

  return NextResponse.json({ ok: true, date: dateStr, views: totalViews, bookings: bookingCount });
}

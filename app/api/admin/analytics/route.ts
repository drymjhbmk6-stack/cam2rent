import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase';

async function checkAdminAuth(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get('admin_token')?.value;
  if (!token) return false;
  const expected = createHash('sha256')
    .update((process.env.ADMIN_PASSWORD ?? '') + '_cam2rent_admin')
    .digest('hex');
  return token === expected;
}

function formatReferrer(ref: string | null): string {
  if (!ref) return 'direkt';
  try {
    const url = new URL(ref);
    const h = url.hostname.replace(/^www\./, '');
    if (h.includes('google')) return 'Google';
    if (h.includes('instagram')) return 'Instagram';
    if (h.includes('facebook') || h.includes('fb.com')) return 'Facebook';
    if (h.includes('tiktok')) return 'TikTok';
    if (h.includes('youtube')) return 'YouTube';
    if (h.includes('bing')) return 'Bing';
    return h;
  } catch {
    return ref.slice(0, 30);
  }
}

export async function GET(req: NextRequest) {
  if (!await checkAdminAuth()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'today';
  const supabase = createServiceClient();

  // ── LIVE ──────────────────────────────────────────────────────────────────
  if (type === 'live') {
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('page_views')
      .select('visitor_id, session_id, path, device_type, browser, referrer, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    const sessionMap = new Map<string, {
      visitor_id: string;
      current_page: string;
      device: string;
      browser: string;
      referrer: string;
      last_seen: string;
      page_count: number;
    }>();

    for (const row of data ?? []) {
      if (!sessionMap.has(row.session_id)) {
        sessionMap.set(row.session_id, {
          visitor_id: (row.visitor_id ?? '').slice(0, 8),
          current_page: row.path,
          device: row.device_type ?? 'desktop',
          browser: row.browser ?? 'Andere',
          referrer: formatReferrer(row.referrer),
          last_seen: row.created_at,
          page_count: 1,
        });
      } else {
        sessionMap.get(row.session_id)!.page_count++;
      }
    }

    const visitors = Array.from(sessionMap.values());

    // Today stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayData } = await supabase
      .from('page_views')
      .select('session_id, visitor_id')
      .gte('created_at', todayStart.toISOString());

    const totalViews = todayData?.length ?? 0;
    const uniqueVisitors = new Set(todayData?.map((r) => r.visitor_id)).size;
    const sessions = new Set(todayData?.map((r) => r.session_id)).size;

    return NextResponse.json({
      active_count: visitors.length,
      visitors,
      total_views: totalViews,
      unique_visitors: uniqueVisitors,
      avg_pages_per_session: sessions > 0 ? +(totalViews / sessions).toFixed(1) : 0,
    });
  }

  // ── TODAY ─────────────────────────────────────────────────────────────────
  if (type === 'today') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('page_views')
      .select('session_id, visitor_id, path, device_type, created_at')
      .gte('created_at', todayStart.toISOString());

    const rows = data ?? [];
    const totalViews = rows.length;
    const uniqueVisitors = new Set(rows.map((r) => r.visitor_id)).size;
    const sessions = new Set(rows.map((r) => r.session_id)).size;

    // Hourly distribution
    const hourly = Array(24).fill(0);
    for (const row of rows) {
      const h = new Date(row.created_at).getHours();
      hourly[h]++;
    }

    // Top pages
    const pageMap = new Map<string, number>();
    for (const row of rows) {
      pageMap.set(row.path, (pageMap.get(row.path) ?? 0) + 1);
    }
    const topPages = Array.from(pageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, views]) => ({ path, views }));

    // Device distribution
    let desktop = 0, mobile = 0, tablet = 0;
    for (const row of rows) {
      if (row.device_type === 'mobile') mobile++;
      else if (row.device_type === 'tablet') tablet++;
      else desktop++;
    }
    const total = rows.length || 1;

    return NextResponse.json({
      total_views: totalViews,
      unique_visitors: uniqueVisitors,
      sessions,
      hourly,
      top_pages: topPages,
      devices: {
        desktop: Math.round((desktop / total) * 100),
        mobile: Math.round((mobile / total) * 100),
        tablet: Math.round((tablet / total) * 100),
      },
    });
  }

  // ── HISTORY ───────────────────────────────────────────────────────────────
  if (type === 'history') {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('page_views')
      .select('session_id, visitor_id, created_at')
      .gte('created_at', since);

    const dayMap = new Map<string, { views: number; visitors: Set<string>; sessions: Set<string> }>();
    for (const row of data ?? []) {
      const day = row.created_at.slice(0, 10);
      if (!dayMap.has(day)) {
        dayMap.set(day, { views: 0, visitors: new Set(), sessions: new Set() });
      }
      const d = dayMap.get(day)!;
      d.views++;
      d.visitors.add(row.visitor_id);
      d.sessions.add(row.session_id);
    }

    const history = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({
        date,
        views: d.views,
        unique_visitors: d.visitors.size,
        sessions: d.sessions.size,
      }));

    return NextResponse.json({ history });
  }

  // ── FUNNEL ────────────────────────────────────────────────────────────────
  if (type === 'funnel') {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('page_views')
      .select('session_id, path')
      .gte('created_at', since);

    const rows = data ?? [];
    const allSessions = new Set(rows.map((r) => r.session_id)).size;

    const sessionsWithHome = new Set(rows.filter((r) => r.path === '/').map((r) => r.session_id)).size;
    const sessionsWithProduct = new Set(rows.filter((r) => r.path.startsWith('/kameras/')).map((r) => r.session_id)).size;
    const sessionsWithBooking = new Set(rows.filter((r) => r.path.includes('/buchen')).map((r) => r.session_id)).size;
    const sessionsWithCheckout = new Set(rows.filter((r) => r.path === '/checkout' || r.path.startsWith('/buchung-bestaetigt')).map((r) => r.session_id)).size;

    const { count: bookingCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .neq('status', 'cancelled');

    const base = sessionsWithHome || allSessions || 1;

    return NextResponse.json({
      funnel: [
        { step: 'Startseite besucht', count: sessionsWithHome, pct: 100 },
        { step: 'Produkt angesehen', count: sessionsWithProduct, pct: Math.round((sessionsWithProduct / base) * 100) },
        { step: 'Buchung gestartet', count: sessionsWithBooking, pct: Math.round((sessionsWithBooking / base) * 100) },
        { step: 'Checkout erreicht', count: sessionsWithCheckout, pct: Math.round((sessionsWithCheckout / base) * 100) },
        { step: 'Erfolgreich bezahlt', count: bookingCount ?? 0, pct: Math.round(((bookingCount ?? 0) / base) * 100) },
      ],
    });
  }

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  if (type === 'products') {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: viewData } = await supabase
      .from('page_views')
      .select('path')
      .gte('created_at', since)
      .like('path', '/kameras/%');

    const { data: bookingData } = await supabase
      .from('bookings')
      .select('product_id, total_price, rental_start, rental_end, status')
      .gte('created_at', since)
      .neq('status', 'cancelled');

    // Count views per slug
    const viewMap = new Map<string, number>();
    for (const row of viewData ?? []) {
      const slug = row.path.replace('/kameras/', '').split('/')[0];
      if (slug && slug !== 'buchen') {
        viewMap.set(slug, (viewMap.get(slug) ?? 0) + 1);
      }
    }

    // Count bookings & revenue per product
    const bookingMap = new Map<string, { count: number; revenue: number; days: number }>();
    for (const row of bookingData ?? []) {
      const pid = row.product_id ?? 'unknown';
      if (!bookingMap.has(pid)) bookingMap.set(pid, { count: 0, revenue: 0, days: 0 });
      const b = bookingMap.get(pid)!;
      b.count++;
      b.revenue += row.total_price ?? 0;
      if (row.rental_start && row.rental_end) {
        const diff = Math.max(1, Math.ceil(
          (new Date(row.rental_end).getTime() - new Date(row.rental_start).getTime()) / 86400000
        ));
        b.days += diff;
      }
    }

    // Combine: use slugs from viewMap
    const products = Array.from(viewMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([slug, views]) => {
        const booking = bookingMap.get(slug) ?? { count: 0, revenue: 0, days: 0 };
        const utilization = Math.min(100, Math.round((booking.days / 30) * 100));
        return { slug, views, bookings: booking.count, revenue: booking.revenue, utilization };
      });

    return NextResponse.json({ products });
  }

  // ── TRAFFIC SOURCES ───────────────────────────────────────────────────────
  if (type === 'traffic') {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('page_views')
      .select('referrer, session_id, visitor_id, device_type, browser, created_at')
      .gte('created_at', since);

    const rows = data ?? [];

    // Traffic sources
    const sourceMap = new Map<string, number>();
    for (const row of rows) {
      const src = formatReferrer(row.referrer);
      sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
    }
    const total = rows.length || 1;
    const sources = Array.from(sourceMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([source, count]) => ({ source, count, pct: Math.round((count / total) * 100) }));

    // Browser distribution
    const browserMap = new Map<string, number>();
    for (const row of rows) {
      const b = row.browser ?? 'Andere';
      browserMap.set(b, (browserMap.get(b) ?? 0) + 1);
    }
    const browsers = Array.from(browserMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([browser, count]) => ({ browser, count, pct: Math.round((count / total) * 100) }));

    // Device
    let desktop = 0, mobile = 0, tablet = 0;
    for (const row of rows) {
      if (row.device_type === 'mobile') mobile++;
      else if (row.device_type === 'tablet') tablet++;
      else desktop++;
    }

    // Bounce rate (sessions with only 1 page view)
    const sessionPageCount = new Map<string, number>();
    for (const row of rows) {
      sessionPageCount.set(row.session_id, (sessionPageCount.get(row.session_id) ?? 0) + 1);
    }
    const bounced = Array.from(sessionPageCount.values()).filter((c) => c === 1).length;
    const bounceRate = sessionPageCount.size > 0 ? Math.round((bounced / sessionPageCount.size) * 100) : 0;

    // New vs returning (visitor seen in last 30 days before their first hit)
    const visitorFirstSeen = new Map<string, string>();
    for (const row of (data ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (!visitorFirstSeen.has(row.visitor_id)) visitorFirstSeen.set(row.visitor_id, row.created_at);
    }
    const newVisitors = Array.from(visitorFirstSeen.values()).filter(
      (d) => new Date(d) >= new Date(since)
    ).length;
    const returningVisitors = visitorFirstSeen.size - newVisitors;

    return NextResponse.json({
      sources,
      browsers,
      devices: {
        desktop: Math.round((desktop / total) * 100),
        mobile: Math.round((mobile / total) * 100),
        tablet: Math.round((tablet / total) * 100),
      },
      bounce_rate: bounceRate,
      new_visitors: newVisitors,
      returning_visitors: returningVisitors,
      total_sessions: sessionPageCount.size,
    });
  }

  // ── BOOKINGS STATS ────────────────────────────────────────────────────────
  if (type === 'bookings') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: todayBookings } = await supabase
      .from('bookings')
      .select('total_price, created_at')
      .gte('created_at', todayStart.toISOString())
      .neq('status', 'cancelled');

    const { data: allBookings } = await supabase
      .from('bookings')
      .select('total_price, created_at')
      .gte('created_at', since30)
      .neq('status', 'cancelled');

    const todayRevenue = (todayBookings ?? []).reduce((s, b) => s + (b.total_price ?? 0), 0);
    const todayCount = (todayBookings ?? []).length;

    // Booking trend: per day
    const dayMap = new Map<string, { count: number; revenue: number }>();
    for (const row of allBookings ?? []) {
      const day = row.created_at.slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, { count: 0, revenue: 0 });
      const d = dayMap.get(day)!;
      d.count++;
      d.revenue += row.total_price ?? 0;
    }
    const trend = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({ date, count: d.count, revenue: d.revenue }));

    // Page views today for conversion rate
    const { data: todayViews } = await supabase
      .from('page_views')
      .select('session_id', { count: 'exact', head: false })
      .gte('created_at', todayStart.toISOString());
    const sessionCount = new Set((todayViews ?? []).map((r) => r.session_id)).size;
    const conversionRate = sessionCount > 0 ? +((todayCount / sessionCount) * 100).toFixed(1) : 0;
    const avgBookingValue = todayCount > 0 ? +(todayRevenue / todayCount).toFixed(2) : 0;

    return NextResponse.json({
      today_bookings: todayCount,
      today_revenue: todayRevenue,
      conversion_rate: conversionRate,
      avg_booking_value: avgBookingValue,
      trend,
    });
  }

  return NextResponse.json({ error: 'Ungültiger type-Parameter' }, { status: 400 });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

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

    const base = allSessions || 1;

    return NextResponse.json({
      funnel: [
        { step: 'Startseite besucht', count: sessionsWithHome, pct: Math.round((sessionsWithHome / base) * 100) },
        { step: 'Produkt angesehen', count: sessionsWithProduct, pct: Math.round((sessionsWithProduct / base) * 100) },
        { step: 'Buchung gestartet', count: sessionsWithBooking, pct: Math.round((sessionsWithBooking / base) * 100) },
        { step: 'Checkout erreicht', count: sessionsWithCheckout, pct: Math.round((sessionsWithCheckout / base) * 100) },
        { step: 'Erfolgreich bezahlt', count: bookingCount ?? 0, pct: Math.round(((bookingCount ?? 0) / base) * 100) },
      ],
    });
  }

  // ── CUSTOMERS ────────────────────────────────────────────────────────────
  if (type === 'customers') {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Alle Buchungen für Kundenwert-Berechnung
    const { data: allBookings } = await supabase
      .from('bookings')
      .select('user_id, customer_email, price_total, status, created_at')
      .neq('status', 'cancelled');

    const bookings = allBookings ?? [];

    // Kunden nach Email gruppieren
    const customerMap = new Map<string, { total: number; count: number; first: string }>();
    for (const b of bookings) {
      const key = b.user_id ?? b.customer_email ?? 'unknown';
      const existing = customerMap.get(key) ?? { total: 0, count: 0, first: b.created_at };
      existing.total += b.price_total ?? 0;
      existing.count += 1;
      if (b.created_at < existing.first) existing.first = b.created_at;
      customerMap.set(key, existing);
    }

    const totalCustomers = customerMap.size;
    const repeatCustomers = [...customerMap.values()].filter((c) => c.count > 1).length;
    const avgLifetimeValue = totalCustomers > 0
      ? Math.round([...customerMap.values()].reduce((s, c) => s + c.total, 0) / totalCustomers * 100) / 100
      : 0;
    const avgOrderValue = bookings.length > 0
      ? Math.round(bookings.reduce((s, b) => s + (b.price_total ?? 0), 0) / bookings.length * 100) / 100
      : 0;

    // Warenkorbabbrueche (Tabelle existiert ggf. nicht)
    let abandonedTotal = 0;
    let abandonedRecovered = 0;
    try {
      const { count: at } = await supabase.from('abandoned_carts').select('id', { count: 'exact', head: true }).gte('created_at', since30);
      const { count: ar } = await supabase.from('abandoned_carts').select('id', { count: 'exact', head: true }).eq('recovered', true).gte('created_at', since30);
      abandonedTotal = at ?? 0;
      abandonedRecovered = ar ?? 0;
    } catch { /* Tabelle existiert nicht — ignorieren */ }

    // Neue Kunden letzter 30 Tage
    const newCustomers30d = [...customerMap.values()].filter((c) => c.first >= since30).length;

    return NextResponse.json({
      totalCustomers,
      repeatCustomers,
      repeatRate: totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0,
      avgLifetimeValue,
      avgOrderValue,
      newCustomers30d,
      abandonedCarts: abandonedTotal ?? 0,
      recoveredCarts: abandonedRecovered ?? 0,
      recoveryRate: (abandonedTotal ?? 0) > 0
        ? Math.round(((abandonedRecovered ?? 0) / (abandonedTotal ?? 0)) * 100)
        : 0,
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
      .select('product_id, product_name, price_total, rental_from, rental_to, status')
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

    // Count bookings & revenue per product (key by product_id AND slug for matching)
    const bookingByIdMap = new Map<string, { count: number; revenue: number; days: number; name: string }>();
    const slugToIdMap = new Map<string, string>();
    for (const row of bookingData ?? []) {
      const pid = row.product_id ?? 'unknown';
      if (!bookingByIdMap.has(pid)) bookingByIdMap.set(pid, { count: 0, revenue: 0, days: 0, name: row.product_name ?? pid });
      const b = bookingByIdMap.get(pid)!;
      b.count++;
      b.revenue += row.price_total ?? 0;
      if (row.rental_from && row.rental_to) {
        const diff = Math.max(1, Math.ceil(
          (new Date(row.rental_to).getTime() - new Date(row.rental_from).getTime()) / 86400000
        ));
        b.days += diff;
      }
    }

    // Produkte aus admin_config laden für Slug→ID Zuordnung
    const { data: configData } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .single();
    const productsConfig = configData?.value && typeof configData.value === 'object'
      ? (configData.value as Record<string, { id: string; slug?: string; name: string }>)
      : {};
    for (const p of Object.values(productsConfig)) {
      if (p.slug) slugToIdMap.set(p.slug, p.id);
    }

    // Combine: views per slug + bookings per product_id
    const products = Array.from(viewMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([slug, views]) => {
        const productId = slugToIdMap.get(slug);
        const booking = productId ? (bookingByIdMap.get(productId) ?? { count: 0, revenue: 0, days: 0, name: slug }) : { count: 0, revenue: 0, days: 0, name: slug };
        const utilization = Math.min(100, Math.round((booking.days / 30) * 100));
        return { slug, name: booking.name, views, bookings: booking.count, revenue: booking.revenue, utilization };
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
      .select('price_total, created_at')
      .gte('created_at', todayStart.toISOString())
      .neq('status', 'cancelled');

    const { data: allBookings } = await supabase
      .from('bookings')
      .select('price_total, created_at')
      .gte('created_at', since30)
      .neq('status', 'cancelled');

    const todayRevenue = (todayBookings ?? []).reduce((s, b) => s + (b.price_total ?? 0), 0);
    const todayCount = (todayBookings ?? []).length;

    // Booking trend: per day
    const dayMap = new Map<string, { count: number; revenue: number }>();
    for (const row of allBookings ?? []) {
      const day = row.created_at.slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, { count: 0, revenue: 0 });
      const d = dayMap.get(day)!;
      d.count++;
      d.revenue += row.price_total ?? 0;
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

  // ── BLOG ────────────────────────────────────────────────────────────────────
  if (type === 'blog') {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Alle Blog-Artikel
    const { data: allPosts } = await supabase
      .from('blog_posts')
      .select('id, title, slug, status, published_at, views, created_at')
      .order('created_at', { ascending: false });

    const posts = allPosts ?? [];
    const totalPosts = posts.length;
    const publishedPosts = posts.filter(p => p.status === 'published').length;
    const draftPosts = posts.filter(p => p.status === 'draft').length;
    const recentPosts = posts.filter(p => p.created_at >= since30).length;

    // Gesamte Blog-Views
    const totalViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);

    // Top-Artikel nach Views
    const topArticles = posts
      .filter(p => p.status === 'published')
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 10)
      .map(p => ({ title: p.title, slug: p.slug, views: p.views ?? 0, published_at: p.published_at }));

    // Blog Page Views aus page_views Tabelle
    const { data: blogViews } = await supabase
      .from('page_views')
      .select('path, created_at')
      .gte('created_at', since30)
      .like('path', '/blog/%');

    const blogPageViews30d = blogViews?.length ?? 0;

    // Views pro Tag (letzte 30 Tage)
    const dayMap = new Map<string, number>();
    for (const row of blogViews ?? []) {
      const day = row.created_at.slice(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    const viewTrend = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, views]) => ({ date, views }));

    // Top Blog-Seiten aus page_views
    const blogPageMap = new Map<string, number>();
    for (const row of blogViews ?? []) {
      const slug = row.path.replace('/blog/', '').split('?')[0];
      if (slug && slug !== '') {
        blogPageMap.set(slug, (blogPageMap.get(slug) ?? 0) + 1);
      }
    }
    const topBlogPages = Array.from(blogPageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([slug, views]) => {
        const post = posts.find(p => p.slug === slug);
        return { slug, title: post?.title ?? slug, views };
      });

    // Kommentare
    const { count: totalComments } = await supabase
      .from('blog_comments')
      .select('id', { count: 'exact', head: true });
    const { count: recentComments } = await supabase
      .from('blog_comments')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since30);

    // Zeitplan
    const { data: scheduleData } = await supabase
      .from('blog_schedule')
      .select('id, status')
      .in('status', ['pending', 'scheduled']);
    const scheduledCount = scheduleData?.length ?? 0;

    return NextResponse.json({
      totalPosts,
      publishedPosts,
      draftPosts,
      recentPosts,
      totalViews,
      blogPageViews30d,
      topArticles,
      topBlogPages,
      viewTrend,
      totalComments: totalComments ?? 0,
      recentComments: recentComments ?? 0,
      scheduledCount,
    });
  }

  return NextResponse.json({ error: 'Ungültiger type-Parameter' }, { status: 400 });
}

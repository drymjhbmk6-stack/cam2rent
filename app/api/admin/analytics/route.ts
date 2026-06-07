import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getBerlinHour, getBerlinDateKey } from '@/lib/timezone';
import { parseAnalyticsRange, applyRange, type ParsedRange } from '@/lib/analytics-range';

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

/**
 * Pruefe ob ein getrackter Pfad zu "Buchung gestartet" zaehlt.
 * Muss das Buchungs-Wizard auf einer Produktseite sein — NICHT
 * /konto/buchungen (Endkundenkonto-Liste). Frueher matchte
 * `path.includes('/buchen')` beides und verfaelschte den Funnel.
 */
function isBookingWizardPath(path: string): boolean {
  return /^\/kameras\/[^/]+\/buchen(\/|$|\?)/.test(path);
}

/** True wenn Pfad zu Top-Pages zaehlt (nicht /admin, nicht /api). */
function isTrackablePagePath(path: string): boolean {
  if (!path) return false;
  if (path.startsWith('/admin')) return false;
  if (path.startsWith('/api')) return false;
  return true;
}

/**
 * Laedt ALLE Zeilen einer Query ueber Pagination — umgeht Supabases
 * Default-Limit von 1000 Zeilen pro Request. Ohne das fror z.B. die
 * Seitenaufruf-Zahl bei exakt 1000 ein, sobald mehr als 1000 page_views
 * im Zeitraum lagen (und Unique-Visitor/Session-Counts wurden unterzaehlt).
 * `buildQuery(from, to)` muss eine frische, gefilterte Query mit `.range(from,to)`
 * zurueckgeben.
 */
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
    if (from >= 2_000_000) break; // Sicherheitsnetz
  }
  return all;
}

export async function GET(req: NextRequest) {
  if (!await checkAdminAuth()) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'today';
  const supabase = createServiceClient();
  const parsed: ParsedRange = parseAnalyticsRange(req);

  // ── LIVE ──────────────────────────────────────────────────────────────────
  if (type === 'live') {
    // "Gerade online" ist immer die letzten 5 Minuten — unabhaengig vom Filter.
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

    // KPIs respektieren den Range-Filter (today/24h/7d/30d/month/year/custom).
    const rangeData = await fetchAllRows<{ session_id: string; visitor_id: string }>((from, to) =>
      applyRange(supabase.from('page_views').select('session_id, visitor_id'), parsed).range(from, to),
    );

    const totalViews = rangeData.length;
    const uniqueVisitors = new Set(rangeData.map((r) => r.visitor_id)).size;
    const sessions = new Set(rangeData.map((r) => r.session_id)).size;

    return NextResponse.json({
      active_count: visitors.length,
      visitors,
      total_views: totalViews,
      unique_visitors: uniqueVisitors,
      avg_pages_per_session: sessions > 0 ? +(totalViews / sessions).toFixed(1) : 0,
      range: parsed.range,
    });
  }

  // ── TODAY ─────────────────────────────────────────────────────────────────
  // Liefert Hourly-Chart (24 Buckets), Top-Pages und Device-Distribution
  // fuer den gewaehlten Range. Bei range != today/24h sind die Hourly-Buckets
  // "Stunde-des-Tages" aggregiert ueber den ganzen Bereich.
  if (type === 'today') {
    const rows = await fetchAllRows<{ session_id: string; visitor_id: string; path: string; device_type: string | null; created_at: string }>((from, to) =>
      applyRange(supabase.from('page_views').select('session_id, visitor_id, path, device_type, created_at'), parsed).range(from, to),
    );

    const totalViews = rows.length;
    const uniqueVisitors = new Set(rows.map((r) => r.visitor_id)).size;
    const sessions = new Set(rows.map((r) => r.session_id)).size;

    // Hourly distribution — Stunde in Europe/Berlin.
    const hourly = Array(24).fill(0);
    for (const row of rows) {
      hourly[getBerlinHour(row.created_at)]++;
    }

    // Top pages (ohne Admin/API-Pfade — die sind ohnehin nicht getrackt,
    // aber als Defense-in-Depth filtern wir nochmal).
    const pageMap = new Map<string, number>();
    for (const row of rows) {
      if (!isTrackablePagePath(row.path)) continue;
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
      range: parsed.range,
    });
  }

  // ── HISTORY ───────────────────────────────────────────────────────────────
  if (type === 'history') {
    const daysRaw = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 400) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const data = await fetchAllRows<{ session_id: string; visitor_id: string; created_at: string }>((from, to) =>
      supabase
        .from('page_views')
        .select('session_id, visitor_id, created_at')
        .gte('created_at', since)
        .range(from, to),
    );

    const dayMap = new Map<string, { views: number; visitors: Set<string>; sessions: Set<string> }>();
    for (const row of data) {
      // Tag in Berlin-Zeit gruppieren — sonst landen 00:30-02:00 Berlin
      // auf dem Vortag (UTC-Zeit liegt davor).
      const day = getBerlinDateKey(row.created_at);
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
    const rows = await fetchAllRows<{ session_id: string; path: string }>((from, to) =>
      applyRange(supabase.from('page_views').select('session_id, path'), parsed).range(from, to),
    );
    const allSessions = new Set(rows.map((r) => r.session_id)).size;

    const sessionsWithHome = new Set(rows.filter((r) => r.path === '/').map((r) => r.session_id)).size;
    const sessionsWithProduct = new Set(rows.filter((r) => r.path.startsWith('/kameras/') && !isBookingWizardPath(r.path)).map((r) => r.session_id)).size;
    // FIX: vorher matchte `path.includes('/buchen')` auch /konto/buchungen.
    const sessionsWithBooking = new Set(rows.filter((r) => isBookingWizardPath(r.path)).map((r) => r.session_id)).size;
    const sessionsWithCheckout = new Set(rows.filter((r) => r.path === '/checkout' || r.path.startsWith('/checkout/') || r.path.startsWith('/buchung-bestaetigt')).map((r) => r.session_id)).size;

    const bookingsQ = applyRange(
      supabase.from('bookings').select('id', { count: 'exact', head: true }),
      parsed,
    ).neq('status', 'cancelled');
    const { count: bookingCount } = await bookingsQ;

    const base = allSessions || 1;
    // FIX: pct kann sonst > 100 werden, weil Bookings (Entitaet) gegen
    // Sessions (page_views) gerechnet wird — Returning-Customer ohne
    // Tracking-Consent erzeugen Bookings ohne Sessions. Cap auf 100.
    const cappedPct = (n: number) => Math.min(100, Math.round((n / base) * 100));

    return NextResponse.json({
      funnel: [
        { step: 'Startseite besucht', count: sessionsWithHome, pct: cappedPct(sessionsWithHome) },
        { step: 'Produkt angesehen', count: sessionsWithProduct, pct: cappedPct(sessionsWithProduct) },
        { step: 'Buchung gestartet', count: sessionsWithBooking, pct: cappedPct(sessionsWithBooking) },
        { step: 'Checkout erreicht', count: sessionsWithCheckout, pct: cappedPct(sessionsWithCheckout) },
        { step: 'Erfolgreich bezahlt', count: bookingCount ?? 0, pct: cappedPct(bookingCount ?? 0) },
      ],
      range: parsed.range,
    });
  }

  // ── CUSTOMERS ────────────────────────────────────────────────────────────
  if (type === 'customers') {
    // Buchungs-bezogene KPIs respektieren den Range-Filter.
    const bookings = await fetchAllRows<{ user_id: string | null; customer_email: string | null; price_total: number | null; status: string; created_at: string }>((from, to) =>
      applyRange(
        supabase.from('bookings').select('user_id, customer_email, price_total, status, created_at'),
        parsed,
      ).neq('status', 'cancelled').range(from, to),
    );

    // Zusaetzlich: ALLE Buchungen fuer die korrekte "neuer-Kunde-im-Range"-Berechnung
    // (vergleicht das Erst-Booking-Datum eines Kunden gegen den Range-Start).
    const all = await fetchAllRows<{ user_id: string | null; customer_email: string | null; created_at: string; status: string }>((from, to) =>
      supabase
        .from('bookings')
        .select('user_id, customer_email, created_at, status')
        .neq('status', 'cancelled')
        .range(from, to),
    );

    // Customer-Dedup: E-Mail (lowercase) ist primaerer Key, weil ein Kunde
    // erst als Gast (nur email) bucht und spaeter ein Konto anlegt — vorher
    // wurde derselbe Kunde 2x gezaehlt (key=email, key=user_id).
    const customerKey = (b: { user_id: string | null; customer_email: string | null }): string => {
      const email = b.customer_email?.toLowerCase().trim();
      if (email) return `email:${email}`;
      if (b.user_id) return `uid:${b.user_id}`;
      return 'unknown';
    };

    // Gruppierung im Range
    const customerMap = new Map<string, { total: number; count: number }>();
    for (const b of bookings) {
      const key = customerKey(b);
      const existing = customerMap.get(key) ?? { total: 0, count: 0 };
      existing.total += b.price_total ?? 0;
      existing.count += 1;
      customerMap.set(key, existing);
    }

    // Erst-Buchung pro Kunde aus ALLEN Buchungen (fuer "neue Kunden im Range")
    const firstBooking = new Map<string, string>();
    for (const b of all) {
      const key = customerKey(b);
      const existing = firstBooking.get(key);
      if (!existing || b.created_at < existing) firstBooking.set(key, b.created_at);
    }

    const totalCustomers = customerMap.size;
    const repeatCustomers = [...customerMap.values()].filter((c) => c.count > 1).length;
    const totalRevenue = [...customerMap.values()].reduce((s, c) => s + c.total, 0);
    const avgLifetimeValue = totalCustomers > 0 ? +(totalRevenue / totalCustomers).toFixed(2) : 0;
    const avgOrderValue = bookings.length > 0
      ? +(bookings.reduce((s, b) => s + (b.price_total ?? 0), 0) / bookings.length).toFixed(2)
      : 0;

    // Neue Kunden = Kunden, deren Erst-Buchung in den Range faellt.
    const startMs = new Date(parsed.startISO).getTime();
    const endMs = parsed.endISO ? new Date(parsed.endISO).getTime() : Date.now();
    const newCustomersInRange = [...firstBooking.values()].filter((iso) => {
      const t = new Date(iso).getTime();
      return t >= startMs && t <= endMs;
    }).length;

    // Warenkorbabbrueche im Range (Tabelle existiert ggf. nicht).
    let abandonedTotal = 0;
    let abandonedRecovered = 0;
    try {
      const atQ = applyRange(
        supabase.from('abandoned_carts').select('id', { count: 'exact', head: true }),
        parsed,
      );
      const { count: at } = await atQ;
      const arQ = applyRange(
        supabase.from('abandoned_carts').select('id', { count: 'exact', head: true }),
        parsed,
      ).eq('recovered', true);
      const { count: ar } = await arQ;
      abandonedTotal = at ?? 0;
      abandonedRecovered = ar ?? 0;
    } catch { /* Tabelle existiert nicht — ignorieren */ }

    return NextResponse.json({
      totalCustomers,
      repeatCustomers,
      repeatRate: totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0,
      avgLifetimeValue,
      avgOrderValue,
      newCustomersInRange,
      // Backwards-Compat: alter Feldname (UI nutzt evtl. noch newCustomers30d)
      newCustomers30d: newCustomersInRange,
      abandonedCarts: abandonedTotal,
      recoveredCarts: abandonedRecovered,
      recoveryRate: abandonedTotal > 0 ? Math.round((abandonedRecovered / abandonedTotal) * 100) : 0,
      range: parsed.range,
    });
  }

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  if (type === 'products') {
    const viewData = await fetchAllRows<{ path: string }>((from, to) =>
      applyRange(supabase.from('page_views').select('path'), parsed).like('path', '/kameras/%').range(from, to),
    );

    const bookingData = await fetchAllRows<{ product_id: string | null; product_name: string | null; price_total: number | null; rental_from: string | null; rental_to: string | null; status: string }>((from, to) =>
      applyRange(
        supabase.from('bookings').select('product_id, product_name, price_total, rental_from, rental_to, status'),
        parsed,
      ).neq('status', 'cancelled').range(from, to),
    );

    // Count views per slug (skip /kameras/<slug>/buchen — ist Buchungs-Wizard, nicht Produkt-Detail)
    const viewMap = new Map<string, number>();
    for (const row of viewData) {
      const slug = row.path.replace('/kameras/', '').split('/')[0];
      const isWizard = isBookingWizardPath(row.path);
      if (slug && slug !== 'buchen' && !isWizard) {
        viewMap.set(slug, (viewMap.get(slug) ?? 0) + 1);
      }
    }

    // Count bookings & revenue per product
    const bookingByIdMap = new Map<string, { count: number; revenue: number; days: number; name: string }>();
    const slugToIdMap = new Map<string, string>();
    for (const row of bookingData) {
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

    // Auslastung gegen die Range-Tage normalisieren (vorher hartcodiert /30).
    const rangeDays = Math.max(1, parsed.days);
    const products = Array.from(viewMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([slug, views]) => {
        const productId = slugToIdMap.get(slug);
        const booking = productId ? (bookingByIdMap.get(productId) ?? { count: 0, revenue: 0, days: 0, name: slug }) : { count: 0, revenue: 0, days: 0, name: slug };
        const utilization = Math.min(100, Math.round((booking.days / rangeDays) * 100));
        return { slug, name: booking.name, views, bookings: booking.count, revenue: booking.revenue, utilization };
      });

    return NextResponse.json({ products, range: parsed.range, range_days: rangeDays });
  }

  // ── TRAFFIC SOURCES ───────────────────────────────────────────────────────
  if (type === 'traffic') {
    // country ist optional (Migration ggf. ausstehend) — vorab proben.
    const { error: countryProbe } = await supabase.from('page_views').select('country').limit(1);
    const hasCountry = !(countryProbe && /country|column|schema cache|does not exist/i.test(countryProbe.message ?? ''));
    const trafficCols = `referrer, session_id, visitor_id, device_type, browser, created_at${hasCountry ? ', country' : ''}`;

    type TrafficRow = { referrer: string | null; session_id: string; visitor_id: string; device_type: string | null; browser: string | null; created_at: string; country?: string | null };
    const rows = await fetchAllRows<TrafficRow>((from, to) =>
      applyRange(supabase.from('page_views').select(trafficCols), parsed).range(from, to) as unknown as PromiseLike<{ data: TrafficRow[] | null; error: unknown }>,
    );

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

    // Länder-Verteilung (eindeutige Besucher pro Land, aus Cloudflare-Header).
    // Nur wenn die country-Spalte existiert.
    const countries: { code: string; count: number; pct: number }[] = [];
    if (hasCountry) {
      const visitorsByCountry = new Map<string, Set<string>>();
      let unknownVisitors = 0;
      const seenUnknown = new Set<string>();
      for (const row of rows) {
        const code = (row.country ?? '').toUpperCase();
        const vid = row.visitor_id || row.session_id;
        if (/^[A-Z]{2}$/.test(code)) {
          if (!visitorsByCountry.has(code)) visitorsByCountry.set(code, new Set());
          visitorsByCountry.get(code)!.add(vid);
        } else if (!seenUnknown.has(vid)) {
          seenUnknown.add(vid);
          unknownVisitors++;
        }
      }
      const entries = Array.from(visitorsByCountry.entries()).map(([code, set]) => ({ code, count: set.size }));
      if (unknownVisitors > 0) entries.push({ code: 'XX', count: unknownVisitors });
      const totalGeo = entries.reduce((s, e) => s + e.count, 0) || 1;
      entries.sort((a, b) => b.count - a.count);
      for (const e of entries.slice(0, 12)) {
        countries.push({ code: e.code, count: e.count, pct: Math.round((e.count / totalGeo) * 100) });
      }
    }

    // Bounce rate (sessions with only 1 page view)
    const sessionPageCount = new Map<string, number>();
    for (const row of rows) {
      sessionPageCount.set(row.session_id, (sessionPageCount.get(row.session_id) ?? 0) + 1);
    }
    const bounced = Array.from(sessionPageCount.values()).filter((c) => c === 1).length;
    const bounceRate = sessionPageCount.size > 0 ? Math.round((bounced / sessionPageCount.size) * 100) : 0;

    // New vs returning: Besucher gilt als "neu im Range" wenn sein erster
    // jemals getrackter Besuch im Range liegt. Vorher wurde nur innerhalb
    // des Ranges sortiert — ein Besucher der vor dem Range schon mal da war
    // wurde faelschlich als "neu" gezaehlt.
    const visitorIdsInRange = new Set(rows.map((r) => r.visitor_id).filter(Boolean));
    let newVisitors = 0;
    let returningVisitors = 0;
    if (visitorIdsInRange.size > 0) {
      const firstSeen = await fetchAllRows<{ visitor_id: string; created_at: string }>((from, to) =>
        supabase
          .from('page_views')
          .select('visitor_id, created_at')
          .in('visitor_id', Array.from(visitorIdsInRange))
          .order('created_at', { ascending: true })
          .range(from, to),
      );
      const firstByVisitor = new Map<string, string>();
      for (const r of firstSeen) {
        if (!firstByVisitor.has(r.visitor_id)) firstByVisitor.set(r.visitor_id, r.created_at);
      }
      const startMs = new Date(parsed.startISO).getTime();
      const endMs = parsed.endISO ? new Date(parsed.endISO).getTime() : Date.now();
      for (const iso of firstByVisitor.values()) {
        const t = new Date(iso).getTime();
        if (t >= startMs && t <= endMs) newVisitors++;
        else returningVisitors++;
      }
    }

    return NextResponse.json({
      sources,
      browsers,
      countries,
      devices: {
        desktop: Math.round((desktop / total) * 100),
        mobile: Math.round((mobile / total) * 100),
        tablet: Math.round((tablet / total) * 100),
      },
      bounce_rate: bounceRate,
      new_visitors: newVisitors,
      returning_visitors: returningVisitors,
      total_sessions: sessionPageCount.size,
      range: parsed.range,
    });
  }

  // ── BOOKINGS STATS ────────────────────────────────────────────────────────
  if (type === 'bookings') {
    const rangeBookings = await fetchAllRows<{ price_total: number | null; created_at: string }>((from, to) =>
      applyRange(
        supabase.from('bookings').select('price_total, created_at'),
        parsed,
      ).neq('status', 'cancelled').range(from, to),
    );

    const totalBookings = rangeBookings.length;
    const totalRevenue = rangeBookings.reduce((s, b) => s + (b.price_total ?? 0), 0);

    // Trend pro Berlin-Tag im Range
    const dayMap = new Map<string, { count: number; revenue: number }>();
    for (const row of rangeBookings) {
      const day = getBerlinDateKey(row.created_at);
      if (!dayMap.has(day)) dayMap.set(day, { count: 0, revenue: 0 });
      const d = dayMap.get(day)!;
      d.count++;
      d.revenue += row.price_total ?? 0;
    }
    const trend = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({ date, count: d.count, revenue: d.revenue }));

    // Conversion-Rate: Bookings im Range / Sessions im Range.
    const rangeViews = await fetchAllRows<{ session_id: string }>((from, to) =>
      applyRange(supabase.from('page_views').select('session_id'), parsed).range(from, to),
    );
    const sessionCount = new Set(rangeViews.map((r) => r.session_id)).size;
    const conversionRate = sessionCount > 0 ? +((totalBookings / sessionCount) * 100).toFixed(1) : 0;
    const avgBookingValue = totalBookings > 0 ? +(totalRevenue / totalBookings).toFixed(2) : 0;

    return NextResponse.json({
      // Range-bezogene KPIs (Label-Formatierung passiert im UI).
      total_bookings: totalBookings,
      total_revenue: totalRevenue,
      // Backward-compat (UI las vorher today_*); zeigt jetzt Range-Werte.
      today_bookings: totalBookings,
      today_revenue: totalRevenue,
      conversion_rate: conversionRate,
      avg_booking_value: avgBookingValue,
      trend,
      range: parsed.range,
    });
  }

  // ── BLOG ────────────────────────────────────────────────────────────────────
  if (type === 'blog') {
    // Alle Blog-Artikel (nicht range-gefiltert — "Artikel gesamt" ist all-time)
    const { data: allPosts } = await supabase
      .from('blog_posts')
      .select('id, title, slug, status, published_at, views, created_at')
      .order('created_at', { ascending: false });

    const posts = allPosts ?? [];
    const totalPosts = posts.length;
    const publishedPosts = posts.filter(p => p.status === 'published').length;
    const draftPosts = posts.filter(p => p.status === 'draft').length;
    // "Neu im Range": Artikel die im gewaehlten Zeitraum erstellt wurden.
    const startMs = new Date(parsed.startISO).getTime();
    const endMs = parsed.endISO ? new Date(parsed.endISO).getTime() : Date.now();
    const recentPosts = posts.filter(p => {
      const t = new Date(p.created_at).getTime();
      return t >= startMs && t <= endMs;
    }).length;

    // Gesamte Blog-Views (all-time, aus blog_posts.views)
    const totalViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);

    // Top-Artikel nach Views (all-time — blog_posts.views ist kumuliert)
    const topArticles = posts
      .filter(p => p.status === 'published')
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 10)
      .map(p => ({ title: p.title, slug: p.slug, views: p.views ?? 0, published_at: p.published_at }));

    // Blog Page Views aus page_views Tabelle (Range-bezogen)
    const blogViews = await fetchAllRows<{ path: string; created_at: string }>((from, to) =>
      applyRange(
        supabase.from('page_views').select('path, created_at'),
        parsed,
      ).like('path', '/blog/%').not('path', 'like', '/blog/preview/%').range(from, to),
    );

    const blogPageViewsRange = blogViews.length;

    // Views pro Tag im Range — Berlin-Tag
    const dayMap = new Map<string, number>();
    for (const row of blogViews) {
      const day = getBerlinDateKey(row.created_at);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    const viewTrend = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, views]) => ({ date, views }));

    // Top Blog-Seiten aus page_views (Range-bezogen)
    const blogPageMap = new Map<string, number>();
    for (const row of blogViews) {
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

    // Kommentare: gesamt all-time, neu = im Range
    const { count: totalComments } = await supabase
      .from('blog_comments')
      .select('id', { count: 'exact', head: true });
    const recentCommentsQ = applyRange(
      supabase.from('blog_comments').select('id', { count: 'exact', head: true }),
      parsed,
    );
    const { count: recentComments } = await recentCommentsQ;

    // Zeitplan (all-time — wartende Plan-Eintraege)
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
      // Backward-compat: alter Name war hardcoded auf 30d
      blogPageViews30d: blogPageViewsRange,
      blogPageViewsRange,
      topArticles,
      topBlogPages,
      viewTrend,
      totalComments: totalComments ?? 0,
      recentComments: recentComments ?? 0,
      scheduledCount,
      range: parsed.range,
    });
  }

  return NextResponse.json({ error: 'Ungültiger type-Parameter' }, { status: 400 });
}

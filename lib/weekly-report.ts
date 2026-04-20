import { createServiceClient } from '@/lib/supabase';

/**
 * Sammelt alle Daten für den Wochenbericht.
 *
 * Zeitraum: letzte 7 Tage (rolling). Vergleich: die 7 Tage davor.
 * Alle Zahlen werden serverseitig mit dem Service-Role-Key berechnet —
 * RLS wird umgangen, damit wir über alle User aggregieren können.
 */

export interface TopProduct {
  name: string;
  count: number;
  revenue: number;
}

export interface UpcomingItem {
  bookingId: string;
  customerName: string;
  productName: string;
  date: string; // ISO-Date
}

export interface BlogItem {
  title: string;
  slug: string;
  publishedAt: string;
}

export interface WeeklyReportData {
  generatedAt: string; // ISO
  periodStart: string;
  periodEnd: string;
  prevPeriodStart: string;
  prevPeriodEnd: string;
  weekNumber: number;
  year: number;

  finance: {
    revenue: number;
    prevRevenue: number;
    invoicesPaid: number;
    invoicesOpen: number;
    overdueAmount: number;
  };
  bookings: {
    newCount: number;
    prevCount: number;
    cancelledCount: number;
    topProducts: TopProduct[];
    upcomingShipping: UpcomingItem[];
    upcomingReturn: UpcomingItem[];
  };
  customers: {
    newRegistrations: number;
    pendingVerifications: number;
    newWaitlist: number;
  };
  operations: {
    newDamages: number;
    camerasInMaintenance: number;
  };
  content: {
    blogPublished: BlogItem[];
    socialPublishedCount: number;
  };
  warnings: string[];
}

function iso(d: Date): string {
  return d.toISOString();
}

function getIsoWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

export async function collectWeeklyReportData(now: Date = new Date()): Promise<WeeklyReportData> {
  const supabase = createServiceClient();

  const periodEnd = new Date(now);
  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevPeriodEnd = new Date(periodStart);
  const prevPeriodStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const upcomingEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { week, year } = getIsoWeek(periodEnd);

  // ────────────────────────────────────────────────────────────────────────
  // Parallel alle Queries absetzen — spart Zeit im Report.
  // ────────────────────────────────────────────────────────────────────────
  const [
    bookingsCurr,
    bookingsPrev,
    cancelled,
    upcomingShip,
    upcomingRet,
    newUsers,
    pendingVerif,
    newWaitlist,
    newDamages,
    camMaintenance,
    blogPublished,
    socialPublished,
    invoicesPaidData,
    invoicesOpenData,
  ] = await Promise.all([
    supabase.from('bookings')
      .select('id, product_name, price_total, status')
      .gte('created_at', iso(periodStart))
      .lte('created_at', iso(periodEnd))
      .neq('status', 'cancelled'),
    supabase.from('bookings')
      .select('id, price_total')
      .gte('created_at', iso(prevPeriodStart))
      .lte('created_at', iso(prevPeriodEnd))
      .neq('status', 'cancelled'),
    supabase.from('bookings')
      .select('id', { count: 'exact', head: true })
      .gte('updated_at', iso(periodStart))
      .lte('updated_at', iso(periodEnd))
      .eq('status', 'cancelled'),
    supabase.from('bookings')
      .select('id, customer_name, product_name, rental_from')
      .gte('rental_from', iso(periodEnd).slice(0, 10))
      .lte('rental_from', iso(upcomingEnd).slice(0, 10))
      .neq('status', 'cancelled')
      .order('rental_from', { ascending: true })
      .limit(20),
    supabase.from('bookings')
      .select('id, customer_name, product_name, rental_to')
      .gte('rental_to', iso(periodEnd).slice(0, 10))
      .lte('rental_to', iso(upcomingEnd).slice(0, 10))
      .neq('status', 'cancelled')
      .order('rental_to', { ascending: true })
      .limit(20),
    supabase.from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', iso(periodStart))
      .lte('created_at', iso(periodEnd)),
    supabase.from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'pending'),
    supabase.from('waitlist_subscriptions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', iso(periodStart))
      .lte('created_at', iso(periodEnd)),
    supabase.from('damage_reports')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', iso(periodStart))
      .lte('created_at', iso(periodEnd)),
    supabase.from('product_units')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'maintenance'),
    supabase.from('blog_posts')
      .select('title, slug, published_at')
      .eq('status', 'published')
      .gte('published_at', iso(periodStart))
      .lte('published_at', iso(periodEnd))
      .order('published_at', { ascending: false }),
    supabase.from('social_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('published_at', iso(periodStart))
      .lte('published_at', iso(periodEnd)),
    supabase.from('invoices')
      .select('amount_gross, payment_status')
      .eq('payment_status', 'paid')
      .gte('paid_at', iso(periodStart))
      .lte('paid_at', iso(periodEnd)),
    supabase.from('invoices')
      .select('amount_gross, due_date, payment_status')
      .in('payment_status', ['unpaid', 'overdue']),
  ]);

  const currBookings = bookingsCurr.data ?? [];
  const prevBookings = bookingsPrev.data ?? [];

  // Revenue
  const revenue = currBookings.reduce((s, b) => s + Number(b.price_total ?? 0), 0);
  const prevRevenue = prevBookings.reduce((s, b) => s + Number(b.price_total ?? 0), 0);

  // Top-Produkte nach Anzahl + Umsatz
  const productMap = new Map<string, { count: number; revenue: number }>();
  for (const b of currBookings) {
    const key = b.product_name ?? 'Unbekannt';
    const entry = productMap.get(key) ?? { count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += Number(b.price_total ?? 0);
    productMap.set(key, entry);
  }
  const topProducts: TopProduct[] = Array.from(productMap.entries())
    .map(([name, { count, revenue }]) => ({ name, count, revenue }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Offene Rechnungen
  const invoicesOpen = invoicesOpenData.data ?? [];
  const today = new Date();
  const overdueAmount = invoicesOpen
    .filter((i: { due_date?: string | null }) => i.due_date && new Date(i.due_date) < today)
    .reduce((s: number, i: { amount_gross?: number | null }) => s + Number(i.amount_gross ?? 0), 0);

  // Warnings: abgelaufene/bald ablaufende Tokens, API-Keys etc.
  const warnings: string[] = [];
  try {
    const { data: accts } = await supabase
      .from('social_accounts')
      .select('platform, name, token_expires_at')
      .eq('is_active', true);
    for (const a of accts ?? []) {
      if (!a.token_expires_at) continue;
      const daysLeft = Math.floor(
        (new Date(a.token_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysLeft < 0) {
        warnings.push(`Social-Token abgelaufen: ${a.platform} (${a.name})`);
      } else if (daysLeft < 14) {
        warnings.push(`Social-Token läuft in ${daysLeft} Tagen ab: ${a.platform} (${a.name})`);
      }
    }
  } catch {
    // Social-Modul evtl. noch nicht eingerichtet — kein Warning
  }

  return {
    generatedAt: iso(now),
    periodStart: iso(periodStart),
    periodEnd: iso(periodEnd),
    prevPeriodStart: iso(prevPeriodStart),
    prevPeriodEnd: iso(prevPeriodEnd),
    weekNumber: week,
    year,
    finance: {
      revenue,
      prevRevenue,
      invoicesPaid: (invoicesPaidData.data ?? []).length,
      invoicesOpen: invoicesOpen.length,
      overdueAmount,
    },
    bookings: {
      newCount: currBookings.length,
      prevCount: prevBookings.length,
      cancelledCount: cancelled.count ?? 0,
      topProducts,
      upcomingShipping: (upcomingShip.data ?? []).map((b) => ({
        bookingId: b.id,
        customerName: b.customer_name ?? '—',
        productName: b.product_name ?? '—',
        date: b.rental_from,
      })),
      upcomingReturn: (upcomingRet.data ?? []).map((b) => ({
        bookingId: b.id,
        customerName: b.customer_name ?? '—',
        productName: b.product_name ?? '—',
        date: b.rental_to,
      })),
    },
    customers: {
      newRegistrations: newUsers.count ?? 0,
      pendingVerifications: pendingVerif.count ?? 0,
      newWaitlist: newWaitlist.count ?? 0,
    },
    operations: {
      newDamages: newDamages.count ?? 0,
      camerasInMaintenance: camMaintenance.count ?? 0,
    },
    content: {
      blogPublished: (blogPublished.data ?? []).map((b) => ({
        title: b.title,
        slug: b.slug,
        publishedAt: b.published_at,
      })),
      socialPublishedCount: socialPublished.count ?? 0,
    },
    warnings,
  };
}

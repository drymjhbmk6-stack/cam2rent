import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { DEFAULT_ADMIN_PRODUCTS, type AdminProduct } from '@/lib/price-config';

/**
 * GET /api/admin/dashboard-data
 * Returns all widget data in one call for the admin dashboard.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const now = new Date();

    // Date helpers
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    // Week start (Monday)
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset).toISOString();

    // Month start
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // 3 days from now
    const threeDaysLater = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString();

    // ── Run all queries in parallel ──────────────────────────────

    const [
      dailyBookingsRes,
      pendingShipmentsRes,
      upcomingReturnsRes,
      unreadMessagesRes,
      openDamagesRes,
      revenueTodayRes,
      revenueWeekRes,
      revenueMonthRes,
      activeBookingsRes,
      totalCustomersRes,
      newCustomersWeekRes,
      recentBookingsRes,
      upcomingReturnsListRes,
      openDamagesListRes,
      unreadMessagesListRes,
      recentReviewsRes,
      activityBookingsRes,
    ] = await Promise.all([
      // daily_bookings: count bookings created today
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart)
        .lt('created_at', tomorrowStart),

      // pending_shipments: confirmed but not yet shipped
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed'),

      // upcoming_returns: shipped bookings with rental_to in next 3 days
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'shipped')
        .gte('rental_to', todayStart)
        .lte('rental_to', threeDaysLater),

      // unread_messages: customer messages not read
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_type', 'customer')
        .eq('read', false),

      // open_damages
      supabase
        .from('damage_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),

      // revenue_today
      supabase
        .from('bookings')
        .select('price_total')
        .gte('created_at', todayStart)
        .lt('created_at', tomorrowStart)
        .not('status', 'eq', 'cancelled'),

      // revenue_week
      supabase
        .from('bookings')
        .select('price_total')
        .gte('created_at', weekStart)
        .not('status', 'eq', 'cancelled'),

      // revenue_month
      supabase
        .from('bookings')
        .select('price_total')
        .gte('created_at', monthStart)
        .not('status', 'eq', 'cancelled'),

      // active_bookings (confirmed + shipped)
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', ['confirmed', 'shipped']),

      // total_customers
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true }),

      // new_customers_week
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekStart),

      // recent_bookings (last 10)
      supabase
        .from('bookings')
        .select('id, product_name, customer_name, customer_email, price_total, status, created_at, rental_from, rental_to')
        .order('created_at', { ascending: false })
        .limit(10),

      // upcoming_returns_list (shipped, rental_to in next 7 days)
      supabase
        .from('bookings')
        .select('id, product_name, customer_name, rental_to, status, tracking_number')
        .eq('status', 'shipped')
        .gte('rental_to', todayStart)
        .order('rental_to', { ascending: true })
        .limit(10),

      // open_damages_list
      supabase
        .from('damage_reports')
        .select('id, booking_id, description, status, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(10),

      // unread_messages_list (conversations with unread)
      supabase
        .from('messages')
        .select('id, conversation_id, body, created_at')
        .eq('sender_type', 'customer')
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(10),

      // recent_reviews
      supabase
        .from('reviews')
        .select('id, booking_id, rating, comment, approved, created_at')
        .order('created_at', { ascending: false })
        .limit(10),

      // activity_feed: recent bookings for activity
      supabase
        .from('bookings')
        .select('id, product_name, customer_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    // ── Calculate revenue sums ───────────────────────────────────

    const sumPrices = (rows: { price_total: number }[] | null) =>
      (rows ?? []).reduce((sum, r) => sum + (r.price_total || 0), 0);

    // ── Enrich damage list with booking info ─────────────────────

    let openDamagesList: Array<{ id: string; description: string; status: string; created_at: string; product_name: string; customer_name: string }> = [];
    if (openDamagesListRes.data && openDamagesListRes.data.length > 0) {
      const bIds = [...new Set(openDamagesListRes.data.map((d) => d.booking_id))];
      const { data: damageBookings } = await supabase
        .from('bookings')
        .select('id, product_name, customer_name')
        .in('id', bIds);

      const bMap: Record<string, { product_name: string; customer_name: string }> = {};
      for (const b of damageBookings ?? []) {
        bMap[b.id] = { product_name: b.product_name, customer_name: b.customer_name };
      }

      openDamagesList = openDamagesListRes.data.map((d) => ({
        id: d.id,
        description: d.description || '',
        status: d.status,
        created_at: d.created_at,
        product_name: bMap[d.booking_id]?.product_name || '',
        customer_name: bMap[d.booking_id]?.customer_name || '',
      }));
    }

    // ── Enrich reviews with booking info ─────────────────────────

    let reviewsList: Array<{ id: string; rating: number; comment: string; approved: boolean; created_at: string; product_name: string; customer_name: string }> = [];
    if (recentReviewsRes.data && recentReviewsRes.data.length > 0) {
      const reviewBookingIds = [...new Set(recentReviewsRes.data.map((r) => r.booking_id))];
      const { data: reviewBookings } = await supabase
        .from('bookings')
        .select('id, product_name, customer_name')
        .in('id', reviewBookingIds);

      const rbMap: Record<string, { product_name: string; customer_name: string }> = {};
      for (const b of reviewBookings ?? []) {
        rbMap[b.id] = { product_name: b.product_name, customer_name: b.customer_name };
      }

      reviewsList = recentReviewsRes.data.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: (r.comment || '').substring(0, 120),
        approved: r.approved,
        created_at: r.created_at,
        product_name: rbMap[r.booking_id]?.product_name || '',
        customer_name: rbMap[r.booking_id]?.customer_name || '',
      }));
    }

    // ── Camera Utilization (30 Tage) ─────────────────────────────

    const utilDays = 30;
    const utilPeriodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - utilDays);
    const utilPeriodStartStr = utilPeriodStart.toISOString().split('T')[0];
    const utilPeriodEndStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];

    const { data: utilConfigData } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .single();

    const utilProductsMap: Record<string, AdminProduct> =
      utilConfigData?.value && typeof utilConfigData.value === 'object' && Object.keys(utilConfigData.value as object).length > 0
        ? (utilConfigData.value as Record<string, AdminProduct>)
        : DEFAULT_ADMIN_PRODUCTS;

    const { data: utilBookings } = await supabase
      .from('bookings')
      .select('id, product_id, product_name, rental_from, rental_to, status, price_total')
      .in('status', ['completed', 'shipped', 'confirmed', 'returned'])
      .lte('rental_from', utilPeriodEndStr)
      .gte('rental_to', utilPeriodStartStr);

    const utilizationProducts: Array<{
      id: string; name: string; brand: string; utilization: number;
      bookedDays: number; totalDays: number; revenue: number;
      avgDuration: number; bookingCount: number;
    }> = [];

    for (const product of Object.values(utilProductsMap)) {
      const pBookings = (utilBookings ?? []).filter(
        (b) => b.product_id === product.id || b.product_name === product.name
      );
      let totalBooked = 0;
      let totalRev = 0;
      let totalDur = 0;
      for (const booking of pBookings) {
        const rStart = new Date(booking.rental_from);
        const rEnd = new Date(booking.rental_to);
        const effStart = rStart < utilPeriodStart ? utilPeriodStart : rStart;
        const effEnd = rEnd > now ? now : rEnd;
        totalBooked += Math.max(0, Math.ceil((effEnd.getTime() - effStart.getTime()) / 86400000) + 1);
        totalRev += booking.price_total || 0;
        totalDur += Math.max(1, Math.ceil((rEnd.getTime() - rStart.getTime()) / 86400000) + 1);
      }
      utilizationProducts.push({
        id: product.id,
        name: product.name,
        brand: product.brand,
        utilization: Math.round(Math.min(100, (totalBooked / utilDays) * 100) * 10) / 10,
        bookedDays: totalBooked,
        totalDays: utilDays,
        revenue: Math.round(totalRev * 100) / 100,
        avgDuration: pBookings.length > 0 ? Math.round(totalDur / pBookings.length) : 0,
        bookingCount: pBookings.length,
      });
    }

    // ── Build response ───────────────────────────────────────────

    const data: Record<string, unknown> = {
      daily_bookings:    { value: dailyBookingsRes.count ?? 0 },
      pending_shipments: { value: pendingShipmentsRes.count ?? 0 },
      upcoming_returns:  { value: upcomingReturnsRes.count ?? 0 },
      unread_messages:   { value: unreadMessagesRes.count ?? 0 },
      open_damages:      { value: openDamagesRes.count ?? 0 },
      revenue_today:     { value: sumPrices(revenueTodayRes.data) },
      revenue_week:      { value: sumPrices(revenueWeekRes.data) },
      revenue_month:     { value: sumPrices(revenueMonthRes.data) },
      active_bookings:   { value: activeBookingsRes.count ?? 0 },
      total_customers:   { value: totalCustomersRes.count ?? 0 },
      new_customers_week: { value: newCustomersWeekRes.count ?? 0 },

      recent_bookings:        { items: recentBookingsRes.data ?? [] },
      upcoming_returns_list:  { items: upcomingReturnsListRes.data ?? [] },
      open_damages_list:      { items: openDamagesList },
      unread_messages_list:   { items: (unreadMessagesListRes.data ?? []).map((m) => ({ id: m.id, body: (m.body || '').substring(0, 120), created_at: m.created_at, conversation_id: m.conversation_id })) },
      recent_reviews:         { items: reviewsList },

      activity_feed: {
        items: (activityBookingsRes.data ?? []).map((b) => ({
          id: b.id,
          title: b.product_name || 'Buchung',
          subtitle: b.customer_name || '',
          status: b.status,
          created_at: b.created_at,
        })),
      },

      camera_utilization: { products: utilizationProducts },
    };

    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/admin/dashboard-data error:', err);
    return NextResponse.json({ error: 'Dashboard-Daten konnten nicht geladen werden.' }, { status: 500 });
  }
}

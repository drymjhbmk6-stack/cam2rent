import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { computeCameraUtilization } from '@/lib/camera-utilization';
import { isTestMode } from '@/lib/env-mode';
import {
  loadBufferDays,
  computeShipDate,
  computeReturnDueDate,
  toIsoDate,
  type BufferDays,
} from '@/lib/booking-buffer';

/**
 * GET /api/admin/dashboard-data
 * Returns all widget data in one call for the admin dashboard.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    // Test-/Live-Isolation: im Live-Modus nur echte Buchungen (is_test=false),
    // im Test-Modus nur Test-Buchungen. Gilt für alle bookings-basierten
    // Kennzahlen (Umsatz, Counts, Listen, Aufgaben) — Test-Bestellungen dürfen
    // nie in die Live-Zahlen einfließen (gleiche Konvention wie Analytics/Reports).
    const testMode = await isTestMode();

    // Date helpers — alles in Berlin-Zeit berechnen, damit "heute"/"Woche"/
    // "Monat" dem Nutzer entspricht und nicht dem UTC-Tag des Servers.
    // Parse Berlin-Datum und baue daraus UTC-Timestamps (mit +01:00/+02:00).
    const berlinIso = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }); // "2026-04-20 23:45:00"
    const [berlinDate, berlinTime] = berlinIso.split(' ');
    const [bYear, bMonth, bDay] = berlinDate.split('-').map((n) => parseInt(n, 10));
    // Offset-Helper: waehle +02:00 (CEST) oder +01:00 (CET) je nach aktueller Berlin-Zeit
    const offset = (() => {
      const utcFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', hour12: false }).format(new Date());
      const berlinHour = parseInt(berlinTime.split(':')[0], 10);
      const utcHour = parseInt(utcFmt, 10);
      const diff = (berlinHour - utcHour + 24) % 24;
      return diff === 2 ? '+02:00' : '+01:00';
    })();
    const mkIso = (y: number, m: number, d: number) => {
      const date = new Date(Date.UTC(y, m - 1, d));
      const yy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date.getUTCDate()).padStart(2, '0');
      return new Date(`${yy}-${mm}-${dd}T00:00:00${offset}`).toISOString();
    };
    const todayStart = mkIso(bYear, bMonth, bDay);
    const tomorrowStart = mkIso(bYear, bMonth, bDay + 1);

    // Week start (Monday) in Berlin-Zeit
    const berlinNow = new Date(`${berlinDate}T12:00:00${offset}`);
    const dayOfWeek = berlinNow.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = mkIso(bYear, bMonth, bDay - mondayOffset);

    // Month start
    const monthStart = mkIso(bYear, bMonth, 1);

    // 3 days from now
    const threeDaysLater = mkIso(bYear, bMonth, bDay + 3);

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
      actionQueueRes,
      pendingVerificationsRes,
    ] = await Promise.all([
      // daily_bookings: count bookings created today
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('is_test', testMode)
        .gte('created_at', todayStart)
        .lt('created_at', tomorrowStart),

      // pending_shipments: confirmed but not yet shipped
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('is_test', testMode)
        .eq('status', 'confirmed'),

      // upcoming_returns: shipped/delivered bookings with rental_to in next 3 days
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('is_test', testMode)
        .in('status', ['shipped', 'delivered'])
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
        .eq('is_test', testMode)
        .gte('created_at', todayStart)
        .lt('created_at', tomorrowStart)
        .not('status', 'eq', 'cancelled'),

      // revenue_week
      supabase
        .from('bookings')
        .select('price_total')
        .eq('is_test', testMode)
        .gte('created_at', weekStart)
        .not('status', 'eq', 'cancelled'),

      // revenue_month
      supabase
        .from('bookings')
        .select('price_total')
        .eq('is_test', testMode)
        .gte('created_at', monthStart)
        .not('status', 'eq', 'cancelled'),

      // active_bookings (confirmed + shipped)
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('is_test', testMode)
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
        .eq('is_test', testMode)
        .order('created_at', { ascending: false })
        .limit(10),

      // upcoming_returns_list (shipped, rental_to in next 7 days)
      supabase
        .from('bookings')
        .select('id, product_name, customer_name, rental_to, status, tracking_number')
        .eq('is_test', testMode)
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
        .eq('is_test', testMode)
        .order('created_at', { ascending: false })
        .limit(20),

      // action_queue: bookings die eine Admin-Aktion brauchen (packen,
      // uebergeben, ruckgabe pruefen, freigeben ...) — Direktlink-Liste.
      // select('*') (max 50 Zeilen) ist robust gegen fehlende Migrations-
      // Spalten (z.B. contract_locked) — fehlt eine Spalte, ist sie undefined.
      supabase
        .from('bookings')
        .select('*')
        .eq('is_test', testMode)
        .in('status', ['pending_verification', 'awaiting_payment', 'confirmed', 'preparing_shipment', 'awaiting_pickup', 'shipped', 'delivered', 'picked_up', 'damaged'])
        .order('rental_from', { ascending: true })
        .limit(50),

      // pending_verifications: Kunden die einen Ausweis hochgeladen haben und
      // auf Admin-Pruefung warten (verification_status='pending').
      supabase
        .from('profiles')
        .select('id, full_name, created_at')
        .eq('verification_status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50),
    ]);

    // ── Calculate revenue sums ───────────────────────────────────

    const sumPrices = (rows: { price_total: number }[] | null) =>
      (rows ?? []).reduce((sum, r) => sum + (r.price_total || 0), 0);

    // ── Enrich damage list + reviews mit Booking-Info ────────────
    // Damages und Reviews holen jeweils Bookings-Infos zur Anzeige. Statt zwei
    // separater Queries laden wir alle benoetigten Bookings in einem einzigen
    // Roundtrip und mappen client-side.

    const damageBookingIds = openDamagesListRes.data?.map((d) => d.booking_id) ?? [];
    const reviewBookingIds = recentReviewsRes.data?.map((r) => r.booking_id) ?? [];
    const allEnrichBookingIds = [...new Set([...damageBookingIds, ...reviewBookingIds])];

    const enrichMap: Record<string, { product_name: string; customer_name: string }> = {};
    if (allEnrichBookingIds.length > 0) {
      const { data: enrichBookings } = await supabase
        .from('bookings')
        .select('id, product_name, customer_name')
        .in('id', allEnrichBookingIds);
      for (const b of enrichBookings ?? []) {
        enrichMap[b.id] = { product_name: b.product_name, customer_name: b.customer_name };
      }
    }

    const openDamagesList = (openDamagesListRes.data ?? []).map((d) => ({
      id: d.id,
      description: d.description || '',
      status: d.status,
      created_at: d.created_at,
      product_name: enrichMap[d.booking_id]?.product_name || '',
      customer_name: enrichMap[d.booking_id]?.customer_name || '',
    }));

    const reviewsList = (recentReviewsRes.data ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: (r.comment || '').substring(0, 120),
      approved: r.approved,
      created_at: r.created_at,
      product_name: enrichMap[r.booking_id]?.product_name || '',
      customer_name: enrichMap[r.booking_id]?.customer_name || '',
    }));

    // ── Pending-Verifizierungen aufbereiten ──────────────────────
    // E-Mail aus auth.users nur aufloesen, wenn es wirklich offene Pruefungen
    // gibt (kein listUsers-Call im Normalbetrieb).
    const pendingProfiles = pendingVerificationsRes.data ?? [];
    let pendingVerifications: Array<{ id: string; name: string; created_at: string }> = [];
    if (pendingProfiles.length > 0) {
      const emailMap = new Map<string, string>();
      try {
        const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of users ?? []) emailMap.set(u.id, u.email || '');
      } catch {
        // E-Mail-Aufloesung ist best-effort — Name-Fallback reicht.
      }
      pendingVerifications = pendingProfiles.map((p) => ({
        id: p.id,
        name: (p.full_name || '').trim() || emailMap.get(p.id) || 'Kunde',
        created_at: p.created_at,
      }));
    }

    // ── Camera Utilization (30 Tage) — zentrale Lib, gleiche Logik wie /api/admin/utilization
    const utilizationProducts = await computeCameraUtilization(supabase, 30);

    // ── Action-Queue-Items mit Status-Übersicht anreichern ───────────
    // 4 Indikatoren pro Buchung fürs Dashboard-Aufgaben-Widget:
    //  verified  = Ausweis/Konto-Gate erfüllt (oder nicht erforderlich)
    //  contract_signed  = Mietvertrag unterschrieben
    //  contract_checked = Vertrag freigegeben ("Alles okay" / contract_locked)
    //  paid             = bezahlt — Quelle in dieser Reihenfolge:
    //    1. Stripe-Abgleich: echter Zahlungseingang (stripe_transactions,
    //       match_status 'matched'/'manual' → einer Buchung zugeordnet).
    //    2. Buchhaltung: invoices.status/payment_status = 'paid'.
    //    3. Fallback: abgeleitet aus payment_intent_id-Prefix + Status
    //       (kein PENDING-/MANUAL-UNPAID-/awaiting-/pending_verification).
    type AQRow = Record<string, unknown>;
    const aqRows = (actionQueueRes.data ?? []) as AQRow[];
    const aqIds = aqRows.map((b) => b.id).filter((x): x is string => typeof x === 'string' && x.length > 0);

    // Kunden-Verifizierungsstatus der beteiligten User bulk laden.
    const aqUserIds = [...new Set(
      aqRows.map((b) => b.user_id).filter((x): x is string => typeof x === 'string' && x.length > 0),
    )];
    const verifyStatusMap: Record<string, string> = {};
    if (aqUserIds.length > 0) {
      const { data: vprofiles } = await supabase
        .from('profiles')
        .select('id, verification_status')
        .in('id', aqUserIds);
      for (const p of vprofiles ?? []) {
        verifyStatusMap[p.id as string] = (p.verification_status as string) ?? '';
      }
    }

    // 1. Stripe-Abgleich: welche Buchungen haben einen echten Zahlungseingang?
    const paidViaStripe = new Set<string>();
    // 2. Buchhaltung: welche Buchungen haben eine bezahlte Rechnung?
    const paidViaInvoice = new Set<string>();
    if (aqIds.length > 0) {
      const [stripeRes, invRes] = await Promise.all([
        supabase
          .from('stripe_transactions')
          .select('booking_id, match_status')
          .in('booking_id', aqIds)
          .in('match_status', ['matched', 'manual']),
        supabase
          .from('invoices')
          .select('booking_id, status, payment_status')
          .in('booking_id', aqIds)
          .or('status.eq.paid,payment_status.eq.paid'),
      ]);
      for (const t of stripeRes.data ?? []) {
        if (t.booking_id) paidViaStripe.add(t.booking_id as string);
      }
      for (const i of invRes.data ?? []) {
        if (i.booking_id) paidViaInvoice.add(i.booking_id as string);
      }
    }

    const actionQueueItems = aqRows.map((b) => {
      const id = b.id as string;
      const piId = String(b.payment_intent_id ?? '');
      const st = String(b.status ?? '').toLowerCase();
      const isUnpaidDerived =
        /MANUAL-UNPAID/i.test(piId) ||
        /^PENDING-/i.test(piId) ||
        st === 'awaiting_payment' ||
        st === 'pending_verification';
      // Stripe zuerst, dann Buchhaltung, dann abgeleiteter Fallback.
      const paid = paidViaStripe.has(id) || paidViaInvoice.has(id) || !isUnpaidDerived;
      const gatePassed = !!b.verification_gate_passed_at;
      const uid = typeof b.user_id === 'string' ? b.user_id : '';
      const customerVerified = uid ? verifyStatusMap[uid] === 'verified' : false;
      // „Ausweis/Konto verifiziert": grün nur wenn der Kunde tatsächlich
      // verifiziert ist (Profil-Status 'verified') ODER der Admin das
      // Verifizierungs-Gate freigegeben hat. Sonst rot — auch wenn die
      // Buchung keine verzögerte Verifizierung verlangt (der Ausweis kann
      // trotzdem fehlen, wie bei Dennis).
      const verified = customerVerified || gatePassed;
      return {
        id,
        product_name: (b.product_name as string) ?? '',
        customer_name: (b.customer_name as string) ?? '',
        status: (b.status as string) ?? '',
        delivery_mode: (b.delivery_mode as string) ?? null,
        rental_from: (b.rental_from as string) ?? '',
        rental_to: (b.rental_to as string) ?? '',
        tracking_number: (b.tracking_number as string) ?? null,
        // Status-Übersicht (4 Indikatoren)
        verified,
        contract_signed: b.contract_signed === true,
        contract_checked: b.contract_locked === true,
        paid,
      };
    });

    // ── Abhol-/Rückgabe-Terminabsprache (Aufgaben) ──────────────────
    // Für Abhol-Buchungen (delivery_mode='abholung') soll der Admin ≤ 48h vor
    // dem Abhol- bzw. Rückgabetag mit dem Kunden eine Uhrzeit ausmachen. Wird
    // LIVE aus den bereits geladenen aqRows berechnet (kein Dedup — das
    // Dashboard zeigt die Aufgabe, solange sie im Fenster liegt; die einmalige
    // Push liefert der Cron /api/cron/pickup-return-reminder).
    const coordBuf: BufferDays = await loadBufferDays(supabase, {
      versand_before: 3, versand_after: 3, abholung_before: 1, abholung_after: 1,
    });
    const coordDaysUntil = (dateStr: string) => {
      const a = Date.parse(`${berlinDate}T00:00:00Z`);
      const c = Date.parse(`${dateStr}T00:00:00Z`);
      return Number.isNaN(c) ? Number.POSITIVE_INFINITY : Math.round((c - a) / 86_400_000);
    };
    const COORD_WITHIN_DAYS = 2; // „maximal 48h im Voraus"
    const coordinations: Array<{
      id: string; type: 'pickup' | 'return';
      product_name: string; customer_name: string; due_date: string;
    }> = [];
    for (const b of aqRows) {
      if (b.delivery_mode !== 'abholung') continue;
      const id = b.id as string;
      const st = String(b.status ?? '');
      if (st === 'confirmed' || st === 'awaiting_pickup') {
        const rf = String(b.rental_from ?? '').slice(0, 10);
        if (!rf) continue;
        const pickupDate = toIsoDate(
          computeShipDate(rf, 'abholung', coordBuf, (b.ship_date_override as string | null) ?? null),
        );
        if (coordDaysUntil(pickupDate) <= COORD_WITHIN_DAYS) {
          coordinations.push({
            id, type: 'pickup',
            product_name: (b.product_name as string) ?? '',
            customer_name: (b.customer_name as string) ?? '',
            due_date: pickupDate,
          });
        }
      } else if (st === 'picked_up') {
        const rt = String(b.rental_to ?? '').slice(0, 10);
        if (!rt) continue;
        const returnDate = toIsoDate(
          computeReturnDueDate(rt, 'abholung', coordBuf, (b.return_due_date_override as string | null) ?? null),
        );
        if (coordDaysUntil(returnDate) <= COORD_WITHIN_DAYS) {
          coordinations.push({
            id, type: 'return',
            product_name: (b.product_name as string) ?? '',
            customer_name: (b.customer_name as string) ?? '',
            due_date: returnDate,
          });
        }
      }
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

      action_queue: { items: actionQueueItems, verifications: pendingVerifications, coordinations },
    };

    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/admin/dashboard-data error:', err);
    return NextResponse.json({ error: 'Dashboard-Daten konnten nicht geladen werden.' }, { status: 500 });
  }
}

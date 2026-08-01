import type { SupabaseClient } from '@supabase/supabase-js';
import { type AdminProduct } from '@/lib/price-config';

/**
 * Zentrale Auslastungs-Berechnung — eine Quelle der Wahrheit fuer Dashboard,
 * Kameras-Seite, Analytics.
 *
 * Warum zentral: fruehere Duplikate in /api/admin/dashboard-data und
 * /api/admin/utilization liefen mit unterschiedlichen Status-Filtern
 * auseinander (Dashboard ohne `picked_up`, Utilization ohne `returned`) und
 * zeigten deshalb unterschiedliche Prozentsaetze fuer dieselbe Kamera.
 */
export const UTILIZATION_BOOKING_STATUSES = [
  'confirmed',
  'preparing_shipment',
  'awaiting_pickup',
  'shipped',
  'delivered',
  'picked_up',
  'returned',
  'completed',
] as const;

export interface CameraUtilizationRow {
  id: string;
  name: string;
  brand: string;
  utilization: number;
  bookedDays: number;
  totalDays: number;
  revenue: number;
  avgDuration: number;
  bookingCount: number;
}

/**
 * Optionen fuer computeCameraUtilization. Alle optional → rueckwaerts-
 * kompatibel: nicht-angepasste Aufrufer laufen unveraendert weiter.
 */
export interface CameraUtilizationOptions {
  /**
   * Test-/Live-Filter (M-6). undefined = kein zusaetzlicher Filter
   * (bisheriges Verhalten). true → nur Test-Buchungen, false → nur echte.
   */
  isTest?: boolean;
  /**
   * Expliziter Zeitraum als Berlin-Kalendertag `YYYY-MM-DD` (M-7). Wenn
   * `from` UND `to` gesetzt sind, wird DIESER Zeitraum genutzt (auch
   * vergangene custom-Fenster) statt „letzte `days` Tage bis heute".
   */
  from?: string;
  to?: string;
}

/**
 * Berechnet die Auslastung aller Kameras fuer den angegebenen Zeitraum.
 * `days` = Anzahl Tage in die Vergangenheit ab heute (Berlin-Zeit).
 * Wenn `opts.from`/`opts.to` gesetzt sind, gilt stattdessen dieser explizite
 * Zeitraum (M-7). Auslastung pro Kamera = gebuchte Tage / (Zeitraum ×
 * Anzahl aktiver Units).
 */
export async function computeCameraUtilization(
  supabase: SupabaseClient,
  days = 30,
  opts: CameraUtilizationOptions = {},
): Promise<CameraUtilizationRow[]> {
  let periodStart: Date;
  let periodStartStr: string;
  let now: Date; // Ende-Anker fuer das Clampen von effectiveEnd
  let periodEndStr: string;
  let windowDays: number; // Nenner fuer die Auslastungs-Normalisierung

  if (opts.from && opts.to) {
    // Expliziter (ggf. vergangener) Zeitraum — Tagesgrenzen als UTC-Mitternacht.
    periodStart = new Date(`${opts.from}T00:00:00Z`);
    now = new Date(`${opts.to}T00:00:00Z`);
    periodStartStr = opts.from;
    periodEndStr = opts.to;
    windowDays = Math.max(
      1,
      Math.round((now.getTime() - periodStart.getTime()) / 86400000) + 1,
    );
  } else {
    // Heute in Berlin-Zeit, damit die Periode zwischen 22-24 Uhr nicht auf den
    // UTC-Vortag rutscht (Server laeuft UTC).
    const todayBerlin = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    const [tyStr, tmStr, tdStr] = todayBerlin.split('-');
    const ty = parseInt(tyStr, 10);
    const tm = parseInt(tmStr, 10);
    const td = parseInt(tdStr, 10);
    periodStart = new Date(Date.UTC(ty, tm - 1, td - days));
    periodStartStr = periodStart.toISOString().split('T')[0];
    now = new Date(Date.UTC(ty, tm - 1, td));
    periodEndStr = todayBerlin;
    windowDays = days;
  }

  const { data: configData } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', 'products')
    .single();

  const productsMap: Record<string, AdminProduct> =
    configData?.value && typeof configData.value === 'object' && Object.keys(configData.value).length > 0
      ? (configData.value as Record<string, AdminProduct>)
      : {};

  let bookingsQuery = supabase
    .from('bookings')
    .select('id, product_id, product_name, rental_from, rental_to, status, price_total')
    .in('status', UTILIZATION_BOOKING_STATUSES as unknown as string[])
    .lte('rental_from', periodEndStr)
    .gte('rental_to', periodStartStr);
  // Test-/Live-Isolation (M-6): nur filtern, wenn explizit angefordert —
  // sonst bleibt das bisherige Verhalten (alle Buchungen) erhalten.
  if (opts.isTest !== undefined) {
    bookingsQuery = bookingsQuery.eq('is_test', opts.isTest);
  }
  const { data: bookings } = await bookingsQuery;

  const { data: allUnits } = await supabase
    .from('product_units')
    .select('product_id, status')
    .neq('status', 'retired');

  const results: CameraUtilizationRow[] = [];

  for (const product of Object.values(productsMap)) {
    const productBookings = (bookings ?? []).filter(
      (b) => b.product_id === product.id || b.product_name === product.name,
    );

    let totalBookedDays = 0;
    let totalRevenue = 0;
    let totalDuration = 0;

    for (const booking of productBookings) {
      const rentalStart = new Date(booking.rental_from);
      const rentalEnd = new Date(booking.rental_to);
      const effectiveStart = rentalStart < periodStart ? periodStart : rentalStart;
      const effectiveEnd = rentalEnd > now ? now : rentalEnd;

      const bookedDays = Math.max(
        0,
        Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1,
      );
      totalBookedDays += bookedDays;
      totalRevenue += booking.price_total || 0;

      const fullDuration = Math.max(
        1,
        Math.ceil((rentalEnd.getTime() - rentalStart.getTime()) / 86400000) + 1,
      );
      totalDuration += fullDuration;
    }

    const unitCount = (allUnits ?? []).filter((u) => u.product_id === product.id).length || 1;
    const utilization =
      windowDays > 0 ? Math.min(100, (totalBookedDays / (windowDays * unitCount)) * 100) : 0;
    const avgDuration = productBookings.length > 0 ? Math.round(totalDuration / productBookings.length) : 0;

    results.push({
      id: product.id,
      name: product.name,
      brand: product.brand,
      utilization: Math.round(utilization * 10) / 10,
      bookedDays: totalBookedDays,
      totalDays: windowDays,
      revenue: Math.round(totalRevenue * 100) / 100,
      avgDuration,
      bookingCount: productBookings.length,
    });
  }

  return results;
}

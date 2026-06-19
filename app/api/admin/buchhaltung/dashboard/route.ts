import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';
import { resolveBookingCameras } from '@/lib/booking-cameras';
import { getProducts } from '@/lib/get-products';
import { getPriceForDays, type Product } from '@/data/products';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'Parameter "from" und "to" erforderlich.' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    // Steuermodus laden
    const { data: taxRow } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'tax_mode')
      .maybeSingle();
    const taxMode = taxRow?.value || 'kleinunternehmer';

    // Datumsgrenzen Berlin-TZ-bewusst (sonst Januar/Dezember-Verschiebung am Tagesrand).
    const fromIso = getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`;
    const toIso = getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`;

    // Buchungen im Zeitraum — Test-Daten ausgeschlossen (GoBD-konform)
    // `cameras` (JSONB) defensiv mitladen: Multi-Kamera-Migration ist evtl.
    // noch nicht durch → bei fehlender Spalte Retry ohne `cameras`. Der
    // Top-Produkte-Resolver faellt dann auf den product_name-Komma-Split.
    let bookings: Array<{
      id: string;
      product_name: string | null;
      price_total: number | null;
      status: string | null;
      created_at: string | null;
      days?: number | null;
      rental_from?: string | null;
      rental_to?: string | null;
      cameras?: unknown;
    }> | null = null;
    let bookingsError: { message: string } | null = null;
    {
      const withCameras = await supabase
        .from('bookings')
        .select('id, product_name, price_total, status, created_at, days, rental_from, rental_to, cameras')
        .eq('is_test', false)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false });
      if (withCameras.error && /cameras|column|schema cache|PGRST/i.test(withCameras.error.message)) {
        const retry = await supabase
          .from('bookings')
          .select('id, product_name, price_total, status, created_at, days, rental_from, rental_to')
          .eq('is_test', false)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: false });
        bookings = retry.data;
        bookingsError = retry.error;
      } else {
        bookings = withCameras.data;
        bookingsError = withCameras.error;
      }
    }

    if (bookingsError) {
      return NextResponse.json({ error: `Buchungen: ${bookingsError.message}` }, { status: 500 });
    }

    const allBookings = bookings || [];
    const activeBookings = allBookings.filter(b => b.status !== 'cancelled');
    const cancelledBookings = allBookings.filter(b => b.status === 'cancelled');

    // Vorzeitraum berechnen
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevTo = new Date(fromDate.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - days * 24 * 60 * 60 * 1000);

    const prevFromKey = prevFrom.toISOString().split('T')[0];
    const prevToKey = prevTo.toISOString().split('T')[0];
    const prevFromIso = getBerlinDayStartFromDateString(prevFromKey) ?? `${prevFromKey}T00:00:00Z`;
    const prevToIso = getBerlinDayEndFromDateString(prevToKey) ?? `${prevToKey}T23:59:59Z`;
    const { data: prevBookings } = await supabase
      .from('bookings')
      .select('price_total, status')
      .eq('is_test', false)
      .gte('created_at', prevFromIso)
      .lte('created_at', prevToIso);

    const prevActive = (prevBookings || []).filter(b => b.status !== 'cancelled');
    const currentRevenue = activeBookings.reduce((sum, b) => sum + (b.price_total || 0), 0);
    const prevRevenue = prevActive.reduce((sum, b) => sum + (b.price_total || 0), 0);
    const trend = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    // Rechnungen — mit Fallback falls Spalte noch nicht existiert
    let recentInvoices: Array<{
      id: string;
      invoice_number: string;
      invoice_date: string;
      customer_name: string;
      gross_amount: number;
      status: string;
    }> = [];
    let openAmount = 0;
    let paidCount = 0;

    try {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, gross_amount, status, booking_id, sent_to_email')
        .eq('is_test', false)
        .order('invoice_date', { ascending: false })
        .limit(10);

      recentInvoices = (invoices || []).map(inv => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        customer_name: inv.sent_to_email || '',
        gross_amount: inv.gross_amount || 0,
        // Defensiver Fallback: NULL nicht mehr als "paid" interpretieren — eine
        // Rechnung ohne expliziten Status gilt als offen, bis sie als bezahlt
        // markiert wurde (sonst sahen pending_verification-Buchungen faelschlich
        // bezahlt aus, siehe sync-status-Endpoint).
        status: inv.status || 'open',
      }));

      const { data: openInvoices } = await supabase
        .from('invoices')
        .select('gross_amount')
        .eq('is_test', false)
        .in('status', ['open', 'overdue']);

      openAmount = (openInvoices || []).reduce((sum, inv) => sum + (inv.gross_amount || 0), 0);

      const { data: paidInvoices } = await supabase
        .from('invoices')
        .select('id')
        .eq('is_test', false)
        .eq('status', 'paid')
        .gte('invoice_date', from)
        .lte('invoice_date', to);

      paidCount = paidInvoices?.length || 0;
    } catch {
      // invoices-Tabelle fehlt oder Spalten fehlen — kein Abbruch
    }

    // Umsatzverlauf letzte 12 Monate — Monate in Berlin-Zeit berechnen,
    // sonst schiebt sich der Dezember auf UTC-Servern bei Buchungen
    // zwischen 23-24 Uhr UTC in den falschen Monat.
    const revenueChart: Array<{ month: string; revenue: number; net: number }> = [];
    const berlinNow = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    const [bYearStr, bMonthStr] = berlinNow.split('-');
    const curYear = parseInt(bYearStr, 10);
    const curMonth = parseInt(bMonthStr, 10) - 1; // 0-based
    for (let i = 11; i >= 0; i--) {
      const year = curYear + Math.floor((curMonth - i) / 12);
      const month = ((curMonth - i) % 12 + 12) % 12;
      const firstDay = String(new Date(Date.UTC(year, month, 1)).getUTCDate()).padStart(2, '0');
      const lastDay = String(new Date(Date.UTC(year, month + 1, 0)).getUTCDate()).padStart(2, '0');
      const mFrom = `${year}-${String(month + 1).padStart(2, '0')}-${firstDay}`;
      const mTo = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;

      // Berlin-Zeit in UTC umrechnen fuer den DB-Filter
      const { data: monthBookings } = await supabase
        .from('bookings')
        .select('price_total')
        .eq('is_test', false)
        .neq('status', 'cancelled')
        .gte('created_at', `${mFrom}T00:00:00+01:00`)
        .lte('created_at', `${mTo}T23:59:59+01:00`);

      const revenue = (monthBookings || []).reduce((sum, b) => sum + (b.price_total || 0), 0);
      const monthName = new Date(Date.UTC(year, month, 15)).toLocaleDateString('de-DE', { month: 'short', year: '2-digit', timeZone: 'Europe/Berlin' });
      revenueChart.push({ month: monthName, revenue, net: revenue });
    }

    // Top 5 Produkte — jede Kamera EINZELN zaehlen. Multi-Kamera-Buchungen
    // (product_name = Komma-String wie "OSMO Action 5 Pro , DJI Osmo Nano",
    // auch zweimal dasselbe Modell) werden ueber resolveBookingCameras in
    // einzelne Kameras aufgeteilt. Der Umsatz wird NICHT gleichmaessig, sondern
    // gemaess dem tatsaechlich gebuchten Mietpreis pro Kamera verteilt: pro
    // Kamera wird der Katalog-Mietpreis (getPriceForDays je Modell × Mietdauer)
    // berechnet und price_total proportional zu diesem Anteil zugeordnet. So
    // bekommt jede Kamera den Umsatz, mit dem sie gebucht wurde (das teurere
    // Modell mehr), inkl. anteilig Zubehoer/Versand/Haftung.
    let productCatalog: Product[] = [];
    try {
      productCatalog = await getProducts();
    } catch {
      productCatalog = [];
    }
    const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const productByName = new Map<string, Product>();
    const productById = new Map<string, Product>();
    for (const p of productCatalog) {
      productByName.set(normName(p.name), p);
      productById.set(p.id, p);
    }

    const productRevenue: Record<string, { name: string; revenue: number; count: number }> = {};
    for (const b of activeBookings) {
      const cameras = resolveBookingCameras(b);
      const total = b.price_total || 0;
      if (cameras.length === 0) {
        // Keine Kamera ableitbar (z.B. Verkauf ohne product_name) — als
        // Sammelposten zaehlen, damit der Umsatz nicht verschwindet.
        const name = b.product_name || 'Unbekannt';
        if (!productRevenue[name]) productRevenue[name] = { name, revenue: 0, count: 0 };
        productRevenue[name].revenue += total;
        productRevenue[name].count += 1;
        continue;
      }

      // Mietdauer in Tagen (booking.days bevorzugt, sonst aus rental_from/to).
      let days = typeof b.days === 'number' && b.days > 0 ? b.days : 0;
      if (!days && b.rental_from && b.rental_to) {
        const dFrom = new Date(b.rental_from).getTime();
        const dTo = new Date(b.rental_to).getTime();
        if (!isNaN(dFrom) && !isNaN(dTo)) days = Math.max(1, Math.round((dTo - dFrom) / 86400000) + 1);
      }
      if (!days) days = 1;

      // Mietpreis-Anteil pro Kamera (gebuchter Katalogpreis je Modell).
      const weights = cameras.map((cam) => {
        const prod =
          (cam.product_id ? productById.get(cam.product_id) : undefined) ??
          (cam.product_name ? productByName.get(normName(cam.product_name)) : undefined);
        const price = prod ? getPriceForDays(prod, days) : 0;
        return price > 0 ? price : 0;
      });
      const weightSum = weights.reduce((s, w) => s + w, 0);

      cameras.forEach((cam, i) => {
        const name = cam.product_name || 'Unbekannt';
        if (!productRevenue[name]) productRevenue[name] = { name, revenue: 0, count: 0 };
        // Anteil am Gesamtumsatz: nach Mietpreis gewichtet; ohne bekannten
        // Preis (kein Katalog-Match) Fallback auf gleichmaessige Verteilung.
        const share = weightSum > 0 ? weights[i] / weightSum : 1 / cameras.length;
        productRevenue[name].revenue += total * share;
        productRevenue[name].count += 1;
      });
    }
    const topProducts = Object.values(productRevenue)
      .map((p) => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Offene Mahnungen — mit Fallback
    let openDunning: Array<{
      id: string;
      invoice_number: string;
      customer_name: string;
      days_overdue: number;
      level: number;
      gross_amount: number;
    }> = [];

    try {
      const { data: dunningData } = await supabase
        .from('dunning_notices')
        .select('id, invoice_id, level, fee_amount, status')
        .in('status', ['draft', 'sent'])
        .order('created_at', { ascending: false })
        .limit(10);

      openDunning = (dunningData || []).map(d => ({
        id: d.id,
        invoice_number: '',
        customer_name: '',
        days_overdue: 0,
        level: d.level,
        gross_amount: d.fee_amount || 0,
      }));
    } catch {
      // dunning_notices-Tabelle fehlt — kein Abbruch
    }

    return NextResponse.json({
      kpis: {
        revenue: { current: currentRevenue, previous: prevRevenue, trend },
        openAmount,
        paidCount,
        cancelledCount: cancelledBookings.length,
        cancelledAmount: cancelledBookings.reduce((sum, b) => sum + (b.price_total || 0), 0),
      },
      revenueChart,
      topProducts,
      recentInvoices,
      openDunning,
      taxMode,
    });
  } catch (err) {
    console.error('Dashboard API Fehler:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Interner Serverfehler' },
      { status: 500 }
    );
  }
}

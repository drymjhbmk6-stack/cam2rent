import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

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

    // Buchungen im Zeitraum — Test-Daten ausgeschlossen (GoBD-konform)
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, product_name, price_total, status, created_at')
      .eq('is_test', false)
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .order('created_at', { ascending: false });

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

    const { data: prevBookings } = await supabase
      .from('bookings')
      .select('price_total, status')
      .eq('is_test', false)
      .gte('created_at', `${prevFrom.toISOString().split('T')[0]}T00:00:00`)
      .lte('created_at', `${prevTo.toISOString().split('T')[0]}T23:59:59`);

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
        status: inv.status || 'paid',
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

    // Top 5 Produkte
    const productRevenue: Record<string, { name: string; revenue: number; count: number }> = {};
    for (const b of activeBookings) {
      const name = b.product_name || 'Unbekannt';
      if (!productRevenue[name]) productRevenue[name] = { name, revenue: 0, count: 0 };
      productRevenue[name].revenue += b.price_total || 0;
      productRevenue[name].count += 1;
    }
    const topProducts = Object.values(productRevenue)
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

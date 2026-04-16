import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { type AdminProduct } from '@/lib/price-config';

/**
 * GET /api/admin/utilization?days=30
 * Gibt Auslastungsdaten für alle Kameras zurück.
 */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // Zeitraum bestimmen
    const daysParam = req.nextUrl.searchParams.get('days');
    const days = [30, 90, 365].includes(Number(daysParam)) ? Number(daysParam) : 30;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
    const periodStartStr = periodStart.toISOString().split('T')[0]; // DATE format
    const periodEndStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];

    // Produkte aus admin_config laden
    const { data: configData } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .single();

    const productsMap: Record<string, AdminProduct> =
      configData?.value && typeof configData.value === 'object' && Object.keys(configData.value).length > 0
        ? (configData.value as Record<string, AdminProduct>)
        : {};

    // Buchungen im Zeitraum laden (alle aktiven/abgeschlossenen Status)
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, product_id, product_name, rental_from, rental_to, status, price_total')
      .in('status', ['confirmed', 'shipped', 'picked_up', 'completed'])
      .lte('rental_from', periodEndStr)
      .gte('rental_to', periodStartStr);

    // Anzahl Units pro Produkt (für korrekte Auslastung)
    const { data: allUnits } = await supabase
      .from('product_units')
      .select('product_id, status')
      .neq('status', 'retired');

    // Pro Produkt aggregieren
    const productResults: Array<{
      id: string;
      name: string;
      brand: string;
      utilization: number;
      bookedDays: number;
      totalDays: number;
      revenue: number;
      avgDuration: number;
      bookingCount: number;
    }> = [];

    for (const product of Object.values(productsMap)) {
      // Buchungen für dieses Produkt filtern
      const productBookings = (bookings ?? []).filter(
        (b) => b.product_id === product.id || b.product_name === product.name
      );

      let totalBookedDays = 0;
      let totalRevenue = 0;
      let totalDuration = 0;

      for (const booking of productBookings) {
        // Effektive Tage im Zeitraum berechnen (Überlappung)
        const rentalStart = new Date(booking.rental_from);
        const rentalEnd = new Date(booking.rental_to);
        const effectiveStart = rentalStart < periodStart ? periodStart : rentalStart;
        const effectiveEnd = rentalEnd > now ? now : rentalEnd;

        const bookedDays = Math.max(
          0,
          Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        );
        totalBookedDays += bookedDays;
        totalRevenue += booking.price_total || 0;

        // Gesamtdauer der Buchung (für Durchschnitt)
        const fullDuration = Math.max(
          1,
          Math.ceil((rentalEnd.getTime() - rentalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        );
        totalDuration += fullDuration;
      }

      // Anzahl verfügbarer Units für dieses Produkt (mindestens 1)
      const unitCount = (allUnits ?? []).filter(u => u.product_id === product.id).length || 1;
      // Auslastung = gebuchte Tage / (verfügbare Tage × Anzahl Units)
      const utilization = days > 0 ? Math.min(100, (totalBookedDays / (days * unitCount)) * 100) : 0;
      const avgDuration = productBookings.length > 0 ? Math.round(totalDuration / productBookings.length) : 0;

      productResults.push({
        id: product.id,
        name: product.name,
        brand: product.brand,
        utilization: Math.round(utilization * 10) / 10,
        bookedDays: totalBookedDays,
        totalDays: days,
        revenue: Math.round(totalRevenue * 100) / 100,
        avgDuration,
        bookingCount: productBookings.length,
      });
    }

    return NextResponse.json({ products: productResults });
  } catch (err) {
    console.error('GET /api/admin/utilization error:', err);
    return NextResponse.json(
      { error: 'Auslastungsdaten konnten nicht geladen werden.' },
      { status: 500 }
    );
  }
}

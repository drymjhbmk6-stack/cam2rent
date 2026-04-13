import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';

/**
 * GET /api/admin/availability-gantt?month=2026-04
 *
 * Liefert Gantt-Daten für den Verfügbarkeitskalender:
 * - Alle Produkte mit ihren Units
 * - Alle Buchungen im Monat (inkl. Puffertage)
 * - Blockierte Tage
 */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Parameter "month" im Format YYYY-MM erforderlich.' }, { status: 400 });
  }

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const supabase = createServiceClient();

  // Puffer-Tage laden
  const { data: bufferSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'booking_buffer_days')
    .maybeSingle();

  const buf = bufferSetting?.value
    ? (typeof bufferSetting.value === 'string' ? JSON.parse(bufferSetting.value) : bufferSetting.value)
    : { versand_before: 2, versand_after: 2, abholung_before: 0, abholung_after: 1 };

  const maxBuffer = Math.max(buf.versand_before, buf.versand_after, buf.abholung_before, buf.abholung_after, 3);

  // Erweiterten Zeitraum berechnen
  const extFirst = new Date(year, mon - 1, 1 - maxBuffer).toISOString().split('T')[0];
  const extLast = new Date(year, mon - 1, daysInMonth + maxBuffer).toISOString().split('T')[0];

  // Parallele Abfragen
  const [products, unitsResult, bookingsResult, blockedResult] = await Promise.all([
    getProducts(),
    supabase.from('product_units').select('*').order('created_at', { ascending: true }),
    supabase
      .from('bookings')
      .select('id, product_id, product_name, rental_from, rental_to, days, status, delivery_mode, customer_name, unit_id')
      .in('status', ['confirmed', 'shipped', 'active'])
      .lte('rental_from', extLast)
      .gte('rental_to', extFirst),
    supabase
      .from('product_blocked_dates')
      .select('product_id, start_date, end_date, reason')
      .lte('start_date', lastDay)
      .gte('end_date', firstDay),
  ]);

  const units = unitsResult.data ?? [];
  const bookings = bookingsResult.data ?? [];
  const blocked = blockedResult.data ?? [];

  // Daten nach Produkt gruppieren
  const productData = products
    .filter((p) => p.available !== false)
    .map((p) => {
      const productUnits = units.filter((u) => u.product_id === p.id);
      const productBookings = bookings.filter((b) => b.product_id === p.id);
      const productBlocked = blocked.filter((bl) => bl.product_id === p.id);

      return {
        id: p.id,
        name: p.name,
        stock: p.stock,
        units: productUnits.map((u) => ({
          id: u.id,
          serial_number: u.serial_number,
          label: u.label,
          status: u.status,
        })),
        bookings: productBookings.map((b) => ({
          id: b.id,
          rental_from: b.rental_from,
          rental_to: b.rental_to,
          customer_name: b.customer_name,
          delivery_mode: b.delivery_mode,
          status: b.status,
          unit_id: b.unit_id,
        })),
        blocked: productBlocked,
      };
    });

  return NextResponse.json({
    month,
    daysInMonth,
    bufferDays: buf,
    products: productData,
  });
}

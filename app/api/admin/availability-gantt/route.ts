import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';

/**
 * GET /api/admin/availability-gantt?from=2025-04-16&to=2027-04-15
 * ODER (Rückwärtskompatibel):
 * GET /api/admin/availability-gantt?month=2026-04
 *
 * Liefert Gantt-Daten für den Verfügbarkeitskalender:
 * - Alle Produkte mit ihren Units
 * - Alle Buchungen im Zeitraum (inkl. Puffertage)
 * - Blockierte Tage
 *
 * Unterstützt bis zu 24 Monate in einem Request.
 */
export async function GET(req: NextRequest) {
  let firstDay: string;
  let lastDay: string;

  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const monthParam = req.nextUrl.searchParams.get('month');

  if (fromParam && toParam) {
    // Neues Range-Format: ?from=YYYY-MM-DD&to=YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromParam) || !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
      return NextResponse.json({ error: 'Parameter "from" und "to" im Format YYYY-MM-DD erforderlich.' }, { status: 400 });
    }
    // Max 24 Monate Begrenzung
    const fromDate = new Date(fromParam);
    const toDate = new Date(toParam);
    const diffMs = toDate.getTime() - fromDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 750) { // ~24.5 Monate
      return NextResponse.json({ error: 'Maximaler Zeitraum: 24 Monate.' }, { status: 400 });
    }
    if (diffDays < 0) {
      return NextResponse.json({ error: '"from" muss vor "to" liegen.' }, { status: 400 });
    }
    firstDay = fromParam;
    lastDay = toParam;
  } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    // Rückwärtskompatibel: ?month=YYYY-MM
    const [yearStr, monthStr] = monthParam.split('-');
    const year = parseInt(yearStr, 10);
    const mon = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, mon, 0).getDate();
    firstDay = `${monthParam}-01`;
    lastDay = `${monthParam}-${String(daysInMonth).padStart(2, '0')}`;
  } else {
    return NextResponse.json({ error: 'Parameter "from" + "to" (YYYY-MM-DD) oder "month" (YYYY-MM) erforderlich.' }, { status: 400 });
  }

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

  // Erweiterten Zeitraum berechnen (für Buchungen die über den Rand hinausragen)
  const extFirstDate = new Date(firstDay);
  extFirstDate.setDate(extFirstDate.getDate() - maxBuffer);
  const extFirst = extFirstDate.toISOString().split('T')[0];

  const extLastDate = new Date(lastDay);
  extLastDate.setDate(extLastDate.getDate() + maxBuffer);
  const extLast = extLastDate.toISOString().split('T')[0];

  // Parallele Abfragen
  const [products, unitsResult, bookingsResult, blockedResult, accessoriesResult, setsResult] = await Promise.all([
    getProducts(),
    supabase
      .from('product_units')
      .select('id, product_id, serial_number, label, status')
      .order('created_at', { ascending: true }),
    supabase
      .from('bookings')
      .select('id, product_id, product_name, rental_from, rental_to, days, status, delivery_mode, customer_name, unit_id, accessories')
      .in('status', ['confirmed', 'shipped', 'picked_up', 'completed'])
      .lte('rental_from', extLast)
      .gte('rental_to', extFirst),
    supabase
      .from('product_blocked_dates')
      .select('product_id, start_date, end_date, reason')
      .lte('start_date', lastDay)
      .gte('end_date', firstDay),
    supabase
      .from('accessories')
      .select('id, name, category, available_qty, available, sort_order')
      .eq('available', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('sets')
      .select('id, name, badge, available, accessory_items, sort_order')
      .order('sort_order', { ascending: true }),
  ]);

  const units = unitsResult.data ?? [];
  const bookings = bookingsResult.data ?? [];
  const blocked = blockedResult.data ?? [];

  // Gruppierung in O(n) statt O(n*m) pro Produkt (N+1-Fix)
  const unitsByProduct: Record<string, typeof units> = {};
  for (const u of units) {
    (unitsByProduct[u.product_id] ||= []).push(u);
  }
  const bookingsByProduct: Record<string, typeof bookings> = {};
  for (const b of bookings) {
    if (b.product_id) (bookingsByProduct[b.product_id] ||= []).push(b);
  }
  const blockedByProduct: Record<string, typeof blocked> = {};
  for (const bl of blocked) {
    (blockedByProduct[bl.product_id] ||= []).push(bl);
  }

  // Daten nach Produkt gruppieren
  const productData = products
    .filter((p) => p.available !== false)
    .map((p) => {
      const productUnits = unitsByProduct[p.id] ?? [];
      const productBookings = bookingsByProduct[p.id] ?? [];
      const productBlocked = blockedByProduct[p.id] ?? [];

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

  // ── Zubehör-Daten ──
  const allAccessories = accessoriesResult.data ?? [];
  const allSets = setsResult.data ?? [];

  // Set-ID → Zubehör-Mapping (um Set-Buchungen auf Zubehör aufzulösen)
  const setAccessoryMap: Record<string, { accessory_id: string; qty: number }[]> = {};
  for (const s of allSets) {
    if (Array.isArray(s.accessory_items)) {
      setAccessoryMap[s.id] = s.accessory_items;
    }
  }

  // Buchungen die Zubehör enthalten
  const accBookings = bookings
    .filter((b) => Array.isArray(b.accessories) && b.accessories.length > 0)
    .map((b) => ({
      id: b.id,
      rental_from: b.rental_from,
      rental_to: b.rental_to,
      customer_name: b.customer_name,
      delivery_mode: b.delivery_mode,
      accessories: b.accessories as string[],
    }));

  // Einmal pro Buchung auflösen: welche Accessory-IDs + Set-IDs sind betroffen?
  // Dadurch O(bookings * setItems) statt O(accessories * bookings * setItems).
  const bookingsByAccessory: Record<string, typeof accBookings> = {};
  const bookingsBySet: Record<string, typeof accBookings> = {};
  for (const b of accBookings) {
    const touchedAccessories = new Set<string>();
    const touchedSets = new Set<string>();
    for (const id of b.accessories) {
      const setItems = setAccessoryMap[id];
      if (setItems) {
        touchedSets.add(id);
        for (const si of setItems) touchedAccessories.add(si.accessory_id);
      } else {
        touchedAccessories.add(id);
      }
    }
    for (const accId of touchedAccessories) {
      (bookingsByAccessory[accId] ||= []).push(b);
    }
    for (const setId of touchedSets) {
      (bookingsBySet[setId] ||= []).push(b);
    }
  }

  // Pro Zubehörteil: Welche Buchungen nutzen es? (inkl. Set-Auflösung)
  const accessoryData = allAccessories.map((acc) => {
    const relevantBookings = bookingsByAccessory[acc.id] ?? [];

    return {
      id: acc.id,
      name: acc.name,
      category: acc.category,
      available_qty: acc.available_qty,
      bookings: relevantBookings.map((b) => ({
        id: b.id,
        rental_from: b.rental_from,
        rental_to: b.rental_to,
        customer_name: b.customer_name,
        delivery_mode: b.delivery_mode,
      })),
    };
  });

  // Pro Set: Welche Buchungen nutzen es?
  const setData = allSets.map((s) => {
    const relevantBookings = bookingsBySet[s.id] ?? [];

    return {
      id: s.id,
      name: s.name,
      badge: s.badge,
      available: s.available,
      accessory_items: s.accessory_items,
      bookings: relevantBookings.map((b) => ({
        id: b.id,
        rental_from: b.rental_from,
        rental_to: b.rental_to,
        customer_name: b.customer_name,
        delivery_mode: b.delivery_mode,
      })),
    };
  });

  return NextResponse.json({
    from: firstDay,
    to: lastDay,
    bufferDays: buf,
    products: productData,
    accessories: accessoryData,
    sets: setData,
  });
}

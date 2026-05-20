import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';
import { resolveProdukteIdMap, loadInventarUnitsForProdukteBulk } from '@/lib/legacy-bridge';
import { resolveBookingCameras } from '@/lib/booking-cameras';

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
  const [products, bookingsResult, blockedResult, accessoriesResult, setsResult] = await Promise.all([
    getProducts(),
    supabase
      .from('bookings')
      .select('id, product_id, product_name, rental_from, rental_to, days, status, delivery_mode, customer_name, unit_id, cameras, accessories, accessory_items, accessory_unit_ids, is_test')
      .in('status', ['awaiting_payment', 'confirmed', 'shipped', 'picked_up', 'completed'])
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

  const bookings = bookingsResult.data ?? [];
  const blocked = blockedResult.data ?? [];

  // Inventar-Einheiten via legacy-bridge laden (neue Welt). Mit
  // legacy_unit_id-Mapping, damit existierende Buchungen (bookings.unit_id =
  // alte product_units.id) korrekt zur Inventar-Einheit zugeordnet werden.
  const visibleProducts = products.filter((p) => p.available !== false);
  const legacyToProdukteId = await resolveProdukteIdMap(
    supabase,
    'admin_config.products',
    visibleProducts.map((p) => p.id),
    { autoCreate: true }, // Lazy-Backfill, falls neu angelegt
  );
  const produkteIds = Array.from(legacyToProdukteId.values());
  const inventarByProdukt = await loadInventarUnitsForProdukteBulk(supabase, produkteIds, {
    typ: 'kamera',
    legacyMappingFrom: 'product_units',
  });

  // Fallback: alte product_units lesen — fuer Pre-Migration-Daten oder wenn
  // die produkte/migration_audit-Tabellen noch nicht durch sind.
  const { data: legacyUnitsData } = await supabase
    .from('product_units')
    .select('id, product_id, serial_number, label, status')
    .order('created_at', { ascending: true });
  const legacyUnits = legacyUnitsData ?? [];
  const legacyUnitsByProduct: Record<string, typeof legacyUnits> = {};
  for (const u of legacyUnits) {
    (legacyUnitsByProduct[u.product_id] ||= []).push(u);
  }

  // Pro Kamera der Buchung ein Overlay-Eintrag mit DEREN unit_id, gruppiert
  // nach DEREN Produkt — so erscheinen gemischte Modelle auf der richtigen
  // Produkt-/Unit-Zeile (nicht nur die erste Kamera). Legacy/cameras=NULL →
  // Resolver liefert eine Kamera = altes Verhalten.
  type GanttBooking = (typeof bookings)[number] & { _unitId: string | null };
  const bookingsByProduct: Record<string, GanttBooking[]> = {};
  for (const b of bookings) {
    const cams = resolveBookingCameras(b);
    if (cams.length === 0) {
      if (b.product_id)
        (bookingsByProduct[b.product_id] ||= []).push({ ...b, _unitId: b.unit_id ?? null });
      continue;
    }
    for (const c of cams) {
      const pid = c.product_id ?? b.product_id;
      if (!pid) continue;
      (bookingsByProduct[pid] ||= []).push({ ...b, _unitId: c.unit_id });
    }
  }
  const blockedByProduct: Record<string, typeof blocked> = {};
  for (const bl of blocked) {
    (blockedByProduct[bl.product_id] ||= []).push(bl);
  }

  // Daten nach Produkt gruppieren — Inventar-Einheiten haben Vorrang.
  // Status-Mapping fuer alte UI: verfuegbar→available, vermietet→rented, ...
  const productData = visibleProducts.map((p) => {
    const produkteId = legacyToProdukteId.get(p.id);
    const inventarUnits = produkteId ? (inventarByProdukt.get(produkteId) ?? []) : [];
    const productBookings = bookingsByProduct[p.id] ?? [];
    const productBlocked = blockedByProduct[p.id] ?? [];

    // Bekannte Inventar-Units mit Legacy-Mapping → diese alten product_units
    // werden NICHT mehr separat gezeigt (wuerde sonst doppelte Zeilen ergeben).
    const knownLegacyIds = new Set(
      inventarUnits.map((u) => u.legacy_unit_id).filter((x): x is string => !!x),
    );
    const orphanLegacyUnits = (legacyUnitsByProduct[p.id] ?? [])
      .filter((u) => !knownLegacyIds.has(u.id))
      .map((u) => ({
        id: u.id,
        serial_number: u.serial_number,
        label: u.label,
        status: u.status,
      }));

    const unitsForUi = [
      ...inventarUnits.map((u) => ({
        // ID-Konvention: fuer Booking-Overlay verwenden wir die LEGACY-ID
        // (falls vorhanden), denn bookings.unit_id hat die alte ID.
        // Nur-Inventar-Stuecke (ohne Legacy-Twin) bekommen ihre Inventar-ID
        // — bookings koennen eh noch nicht darauf zeigen.
        id: u.legacy_unit_id ?? u.id,
        serial_number: u.serial_number,
        label: u.label,
        status: u.status,
      })),
      ...orphanLegacyUnits,
    ];

    return {
      id: p.id,
      name: p.name,
      stock: p.stock,
      units: unitsForUi,
      bookings: productBookings.map((b) => ({
        id: b.id,
        rental_from: b.rental_from,
        rental_to: b.rental_to,
        customer_name: b.customer_name,
        delivery_mode: b.delivery_mode,
        status: b.status,
        unit_id: b._unitId,
        is_test: b.is_test ?? false,
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

  // Unit→Accessory-Mapping (Prio 1 fuer accessory_unit_ids — die konkret
  // reservierten Exemplare). Mengen-/Multi-Kamera-Buchungen reservieren
  // mehrere Einheiten; ohne qty-Aufloesung zaehlt der Gantt jede Buchung
  // nur 1× und zeigt z.B. "1/2 belegt" obwohl 2 Karten gebucht sind.
  const allAccUnitIds = new Set<string>();
  for (const b of bookings) {
    const uids = (b as { accessory_unit_ids?: string[] }).accessory_unit_ids;
    if (Array.isArray(uids)) for (const u of uids) if (u) allAccUnitIds.add(u);
  }
  const unitToAcc = new Map<string, string>();
  if (allAccUnitIds.size > 0) {
    const { data: accUnits } = await supabase
      .from('accessory_units')
      .select('id, accessory_id')
      .in('id', [...allAccUnitIds]);
    for (const u of accUnits ?? []) unitToAcc.set(u.id as string, u.accessory_id as string);
  }

  interface AccBookingLite {
    id: string; rental_from: string; rental_to: string;
    customer_name: string; delivery_mode: string; status: string;
  }

  // Pro Buchung qty-aware aufloesen — gleiche Prioritaet wie der
  // kundenseitige computeAccessoryAvailability (unit_ids → items → legacy).
  const bookingsByAccessory: Record<string, (AccBookingLite & { qty: number })[]> = {};
  const bookingsBySet: Record<string, AccBookingLite[]> = {};

  for (const b of bookings) {
    const accessories = Array.isArray(b.accessories) ? (b.accessories as string[]) : [];
    const items = Array.isArray((b as { accessory_items?: { accessory_id: string; qty?: number }[] }).accessory_items)
      ? ((b as { accessory_items: { accessory_id: string; qty?: number }[] }).accessory_items)
      : [];
    const unitIds = Array.isArray((b as { accessory_unit_ids?: string[] }).accessory_unit_ids)
      ? ((b as { accessory_unit_ids: string[] }).accessory_unit_ids)
      : [];
    if (accessories.length === 0 && items.length === 0 && unitIds.length === 0) continue;

    const lite: AccBookingLite = {
      id: b.id,
      rental_from: b.rental_from,
      rental_to: b.rental_to,
      customer_name: b.customer_name,
      delivery_mode: b.delivery_mode,
      status: b.status,
    };

    const accQty = new Map<string, number>();
    const touchedSets = new Set<string>();

    const addAcc = (id: string, q: number) => {
      const setItems = setAccessoryMap[id];
      if (setItems) {
        touchedSets.add(id);
        for (const si of setItems) {
          accQty.set(si.accessory_id, (accQty.get(si.accessory_id) ?? 0) + (si.qty ?? 1) * q);
        }
      } else {
        accQty.set(id, (accQty.get(id) ?? 0) + q);
      }
    };

    if (unitIds.length > 0) {
      for (const uid of unitIds) {
        const accId = unitToAcc.get(uid);
        if (accId) accQty.set(accId, (accQty.get(accId) ?? 0) + 1);
      }
      // Set-Zeilen fuer die Set-Ansicht weiterhin markieren.
      for (const id of accessories) if (setAccessoryMap[id]) touchedSets.add(id);
    } else if (items.length > 0) {
      for (const it of items) {
        if (!it?.accessory_id) continue;
        const q = typeof it.qty === 'number' && it.qty > 0 ? Math.floor(it.qty) : 1;
        addAcc(it.accessory_id, q);
      }
    } else {
      for (const id of accessories) { if (id) addAcc(id, 1); }
    }

    for (const [accId, q] of accQty) {
      (bookingsByAccessory[accId] ||= []).push({ ...lite, qty: q });
    }
    for (const setId of touchedSets) {
      (bookingsBySet[setId] ||= []).push(lite);
    }
  }

  // Pro Zubehörteil: Welche Buchungen nutzen es? (inkl. Set-Auflösung, qty-aware)
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
        status: b.status,
        qty: b.qty,
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
        status: b.status,
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

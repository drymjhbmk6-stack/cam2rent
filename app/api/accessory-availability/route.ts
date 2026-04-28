import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { RESERVING_BOOKING_STATUSES } from '@/lib/booking-statuses';

interface BufferDays {
  versand_before: number;
  versand_after: number;
  abholung_before: number;
  abholung_after: number;
}

const DEFAULT_BUFFER: BufferDays = {
  versand_before: 2, versand_after: 2,
  abholung_before: 0, abholung_after: 1,
};

interface AccessoryItemLite {
  accessory_id: string;
  qty: number;
}

interface ReservingBooking {
  accessories: string[] | null;
  accessory_items: AccessoryItemLite[] | null;
  accessory_unit_ids: string[] | null;
  rental_from: string;
  rental_to: string;
  delivery_mode: string | null;
}

/**
 * GET /api/accessory-availability?from=2026-04-10&to=2026-04-15&product_id=1&delivery_mode=versand
 *
 * Berechnet welche Zubehörteile und Sets für den Zeitraum verfügbar sind.
 * Berücksichtigt:
 *  - Gesamtmenge: accessories.available_qty (wird durch syncAccessoryQty
 *    automatisch aus COUNT(units WHERE status IN ('available','rented'))
 *    gepflegt — also schon ohne damaged/lost/maintenance/retired).
 *  - Bereits gebuchtes Zubehör qty-aware aus den überlappenden Buchungen,
 *    mit Prioritäts-Reihenfolge:
 *      1. accessory_unit_ids (UUID[]) — Phase-2B+ Buchungen, exakte Units
 *      2. accessory_items (JSONB qty-aware) — Legacy mit Mengensupport
 *      3. accessories (TEXT[]) — uralte Legacy, je 1 Stück
 *  - Puffer-Tage je Lieferart auf eigenen UND fremden Buchungen.
 *  - Produkt-Kompatibilität (compatible_product_ids).
 *
 * Returns: { accessories: [{ id, available_qty_remaining, ... }], buffer }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const productId = searchParams.get('product_id');
  const deliveryMode = searchParams.get('delivery_mode') ?? 'versand';

  if (!from || !to) {
    return NextResponse.json({ error: 'from und to Parameter erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. Puffer-Tage laden
  const { data: bufferSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'booking_buffer_days')
    .maybeSingle();

  const buffer: BufferDays = bufferSetting?.value
    ? (typeof bufferSetting.value === 'string' ? JSON.parse(bufferSetting.value) : bufferSetting.value)
    : DEFAULT_BUFFER;

  // 2. Effektiven Zeitraum mit Puffer berechnen
  const beforeDays = deliveryMode === 'abholung' ? buffer.abholung_before : buffer.versand_before;
  const afterDays = deliveryMode === 'abholung' ? buffer.abholung_after : buffer.versand_after;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setDate(fromDate.getDate() - beforeDays);
  toDate.setDate(toDate.getDate() + afterDays);

  const bufferedFrom = fromDate.toISOString().split('T')[0];
  const bufferedTo = toDate.toISOString().split('T')[0];

  // 3. Alle Zubehörteile laden
  const { data: allAccessories } = await supabase
    .from('accessories')
    .select('id, name, available_qty, available, compatible_product_ids')
    .eq('available', true);

  if (!allAccessories) {
    return NextResponse.json({ accessories: [], buffer: { from: bufferedFrom, to: bufferedTo } });
  }

  // 4. Überlappende Buchungen laden — mit allen drei Quellen für Zubehör-Belegung.
  //    Filter ".or" damit Buchungen ohne irgendwelche Zubehör-Spuren ausgeschlossen
  //    sind (Performance — bringt nichts, sie zu laden).
  const { data: bookings } = await supabase
    .from('bookings')
    .select('accessories, accessory_items, accessory_unit_ids, rental_from, rental_to, delivery_mode')
    .in('status', [...RESERVING_BOOKING_STATUSES])
    .or('accessories.neq.{},accessory_items.not.is.null,accessory_unit_ids.neq.{}')
    .returns<ReservingBooking[]>();

  // 5. Unit→Accessory-Mapping vorab laden (1 Bulk-Query statt N pro Buchung)
  const allUnitIds = new Set<string>();
  for (const b of bookings ?? []) {
    if (Array.isArray(b.accessory_unit_ids)) {
      for (const uid of b.accessory_unit_ids) allUnitIds.add(uid);
    }
  }

  const unitToAcc = new Map<string, string>();
  if (allUnitIds.size > 0) {
    const { data: units } = await supabase
      .from('accessory_units')
      .select('id, accessory_id')
      .in('id', [...allUnitIds]);
    for (const u of units ?? []) {
      unitToAcc.set(u.id as string, u.accessory_id as string);
    }
  }

  // 6. Pro Zubehör: wie viele sind im Zeitraum gebucht?
  const bookedCounts = new Map<string, number>();

  for (const booking of bookings ?? []) {
    // Puffer für diese Buchung berechnen
    const bMode = booking.delivery_mode ?? 'versand';
    const bBefore = bMode === 'abholung' ? buffer.abholung_before : buffer.versand_before;
    const bAfter = bMode === 'abholung' ? buffer.abholung_after : buffer.versand_after;

    const bFrom = new Date(booking.rental_from);
    const bTo = new Date(booking.rental_to);
    bFrom.setDate(bFrom.getDate() - bBefore);
    bTo.setDate(bTo.getDate() + bAfter);

    const bookingBufferedFrom = bFrom.toISOString().split('T')[0];
    const bookingBufferedTo = bTo.toISOString().split('T')[0];

    // Überlappung prüfen
    if (!(bufferedFrom <= bookingBufferedTo && bufferedTo >= bookingBufferedFrom)) {
      continue;
    }

    // Prio 1: accessory_unit_ids (Phase-2B+ Buchungen)
    if (Array.isArray(booking.accessory_unit_ids) && booking.accessory_unit_ids.length > 0) {
      for (const uid of booking.accessory_unit_ids) {
        const accId = unitToAcc.get(uid);
        if (!accId) continue; // Unit gelöscht/nicht auflösbar — überspringen
        bookedCounts.set(accId, (bookedCounts.get(accId) ?? 0) + 1);
      }
      continue;
    }

    // Prio 2: accessory_items (qty-aware Legacy)
    if (Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0) {
      for (const item of booking.accessory_items) {
        if (!item?.accessory_id) continue;
        const q = typeof item.qty === 'number' && item.qty > 0 ? Math.floor(item.qty) : 1;
        bookedCounts.set(item.accessory_id, (bookedCounts.get(item.accessory_id) ?? 0) + q);
      }
      continue;
    }

    // Prio 3: accessories[] (uralte Legacy, je 1)
    if (Array.isArray(booking.accessories)) {
      for (const accId of booking.accessories) {
        if (!accId) continue;
        bookedCounts.set(accId, (bookedCounts.get(accId) ?? 0) + 1);
      }
    }
  }

  // 7. Ergebnis zusammenbauen
  const result = allAccessories.map((acc) => {
    const totalQty = acc.available_qty ?? 0;
    const bookedQty = bookedCounts.get(acc.id) ?? 0;
    const remaining = Math.max(0, totalQty - bookedQty);

    // Produkt-Kompatibilität
    const compatIds: string[] = acc.compatible_product_ids ?? [];
    const compatible = compatIds.length === 0 || (productId ? compatIds.includes(productId) : true);

    return {
      id: acc.id,
      name: acc.name,
      total_qty: totalQty,
      booked_qty: bookedQty,
      available_qty_remaining: remaining,
      is_available: remaining > 0 && compatible,
      compatible,
    };
  });

  return NextResponse.json({
    accessories: result,
    buffer: { from: bufferedFrom, to: bufferedTo, beforeDays, afterDays },
  });
}

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

/**
 * GET /api/accessory-availability?from=2026-04-10&to=2026-04-15&product_id=1&delivery_mode=versand
 *
 * Berechnet welche Zubehörteile und Sets für den Zeitraum verfügbar sind.
 * Berücksichtigt:
 * - Gesamtmenge (available_qty) des Zubehörs
 * - Bereits gebuchtes Zubehör in überlappenden Buchungen (inkl. Puffer-Tage)
 * - Produkt-Kompatibilität (compatible_product_ids)
 *
 * Returns: { accessories: [{ id, available_qty_remaining, compatible }], buffer }
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

  // 4. Überlappende Buchungen laden (die Zubehör enthalten)
  // Puffer auch auf bestehende Buchungen anwenden
  const { data: bookings } = await supabase
    .from('bookings')
    .select('accessories, rental_from, rental_to, delivery_mode')
    .in('status', [...RESERVING_BOOKING_STATUSES])
    .not('accessories', 'eq', '{}');

  // 5. Pro Zubehör: wie viele sind im Zeitraum gebucht?
  const bookedCounts = new Map<string, number>();

  if (bookings) {
    for (const booking of bookings) {
      if (!booking.accessories || booking.accessories.length === 0) continue;

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

      // Überlappung prüfen: bufferedFrom..bufferedTo vs bookingBufferedFrom..bookingBufferedTo
      if (bufferedFrom <= bookingBufferedTo && bufferedTo >= bookingBufferedFrom) {
        for (const accId of booking.accessories) {
          bookedCounts.set(accId, (bookedCounts.get(accId) ?? 0) + 1);
        }
      }
    }
  }

  // 6. Ergebnis zusammenbauen
  const result = allAccessories.map((acc) => {
    const totalQty = acc.available_qty ?? 0;
    const bookedQty = bookedCounts.get(acc.id) ?? 0;
    const remaining = Math.max(0, totalQty - bookedQty);

    // Produkt-Kompatibilitaet
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

import { createServiceClient } from '@/lib/supabase';

/**
 * Findet eine freie product_unit für einen Buchungszeitraum.
 *
 * Query: Finde eine product_unit deren id NICHT in einer aktiven Buchung ist,
 * die den Zeitraum überlappt.
 *
 * @param isTest Optional: Wenn gesetzt, werden nur Buchungen mit gleichem
 *   is_test-Wert als blockierend betrachtet (Test-/Live-Isolation).
 *   Default: false (= Live-Buchungen sehen nur Live-Buchungen).
 * @returns Die unit_id oder null falls keine frei
 */
export async function findFreeUnit(
  productId: string,
  rentalFrom: string,
  rentalTo: string,
  isTest: boolean = false,
): Promise<string | null> {
  const supabase = createServiceClient();

  // 1. Alle verfügbaren Units für das Produkt laden
  const { data: units, error: unitsErr } = await supabase
    .from('product_units')
    .select('id')
    .eq('product_id', productId)
    .in('status', ['available', 'rented']);

  if (unitsErr || !units || units.length === 0) return null;

  // 2. Alle ueberlappenden aktiven Buchungen laden (gleicher is_test-Wert).
  //    KEIN product_id-Filter: eine Kamera-Unit dieses Produkts kann auch
  //    in einer Buchung stecken, deren bookings.product_id (= erste Kamera)
  //    ein anderes Modell ist (gemischte Modelle leben in cameras[]).
  //    Belegt = Legacy bookings.unit_id ODER irgendein cameras[].unit_id.
  let bookingQuery = supabase
    .from('bookings')
    .select('unit_id, cameras')
    .in('status', ['confirmed', 'preparing_shipment', 'awaiting_pickup', 'shipped', 'delivered', 'picked_up', 'active'])
    .lte('rental_from', rentalTo)
    .gte('rental_to', rentalFrom);
  bookingQuery = isTest
    ? bookingQuery.eq('is_test', true)
    : bookingQuery.not('is_test', 'is', true);
  const { data: bookings } = await bookingQuery;

  const occupiedUnitIds = new Set<string>();
  for (const b of bookings ?? []) {
    if (b.unit_id) occupiedUnitIds.add(b.unit_id as string);
    const cams = b.cameras;
    if (Array.isArray(cams)) {
      for (const c of cams) {
        const uid = c && typeof c === 'object' ? (c as { unit_id?: unknown }).unit_id : null;
        if (typeof uid === 'string' && uid) occupiedUnitIds.add(uid);
      }
    }
  }

  // 3. Erste freie Unit finden
  const freeUnit = units.find((u) => !occupiedUnitIds.has(u.id));
  return freeUnit?.id ?? null;
}

/**
 * Weist einer Buchung atomar eine freie Unit zu.
 *
 * Nutzt die Postgres-Funktion `assign_free_unit` mit `pg_advisory_xact_lock`
 * (siehe supabase-unit-assignment-lock.sql). Das serialisiert parallele
 * Zuweisungen pro Produkt und verhindert Doppelvergaben.
 *
 * @returns Die zugewiesene unit_id oder null falls keine frei
 */
export async function assignUnitToBooking(
  bookingId: string,
  productId: string,
  rentalFrom: string,
  rentalTo: string,
): Promise<string | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('assign_free_unit', {
    p_product_id: productId,
    p_rental_from: rentalFrom,
    p_rental_to: rentalTo,
    p_booking_id: bookingId,
  });

  if (error) {
    // RPC muss verfügbar sein — sonst droht Race-Condition beim Fallback.
    // Migration `supabase-unit-assignment-lock.sql` läuft beim Setup.
    console.error('[unit-assignment] assign_free_unit RPC fehlgeschlagen:', error);
    throw new Error(`Unit-Zuweisung fehlgeschlagen: ${error.message}`);
  }

  return (data as string | null) ?? null;
}

import { createServiceClient } from '@/lib/supabase';

/**
 * Findet eine freie product_unit für einen Buchungszeitraum.
 *
 * Query: Finde eine product_unit deren id NICHT in einer aktiven Buchung ist,
 * die den Zeitraum überlappt.
 *
 * @returns Die unit_id oder null falls keine frei
 */
export async function findFreeUnit(
  productId: string,
  rentalFrom: string,
  rentalTo: string,
): Promise<string | null> {
  const supabase = createServiceClient();

  // 1. Alle verfügbaren Units für das Produkt laden
  const { data: units, error: unitsErr } = await supabase
    .from('product_units')
    .select('id')
    .eq('product_id', productId)
    .in('status', ['available', 'rented']);

  if (unitsErr || !units || units.length === 0) return null;

  // 2. Alle Buchungen im Zeitraum laden (die eine Unit zugeordnet haben)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('unit_id')
    .eq('product_id', productId)
    .in('status', ['confirmed', 'shipped', 'active'])
    .not('unit_id', 'is', null)
    .lte('rental_from', rentalTo)
    .gte('rental_to', rentalFrom);

  const occupiedUnitIds = new Set(
    (bookings ?? []).map((b) => b.unit_id).filter(Boolean)
  );

  // 3. Erste freie Unit finden
  const freeUnit = units.find((u) => !occupiedUnitIds.has(u.id));
  return freeUnit?.id ?? null;
}

/**
 * Weist einer Buchung atomar eine freie Unit zu.
 *
 * Nutzt die Postgres-Funktion `assign_free_unit` mit Advisory Lock
 * (siehe supabase-unit-assignment-lock.sql). Das serialisiert parallele
 * Zuweisungen pro Produkt und verhindert Doppelvergaben.
 *
 * Fallback auf die alte (race-anfällige) Logik, falls die RPC-Funktion
 * in der DB noch nicht existiert — damit brechen bestehende Installationen
 * nicht, bis die Migration ausgeführt wird.
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

  if (!error) {
    return (data as string | null) ?? null;
  }

  // Fallback (Migration noch nicht ausgeführt): alte Logik verwenden.
  // WICHTIG: Race-anfällig — nach Migration entfernen.
  console.warn('[unit-assignment] RPC assign_free_unit nicht verfügbar, Fallback aktiv:', error.message);

  const unitId = await findFreeUnit(productId, rentalFrom, rentalTo);
  if (!unitId) return null;

  await supabase.from('bookings').update({ unit_id: unitId }).eq('id', bookingId);
  return unitId;
}

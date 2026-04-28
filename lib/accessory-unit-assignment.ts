import { createServiceClient } from '@/lib/supabase';
import { syncAccessoryQty } from '@/lib/sync-accessory-qty';

/**
 * Wrapper um die Postgres-RPC `assign_free_accessory_units` (siehe
 * erledigte supabase/supabase-accessory-unit-assignment-lock.sql).
 *
 * Die RPC nutzt `pg_advisory_xact_lock` pro accessory_id — verhindert
 * Doppelvergaben bei parallelen Buchungen.
 *
 * Pattern analog `lib/unit-assignment.ts` fuer Kameras.
 */

export interface BookingAccessoryItemLite {
  accessory_id: string;
  qty: number;
}

export interface AssignAccessoryUnitsResult {
  /** accessory_id → assigned unit UUIDs (in Reihenfolge der RPC-Antwort) */
  assigned: Record<string, string[]>;
  /** accessory_ids fuer die nicht genug Exemplare frei waren */
  missing: string[];
}

/**
 * Weist allen Zubehoer-Items einer Buchung freie Exemplare zu.
 *
 * Funktioniert pro accessory_id einzeln (RPC-Aufruf je Zeile). Wenn fuer
 * einen accessory_id nicht genug Units verfuegbar sind, wird er in
 * `missing` zurueckgegeben — der Aufrufer entscheidet, ob die Buchung
 * trotzdem durchlaeuft (heutiger Fallback: ja, weil der Buchungsflow
 * historisch ohne Unit-Zuweisung lief).
 *
 * Wirft NICHT bei einzelnen RPC-Fehlern — loggt und gibt missing zurueck.
 */
export async function assignAccessoryUnitsToBooking(
  bookingId: string,
  accessoryItems: BookingAccessoryItemLite[],
  rentalFrom: string,
  rentalTo: string,
): Promise<AssignAccessoryUnitsResult> {
  const result: AssignAccessoryUnitsResult = { assigned: {}, missing: [] };

  if (!accessoryItems || accessoryItems.length === 0) return result;

  const supabase = createServiceClient();

  for (const item of accessoryItems) {
    if (!item.accessory_id || !item.qty || item.qty <= 0) continue;

    const { data, error } = await supabase.rpc('assign_free_accessory_units', {
      p_accessory_id: item.accessory_id,
      p_qty: item.qty,
      p_rental_from: rentalFrom,
      p_rental_to: rentalTo,
      p_booking_id: bookingId,
    });

    if (error) {
      console.error(
        `[accessory-unit-assignment] RPC failed for ${item.accessory_id}:`,
        error.message,
      );
      result.missing.push(item.accessory_id);
      continue;
    }

    const ids = Array.isArray(data) ? (data as string[]) : [];
    if (ids.length < item.qty) {
      // RPC gibt leeres Array zurueck wenn nicht genug Units frei
      result.missing.push(item.accessory_id);
      continue;
    }

    result.assigned[item.accessory_id] = ids;

    // available_qty resyncen, damit Frontend-Verfuegbarkeit sofort stimmt
    await syncAccessoryQty(supabase, item.accessory_id);
  }

  return result;
}

/**
 * Setzt die Units einer Buchung zurueck auf 'available' — aber nur jene,
 * die nicht in einer ANDEREN aktiven Buchung stecken (durch ueberlappende
 * Folgebuchungen koennten Exemplare bereits weiterreserviert sein).
 *
 * Wird bei Storno + Completion aufgerufen. Idempotent.
 *
 * `bookings.accessory_unit_ids` wird NICHT geleert — die IDs bleiben fuer
 * Audit + Schadensabwicklung dranhaengen. Nur der `accessory_units.status`
 * wird zurueckgesetzt.
 *
 * @param bookingId Buchung deren Units freigegeben werden sollen
 * @param unitIds Optional: bereits geladene Unit-IDs (spart einen Round-Trip)
 */
export async function releaseAccessoryUnitsFromBooking(
  bookingId: string,
  unitIds?: string[] | null,
): Promise<void> {
  const supabase = createServiceClient();

  // Wenn Unit-IDs nicht uebergeben: aus der Buchung laden
  let ids: string[] = unitIds ?? [];
  if (!unitIds) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('accessory_unit_ids')
      .eq('id', bookingId)
      .single();
    ids = (booking?.accessory_unit_ids as string[] | null) ?? [];
  }

  if (!ids || ids.length === 0) return;

  // 1. Pruefen welche Units noch in einer anderen aktiven Buchung sind
  const { data: otherBookings } = await supabase
    .from('bookings')
    .select('accessory_unit_ids')
    .neq('id', bookingId)
    .not('status', 'in', '(cancelled,completed,returned)')
    .overlaps('accessory_unit_ids', ids);

  const stillBlocked = new Set<string>();
  for (const b of otherBookings ?? []) {
    const otherIds = (b.accessory_unit_ids as string[] | null) ?? [];
    for (const uid of otherIds) {
      if (ids.includes(uid)) stillBlocked.add(uid);
    }
  }

  const toRelease = ids.filter((id) => !stillBlocked.has(id));
  if (toRelease.length === 0) return;

  // 2. Status nur zuruecksetzen wenn aktuell 'rented'.
  //    Status 'damaged'/'lost'/'maintenance' bleiben unangetastet — die
  //    spiegeln einen physischen Zustand und muessen vom Admin manuell
  //    geaendert werden.
  await supabase
    .from('accessory_units')
    .update({ status: 'available' })
    .in('id', toRelease)
    .eq('status', 'rented');

  // 3. accessories.available_qty resyncen fuer alle betroffenen Zubehoer-IDs
  const { data: releasedUnits } = await supabase
    .from('accessory_units')
    .select('accessory_id')
    .in('id', toRelease);

  const accIds = new Set((releasedUnits ?? []).map((u) => u.accessory_id as string));
  for (const accId of accIds) {
    await syncAccessoryQty(supabase, accId);
  }
}

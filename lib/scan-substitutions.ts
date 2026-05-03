import type { SupabaseClient } from '@supabase/supabase-js';

export type ScannedUnits = {
  cameraUnitId: string | null;
  accessoryUnitIds: string[];
};

export function parseScannedUnits(input: unknown): ScannedUnits {
  if (!input || typeof input !== 'object') return { cameraUnitId: null, accessoryUnitIds: [] };
  const obj = input as Record<string, unknown>;
  const cameraUnitId = typeof obj.cameraUnitId === 'string' && obj.cameraUnitId.length > 0
    ? obj.cameraUnitId
    : null;
  const accessoryUnitIds = Array.isArray(obj.accessoryUnitIds)
    ? (obj.accessoryUnitIds as unknown[])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  return { cameraUnitId, accessoryUnitIds };
}

/**
 * Wendet die Liste der tatsaechlich gescannten Unit-IDs auf eine Buchung an.
 * Reihenfolge-egal — egal in welcher Sequenz der Packer die Codes gescannt
 * hat, das Endergebnis ist immer dasselbe.
 *
 * Algorithmus fuer Zubehoer:
 *   reserved = booking.accessory_unit_ids
 *   scanned  = scannedAccessoryUnitIds (incl. Substitute)
 *   - kept     = reserved ∩ scanned                 → bleiben drin
 *   - extras   = scanned \ reserved                 → Substitute
 *   - missing  = reserved \ scanned                 → wurde nicht gescannt
 *   Fuer jedes missing wird ein extra derselben accessory_id gesucht und
 *   eingetauscht. Missings ohne extra-Pendant bleiben drin (manuelles Haken).
 *   Extras ohne missing-Pendant werden hinten angehaengt.
 *
 * Kamera analog: wenn cameraUnitId !== booking.unit_id → swap.
 *
 * Idempotent. Best-effort bei Status-Updates (product_units / accessory_units),
 * blockt den Pack-/Check-Submit nicht wenn Status-Updates failen.
 */
export async function applyScannedUnits(
  supabase: SupabaseClient,
  bookingId: string,
  scanned: ScannedUnits,
): Promise<void> {
  const hasCameraInput = scanned.cameraUnitId !== null;
  const hasAccessoryInput = scanned.accessoryUnitIds.length > 0;
  if (!hasCameraInput && !hasAccessoryInput) return;

  const { data: bookingBefore } = await supabase
    .from('bookings')
    .select('unit_id, accessory_unit_ids')
    .eq('id', bookingId)
    .maybeSingle();
  if (!bookingBefore) return;

  // ── 1) Kamera ────────────────────────────────────────────────────────────
  if (hasCameraInput) {
    const oldCameraUnitId = bookingBefore.unit_id as string | null;
    const newCameraUnitId = scanned.cameraUnitId;
    if (oldCameraUnitId !== newCameraUnitId && newCameraUnitId) {
      await supabase.from('bookings').update({ unit_id: newCameraUnitId }).eq('id', bookingId);
      if (oldCameraUnitId) {
        await supabase.from('product_units')
          .update({ status: 'available' })
          .eq('id', oldCameraUnitId)
          .eq('status', 'rented');
      }
      await supabase.from('product_units')
        .update({ status: 'rented' })
        .eq('id', newCameraUnitId)
        .in('status', ['available', 'rented']);
    }
  }

  // ── 2) Zubehoer ──────────────────────────────────────────────────────────
  if (!hasAccessoryInput) return;

  const reserved = ((bookingBefore.accessory_unit_ids as string[] | null) ?? []).slice();
  const scannedSet = new Set(scanned.accessoryUnitIds);
  const reservedSet = new Set(reserved);

  const extras = scanned.accessoryUnitIds.filter((id) => !reservedSet.has(id));

  // Fuer den Match nach accessory_id brauchen wir die Stamm-IDs aller
  // beteiligten Units (reservierte + Substitute). Eine Bulk-Query.
  const allInvolvedIds = [...new Set([...reserved, ...extras])];
  const unitToAccId = new Map<string, string>();
  if (allInvolvedIds.length > 0) {
    const { data: units } = await supabase
      .from('accessory_units')
      .select('id, accessory_id')
      .in('id', allInvolvedIds);
    for (const u of units ?? []) unitToAccId.set(u.id as string, u.accessory_id as string);
  }

  // Reihenfolge-egal: ueber die reservierte Liste laufen, jedem missing einen
  // passenden extra zuordnen. Reserved-Indices die kein scanned-Pendant haben
  // werden in-place ersetzt; Reserved-Indices die gescannt wurden bleiben
  // unveraendert; uebrig bleibende extras werden hinten angehaengt.
  const finalIds = reserved.slice();
  const remainingExtras = extras.slice();
  const swappedOut: string[] = []; // alte Units die durch Substitute ersetzt wurden

  for (let i = 0; i < finalIds.length; i++) {
    const id = finalIds[i];
    if (scannedSet.has(id)) continue; // gescannt → bleibt
    const accId = unitToAccId.get(id);
    if (!accId) continue;
    const extraIdx = remainingExtras.findIndex((eid) => unitToAccId.get(eid) === accId);
    if (extraIdx >= 0) {
      const [extraId] = remainingExtras.splice(extraIdx, 1);
      finalIds[i] = extraId;
      swappedOut.push(id);
    }
    // sonst: missing ohne extra-Pendant bleibt drin (z.B. manuell gehakt)
  }

  // Uebrige extras (mehr Substitute als missings) hinten anhaengen
  for (const extraId of remainingExtras) finalIds.push(extraId);

  // Update nur wenn sich was geaendert hat (vermeidet sinnlose DB-Writes)
  const arraysEqual = finalIds.length === reserved.length
    && finalIds.every((id, i) => id === reserved[i]);
  if (arraysEqual) return;

  await supabase.from('bookings')
    .update({ accessory_unit_ids: finalIds })
    .eq('id', bookingId);

  if (swappedOut.length > 0) {
    await supabase.from('accessory_units')
      .update({ status: 'available' })
      .in('id', swappedOut)
      .eq('status', 'rented');
  }
  const swappedIn = finalIds.filter((id) => !reservedSet.has(id));
  if (swappedIn.length > 0) {
    await supabase.from('accessory_units')
      .update({ status: 'rented' })
      .in('id', swappedIn)
      .in('status', ['available', 'rented']);
  }
}

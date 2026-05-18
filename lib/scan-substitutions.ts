import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBookingCameras } from '@/lib/booking-cameras';

export type ScannedUnits = {
  /** Legacy-Einzelkamera (Back-Compat). cameraUnitIds hat Vorrang. */
  cameraUnitId: string | null;
  /** Multi-Kamera: alle tatsächlich gescannten Kamera-Einheiten. */
  cameraUnitIds: string[];
  accessoryUnitIds: string[];
};

export function parseScannedUnits(input: unknown): ScannedUnits {
  if (!input || typeof input !== 'object') {
    return { cameraUnitId: null, cameraUnitIds: [], accessoryUnitIds: [] };
  }
  const obj = input as Record<string, unknown>;
  const cameraUnitId = typeof obj.cameraUnitId === 'string' && obj.cameraUnitId.length > 0
    ? obj.cameraUnitId
    : null;
  const cameraUnitIdsRaw = Array.isArray(obj.cameraUnitIds)
    ? (obj.cameraUnitIds as unknown[])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const cameraUnitIds = cameraUnitIdsRaw.length > 0
    ? Array.from(new Set(cameraUnitIdsRaw))
    : (cameraUnitId ? [cameraUnitId] : []);
  const accessoryUnitIds = Array.isArray(obj.accessoryUnitIds)
    ? (obj.accessoryUnitIds as unknown[])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  return { cameraUnitId, cameraUnitIds, accessoryUnitIds };
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
  const hasCameraInput = scanned.cameraUnitIds.length > 0;
  const hasAccessoryInput = scanned.accessoryUnitIds.length > 0;
  if (!hasCameraInput && !hasAccessoryInput) return;

  const { data: bookingBefore } = await supabase
    .from('bookings')
    .select('unit_id, product_id, product_name, cameras, accessory_unit_ids')
    .eq('id', bookingId)
    .maybeSingle();
  if (!bookingBefore) return;

  // ── 1) Kameras (Multi-Kamera, Substitution pro Produkt) ──────────────────
  if (hasCameraInput) {
    const cams = resolveBookingCameras(bookingBefore).map((c) => ({ ...c }));
    if (cams.length > 0) {
      const scannedSet = new Set(scanned.cameraUnitIds);
      const reservedUnits = new Set(
        cams.map((c) => c.unit_id).filter((u): u is string => !!u),
      );
      // Substitute/Fills = gescannte Units, die noch keinem Slot zugeordnet sind
      const extras = scanned.cameraUnitIds.filter((u) => !reservedUnits.has(u));

      // product_id der Substitute-Units bestimmen (Match pro Produkt)
      const extraProduct = new Map<string, string | null>();
      if (extras.length > 0) {
        const { data: pus } = await supabase
          .from('product_units')
          .select('id, product_id')
          .in('id', extras);
        for (const u of pus ?? []) {
          extraProduct.set(u.id as string, (u.product_id as string | null) ?? null);
        }
      }

      const remainingExtras = extras.slice();
      const swappedOut: string[] = [];
      for (let i = 0; i < cams.length; i++) {
        const slot = cams[i];
        if (slot.unit_id && scannedSet.has(slot.unit_id)) continue; // gescannt → bleibt
        // Slot ist "missing" (nicht gescannt) ODER leer (kein Unit) → Substitut
        // desselben Produkts suchen.
        const idx = remainingExtras.findIndex(
          (eid) => (extraProduct.get(eid) ?? null) === (slot.product_id ?? null),
        );
        if (idx >= 0) {
          const [eid] = remainingExtras.splice(idx, 1);
          if (slot.unit_id) swappedOut.push(slot.unit_id);
          cams[i] = { ...slot, unit_id: eid };
        }
      }

      const oldCams = resolveBookingCameras(bookingBefore);
      const changed =
        cams.length !== oldCams.length ||
        cams.some((c, i) => c.unit_id !== oldCams[i]?.unit_id);
      if (changed) {
        const firstUnit = cams.find((c) => c.unit_id)?.unit_id ?? null;
        await supabase
          .from('bookings')
          .update({ cameras: cams, unit_id: firstUnit })
          .eq('id', bookingId);
        if (swappedOut.length > 0) {
          await supabase.from('product_units')
            .update({ status: 'available' })
            .in('id', swappedOut)
            .eq('status', 'rented');
        }
        const swappedIn = cams
          .map((c) => c.unit_id)
          .filter((u): u is string => !!u && !reservedUnits.has(u));
        if (swappedIn.length > 0) {
          await supabase.from('product_units')
            .update({ status: 'rented' })
            .in('id', swappedIn)
            .in('status', ['available', 'rented']);
        }
      }
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

/**
 * Spiegelt Inventar-Einheiten in die alten Tabellen `product_units` /
 * `accessory_units`, damit der Buchungs-Auto-Zuweiser (RPC
 * `assign_free_unit` / `assign_free_accessory_units`) Daten findet und
 * `bookings.unit_id` / `bookings.accessory_unit_ids` weiter ihre FK-Constraints
 * erfuellen koennen.
 *
 * Architektur-Notiz: bookings.unit_id ist FK auf product_units. Ohne diesen
 * Mirror koennten Inventar-Stuecke nicht in Buchungen referenziert werden,
 * waehrend die alten Tabellen exklusiv fuer den Buchungs-Pfad zustaendig
 * waren — mit dem Mirror kann das Inventar als Single Source of Truth fuer
 * den Admin dienen, waehrend die Buchungs-Logik weiter unverandert laeuft.
 *
 * Idempotent: Wenn ein migration_audit-Eintrag bereits existiert, wird die
 * alte Tabelle nur synchronisiert (Status, label).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const STATUS_INVENTAR_TO_PRODUCT_UNITS: Record<string, 'available' | 'rented' | 'maintenance' | 'retired'> = {
  verfuegbar: 'available',
  vermietet: 'rented',
  wartung: 'maintenance',
  defekt: 'maintenance',
  ausgemustert: 'retired',
};

const STATUS_INVENTAR_TO_ACCESSORY_UNITS: Record<string, 'available' | 'rented' | 'maintenance' | 'damaged' | 'lost' | 'retired'> = {
  verfuegbar: 'available',
  vermietet: 'rented',
  wartung: 'maintenance',
  defekt: 'damaged',
  ausgemustert: 'retired',
};

interface InventarUnitRow {
  id: string;
  produkt_id: string | null;
  typ: 'kamera' | 'zubehoer' | 'verbrauch';
  tracking_mode: 'individual' | 'bulk';
  bezeichnung: string;
  inventar_code: string | null;
  seriennummer: string | null;
  status: string;
  notes: string | null;
  kaufdatum: string | null;
}

/**
 * Liefert die alte Legacy-ID (admin_config.products.id bzw. accessories.id)
 * zur produkte.id, oder null wenn keine Brueckenzeile vorliegt.
 */
async function reverseLookupLegacyProductId(
  supabase: SupabaseClient,
  produkteId: string,
  alteTabelle: 'admin_config.products' | 'accessories',
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('alte_id')
      .eq('alte_tabelle', alteTabelle)
      .eq('neue_tabelle', 'produkte')
      .eq('neue_id', produkteId)
      .maybeSingle();
    return (data as { alte_id?: string } | null)?.alte_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Sucht den existierenden Mirror-Eintrag fuer die Inventar-Unit. Liefert die
 * Legacy-ID (product_units.id bzw. accessory_units.id) oder null.
 */
async function findExistingMirror(
  supabase: SupabaseClient,
  inventarUnitId: string,
  alteTabelle: 'product_units' | 'accessory_units',
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('alte_id')
      .eq('alte_tabelle', alteTabelle)
      .eq('neue_tabelle', 'inventar_units')
      .eq('neue_id', inventarUnitId)
      .maybeSingle();
    return (data as { alte_id?: string } | null)?.alte_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Spiegelt eine Inventar-Einheit (typ='kamera', tracking_mode='individual')
 * in die alte product_units-Tabelle. Wenn bereits gespiegelt, werden nur
 * Status + Label synchronisiert. Liefert die product_units.id oder null.
 *
 * Voraussetzungen:
 *  - typ === 'kamera'
 *  - tracking_mode === 'individual'
 *  - produkt_id gesetzt
 *  - migration_audit-Eintrag (admin_config.products → produkte) existiert,
 *    sodass wir die alte product_id rekonstruieren koennen.
 */
export async function mirrorCameraToLegacy(
  supabase: SupabaseClient,
  unit: InventarUnitRow,
): Promise<string | null> {
  if (unit.typ !== 'kamera') return null;
  if (unit.tracking_mode !== 'individual') return null;
  if (!unit.produkt_id) return null;

  const existing = await findExistingMirror(supabase, unit.id, 'product_units');
  const legacyProductId = await reverseLookupLegacyProductId(supabase, unit.produkt_id, 'admin_config.products');
  if (!legacyProductId) {
    // Ohne legacy product_id koennen wir den FK product_units.product_id nicht
    // bedienen — Mirror nicht moeglich. UI-Workaround: User soll erst die
    // Kamera-Stammdaten via /admin/preise/kameras/neu anlegen.
    return null;
  }

  const newStatus = STATUS_INVENTAR_TO_PRODUCT_UNITS[unit.status] ?? 'available';
  const serial = unit.seriennummer ?? unit.inventar_code ?? unit.bezeichnung;
  const label = unit.bezeichnung;

  if (existing) {
    // Synchronisieren — Status, label, notes, purchased_at koennen sich
    // geaendert haben. serial_number ist immutable im Original-Schema.
    await supabase.from('product_units').update({
      label,
      status: newStatus,
      notes: unit.notes,
      purchased_at: unit.kaufdatum,
    }).eq('id', existing);
    return existing;
  }

  // Neu anlegen
  const { data: inserted, error } = await supabase
    .from('product_units')
    .insert({
      product_id: legacyProductId,
      serial_number: serial,
      label,
      status: newStatus,
      notes: unit.notes,
      purchased_at: unit.kaufdatum,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('[inventar-mirror] product_units insert fehlgeschlagen:', error?.message);
    return null;
  }
  const newId = (inserted as { id: string }).id;

  await supabase.from('migration_audit').insert({
    alte_tabelle: 'product_units',
    alte_id: newId,
    neue_tabelle: 'inventar_units',
    neue_id: unit.id,
    notizen: 'auto-mirror (inventar→legacy)',
  }).then(({ error: auditErr }) => {
    if (auditErr) console.error('[inventar-mirror] audit insert fehlgeschlagen:', auditErr.message);
  });

  return newId;
}

/**
 * Spiegelt eine Inventar-Einheit (typ='zubehoer'/'verbrauch',
 * tracking_mode='individual') in die alte accessory_units-Tabelle.
 */
export async function mirrorAccessoryToLegacy(
  supabase: SupabaseClient,
  unit: InventarUnitRow,
): Promise<string | null> {
  if (unit.typ === 'kamera') return null;
  if (unit.tracking_mode !== 'individual') return null;
  if (!unit.produkt_id) return null;

  const existing = await findExistingMirror(supabase, unit.id, 'accessory_units');
  const legacyAccessoryId = await reverseLookupLegacyProductId(supabase, unit.produkt_id, 'accessories');
  if (!legacyAccessoryId) return null;

  const newStatus = STATUS_INVENTAR_TO_ACCESSORY_UNITS[unit.status] ?? 'available';
  const exemplarCode = unit.inventar_code ?? unit.seriennummer ?? unit.bezeichnung;

  if (existing) {
    await supabase.from('accessory_units').update({
      status: newStatus,
      notes: unit.notes,
      purchased_at: unit.kaufdatum,
    }).eq('id', existing);
    return existing;
  }

  const { data: inserted, error } = await supabase
    .from('accessory_units')
    .insert({
      accessory_id: legacyAccessoryId,
      exemplar_code: exemplarCode,
      status: newStatus,
      notes: unit.notes,
      purchased_at: unit.kaufdatum,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('[inventar-mirror] accessory_units insert fehlgeschlagen:', error?.message);
    return null;
  }
  const newId = (inserted as { id: string }).id;

  await supabase.from('migration_audit').insert({
    alte_tabelle: 'accessory_units',
    alte_id: newId,
    neue_tabelle: 'inventar_units',
    neue_id: unit.id,
    notizen: 'auto-mirror (inventar→legacy)',
  }).then(({ error: auditErr }) => {
    if (auditErr) console.error('[inventar-mirror] audit insert fehlgeschlagen:', auditErr.message);
  });

  return newId;
}

/**
 * Wrapper, der die richtige Mirror-Funktion abhaengig vom typ aufruft.
 */
export async function mirrorInventarToLegacy(
  supabase: SupabaseClient,
  unit: InventarUnitRow,
): Promise<string | null> {
  if (unit.typ === 'kamera') return mirrorCameraToLegacy(supabase, unit);
  return mirrorAccessoryToLegacy(supabase, unit);
}

/**
 * Loescht den gespiegelten Eintrag (best-effort) — wird beim DELETE der
 * Inventar-Einheit aufgerufen.
 */
export async function deleteMirror(
  supabase: SupabaseClient,
  inventarUnitId: string,
): Promise<void> {
  for (const alteTabelle of ['product_units', 'accessory_units'] as const) {
    const legacyId = await findExistingMirror(supabase, inventarUnitId, alteTabelle);
    if (!legacyId) continue;
    await supabase.from(alteTabelle).delete().eq('id', legacyId);
    await supabase.from('migration_audit')
      .delete()
      .eq('alte_tabelle', alteTabelle)
      .eq('alte_id', legacyId)
      .eq('neue_tabelle', 'inventar_units')
      .eq('neue_id', inventarUnitId);
  }
}

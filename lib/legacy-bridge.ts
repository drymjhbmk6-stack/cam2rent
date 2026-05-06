/**
 * Bruecke zwischen alter Welt (admin_config.products / accessories) und neuer
 * Welt (produkte / inventar_units). Wird vom legacy-bridge-Endpoint und allen
 * Read-Pfaden genutzt, die Bestand/Seriennummern auf Basis einer Legacy-ID
 * brauchen.
 *
 * Lazy-Backfill: Wenn fuer eine Legacy-ID noch keine produkte-Row +
 * migration_audit-Eintrag existiert, wird beides automatisch erstellt — sonst
 * waere der Bestand fuer alle nach der Migration neu angelegten Kameras /
 * Zubehoere immer null.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type LegacySource = 'admin_config.products' | 'accessories';

export interface ProduktData {
  name: string;
  marke: string | null;
  modell: string | null;
  default_wbw: number | null;
  bild_url: string | null;
}

/**
 * Liest aus `admin_config.products[legacyId]` und liefert ein `ProduktData`.
 * Liefert null, wenn die Legacy-Row nicht existiert.
 */
async function loadCameraStammdaten(
  supabase: SupabaseClient,
  legacyId: string,
): Promise<ProduktData | null> {
  const { data } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', 'products')
    .maybeSingle();
  const products = (data?.value ?? {}) as Record<
    string,
    { name?: string; brand?: string; model?: string; deposit?: number; image?: string; images?: string[] }
  >;
  const p = products[legacyId];
  if (!p) return null;
  return {
    name: p.name ?? legacyId,
    marke: p.brand ?? null,
    modell: p.model ?? null,
    default_wbw: typeof p.deposit === 'number' ? p.deposit : null,
    bild_url: p.image ?? p.images?.[0] ?? null,
  };
}

/**
 * Liest die accessories-Row und liefert ein `ProduktData`.
 */
async function loadAccessoryStammdaten(
  supabase: SupabaseClient,
  legacyId: string,
): Promise<ProduktData | null> {
  const { data } = await supabase
    .from('accessories')
    .select('id, name, category, replacement_value, image_url')
    .eq('id', legacyId)
    .maybeSingle();
  if (!data) return null;
  const acc = data as { name: string; category: string | null; replacement_value: number | null; image_url: string | null };
  return {
    name: acc.name,
    marke: null,
    modell: acc.category ?? null,
    default_wbw: acc.replacement_value ?? null,
    bild_url: acc.image_url ?? null,
  };
}

/**
 * Sucht in `migration_audit` nach der zugehoerigen produkte.id. Liefert null,
 * wenn kein Eintrag existiert oder die Tabelle fehlt.
 */
export async function lookupProdukteId(
  supabase: SupabaseClient,
  source: LegacySource,
  legacyId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('neue_id')
      .eq('alte_tabelle', source)
      .eq('alte_id', legacyId)
      .eq('neue_tabelle', 'produkte')
      .maybeSingle();
    return (data as { neue_id?: string } | null)?.neue_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Erstellt eine produkte-Row + migration_audit-Eintrag fuer die Legacy-ID.
 * Liefert die neue produkte.id. Wirft, wenn die Stammdaten in der Quelle
 * nicht existieren.
 */
export async function backfillProdukte(
  supabase: SupabaseClient,
  source: LegacySource,
  legacyId: string,
): Promise<string | null> {
  // Race-Schutz: vor dem Insert nochmal nachschauen, ob inzwischen ein
  // anderer Request die Row angelegt hat.
  const existing = await lookupProdukteId(supabase, source, legacyId);
  if (existing) return existing;

  const stamm = source === 'admin_config.products'
    ? await loadCameraStammdaten(supabase, legacyId)
    : await loadAccessoryStammdaten(supabase, legacyId);
  if (!stamm) return null;

  const insertRow = {
    name: stamm.name,
    marke: stamm.marke,
    modell: stamm.modell,
    default_wbw: stamm.default_wbw,
    ist_vermietbar: true,
    bild_url: stamm.bild_url,
  };

  let produktId: string | null = null;
  try {
    const { data, error } = await supabase
      .from('produkte')
      .insert(insertRow)
      .select('id')
      .single();
    if (error) {
      console.error('[legacy-bridge] backfill produkte fehlgeschlagen:', error.message);
      return null;
    }
    produktId = (data as { id: string }).id;
  } catch (err) {
    console.error('[legacy-bridge] backfill produkte exception:', err);
    return null;
  }

  // Race-Recovery: wenn parallel ein anderer Request schon backfill gemacht
  // hat, jetzt zwei produkte-Rows existieren. Pruefe migration_audit erneut —
  // wenn dort schon eine andere ID drin steht, behalte die und loesche die
  // unsere.
  try {
    const winner = await lookupProdukteId(supabase, source, legacyId);
    if (winner && winner !== produktId) {
      await supabase.from('produkte').delete().eq('id', produktId);
      return winner;
    }
  } catch {
    // egal — wir versuchen den Audit-Insert
  }

  try {
    await supabase.from('migration_audit').insert({
      alte_tabelle: source,
      alte_id: legacyId,
      neue_tabelle: 'produkte',
      neue_id: produktId,
      notizen: 'lazy backfill',
    });
  } catch (err) {
    console.error('[legacy-bridge] migration_audit insert fehlgeschlagen:', err);
    // produkte-Row existiert, aber kein Audit — bei naechstem Lookup wird
    // erneut versucht, das ist ok.
  }

  return produktId;
}

/**
 * Gibt die produkte.id zur Legacy-ID zurueck. Wenn noch keine existiert und
 * `autoCreate=true`, wird sie automatisch angelegt (Lazy-Backfill).
 */
export async function resolveProdukteId(
  supabase: SupabaseClient,
  source: LegacySource,
  legacyId: string,
  options: { autoCreate?: boolean } = {},
): Promise<string | null> {
  const existing = await lookupProdukteId(supabase, source, legacyId);
  if (existing) return existing;
  if (!options.autoCreate) return null;
  return backfillProdukte(supabase, source, legacyId);
}

/**
 * Bulk-Variante: liefert eine Map legacy_id → produkte.id fuer eine Liste.
 * Vorhandene werden ueber migration_audit gelesen, fehlende werden — wenn
 * `autoCreate=true` — angelegt.
 */
export async function resolveProdukteIdMap(
  supabase: SupabaseClient,
  source: LegacySource,
  legacyIds: string[],
  options: { autoCreate?: boolean } = {},
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (legacyIds.length === 0) return map;

  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('alte_id, neue_id')
      .eq('alte_tabelle', source)
      .eq('neue_tabelle', 'produkte')
      .in('alte_id', legacyIds);
    for (const row of (data ?? []) as Array<{ alte_id: string; neue_id: string }>) {
      map.set(row.alte_id, row.neue_id);
    }
  } catch {
    // migration_audit fehlt
  }

  if (!options.autoCreate) return map;

  for (const legacyId of legacyIds) {
    if (map.has(legacyId)) continue;
    const id = await backfillProdukte(supabase, source, legacyId);
    if (id) map.set(legacyId, id);
  }
  return map;
}

/**
 * Gibt die ProduktUnit-aequivalenten Daten aus inventar_units zurueck — fuer
 * eine bestimmte Produkt-ID (UUID in produkte). Wird von Read-Pfaden genutzt,
 * die frueher product_units gelesen haben.
 *
 * Liefert eine Liste mit Feldnamen, die der alten product_units-Schema
 * nahe kommen, damit Aufrufer minimal angepasst werden muessen.
 */
export interface UnitView {
  id: string;            // inventar_units.id
  serial_number: string; // seriennummer ?? inventar_code
  inventar_code: string;
  label: string;         // bezeichnung
  status: 'available' | 'rented' | 'maintenance' | 'retired' | 'lost';
  notes: string | null;
  purchased_at: string | null;
  tracking_mode: 'individual' | 'bulk';
  bestand: number | null;
  produkt_id: string;
  legacy_unit_id: string | null; // alte product_units.id, falls migriert
}

const STATUS_NEW_TO_OLD: Record<string, UnitView['status']> = {
  verfuegbar: 'available',
  vermietet: 'rented',
  wartung: 'maintenance',
  defekt: 'maintenance',
  ausgemustert: 'retired',
};

interface InventarUnitRow {
  id: string;
  bezeichnung: string;
  inventar_code: string | null;
  seriennummer: string | null;
  status: string;
  notizen: string | null;
  kaufdatum: string | null;
  tracking_mode: string;
  bestand: number | null;
  produkt_id: string | null;
}

export function inventarRowToUnitView(
  row: InventarUnitRow,
  legacyUnitId: string | null = null,
): UnitView {
  return {
    id: row.id,
    serial_number: row.seriennummer ?? row.inventar_code ?? row.bezeichnung,
    inventar_code: row.inventar_code ?? '',
    label: row.bezeichnung,
    status: STATUS_NEW_TO_OLD[row.status] ?? 'available',
    notes: row.notizen,
    purchased_at: row.kaufdatum,
    tracking_mode: (row.tracking_mode as 'individual' | 'bulk') ?? 'individual',
    bestand: row.bestand,
    produkt_id: row.produkt_id ?? '',
    legacy_unit_id: legacyUnitId,
  };
}

/**
 * Lookup: zu welchen `inventar_units.id` gehoeren welche alten
 * `product_units.id` (oder `accessory_units.id`)? Wird gebraucht, damit
 * Buchungen (`bookings.unit_id` = alte ID) mit Inventar-Einheiten verknuepft
 * werden koennen.
 *
 * `direction='legacy_to_neu'`: Map alte_id → neue_id
 * `direction='neu_to_legacy'`: Map neue_id → alte_id
 */
export async function loadUnitIdMapping(
  supabase: SupabaseClient,
  alteTabelle: 'product_units' | 'accessory_units',
  direction: 'legacy_to_neu' | 'neu_to_legacy' = 'neu_to_legacy',
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('alte_id, neue_id')
      .eq('alte_tabelle', alteTabelle)
      .eq('neue_tabelle', 'inventar_units');
    for (const row of (data ?? []) as Array<{ alte_id: string; neue_id: string }>) {
      if (direction === 'legacy_to_neu') map.set(row.alte_id, row.neue_id);
      else map.set(row.neue_id, row.alte_id);
    }
  } catch {
    // migration_audit fehlt → leere Map
  }
  return map;
}

/**
 * Lade alle aktiven Inventar-Einheiten fuer ein Produkt. `excludeRetired=true`
 * schliesst ausgemusterte Stuecke aus (Default).
 */
export async function loadInventarUnitsForProdukt(
  supabase: SupabaseClient,
  produkteId: string,
  options: { excludeRetired?: boolean; trackingMode?: 'individual' | 'bulk' } = {},
): Promise<UnitView[]> {
  let q = supabase
    .from('inventar_units')
    .select('id, bezeichnung, inventar_code, seriennummer, status, notizen, kaufdatum, tracking_mode, bestand, produkt_id')
    .eq('produkt_id', produkteId);
  if (options.excludeRetired ?? true) q = q.neq('status', 'ausgemustert');
  if (options.trackingMode) q = q.eq('tracking_mode', options.trackingMode);
  q = q.order('bezeichnung');

  const { data, error } = await q;
  if (error) {
    console.error('[legacy-bridge] loadInventarUnitsForProdukt:', error.message);
    return [];
  }
  return ((data ?? []) as InventarUnitRow[]).map((row) => inventarRowToUnitView(row));
}

/**
 * Bulk-Variante von loadInventarUnitsForProdukt: laedt fuer mehrere
 * produkt_ids gleichzeitig und liefert eine Map produkt_id → UnitView[].
 *
 * Optional wird `legacy_unit_id` pro UnitView gefuellt — das ist die alte
 * `product_units.id` (oder `accessory_units.id`), unter der existierende
 * Buchungen referenzieren. Wird gebraucht fuer Booking-Overlay.
 */
export async function loadInventarUnitsForProdukteBulk(
  supabase: SupabaseClient,
  produkteIds: string[],
  options: {
    excludeRetired?: boolean;
    trackingMode?: 'individual' | 'bulk';
    typ?: 'kamera' | 'zubehoer' | 'verbrauch';
    /** Legacy-Tabelle aus der die unit_id-Mappings nachgeladen werden sollen. */
    legacyMappingFrom?: 'product_units' | 'accessory_units';
  } = {},
): Promise<Map<string, UnitView[]>> {
  const result = new Map<string, UnitView[]>();
  if (produkteIds.length === 0) return result;

  let q = supabase
    .from('inventar_units')
    .select('id, bezeichnung, inventar_code, seriennummer, status, notizen, kaufdatum, tracking_mode, bestand, produkt_id')
    .in('produkt_id', produkteIds);
  if (options.excludeRetired ?? false) q = q.neq('status', 'ausgemustert');
  if (options.trackingMode) q = q.eq('tracking_mode', options.trackingMode);
  if (options.typ) q = q.eq('typ', options.typ);
  q = q.order('bezeichnung');

  const { data, error } = await q;
  if (error) {
    console.error('[legacy-bridge] loadInventarUnitsForProdukteBulk:', error.message);
    return result;
  }

  // Optional: Legacy-Unit-ID-Mapping fuer Booking-Overlay
  let legacyMap: Map<string, string> | null = null;
  if (options.legacyMappingFrom) {
    legacyMap = await loadUnitIdMapping(supabase, options.legacyMappingFrom, 'neu_to_legacy');
  }

  for (const row of (data ?? []) as InventarUnitRow[]) {
    const view = inventarRowToUnitView(row, legacyMap?.get(row.id) ?? null);
    if (!row.produkt_id) continue;
    if (!result.has(row.produkt_id)) result.set(row.produkt_id, []);
    result.get(row.produkt_id)!.push(view);
  }
  return result;
}

/**
 * Bruecke zwischen alter Welt (accessory_units / accessories / product_units)
 * und neuer Welt (inventar_units / produkte) ueber migration_audit. Liefert
 * den aktuellen Wiederbeschaffungswert (WBW) eines physischen Stuecks oder
 * eines Listings, damit Buchungs-Detail + Mietvertrag konsistente Zahlen
 * zeigen — egal ob die Daten noch in den alten Tabellen oder bereits in
 * inventar_units liegen.
 *
 * Hintergrund: Nach der Buchhaltungs-Konsolidierung leben Werte primaer in
 * inventar_units.wiederbeschaffungswert (Override) bzw. .kaufpreis_netto +
 * .kaufdatum (rechnerisch). Buchungs-/Vertrags-Code liest aber historisch
 * aus `assets` und `accessories.replacement_value` — ohne diesen Bridge
 * zeigt der Vertrag dann 0 EUR, obwohl das Inventar reale Werte hat.
 *
 * migration_audit-Mapping:
 *   - alte_tabelle='accessory_units', alte_id=<uuid>, neue_tabelle='inventar_units'
 *   - alte_tabelle='product_units',  alte_id=<uuid>, neue_tabelle='inventar_units'
 *   - alte_tabelle='accessories',    alte_id=<text>, neue_tabelle='produkte'
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { computeReplacementValue, loadReplacementValueConfig, type ReplacementValueConfig } from '@/lib/replacement-value';

type InventarUnitRow = {
  id: string;
  produkt_id: string | null;
  wbw_manuell_gesetzt: boolean | null;
  wiederbeschaffungswert: number | string | null;
  kaufpreis_netto: number | string | null;
  kaufdatum: string | null;
  status: string | null;
};

/**
 * Wandelt eine inventar_units-Row in einen Asset-aehnlichen Input und
 * berechnet darueber den WBW. Liefert 0 wenn weder Override noch Kaufpreis
 * vorhanden.
 */
function computeUnitWbw(unit: InventarUnitRow, config: ReplacementValueConfig): number {
  const isManual = unit.wbw_manuell_gesetzt === true;
  const manualValue = unit.wiederbeschaffungswert != null ? Number(unit.wiederbeschaffungswert) : null;
  if (isManual && manualValue != null && Number.isFinite(manualValue) && manualValue >= 0) {
    return Math.round(manualValue * 100) / 100;
  }
  if (unit.kaufpreis_netto == null) return 0;
  // computeReplacementValue verlangt ein purchase_date — wenn keins gesetzt
  // ist, nehmen wir konservativ den heutigen Tag (=> voller Kaufpreis).
  const purchaseDate = unit.kaufdatum ?? new Date().toISOString().slice(0, 10);
  return computeReplacementValue(
    {
      purchase_price: unit.kaufpreis_netto,
      purchase_date: purchaseDate,
      replacement_value_estimate: isManual ? unit.wiederbeschaffungswert : null,
    },
    config,
  );
}

/**
 * Loest eine Liste alter Unit-IDs (z.B. accessory_units.id ODER product_units.id)
 * direkt in WBW-Werte auf. Map: alte_id -> WBW (Euro).
 *
 * Verwendet: bookings.accessory_unit_ids oder bookings.unit_id.
 */
export async function getInventarWbwByLegacyUnitIds(
  supabase: SupabaseClient,
  alteIds: string[],
  alteTabelle: 'accessory_units' | 'product_units',
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (alteIds.length === 0) return out;

  let auditRows: Array<{ alte_id: string; neue_id: string }> = [];
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('alte_id, neue_id')
      .eq('alte_tabelle', alteTabelle)
      .eq('neue_tabelle', 'inventar_units')
      .in('alte_id', alteIds);
    auditRows = (data ?? []) as Array<{ alte_id: string; neue_id: string }>;
  } catch {
    return out;
  }
  if (auditRows.length === 0) return out;

  const inventarIds = auditRows.map((a) => a.neue_id);
  let units: InventarUnitRow[] = [];
  try {
    const { data } = await supabase
      .from('inventar_units')
      .select('id, produkt_id, wbw_manuell_gesetzt, wiederbeschaffungswert, kaufpreis_netto, kaufdatum, status')
      .in('id', inventarIds);
    units = (data ?? []) as InventarUnitRow[];
  } catch {
    return out;
  }

  const config = await loadReplacementValueConfig(supabase);
  const unitMap = new Map<string, InventarUnitRow>();
  for (const u of units) unitMap.set(u.id, u);

  for (const a of auditRows) {
    const unit = unitMap.get(a.neue_id);
    if (!unit) continue;
    const wbw = computeUnitWbw(unit, config);
    if (wbw > 0) out.set(a.alte_id, wbw);
  }
  return out;
}

/**
 * Loest eine Liste alter accessories.id (legacy text) ueber produkte.id auf
 * und liefert pro accessory_id den durchschnittlichen WBW aller inventar_units,
 * die zu dem produkt gehoeren (Status verfuegbar/vermietet/wartung).
 *
 * Liefert 0 fuer accessory_ids ohne passende inventar_units oder ohne
 * berechenbaren WBW (z.B. Pfad-B-Stuecke ohne Kaufpreis).
 */
export async function getInventarWbwAverageByLegacyAccessoryIds(
  supabase: SupabaseClient,
  accessoryIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (accessoryIds.length === 0) return out;

  let auditRows: Array<{ alte_id: string; neue_id: string }> = [];
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('alte_id, neue_id')
      .eq('alte_tabelle', 'accessories')
      .eq('neue_tabelle', 'produkte')
      .in('alte_id', accessoryIds);
    auditRows = (data ?? []) as Array<{ alte_id: string; neue_id: string }>;
  } catch {
    return out;
  }
  if (auditRows.length === 0) return out;

  const accToProdukt = new Map<string, string>();
  const produktIds: string[] = [];
  for (const a of auditRows) {
    accToProdukt.set(a.alte_id, a.neue_id);
    produktIds.push(a.neue_id);
  }

  let units: InventarUnitRow[] = [];
  try {
    const { data } = await supabase
      .from('inventar_units')
      .select('id, produkt_id, wbw_manuell_gesetzt, wiederbeschaffungswert, kaufpreis_netto, kaufdatum, status')
      .in('produkt_id', produktIds)
      .in('status', ['verfuegbar', 'vermietet', 'wartung']);
    units = (data ?? []) as InventarUnitRow[];
  } catch {
    return out;
  }
  if (units.length === 0) return out;

  const config = await loadReplacementValueConfig(supabase);
  const valuesByProdukt = new Map<string, number[]>();
  for (const u of units) {
    if (!u.produkt_id) continue;
    const v = computeUnitWbw(u, config);
    if (v <= 0) continue;
    const arr = valuesByProdukt.get(u.produkt_id) ?? [];
    arr.push(v);
    valuesByProdukt.set(u.produkt_id, arr);
  }

  for (const [accId, prodId] of accToProdukt) {
    const arr = valuesByProdukt.get(prodId);
    if (!arr || arr.length === 0) continue;
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    out.set(accId, Math.round(avg * 100) / 100);
  }
  return out;
}

/**
 * Bequemer Kombi-Lookup fuer einen Buchungs-Schadensfall: gibt fuer jeden
 * accessory_id den besten verfuegbaren WBW-Wert zurueck. Priorisierung:
 *   1) Falls accessory_unit_ids passend → direkter Asset-Wert pro Unit
 *   2) Sonst → Durchschnitt aller produkte/inventar_units zum accessory_id
 */
export async function getInventarWbwForBookingAccessories(
  supabase: SupabaseClient,
  opts: { accessoryIds: string[]; accessoryUnitIds?: string[] },
): Promise<{ perAccessoryId: Map<string, number>; perUnitId: Map<string, number> }> {
  const perUnitId = opts.accessoryUnitIds && opts.accessoryUnitIds.length > 0
    ? await getInventarWbwByLegacyUnitIds(supabase, opts.accessoryUnitIds, 'accessory_units')
    : new Map<string, number>();
  const perAccessoryId = await getInventarWbwAverageByLegacyAccessoryIds(supabase, opts.accessoryIds);
  return { perAccessoryId, perUnitId };
}

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Recovery-Helper, wenn `accessories.available_qty` durch einen
 * fehlerhaften Resync-Lauf zu niedrig gesetzt wurde (typischer Fall:
 * `accessory_units`-Mirror ist leer, aber das Inventar lebt in der neuen
 * Welt `inventar_units` weiter).
 *
 * Hintergrund: `syncAccessoryQty()` zaehlt nur `accessory_units`. Wenn
 * vor einem manuellen "Bestaende pruefen" der Mirror-Backfill nicht lief
 * oder eine Daten-Inkonsistenz vorlag, fiel `available_qty` auf 0, obwohl
 * in `inventar_units` echte Stuecke existieren. Im Gantt erschien
 * daraufhin alles als "ausgebucht".
 *
 * Strategie: pro Nicht-Bulk-Zubehoer zaehlen wir BEIDE Welten und nehmen
 * das Maximum. Damit ist gewaehrleistet, dass der Bestand nie unter den
 * tatsaechlich vorhandenen Exemplaren liegt.
 *
 *  - `accessory_units` (status IN ['available', 'rented']) → alte Welt
 *  - `inventar_units` (typ IN ['zubehoer','verbrauch'],
 *     tracking_mode='individual', status NICHT 'ausgemustert') → neue Welt
 *
 * Bulk-Accessories (`accessories.is_bulk=true`) werden bewusst NICHT
 * angefasst — dort ist `available_qty` der manuell gepflegte Lagerbestand
 * und hat in keiner der Welten eine zaehlbare Quelle.
 */

export interface AccessoryQtyDriftRow {
  id: string;
  name: string;
  /** Aktueller accessories.available_qty (was im Gantt/Shop sichtbar ist). */
  current_qty: number;
  /** Count aus accessory_units (alte Welt). */
  legacy_unit_count: number;
  /** Count aus inventar_units (neue Welt). */
  inventar_unit_count: number;
  /** Max der beiden Welten — das ist der korrekte Sollwert. */
  recovered_qty: number;
  /** Differenz recovered - current. Positiv = Bestand wird hochgesetzt
   *  (typischer Recovery-Fall). Negativ = Bestand wird gesenkt (Drift in
   *  die andere Richtung, z.B. ausgemusterte Stuecke). */
  diff: number;
  /** Hat das Accessory eine produkte-Bruecke (migration_audit)? Sagt
   *  nicht ob Inventar-Einheiten existieren — dafuer ist
   *  inventar_unit_count das verlaessliche Signal. */
  has_produkte_bridge: boolean;
  /** Hat das Accessory tatsaechlich Inventar in der neuen Welt? */
  has_inventar_units: boolean;
}

/**
 * Ermittelt fuer alle Nicht-Bulk-Accessories den korrekten Sollwert aus
 * BEIDEN Welten. Wirft keine Mutationen — reine Lese-Operation.
 */
export async function computeAccessoryQtyRecovery(
  supabase: SupabaseClient,
): Promise<AccessoryQtyDriftRow[]> {
  const { data: accessories } = await supabase
    .from('accessories')
    .select('id, name, available_qty, is_bulk')
    .eq('is_bulk', false)
    .order('name', { ascending: true });

  const accRows = (accessories ?? []) as Array<{
    id: string;
    name: string;
    available_qty: number | null;
    is_bulk: boolean;
  }>;
  if (accRows.length === 0) return [];

  const accessoryIds = accRows.map((r) => r.id);

  // ── Alte Welt: accessory_units ───────────────────────────────────────
  const { data: legacyUnits } = await supabase
    .from('accessory_units')
    .select('accessory_id, status')
    .in('accessory_id', accessoryIds)
    .in('status', ['available', 'rented']);

  const legacyCountByAcc = new Map<string, number>();
  for (const u of (legacyUnits ?? []) as Array<{ accessory_id: string }>) {
    legacyCountByAcc.set(u.accessory_id, (legacyCountByAcc.get(u.accessory_id) ?? 0) + 1);
  }

  // ── Neue Welt: inventar_units ueber migration_audit-Bruecke ──────────
  // 1) accessory_id → produkte_id auflösen
  const { data: auditRows } = await supabase
    .from('migration_audit')
    .select('alte_id, neue_id')
    .eq('alte_tabelle', 'accessories')
    .eq('neue_tabelle', 'produkte')
    .in('alte_id', accessoryIds);

  const accIdToProdukteId = new Map<string, string>();
  const produkteIds: string[] = [];
  for (const r of (auditRows ?? []) as Array<{ alte_id: string; neue_id: string }>) {
    accIdToProdukteId.set(r.alte_id, r.neue_id);
    produkteIds.push(r.neue_id);
  }

  // 2) Pro produkte_id: Anzahl der aktiven inventar_units (individual
  //    tracking) zaehlen. Bulk-Tracking-Units werden hier ausgeschlossen,
  //    weil sie nicht 1:1 in accessory_units gespiegelt sind.
  const inventarCountByProdukte = new Map<string, number>();
  if (produkteIds.length > 0) {
    const { data: invUnits } = await supabase
      .from('inventar_units')
      .select('produkt_id, status, tracking_mode, typ')
      .in('produkt_id', produkteIds)
      .in('typ', ['zubehoer', 'verbrauch'])
      .eq('tracking_mode', 'individual')
      .neq('status', 'ausgemustert');

    for (const u of (invUnits ?? []) as Array<{ produkt_id: string | null }>) {
      if (!u.produkt_id) continue;
      inventarCountByProdukte.set(
        u.produkt_id,
        (inventarCountByProdukte.get(u.produkt_id) ?? 0) + 1,
      );
    }
  }

  // ── Drift pro Accessory zusammenbauen ────────────────────────────────
  const result: AccessoryQtyDriftRow[] = [];
  for (const acc of accRows) {
    const currentQty = acc.available_qty ?? 0;
    const legacyCount = legacyCountByAcc.get(acc.id) ?? 0;
    const produkteId = accIdToProdukteId.get(acc.id);
    const inventarCount = produkteId ? (inventarCountByProdukte.get(produkteId) ?? 0) : 0;

    const recoveredQty = Math.max(legacyCount, inventarCount);
    const diff = recoveredQty - currentQty;

    if (diff === 0) continue; // alles im Lot

    result.push({
      id: acc.id,
      name: acc.name,
      current_qty: currentQty,
      legacy_unit_count: legacyCount,
      inventar_unit_count: inventarCount,
      recovered_qty: recoveredQty,
      diff,
      has_produkte_bridge: !!produkteId,
      has_inventar_units: inventarCount > 0,
    });
  }
  return result;
}

/**
 * Setzt `accessories.available_qty` auf den Recovery-Wert
 * MAX(accessory_units, inventar_units). Nur fuer die uebergebenen IDs.
 *
 * Liefert ein detailliertes Ergebnis pro Eintrag, damit das UI die
 * tatsaechliche Aenderung anzeigen kann.
 */
export interface RecoveryApplyResult {
  applied: number;
  results: Array<{
    id: string;
    name: string;
    from: number;
    to: number;
  }>;
  errors: Array<{ id: string; error: string }>;
}

export async function applyAccessoryQtyRecovery(
  supabase: SupabaseClient,
  ids: string[],
): Promise<RecoveryApplyResult> {
  const drift = await computeAccessoryQtyRecovery(supabase);
  const wantIds = new Set(ids);
  const targets = drift.filter((d) => wantIds.has(d.id));

  const results: RecoveryApplyResult['results'] = [];
  const errors: RecoveryApplyResult['errors'] = [];
  let applied = 0;

  for (const row of targets) {
    const { error } = await supabase
      .from('accessories')
      .update({ available_qty: row.recovered_qty })
      .eq('id', row.id);
    if (error) {
      errors.push({ id: row.id, error: error.message });
    } else {
      results.push({
        id: row.id,
        name: row.name,
        from: row.current_qty,
        to: row.recovered_qty,
      });
      applied++;
    }
  }

  return { applied, results, errors };
}

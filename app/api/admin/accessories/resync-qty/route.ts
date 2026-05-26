import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { syncAccessoryQty } from '@/lib/sync-accessory-qty';
import { logAudit } from '@/lib/audit';

/**
 * GET  /api/admin/accessories/resync-qty
 *   → Dry-Run-Preview: liefert pro Nicht-Bulk-Zubehoer die Abweichung
 *     zwischen `accessories.available_qty` und MAX(accessory_units,
 *     inventar_units). Macht KEINE Aenderungen.
 *
 * POST /api/admin/accessories/resync-qty
 * Body { ids?: string[] }  (optional — wenn leer/fehlt: alle Drift-Eintraege)
 *   → Wendet syncAccessoryQty fuer die gewaehlten IDs an. Dank Haertung in
 *     `syncAccessoryQty` faellt der Wert nie unter den Stand der neuen
 *     Welt (`inventar_units`).
 *
 * Hintergrund:
 *  - Zwei Welten halten Inventar-Exemplare:
 *      * Alte Welt: `accessory_units` (1 Row pro Einzel-Exemplar) →
 *        Quelle fuer den Buchungspfad + `accessories.available_qty`.
 *      * Neue Welt: `inventar_units` (typ=zubehoer/verbrauch,
 *        tracking_mode='individual') → Admin-Inventar (Single Source of
 *        Truth).
 *  - `accessories.available_qty` ist der im Gantt/Shop sichtbare Bestand.
 *  - Drift entstand frueher, weil dieser Endpoint blind die alte Welt
 *    nachzog (count(accessory_units)) und so bei leerem Mirror auf 0 fiel,
 *    obwohl Inventar-Einheiten in der neuen Welt existierten.
 *  - Jetzt zaehlt der Drift-Check BEIDE Welten. Default-Auswahl haakt nur
 *    Eintraege an, die in BEIDEN Welten konsistent sind — kein
 *    versehentlicher Bestand-Verlust mehr.
 */

interface DriftRow {
  id: string;
  name: string;
  /** Aktueller accessories.available_qty (Anzeige im Gantt/Shop). */
  current_qty: number;
  /** Count aus accessory_units (alte Welt). */
  legacy_unit_count: number;
  /** Count aus inventar_units (neue Welt). */
  inventar_unit_count: number;
  /** Korrekter Sollwert = MAX(legacy, inventar). */
  unit_count: number;
  /** Differenz unit_count - current_qty. */
  diff: number;
  /** Gibt es eine produkte-Bruecke (migration_audit)? */
  has_inventar: boolean;
  /** Default-Auswahl im UI? Nur wenn der Sync bestandstreu ist:
   *  beide Welten zaehlen identisch UND kein Bestandsverlust droht. */
  safe_to_apply: boolean;
}

async function computeDrift(supabase: ReturnType<typeof createServiceClient>): Promise<DriftRow[]> {
  // Alle Nicht-Bulk-Zubehoere
  const { data: accessories } = await supabase
    .from('accessories')
    .select('id, name, available_qty, is_bulk')
    .eq('is_bulk', false)
    .order('name', { ascending: true });

  const rows = (accessories ?? []) as Array<{ id: string; name: string; available_qty: number | null; is_bulk: boolean }>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // ── Alte Welt: accessory_units (status in available|rented) ──────────
  const { data: legacyUnits } = await supabase
    .from('accessory_units')
    .select('accessory_id, status')
    .in('accessory_id', ids)
    .in('status', ['available', 'rented']);
  const legacyCountByAcc = new Map<string, number>();
  for (const u of (legacyUnits ?? []) as Array<{ accessory_id: string }>) {
    legacyCountByAcc.set(u.accessory_id, (legacyCountByAcc.get(u.accessory_id) ?? 0) + 1);
  }

  // ── Neue Welt: inventar_units ueber migration_audit-Bruecke ──────────
  const { data: audit } = await supabase
    .from('migration_audit')
    .select('alte_id, neue_id')
    .eq('alte_tabelle', 'accessories')
    .eq('neue_tabelle', 'produkte')
    .in('alte_id', ids);
  const accIdToProdukteId = new Map<string, string>();
  const produkteIds: string[] = [];
  for (const r of (audit ?? []) as Array<{ alte_id: string; neue_id: string }>) {
    accIdToProdukteId.set(r.alte_id, r.neue_id);
    produkteIds.push(r.neue_id);
  }
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
      inventarCountByProdukte.set(u.produkt_id, (inventarCountByProdukte.get(u.produkt_id) ?? 0) + 1);
    }
  }

  // ── Drift-Zeilen zusammenbauen ──────────────────────────────────────
  const drift: DriftRow[] = [];
  for (const r of rows) {
    const current = r.available_qty ?? 0;
    const legacyCount = legacyCountByAcc.get(r.id) ?? 0;
    const produkteId = accIdToProdukteId.get(r.id);
    const inventarCount = produkteId ? (inventarCountByProdukte.get(produkteId) ?? 0) : 0;

    // Sollwert = Maximum beider Welten — so geht kein Bestand verloren,
    // wenn eine der Welten leer ist (z.B. wenn der accessory_units-Mirror
    // nie befuellt wurde, aber inventar_units echte Stuecke enthaelt).
    const unitCount = Math.max(legacyCount, inventarCount);
    if (current === unitCount) continue; // alles im Lot

    // Sicher per Default anhaken, wenn:
    //  - Beide Welten zaehlen IDENTISCH (klare Drift gegen accessories)
    //    UND der Sync den Bestand nicht NACH UNTEN korrigiert, sondern
    //    den richtigen Wert setzt
    //  ODER
    //  - Inventar-Welt ist leer (inventarCount=0) UND legacyCount > 0
    //    (klassische Mirror-Welt-Drift, sicher)
    //
    // Wenn die Welten auseinanderlaufen (z.B. inventar=3, legacy=0), bleibt
    // die Zeile sichtbar aber NICHT Default-angehakt — der Admin muss
    // entscheiden, ob die alte Welt aufgeholt werden soll (was zwingend
    // einen Mirror-Backfill erfordert, sonst greift der Bestandswert nur
    // bis zum naechsten DB-Trigger).
    const worldsAgree = legacyCount === inventarCount;
    const safeToApply = worldsAgree && unitCount > 0;

    drift.push({
      id: r.id,
      name: r.name,
      current_qty: current,
      legacy_unit_count: legacyCount,
      inventar_unit_count: inventarCount,
      unit_count: unitCount,
      diff: unitCount - current,
      has_inventar: !!produkteId,
      safe_to_apply: safeToApply,
    });
  }
  return drift;
}

export async function GET() {
  const supabase = createServiceClient();
  try {
    const drift = await computeDrift(supabase);
    return NextResponse.json({
      total_drift: drift.length,
      would_decrease: drift.filter((d) => d.diff < 0).length,
      would_increase: drift.filter((d) => d.diff > 0).length,
      rows: drift,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const body = await req.json().catch(() => null) as { ids?: string[] } | null;
  const explicitIds = Array.isArray(body?.ids) ? body!.ids!.filter((x) => typeof x === 'string' && x.length > 0) : null;

  // Wenn keine IDs explizit angefordert: sicherheitshalber nur Drift-Eintraege
  // syncen (keine "alle Zubehoere durchgehen"-Aktion ohne Vorschau).
  let targetIds: string[];
  if (explicitIds && explicitIds.length > 0) {
    targetIds = explicitIds;
  } else {
    const drift = await computeDrift(supabase);
    targetIds = drift.map((d) => d.id);
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ applied: 0, message: 'Keine Drift gefunden.' });
  }

  let applied = 0;
  const errors: Array<{ id: string; error: string }> = [];
  for (const id of targetIds) {
    try {
      await syncAccessoryQty(supabase, id);
      applied++;
    } catch (err) {
      errors.push({ id, error: (err as Error).message });
    }
  }

  await logAudit({
    action: 'accessory.resync_qty',
    entityType: 'accessory',
    entityId: targetIds.length === 1 ? targetIds[0] : 'bulk',
    changes: { ids: targetIds, applied, errors: errors.length },
    request: req,
  });

  return NextResponse.json({ applied, errors });
}

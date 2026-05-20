import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { syncAccessoryQty } from '@/lib/sync-accessory-qty';
import { logAudit } from '@/lib/audit';

/**
 * GET  /api/admin/accessories/resync-qty
 *   → Dry-Run-Preview: liefert pro Nicht-Bulk-Zubehoer die Abweichung
 *     zwischen accessories.available_qty und COUNT(accessory_units).
 *     Macht KEINE Aenderungen.
 *
 * POST /api/admin/accessories/resync-qty
 * Body { ids?: string[] }  (optional — wenn leer/fehlt: alle Nicht-Bulk)
 *   → Wendet syncAccessoryQty fuer die gewaehlten IDs an.
 *
 * Hintergrund: Beim Loeschen einer Inventar-Einheit blieb
 * accessories.available_qty stale (Gantt zeigte z.B. „1 Stueck" obwohl
 * 0 aktiv). Dieser Endpoint zeigt die Drift transparent und laesst den
 * Admin gezielt fixen — kein stilles Bulk-Reset, das Zubehoer ohne
 * Exemplar-Tracking faelschlich auf 0 setzen wuerde.
 */

interface DriftRow {
  id: string;
  name: string;
  current_qty: number;
  unit_count: number;
  diff: number;
  has_inventar: boolean;
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

  // Bulk-Count: accessory_units pro accessory_id mit status in (available, rented)
  const ids = rows.map((r) => r.id);
  const { data: units } = await supabase
    .from('accessory_units')
    .select('accessory_id, status')
    .in('accessory_id', ids)
    .in('status', ['available', 'rented']);
  const unitCountByAcc = new Map<string, number>();
  for (const u of (units ?? []) as Array<{ accessory_id: string }>) {
    unitCountByAcc.set(u.accessory_id, (unitCountByAcc.get(u.accessory_id) ?? 0) + 1);
  }

  // Pro accessory: hat es eine Inventar-Welt-Verknuepfung? (via migration_audit)
  // Hilft dem Admin zu erkennen, ob die Position migriert ist (dann ist Count
  // authoritativ) oder reines Legacy (dann ist 0 evtl. ein Datenverlust).
  const { data: audit } = await supabase
    .from('migration_audit')
    .select('alte_id')
    .eq('alte_tabelle', 'accessories')
    .eq('neue_tabelle', 'produkte')
    .in('alte_id', ids);
  const hasInventarMap = new Set(((audit ?? []) as Array<{ alte_id: string }>).map((a) => a.alte_id));

  const drift: DriftRow[] = [];
  for (const r of rows) {
    const current = r.available_qty ?? 0;
    const unitCount = unitCountByAcc.get(r.id) ?? 0;
    if (current === unitCount) continue;
    drift.push({
      id: r.id,
      name: r.name,
      current_qty: current,
      unit_count: unitCount,
      diff: unitCount - current,
      has_inventar: hasInventarMap.has(r.id),
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

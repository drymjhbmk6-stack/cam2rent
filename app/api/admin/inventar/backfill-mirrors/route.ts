import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { mirrorInventarToLegacy, ensureAccessoryListing } from '@/lib/inventar-mirror';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/inventar/backfill-mirrors
 *
 * Reparatur-Endpoint: Bringt die alten Tabellen wieder in Sync mit dem neuen
 * Inventar.
 *
 * Drei Schritte:
 * 1. Restore accessories aus migration_audit — wenn die alte accessories-
 *    Tabelle nach der Konsolidierung leer ist, aber Produkte (in `produkte`)
 *    via Audit als ehemalige Zubehor-Eintraege markiert sind, werden die
 *    accessories-Listings aus den produkte-Daten wiederhergestellt. Damit
 *    erscheinen sie wieder unter /admin/zubehoer.
 * 2. Mirror-Inventar in alte Welt — pro individual-tracking inventar_unit
 *    wird ein product_units- bzw. accessory_units-Eintrag erstellt (oder
 *    synchronisiert), damit Buchungs-RPCs Daten finden.
 * 3. Auto-Promote — fuer typ=zubehoer/verbrauch wird zusaetzlich eine
 *    accessories-Listing-Row angelegt, falls noch nicht vorhanden.
 *
 * Idempotent. Wird einmal nach der Inventar-Konsolidierung-Migration manuell
 * gestartet (Button auf /admin/inventar) oder bei Bedarf zur Reparatur.
 */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  // ── 1) Restore accessories aus Migration-Audit ────────────────────────────
  // Wenn der User vor der Umstellung Zubehoer hatte und die accessories-
  // Tabelle nach der Migration leergeraeumt wurde, finden wir die
  // ehemaligen Eintraege noch in migration_audit + produkte.
  let accessoriesRestored = 0;
  try {
    const { data: auditRows } = await supabase
      .from('migration_audit')
      .select('alte_id, neue_id')
      .eq('alte_tabelle', 'accessories')
      .eq('neue_tabelle', 'produkte');

    for (const row of (auditRows ?? []) as Array<{ alte_id: string; neue_id: string }>) {
      const { data: hit } = await supabase
        .from('accessories')
        .select('id')
        .eq('id', row.alte_id)
        .maybeSingle();
      if (hit) continue; // schon da

      const restored = await ensureAccessoryListing(
        supabase,
        row.neue_id,
        row.alte_id,
        false, // wir wissen nicht ob verbrauch — Default 'sonstiges' (User kann nachpflegen)
      );
      if (restored) accessoriesRestored++;
    }
  } catch (err) {
    console.error('[backfill-mirrors] accessories restore failed:', err);
  }

  // ── 2+3) Inventar-Einheiten spiegeln ──────────────────────────────────────
  const { data: units, error } = await supabase
    .from('inventar_units')
    .select('id, produkt_id, typ, tracking_mode, bezeichnung, inventar_code, seriennummer, status, notizen, kaufdatum')
    .eq('tracking_mode', 'individual');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let mirrored = 0;
  let skipped = 0;
  for (const unit of units ?? []) {
    const result = await mirrorInventarToLegacy(supabase, unit as Parameters<typeof mirrorInventarToLegacy>[1]);
    if (result) mirrored++;
    else skipped++;
  }

  await logAudit({
    action: 'inventar.backfill_mirrors',
    entityType: 'inventar_unit',
    entityId: 'bulk',
    changes: { mirrored, skipped, accessories_restored: accessoriesRestored, total: (units ?? []).length },
    request: req,
  });

  return NextResponse.json({
    total: (units ?? []).length,
    mirrored,
    skipped,
    accessories_restored: accessoriesRestored,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { mirrorInventarToLegacy } from '@/lib/inventar-mirror';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/inventar/backfill-mirrors
 *
 * Spiegelt alle individual-tracking inventar_units, die noch keinen Eintrag
 * in product_units / accessory_units haben, nachtraeglich. Idempotent —
 * bestehende Mirrors werden nur synchronisiert.
 *
 * Wird einmal nach der Inventar-Konsolidierung-Migration manuell gestartet
 * (Button auf /admin/inventar) oder bei Bedarf zur Reparatur.
 */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  const { data: units, error } = await supabase
    .from('inventar_units')
    .select('id, produkt_id, typ, tracking_mode, bezeichnung, inventar_code, seriennummer, status, notes, kaufdatum')
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
    changes: { mirrored, skipped, total: (units ?? []).length },
    request: req,
  });

  return NextResponse.json({
    total: (units ?? []).length,
    mirrored,
    skipped,
  });
}

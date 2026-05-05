import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/produkte/legacy-bridge?legacy_id=1
 *
 * Bruecke zwischen alter Welt (admin_config.products mit string-ID wie "1")
 * und neuer Welt (produkte-Tabelle mit UUID + inventar_units). Liefert die
 * neue produkte.id und die Anzahl der zugehoerigen inventar_units pro Status.
 *
 * Wird auf der Kamera-Edit-Seite aufgerufen, um den Banner mit aktiver
 * Stueckzahl + Deep-Link ins Inventar zu rendern.
 *
 * Defensiv: Wenn migration_audit oder produkte/inventar_units nicht existieren,
 * wird produkte_id=null und total=0 zurueckgegeben — die UI zeigt dann den
 * Hinweis "Noch keine Einheiten" und keinen Deep-Link.
 */
export async function GET(req: NextRequest) {
  const legacyId = req.nextUrl.searchParams.get('legacy_id');
  if (!legacyId) {
    return NextResponse.json({ error: 'legacy_id fehlt' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. Migration-Audit-Lookup
  let produkteId: string | null = null;
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('neue_id')
      .eq('alte_tabelle', 'admin_config.products')
      .eq('alte_id', legacyId)
      .maybeSingle();
    produkteId = (data as { neue_id?: string } | null)?.neue_id ?? null;
  } catch {
    // migration_audit nicht vorhanden → noch alte Welt, einfach null zurueck
  }

  if (!produkteId) {
    return NextResponse.json({
      produkte_id: null,
      total: 0,
      active: 0,
      retired: 0,
    });
  }

  // 2. inventar_units zaehlen
  let total = 0;
  let active = 0;
  let retired = 0;
  try {
    const { data } = await supabase
      .from('inventar_units')
      .select('status')
      .eq('produkt_id', produkteId);
    for (const row of (data ?? []) as Array<{ status: string }>) {
      total++;
      if (row.status === 'ausgemustert') retired++;
      else active++;
    }
  } catch {
    // inventar_units fehlt → 0 zurueckgeben
  }

  return NextResponse.json({ produkte_id: produkteId, total, active, retired });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/produkte/legacy-bridge?legacy_id=X&source=Y
 *
 * Bruecke zwischen alter Welt und neuer Welt (produkte + inventar_units).
 * Liefert die neue produkte.id und die Anzahl der zugehoerigen
 * inventar_units pro Status.
 *
 * `source` kann sein:
 *  - "admin_config.products" (Default) — fuer Kameras (legacy_id ist string wie "1")
 *  - "accessories"                     — fuer Zubehoer (legacy_id ist accessory.id)
 *
 * Wird auf der Kamera- und Zubehoer-Edit-Seite aufgerufen, um den Banner
 * mit aktiver Stueckzahl + Deep-Link ins Inventar zu rendern.
 *
 * Defensiv: Wenn migration_audit oder produkte/inventar_units nicht existieren,
 * wird produkte_id=null und total=0 zurueckgegeben — die UI zeigt dann den
 * Hinweis "Noch keine Einheiten" und keinen Deep-Link.
 */
const ALLOWED_SOURCES = new Set(['admin_config.products', 'accessories']);

export async function GET(req: NextRequest) {
  const legacyId = req.nextUrl.searchParams.get('legacy_id');
  const source = req.nextUrl.searchParams.get('source') ?? 'admin_config.products';
  if (!legacyId) {
    return NextResponse.json({ error: 'legacy_id fehlt' }, { status: 400 });
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json({ error: 'unbekannter source' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. Migration-Audit-Lookup. Bei Zubehoer existieren bis zu drei
  // Audit-Zeilen pro accessory.id — Stammdaten in `produkte`, optional eine
  // bulk-Zeile in `inventar_units` und mehrere individual-Zeilen ueber
  // `accessory_units`. Wir wollen NUR die `produkte`-Zuordnung.
  let produkteId: string | null = null;
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('neue_id')
      .eq('alte_tabelle', source)
      .eq('alte_id', legacyId)
      .eq('neue_tabelle', 'produkte')
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
      bulk_total: null,
    });
  }

  // 2. inventar_units zaehlen — fuer individual-Tracking pro Zeile, fuer bulk
  // ueber das `bestand`-Feld. `active` zaehlt alle Stuecke die noch im Umlauf
  // sein koennen (also nicht ausgemustert).
  let total = 0;
  let active = 0;
  let retired = 0;
  let bulkTotal: number | null = null;
  try {
    const { data } = await supabase
      .from('inventar_units')
      .select('status, tracking_mode, bestand')
      .eq('produkt_id', produkteId);

    for (const row of (data ?? []) as Array<{ status: string; tracking_mode: string; bestand: number | null }>) {
      if (row.tracking_mode === 'bulk') {
        const n = row.bestand ?? 0;
        bulkTotal = (bulkTotal ?? 0) + n;
        total += n;
        if (row.status === 'ausgemustert') retired += n;
        else active += n;
      } else {
        total++;
        if (row.status === 'ausgemustert') retired++;
        else active++;
      }
    }
  } catch {
    // inventar_units fehlt → 0 zurueckgeben
  }

  return NextResponse.json({ produkte_id: produkteId, total, active, retired, bulk_total: bulkTotal });
}

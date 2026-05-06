import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/produkte → Liste aller Produkt-Stammdaten aus der neuen
 * `produkte`-Tabelle. Wird vom Inventar-Anlege-Formular fuer das
 * Produkt-Dropdown genutzt.
 *
 * Pro Produkt wird zusaetzlich `compatible_camera_names` geliefert — eine
 * Liste von Kamera-Namen, mit denen das Zubehoer kompatibel ist (aus
 * accessories.compatible_product_ids, ueber migration_audit aufgeloest).
 * Damit erkennt der Admin im Dropdown, welcher Akku zu welcher Kamera gehoert.
 *
 * Format pro Produkt:
 *   { id, name, marke, modell, ist_vermietbar, compatible_camera_names: string[] }
 *
 * `compatible_camera_names` ist:
 *   - leeres Array `[]` fuer Kamera-Produkte (irrelevant) oder Zubehoer ohne Filter
 *   - `['Alle Kameras']` wenn das Zubehoer fuer alle Kameras passt
 *   - sonst eine Liste konkreter Kameranamen
 */
export async function GET(_req: NextRequest) {
  const supabase = createServiceClient();

  const { data: produkte, error } = await supabase
    .from('produkte')
    .select('id, name, marke, modell, ist_vermietbar')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Anreicherung mit Kompatibilitaeten — defensiv, bei Fehlern liefern wir
  // einfach leere compatible_camera_names zurueck und das Dropdown zeigt
  // wenigstens den Namen.
  const enriched = await enrichWithCompatibility(supabase, produkte ?? []);

  return NextResponse.json({ produkte: enriched });
}

interface ProduktRow {
  id: string;
  name: string;
  marke: string | null;
  modell: string | null;
  ist_vermietbar: boolean;
}

async function enrichWithCompatibility(
  supabase: ReturnType<typeof createServiceClient>,
  produkte: ProduktRow[],
): Promise<Array<ProduktRow & { compatible_camera_names: string[] }>> {
  if (produkte.length === 0) return [];

  const produkteIds = produkte.map((p) => p.id);

  // 1) Migration-Audit fuer accessories → produkte: liefert legacy_id pro
  //    Zubehor-produkt. Kamera-Produkte (alte_tabelle='admin_config.products')
  //    bekommen kein compatible_camera_names — die SIND Kameras.
  let accessoryAudit: Array<{ alte_id: string; neue_id: string }> = [];
  try {
    const { data } = await supabase
      .from('migration_audit')
      .select('alte_id, neue_id')
      .eq('alte_tabelle', 'accessories')
      .eq('neue_tabelle', 'produkte')
      .in('neue_id', produkteIds);
    accessoryAudit = (data ?? []) as typeof accessoryAudit;
  } catch {
    return produkte.map((p) => ({ ...p, compatible_camera_names: [] }));
  }

  if (accessoryAudit.length === 0) {
    return produkte.map((p) => ({ ...p, compatible_camera_names: [] }));
  }

  const produkteIdToLegacyAccId = new Map<string, string>();
  for (const r of accessoryAudit) produkteIdToLegacyAccId.set(r.neue_id, r.alte_id);

  // 2) accessories.compatible_product_ids fuer alle Zubehor-Eintraege bulk-laden
  const legacyAccIds = Array.from(produkteIdToLegacyAccId.values());
  let accessoriesData: Array<{ id: string; compatible_product_ids: string[] | null }> = [];
  try {
    const { data } = await supabase
      .from('accessories')
      .select('id, compatible_product_ids')
      .in('id', legacyAccIds);
    accessoriesData = (data ?? []) as typeof accessoriesData;
  } catch {
    // accessories-Tabelle existiert nicht (Drop-Fall) — leer zurueck
  }

  const accIdToCompatible = new Map<string, string[]>();
  for (const a of accessoriesData) {
    accIdToCompatible.set(a.id, Array.isArray(a.compatible_product_ids) ? a.compatible_product_ids : []);
  }

  // 3) admin_config.products lesen, um die Kamera-Legacy-IDs ("1", "2") in
  //    lesbare Namen zu uebersetzen.
  let cameraMap: Record<string, { name: string; brand?: string | null }> = {};
  try {
    const { data: configRow } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .maybeSingle();
    cameraMap = (configRow?.value ?? {}) as Record<string, { name: string; brand?: string | null }>;
  } catch {
    // egal — wir liefern leere Liste
  }

  // 4) Pro Produkt die Liste auflösen
  return produkte.map((p) => {
    const legacyAccId = produkteIdToLegacyAccId.get(p.id);
    if (!legacyAccId) return { ...p, compatible_camera_names: [] };

    const compatIds = accIdToCompatible.get(legacyAccId) ?? [];
    if (compatIds.length === 0) {
      return { ...p, compatible_camera_names: ['Alle Kameras'] };
    }

    const names = compatIds
      .map((cid) => {
        const c = cameraMap[cid];
        if (!c) return null;
        return `${c.brand ? c.brand + ' ' : ''}${c.name}`.trim();
      })
      .filter((x): x is string => !!x);

    return { ...p, compatible_camera_names: names };
  });
}

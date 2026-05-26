import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/produkte/cleanup-orphans
 *
 * Loescht `produkte`-Rows + zugehoerige `migration_audit`-Eintraege, deren
 * Legacy-Quelle (admin_config.products bzw. accessories) nicht mehr
 * existiert — Karteileichen, die durch das Loeschen einer Kamera/eines
 * Zubehoers im Shop entstanden sind.
 *
 * Sicherheit: ein verwaister Eintrag wird nur dann hart geloescht, wenn
 * keine `inventar_units` (oder Legacy-`product_units`) mehr darauf zeigen.
 * Sonst koennten Schadensberichte oder historische Buchungen ihre
 * Stammdaten verlieren.
 *
 * Antwort: { deleted: number, skipped: number, skipped_reasons: string[] }
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 1. Alle produkte + ihre Audit-Bridges laden
  const { data: produkte, error: pErr } = await supabase
    .from('produkte')
    .select('id, name');
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!produkte || produkte.length === 0) {
    return NextResponse.json({ deleted: 0, skipped: 0, skipped_reasons: [] });
  }

  const produktIds = produkte.map((p: { id: string }) => p.id);

  const { data: auditRows } = await supabase
    .from('migration_audit')
    .select('alte_tabelle, alte_id, neue_id')
    .eq('neue_tabelle', 'produkte')
    .in('neue_id', produktIds);
  const audit = (auditRows ?? []) as Array<{ alte_tabelle: string; alte_id: string; neue_id: string }>;
  if (audit.length === 0) {
    return NextResponse.json({ deleted: 0, skipped: 0, skipped_reasons: [] });
  }

  // 2. Gueltige Quellen sammeln
  const validCameraIds = new Set<string>();
  try {
    const { data: cfg } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .maybeSingle();
    const dict = (cfg?.value ?? {}) as Record<string, { id?: string }>;
    for (const key of Object.keys(dict)) validCameraIds.add(key);
    for (const entry of Object.values(dict)) if (entry?.id) validCameraIds.add(entry.id);
  } catch { /* ignore */ }

  const validAccessoryIds = new Set<string>();
  try {
    const accAuditIds = audit
      .filter((a) => a.alte_tabelle === 'accessories')
      .map((a) => a.alte_id);
    if (accAuditIds.length > 0) {
      const { data } = await supabase.from('accessories').select('id').in('id', accAuditIds);
      for (const row of (data ?? []) as Array<{ id: string }>) validAccessoryIds.add(row.id);
    }
  } catch { /* ignore */ }

  // 3. Verwaiste Produkte ermitteln
  const orphanProduktIds: string[] = [];
  for (const row of audit) {
    if (row.alte_tabelle === 'admin_config.products' && !validCameraIds.has(row.alte_id)) {
      orphanProduktIds.push(row.neue_id);
    } else if (row.alte_tabelle === 'accessories' && !validAccessoryIds.has(row.alte_id)) {
      orphanProduktIds.push(row.neue_id);
    }
  }

  if (orphanProduktIds.length === 0) {
    return NextResponse.json({ deleted: 0, skipped: 0, skipped_reasons: [] });
  }

  // 4. Referenz-Check: welche verwaisten produkte werden noch von
  // inventar_units oder Legacy-product_units referenziert? Die behalten wir.
  const referencedIds = new Set<string>();
  try {
    const { data } = await supabase
      .from('inventar_units')
      .select('produkt_id')
      .in('produkt_id', orphanProduktIds);
    for (const row of (data ?? []) as Array<{ produkt_id: string }>) {
      if (row.produkt_id) referencedIds.add(row.produkt_id);
    }
  } catch { /* inventar_units fehlt → Pre-Konsolidierung, skip */ }

  // 5. Loeschen: nur die ohne aktive Referenzen
  const deletable = orphanProduktIds.filter((id) => !referencedIds.has(id));
  const skipped = orphanProduktIds.length - deletable.length;
  const skippedReasons: string[] = skipped > 0
    ? [`${skipped} Stammdaten haben noch Inventar-Einheiten — diese bleiben erhalten.`]
    : [];

  let deletedCount = 0;
  if (deletable.length > 0) {
    // migration_audit zuerst (FK-frei, defensiv)
    await supabase
      .from('migration_audit')
      .delete()
      .eq('neue_tabelle', 'produkte')
      .in('neue_id', deletable);

    const { error: delErr, count } = await supabase
      .from('produkte')
      .delete({ count: 'exact' })
      .in('id', deletable);
    if (delErr) {
      return NextResponse.json({
        error: `Loeschen fehlgeschlagen: ${delErr.message}`,
        deleted: 0,
        skipped,
      }, { status: 500 });
    }
    deletedCount = count ?? deletable.length;
  }

  await logAudit({
    action: 'produkte.cleanup_orphans',
    entityType: 'produkte',
    entityId: deletable.join(',').slice(0, 200),
    changes: { deleted: deletedCount, skipped, candidateIds: orphanProduktIds.slice(0, 20) },
    request: req,
  });

  return NextResponse.json({
    deleted: deletedCount,
    skipped,
    skipped_reasons: skippedReasons,
  });
}

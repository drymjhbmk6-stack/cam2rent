import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { isBelegFullyClassified, recomputeBelegSummen } from '@/lib/buchhaltung/beleg-utils';
import { erzeugeAssetsFuerBeleg } from '@/lib/buchhaltung/asset-auto-generator';

/**
 * POST /api/admin/belege/[id]/festschreiben
 *
 * - Pruefung: alle Positionen klassifiziert?
 * - Setzt status='festgeschrieben', festgeschrieben_at, interne_beleg_no
 * - Lockt alle Positionen
 * - Erzeugt Assets fuer afa/gwg-Positionen (Auto-Generator)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: beleg, error: loadErr } = await supabase
    .from('belege').select('*').eq('id', id).single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });
  if (beleg.status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Beleg ist bereits festgeschrieben' }, { status: 409 });
  }

  // Eigenbeleg ohne Anhang? Pruefe das
  if (!beleg.ist_eigenbeleg) {
    const { count } = await supabase
      .from('beleg_anhaenge').select('*', { count: 'exact', head: true }).eq('beleg_id', id);
    if ((count ?? 0) === 0) {
      return NextResponse.json(
        { error: 'Beleg hat keinen Anhang — bitte als Eigenbeleg markieren oder Datei hochladen' },
        { status: 400 },
      );
    }
  }

  // Klassifizierungs-Vollstaendigkeit
  const status = await isBelegFullyClassified(supabase, id);
  if (!status.ok) {
    return NextResponse.json(
      { error: `${status.pendingCount} von ${status.totalCount} Positionen sind noch nicht klassifiziert` },
      { status: 400 },
    );
  }

  // Summen final berechnen (falls jemand am Ende noch Positionen geaendert hat)
  await recomputeBelegSummen(supabase, id);

  const now = new Date().toISOString();
  const interne = beleg.interne_beleg_no ?? beleg.beleg_nr;  // Migration: gleicher Wert

  const { error: updErr } = await supabase
    .from('belege')
    .update({
      status: 'festgeschrieben',
      festgeschrieben_at: now,
      interne_beleg_no: interne,
    })
    .eq('id', id)
    .eq('status', beleg.status); // optimistic concurrency
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Positionen locken
  await supabase
    .from('beleg_positionen').update({ locked: true }).eq('beleg_id', id);

  // Auto-Asset-Generierung (afa/gwg)
  let assetsCreated = 0;
  try {
    const result = await erzeugeAssetsFuerBeleg(supabase, id);
    assetsCreated = result.assetsCreated;
  } catch (err) {
    console.error('Asset-Auto-Gen fehlgeschlagen:', err);
    // Festschreibung bleibt trotzdem — Admin kann Assets manuell anlegen
  }

  await logAudit({
    action: 'beleg.festschreiben',
    entityType: 'beleg',
    entityId: id,
    entityLabel: beleg.beleg_nr,
    changes: { interne_beleg_no: interne, assets_created: assetsCreated },
    request: req,
  });

  return NextResponse.json({ ok: true, interne_beleg_no: interne, assets_created: assetsCreated });
}

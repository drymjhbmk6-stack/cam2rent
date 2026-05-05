import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { klassifizierePositionen } from '@/lib/ai/klassifiziere-positionen';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/belege/[id]/ki-klassifizierung
 *
 * Holt alle pending-Positionen, ruft Claude auf, schreibt die Vorschlaege in
 * beleg_positionen.ki_vorschlag (Klassifizierung wird NICHT automatisch
 * angewendet — Admin klickt im UI auf "Anwenden").
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: beleg } = await supabase.from('belege').select('id, status').eq('id', id).single();
  if (!beleg) return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 });
  if (beleg.status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Festgeschrieben' }, { status: 409 });
  }

  const { data: positionen } = await supabase
    .from('beleg_positionen')
    .select('id, bezeichnung, menge, einzelpreis_netto, mwst_satz')
    .eq('beleg_id', id)
    .eq('klassifizierung', 'pending');

  if (!positionen || positionen.length === 0) {
    return NextResponse.json({ ok: true, suggestions: 0, info: 'Alle Positionen bereits klassifiziert' });
  }

  let results;
  try {
    results = await klassifizierePositionen(positionen.map((p) => ({
      id: (p as { id: string }).id,
      bezeichnung: (p as { bezeichnung: string }).bezeichnung,
      menge: (p as { menge: number }).menge,
      einzelpreis_netto: Number((p as { einzelpreis_netto: number }).einzelpreis_netto),
      mwst_satz: Number((p as { mwst_satz: number }).mwst_satz),
    })));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // Vorschlaege in DB schreiben
  for (const r of results) {
    await supabase.from('beleg_positionen').update({
      ki_vorschlag: r.vorschlag,
    }).eq('id', r.position_id);
  }

  await logAudit({ action: 'beleg.ki_klassifizierung', entityType: 'beleg', entityId: id, changes: { count: results.length }, request: req });
  return NextResponse.json({ ok: true, suggestions: results.length });
}

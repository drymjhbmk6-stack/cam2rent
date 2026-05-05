import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sanitizePosition, recomputeBelegSummen } from '@/lib/buchhaltung/beleg-utils';

/**
 * POST /api/admin/beleg-positionen
 * Body: { beleg_id, ...BelegPositionInput }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !body.beleg_id) return NextResponse.json({ error: 'beleg_id Pflicht' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: beleg } = await supabase
    .from('belege').select('id, status').eq('id', String(body.beleg_id)).single();
  if (!beleg) return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 });
  if (beleg.status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Festgeschrieben' }, { status: 409 });
  }

  const sanitized = sanitizePosition({
    bezeichnung: String(body.bezeichnung ?? ''),
    menge: Number(body.menge ?? 1),
    einzelpreis_netto: Number(body.einzelpreis_netto ?? 0),
    mwst_satz: typeof body.mwst_satz === 'number' ? body.mwst_satz : 19,
    klassifizierung: (body.klassifizierung as 'pending' | 'afa' | 'gwg' | 'ausgabe' | 'ignoriert') ?? 'pending',
    kategorie: body.kategorie as string | null,
    notizen: body.notizen as string | null,
    reihenfolge: typeof body.reihenfolge === 'number' ? body.reihenfolge : 999,
  });

  const { data, error } = await supabase
    .from('beleg_positionen').insert({ ...sanitized, beleg_id: body.beleg_id }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recomputeBelegSummen(supabase, String(body.beleg_id));
  await logAudit({ action: 'beleg_position.create', entityType: 'beleg_position', entityId: data.id, request: req });
  return NextResponse.json({ position: data });
}

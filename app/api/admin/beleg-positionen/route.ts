import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sanitizePosition, recomputeBelegSummen } from '@/lib/buchhaltung/beleg-utils';

/**
 * POST /api/admin/beleg-positionen     → neue Position anlegen
 * GET  /api/admin/beleg-positionen?q=…  → Fuzzy-Suche fuer Pfad B (Inventar
 *      sucht passenden Beleg). Sucht in bezeichnung, beleg_nr, lieferant.name.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim() ?? '';
  const lieferantId = sp.get('lieferant_id');
  const fromDate = sp.get('from');
  const toDate = sp.get('to');

  const supabase = createServiceClient();
  let query = supabase
    .from('beleg_positionen')
    .select('id, bezeichnung, menge, einzelpreis_netto, gesamt_netto, klassifizierung, beleg:belege(id, beleg_nr, beleg_datum, lieferant_id, lieferant:lieferanten(id, name))')
    .order('created_at', { ascending: false })
    .limit(50);

  if (q) query = query.ilike('bezeichnung', `%${q}%`);
  // Hinweis: Filter auf nested beleg-Felder funktioniert in PostgREST nicht direkt,
  // deshalb wird in den Kandidaten danach client-seitig nachgefiltert.

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let results = data ?? [];
  if (lieferantId || fromDate || toDate) {
    results = results.filter((r) => {
      const beleg = (r as { beleg: { beleg_datum: string; lieferant_id: string | null } | null }).beleg;
      if (!beleg) return false;
      if (lieferantId && beleg.lieferant_id !== lieferantId) return false;
      if (fromDate && beleg.beleg_datum < fromDate) return false;
      if (toDate && beleg.beleg_datum > toDate) return false;
      return true;
    });
  }
  return NextResponse.json({ positionen: results });
}

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

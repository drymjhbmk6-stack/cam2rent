import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { sanitizePosition, recomputeBelegSummen, insertPositionWithVerbrauchFallback } from '@/lib/buchhaltung/beleg-utils';

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
  // inventarbar=1 → nur Positionen, die als Inventar gefuehrt werden duerfen
  // (afa/gwg/verbrauch). Ohne den Param bleibt das Verhalten kompatibel zur
  // bisherigen Volltextsuche, damit andere Konsumenten nicht gebrochen werden.
  const inventarbar = sp.get('inventarbar') === '1';

  const supabase = createServiceClient();
  let query = supabase
    .from('beleg_positionen')
    .select('id, bezeichnung, menge, einzelpreis_netto, gesamt_netto, klassifizierung, beleg:belege(id, beleg_nr, beleg_datum, lieferant_id, lieferant:lieferanten(id, name))')
    .order('created_at', { ascending: false })
    .limit(50);

  if (q) query = query.ilike('bezeichnung', `%${q}%`);
  if (inventarbar) query = query.in('klassifizierung', ['afa', 'gwg', 'verbrauch']);
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

  // Verknuepfungen-Counts pro Position dazuholen, damit das Frontend die
  // Restmenge ('noch X von Y verknuepfbar') anzeigen + voll-belegte
  // Positionen ausgrauen kann.
  const positionIds = results.map((r) => (r as { id: string }).id);
  const countsByPos: Record<string, number> = {};
  if (positionIds.length > 0) {
    try {
      const { data: links } = await supabase
        .from('inventar_verknuepfung')
        .select('beleg_position_id')
        .in('beleg_position_id', positionIds);
      for (const l of (links ?? []) as Array<{ beleg_position_id: string }>) {
        countsByPos[l.beleg_position_id] = (countsByPos[l.beleg_position_id] ?? 0) + 1;
      }
    } catch {
      // defensiv
    }
  }
  const enriched = results.map((r) => ({
    ...(r as Record<string, unknown>),
    verknuepfungen_count: countsByPos[(r as { id: string }).id] ?? 0,
  }));

  return NextResponse.json({ positionen: enriched });
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
    klassifizierung: (body.klassifizierung as 'pending' | 'afa' | 'gwg' | 'ausgabe' | 'verbrauch' | 'ignoriert') ?? 'pending',
    kategorie: body.kategorie as string | null,
    notizen: body.notizen as string | null,
    reihenfolge: typeof body.reihenfolge === 'number' ? body.reihenfolge : 999,
  });

  const { data, error } = await insertPositionWithVerbrauchFallback(
    supabase,
    { ...sanitized, beleg_id: body.beleg_id },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recomputeBelegSummen(supabase, String(body.beleg_id));
  await logAudit({ action: 'beleg_position.create', entityType: 'beleg_position', entityId: data.id, request: req });
  return NextResponse.json({ position: data });
}

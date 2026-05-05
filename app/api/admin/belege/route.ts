import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';
import { nextBelegNr, sanitizePosition, recomputeBelegSummen, type BelegPositionInput } from '@/lib/buchhaltung/beleg-utils';

/**
 * GET /api/admin/belege?status=&lieferant_id=&from=&to=&q=&limit=&offset=
 * POST /api/admin/belege
 *
 * Body POST:
 *   {
 *     beleg_datum: 'YYYY-MM-DD',
 *     lieferant_id?: uuid,
 *     bezahl_datum?: 'YYYY-MM-DD',
 *     rechnungsnummer_lieferant?: string,
 *     quelle: 'upload' | 'manuell',
 *     ist_eigenbeleg?: bool,
 *     eigenbeleg_grund?: string,
 *     positionen: BelegPositionInput[],
 *     notizen?: string
 *   }
 */

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const lieferantId = sp.get('lieferant_id');
  const from = sp.get('from');
  const to = sp.get('to');
  const q = sp.get('q')?.trim() ?? '';
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
  const offset = Math.max(0, parseInt(sp.get('offset') ?? '0', 10));

  const supabase = createServiceClient();
  let query = supabase
    .from('belege')
    .select('*, lieferant:lieferanten(id,name)', { count: 'exact' })
    .order('beleg_datum', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (lieferantId) query = query.eq('lieferant_id', lieferantId);
  if (from) query = query.gte('beleg_datum', from);
  if (to) query = query.lte('beleg_datum', to);
  if (q) query = query.or(`beleg_nr.ilike.%${q}%,rechnungsnummer_lieferant.ilike.%${q}%,notizen.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pro Beleg die Anzahl + Status der Positionen anhaengen
  const ids = (data ?? []).map((b) => (b as { id: string }).id);
  let posByBeleg = new Map<string, { total: number; pending: number }>();
  if (ids.length) {
    const { data: posRows } = await supabase
      .from('beleg_positionen')
      .select('beleg_id, klassifizierung')
      .in('beleg_id', ids);
    for (const p of posRows ?? []) {
      const r = p as { beleg_id: string; klassifizierung: string };
      const cur = posByBeleg.get(r.beleg_id) ?? { total: 0, pending: 0 };
      cur.total++;
      if (r.klassifizierung === 'pending') cur.pending++;
      posByBeleg.set(r.beleg_id, cur);
    }
  }

  const enriched = (data ?? []).map((b) => {
    const stats = posByBeleg.get((b as { id: string }).id) ?? { total: 0, pending: 0 };
    return { ...b, positions_total: stats.total, positions_pending: stats.pending };
  });

  return NextResponse.json({ belege: enriched, total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const belegDatum = body.beleg_datum as string | undefined;
  const positionen = (body.positionen ?? []) as BelegPositionInput[];
  const quelle = (body.quelle ?? 'manuell') as 'upload' | 'manuell';

  if (!belegDatum) return NextResponse.json({ error: 'beleg_datum ist Pflicht' }, { status: 400 });
  if (!Array.isArray(positionen) || positionen.length === 0) {
    return NextResponse.json({ error: 'mindestens eine Position erforderlich' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const jahr = new Date(belegDatum).getFullYear();
  const belegNr = await nextBelegNr(supabase, jahr);
  const istEigenbeleg = !!body.ist_eigenbeleg;
  const eigenbelegGrund = body.eigenbeleg_grund ? String(body.eigenbeleg_grund) : null;

  if (istEigenbeleg && !eigenbelegGrund) {
    return NextResponse.json({ error: 'eigenbeleg_grund Pflicht bei ist_eigenbeleg=true' }, { status: 400 });
  }

  const isTest = await isTestMode();

  const { data: beleg, error: belErr } = await supabase
    .from('belege')
    .insert({
      beleg_nr: belegNr,
      lieferant_id: body.lieferant_id ?? null,
      beleg_datum: belegDatum,
      bezahl_datum: body.bezahl_datum ?? null,
      rechnungsnummer_lieferant: body.rechnungsnummer_lieferant ?? null,
      summe_netto: 0,
      summe_brutto: 0,
      status: 'offen',
      quelle,
      ist_eigenbeleg: istEigenbeleg,
      eigenbeleg_grund: eigenbelegGrund,
      notizen: body.notizen ?? null,
      is_test: isTest,
    })
    .select('*')
    .single();
  if (belErr) return NextResponse.json({ error: belErr.message }, { status: 500 });

  // Positionen einfuegen
  const sanitized = positionen.map((p, i) => ({
    ...sanitizePosition({ ...p, reihenfolge: p.reihenfolge ?? i }),
    beleg_id: beleg.id,
  }));
  const { error: posErr } = await supabase.from('beleg_positionen').insert(sanitized);
  if (posErr) {
    // Rollback: Beleg wieder loeschen
    await supabase.from('belege').delete().eq('id', beleg.id);
    return NextResponse.json({ error: posErr.message }, { status: 500 });
  }

  await recomputeBelegSummen(supabase, beleg.id);
  await logAudit({ action: 'beleg.create', entityType: 'beleg', entityId: beleg.id, entityLabel: belegNr, changes: { positionen: positionen.length }, request: req });

  const { data: full } = await supabase
    .from('belege')
    .select('*, lieferant:lieferanten(id,name)')
    .eq('id', beleg.id)
    .single();

  return NextResponse.json({ beleg: full });
}

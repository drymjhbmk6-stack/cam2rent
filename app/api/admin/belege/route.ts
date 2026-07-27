import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';
import { type BelegPositionInput } from '@/lib/buchhaltung/beleg-utils';
import { createBeleg } from '@/lib/buchhaltung/beleg-create';
import { sanitizeSearchInput } from '@/lib/search-sanitize';

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
  const q = sanitizeSearchInput(sp.get('q'));
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
  const posByBeleg = new Map<string, { total: number; pending: number }>();
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
  if (!Array.isArray(positionen)) {
    return NextResponse.json({ error: 'positionen muss ein Array sein' }, { status: 400 });
  }
  // Beim Upload-Pfad ist ein leerer Beleg erlaubt — Positionen werden gleich
  // per OCR oder manuell ergaenzt. Im manuellen Pfad bleibt mind. eine Pflicht.
  if (quelle === 'manuell' && positionen.length === 0) {
    return NextResponse.json({ error: 'mindestens eine Position erforderlich' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const istEigenbeleg = !!body.ist_eigenbeleg;
  const eigenbelegGrund = body.eigenbeleg_grund ? String(body.eigenbeleg_grund) : null;

  if (istEigenbeleg && !eigenbelegGrund) {
    return NextResponse.json({ error: 'eigenbeleg_grund Pflicht bei ist_eigenbeleg=true' }, { status: 400 });
  }

  const isTest = await isTestMode();

  // Anlage-Logik (Insert + Positionen + Summen + Duplikat-Check) liegt im
  // geteilten Helfer, den auch der E-Mail-Import nutzt — keine Divergenz.
  const { beleg, error: createErr } = await createBeleg(supabase, {
    belegDatum,
    quelle,
    isTest,
    lieferantId: (body.lieferant_id as string | undefined) ?? null,
    bezahlDatum: (body.bezahl_datum as string | undefined) ?? null,
    rechnungsnummerLieferant: (body.rechnungsnummer_lieferant as string | undefined) ?? null,
    istEigenbeleg,
    eigenbelegGrund,
    notizen: (body.notizen as string | undefined) ?? null,
    positionen,
  });
  if (!beleg) {
    return NextResponse.json({ error: createErr ?? 'Beleg-Anlage fehlgeschlagen' }, { status: 500 });
  }

  await logAudit({ action: 'beleg.create', entityType: 'beleg', entityId: beleg.id, entityLabel: beleg.beleg_nr, changes: { positionen: positionen.length }, request: req });

  const { data: full } = await supabase
    .from('belege')
    .select('*, lieferant:lieferanten(id,name)')
    .eq('id', beleg.id)
    .single();

  return NextResponse.json({ beleg: full });
}

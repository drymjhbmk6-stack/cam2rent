import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { findContentDuplicate, persistDuplicateWarning } from '@/lib/buchhaltung/duplicate-check';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: beleg, error } = await supabase
    .from('belege')
    .select('*, lieferant:lieferanten(id,name,adresse,email,ust_id)')
    .eq('id', id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Bei aktivem Duplikat-Verdacht den verlinkten Original-Beleg dazuladen
  // (separater Roundtrip statt FK-Embed, weil Self-Join in PostgREST mehr
  // Setup braucht und wir hier defensiv gegen fehlende Migration sein
  // muessen). Defensiv: bei fehlender Spalte einfach null lassen.
  let verdachtExisting: { id: string; beleg_nr: string } | null = null;
  const verdachtId = (beleg as { verdacht_duplikat_beleg_id?: string | null }).verdacht_duplikat_beleg_id ?? null;
  if (verdachtId) {
    const { data: orig } = await supabase
      .from('belege').select('id, beleg_nr').eq('id', verdachtId).maybeSingle();
    if (orig) verdachtExisting = orig as { id: string; beleg_nr: string };
  }

  const { data: positionen } = await supabase
    .from('beleg_positionen')
    .select('*')
    .eq('beleg_id', id)
    .order('reihenfolge');

  const { data: anhaenge } = await supabase
    .from('beleg_anhaenge')
    .select('*')
    .eq('beleg_id', id)
    .order('created_at');

  // Verknuepfungen pro Position (Inventar-Stuecke) defensiv mitladen
  const positionIds = (positionen ?? []).map((p) => (p as { id: string }).id);
  let linksByPosition: Record<string, Array<{ id: string; stueck_anteil: number; inventar_unit: { id: string; bezeichnung: string; inventar_code: string | null; seriennummer: string | null } | null }>> = {};
  if (positionIds.length > 0) {
    try {
      const { data: links } = await supabase
        .from('inventar_verknuepfung')
        .select('id, stueck_anteil, beleg_position_id, inventar_unit:inventar_units(id, bezeichnung, inventar_code, seriennummer)')
        .in('beleg_position_id', positionIds);
      const map: typeof linksByPosition = {};
      for (const l of (links ?? []) as Array<{ id: string; stueck_anteil: number; beleg_position_id: string; inventar_unit: unknown }>) {
        const inv = Array.isArray(l.inventar_unit)
          ? (l.inventar_unit[0] as { id: string; bezeichnung: string; inventar_code: string | null; seriennummer: string | null } | undefined) ?? null
          : (l.inventar_unit as { id: string; bezeichnung: string; inventar_code: string | null; seriennummer: string | null } | null) ?? null;
        if (!map[l.beleg_position_id]) map[l.beleg_position_id] = [];
        map[l.beleg_position_id].push({ id: l.id, stueck_anteil: l.stueck_anteil, inventar_unit: inv });
      }
      linksByPosition = map;
    } catch {
      // defensiv — Tabelle könnte fehlen
    }
  }

  // Asset-Status: pro afa/gwg-Position pruefen, ob bereits ein Asset existiert.
  // UI nutzt das, um nach dem Festschreiben einen Recovery-Banner zu zeigen,
  // falls die Auto-Generierung still gescheitert ist.
  const assetExpectedPosIds = (positionen ?? [])
    .filter((p) => {
      const r = p as { klassifizierung: string; folgekosten_asset_id: string | null };
      return ['afa', 'gwg'].includes(r.klassifizierung) && !r.folgekosten_asset_id;
    })
    .map((p) => (p as { id: string }).id);
  const assetExpected = assetExpectedPosIds.length;
  let assetActual = 0;
  if (assetExpected > 0) {
    // Probe-Read: erst assets_neu, dann assets (defensiv vor/nach Drop-Migration).
    // PostgREST liefert bei "Tabelle nicht im Schema-Cache" code='PGRST205'
    // mit Schema-Cache-Meldung — NICHT den PG-Errorcode 42P01. Wir muessen
    // also auf beide Faelle pruefen.
    const isMissingTable = (e: { code?: string; message?: string } | null | undefined): boolean => {
      if (!e) return false;
      if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202') return true;
      if (typeof e.message === 'string' && /could not find the table|schema cache/i.test(e.message)) return true;
      return false;
    };
    let probe = await supabase.from('assets_neu')
      .select('beleg_position_id', { count: 'exact', head: false })
      .in('beleg_position_id', assetExpectedPosIds);
    if (isMissingTable(probe.error)) {
      probe = await supabase.from('assets')
        .select('beleg_position_id', { count: 'exact', head: false })
        .in('beleg_position_id', assetExpectedPosIds);
    }
    if (!probe.error) {
      assetActual = (probe.data ?? []).length;
    }
    // Falls beide Tabellen fehlen (uralter Datenstand vor Migration),
    // assetActual bleibt 0 — UI zeigt dann den Hinweis, was OK ist.
  }

  return NextResponse.json({
    beleg: { ...beleg, verdacht_duplikat_existing: verdachtExisting },
    positionen: positionen ?? [],
    anhaenge: anhaenge ?? [],
    linksByPosition,
    asset_status: { expected: assetExpected, actual: assetActual },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: existing, error: loadErr } = await supabase
    .from('belege').select('id, status').eq('id', id).single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });
  if (existing.status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Beleg ist festgeschrieben — keine Aenderungen mehr moeglich' }, { status: 409 });
  }

  const update: Record<string, unknown> = {};
  for (const k of [
    'lieferant_id', 'beleg_datum', 'bezahl_datum', 'rechnungsnummer_lieferant',
    'ist_eigenbeleg', 'eigenbeleg_grund', 'notizen',
  ]) {
    if (k in body) update[k] = body[k];
  }
  if (update.ist_eigenbeleg === true && !update.eigenbeleg_grund) {
    return NextResponse.json({ error: 'eigenbeleg_grund Pflicht bei ist_eigenbeleg=true' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('belege').update(update).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Wenn dup-relevante Felder geaendert wurden, neu pruefen — sonst koennte
  // ein stehender Verdacht-Banner haengenbleiben (oder umgekehrt: ein neu
  // entstandenes Duplikat wuerde nicht entdeckt).
  const dupRelevantChanged = ['lieferant_id', 'beleg_datum', 'rechnungsnummer_lieferant'].some((k) => k in update);
  if (dupRelevantChanged) {
    const { data: fresh } = await supabase
      .from('belege')
      .select('id, lieferant_id, beleg_datum, rechnungsnummer_lieferant, summe_brutto, is_test')
      .eq('id', id)
      .single();
    if (fresh) {
      const dup = await findContentDuplicate(supabase, {
        belegId: id,
        lieferantId: (fresh as { lieferant_id: string | null }).lieferant_id,
        belegDatum: (fresh as { beleg_datum: string | null }).beleg_datum,
        rechnungsnummerLieferant: (fresh as { rechnungsnummer_lieferant: string | null }).rechnungsnummer_lieferant,
        summeBrutto: Number((fresh as { summe_brutto: number | string }).summe_brutto ?? 0),
        isTest: !!(fresh as { is_test: boolean }).is_test,
      });
      await persistDuplicateWarning(supabase, id, dup);
    }
  }

  await logAudit({ action: 'beleg.update', entityType: 'beleg', entityId: id, changes: update, request: req });
  return NextResponse.json({ beleg: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: existing, error: loadErr } = await supabase
    .from('belege').select('id, status, beleg_nr').eq('id', id).single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });
  if (existing.status === 'festgeschrieben') {
    return NextResponse.json({ error: 'Festgeschriebene Belege koennen nicht geloescht werden' }, { status: 409 });
  }

  // Anhaenge aus Storage loeschen
  const { data: anhaenge } = await supabase
    .from('beleg_anhaenge').select('storage_path').eq('beleg_id', id);
  if (anhaenge && anhaenge.length > 0) {
    const paths = anhaenge.map((a) => (a as { storage_path: string }).storage_path);
    await supabase.storage.from('purchase-invoices').remove(paths);
  }

  // CASCADE droppt beleg_positionen + beleg_anhaenge automatisch
  const { error } = await supabase.from('belege').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ action: 'beleg.delete', entityType: 'beleg', entityId: id, entityLabel: existing.beleg_nr, request: req });
  return NextResponse.json({ ok: true });
}

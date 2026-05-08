import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/inventar/[id]/verknuepfen
 * Body: { beleg_position_id: uuid, stueck_anteil?: number }
 *
 * Verknuepft eine inventar_unit mit einer beleg_position.
 * Wenn die Unit noch keinen Kaufpreis hat, wird er aus der Position
 * abgeleitet (einzelpreis_netto). beleg_status wird auf 'verknuepft'
 * gesetzt.
 *
 * Wenn unit.wbw_manuell_gesetzt=false und kaufpreis_netto neu kommt,
 * wird wiederbeschaffungswert auf kaufpreis_netto initialisiert.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { beleg_position_id?: string; stueck_anteil?: number } | null;
  if (!body?.beleg_position_id) {
    return NextResponse.json({ error: 'beleg_position_id Pflicht' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: unit, error: uErr } = await supabase
    .from('inventar_units').select('*').eq('id', id).single();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 404 });

  const { data: position, error: pErr } = await supabase
    .from('beleg_positionen')
    .select('id, menge, einzelpreis_netto, mwst_satz, bezeichnung, beleg:belege(id, beleg_datum, beleg_nr)')
    .eq('id', body.beleg_position_id)
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 });

  // Mengen-Limit pruefen: pro Beleg-Position duerfen max. position.menge
  // Inventar-Stuecke verknuepft sein. Pruefung nur fuer NEUE Verknuepfungen
  // (bestehende Verknuepfung mit dieser Unit ist ueber UNIQUE(pos,unit) bereits
  // vor Doppel-Insert geschuetzt — wir wollen aber nicht doppelt zaehlen).
  const positionMenge = Number((position as { menge: number }).menge ?? 1);
  const stueckAnteil = Number(body.stueck_anteil ?? 1);
  const { data: existingLinks } = await supabase
    .from('inventar_verknuepfung')
    .select('id, inventar_unit_id, stueck_anteil')
    .eq('beleg_position_id', body.beleg_position_id);
  const isReLink = (existingLinks ?? []).some(
    (l) => (l as { inventar_unit_id: string }).inventar_unit_id === id,
  );
  if (!isReLink) {
    const sumExisting = (existingLinks ?? []).reduce(
      (s, l) => s + Number((l as { stueck_anteil: number }).stueck_anteil ?? 1),
      0,
    );
    if (sumExisting + stueckAnteil > positionMenge) {
      const rest = Math.max(0, positionMenge - sumExisting);
      return NextResponse.json({
        error: `Position '${(position as { bezeichnung: string }).bezeichnung}' hat nur ${positionMenge} Stueck und ist bereits ${sumExisting}× verknuepft. Noch verfuegbar: ${rest}.`,
      }, { status: 409 });
    }
  }

  // Verknuepfung anlegen
  const { error: insErr } = await supabase.from('inventar_verknuepfung').insert({
    beleg_position_id: body.beleg_position_id,
    inventar_unit_id: id,
    stueck_anteil: stueckAnteil,
  });
  if (insErr && insErr.code !== '23505') {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Steuermodus laden — Kleinunternehmer kann keine Vorsteuer abziehen,
  // also ist der wirtschaftliche Anschaffungswert = Brutto (netto + MwSt).
  // Bei Regelbesteuerung wird die MwSt als Vorsteuer geltend gemacht,
  // also bleibt der Anschaffungswert = netto.
  const { data: taxRow } = await supabase
    .from('admin_settings').select('value').eq('key', 'tax_mode').maybeSingle();
  const taxMode = ((taxRow?.value as { mode?: string } | string | undefined) as string) === 'regelbesteuerung'
    ? 'regelbesteuerung'
    : (typeof taxRow?.value === 'object' && (taxRow!.value as { mode?: string }).mode === 'regelbesteuerung'
        ? 'regelbesteuerung'
        : 'kleinunternehmer');

  // Unit-Felder updaten falls leer
  const update: Record<string, unknown> = { beleg_status: 'verknuepft' };
  const u = unit as { kaufpreis_netto: number | null; kaufdatum: string | null; wbw_manuell_gesetzt: boolean; wiederbeschaffungswert: number | null };
  const beleg = (position as unknown as { beleg: { beleg_datum: string } }).beleg;
  const positionNetto = Number((position as { einzelpreis_netto: number }).einzelpreis_netto);
  const positionMwst = Number((position as { mwst_satz: number | null }).mwst_satz ?? 0);
  // Anschaffungswert: bei Kleinunternehmer brutto, sonst netto.
  const anschaffungsWert = taxMode === 'kleinunternehmer'
    ? positionNetto * (1 + positionMwst / 100)
    : positionNetto;
  const anschaffungsWertRounded = Math.round(anschaffungsWert * 100) / 100;

  if (u.kaufpreis_netto === null || u.kaufpreis_netto === undefined) {
    update.kaufpreis_netto = anschaffungsWertRounded;
  }
  if (!u.kaufdatum && beleg?.beleg_datum) {
    update.kaufdatum = beleg.beleg_datum;
  }
  // WBW nur initialisieren wenn KEIN Override + WBW noch leer
  if (!u.wbw_manuell_gesetzt && (u.wiederbeschaffungswert === null || u.wiederbeschaffungswert === undefined)) {
    update.wiederbeschaffungswert = anschaffungsWertRounded;
    update.wbw_manuell_gesetzt = false;  // wichtig: bleibt false, damit Formel greift
  }

  await supabase.from('inventar_units').update(update).eq('id', id);

  await logAudit({
    action: 'inventar.verknuepfen',
    entityType: 'inventar_unit',
    entityId: id,
    changes: { beleg_position_id: body.beleg_position_id, kaufpreis_uebernommen: 'kaufpreis_netto' in update },
    request: req,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/inventar/[id]/verknuepfen?verknuepfung_id=...
 *
 * Loest eine Beleg-Verknuepfung von einer Inventar-Unit. Werte werden
 * danach defensiv aufgeraeumt:
 *
 * - Wenn KEINE Verknuepfung mehr uebrig ist: kaufpreis_netto, kaufdatum
 *   und wiederbeschaffungswert werden auf NULL gesetzt; beleg_status
 *   wechselt auf 'beleg_fehlt'. Manueller WBW-Override (`wbw_manuell_gesetzt=true`)
 *   bleibt unangetastet — er wird ja gerade NICHT aus dem Beleg gezogen.
 * - Wenn noch eine Verknuepfung uebrig ist: Werte werden aus der ersten
 *   verbleibenden Position neu abgeleitet (gleiche Logik wie POST), damit
 *   die Unit konsistent zur uebrig gebliebenen Quelle passt.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const verkId = req.nextUrl.searchParams.get('verknuepfung_id');
  if (!verkId) return NextResponse.json({ error: 'verknuepfung_id Pflicht' }, { status: 400 });
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('inventar_verknuepfung').delete().eq('id', verkId).eq('inventar_unit_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Restliche Verknuepfungen pruefen — wir wollen die Unit-Felder konsistent
  // halten. Bei der ersten verbleibenden Position werden kaufpreis/kaufdatum/
  // WBW (sofern kein Override) neu berechnet; ist nichts uebrig, raeumen wir
  // ab, damit nicht alte Werte im Inventar stehen bleiben, die zu keinem
  // Beleg mehr passen.
  const { data: rest } = await supabase
    .from('inventar_verknuepfung')
    .select('beleg_position_id')
    .eq('inventar_unit_id', id)
    .order('created_at', { ascending: true })
    .limit(1);

  const { data: u } = await supabase
    .from('inventar_units')
    .select('wbw_manuell_gesetzt')
    .eq('id', id)
    .single();
  const wbwManuell = !!(u as { wbw_manuell_gesetzt?: boolean } | null)?.wbw_manuell_gesetzt;

  if (!rest || rest.length === 0) {
    // Keine Verknuepfung mehr → Werte abraeumen.
    const reset: Record<string, unknown> = {
      kaufpreis_netto: null,
      kaufdatum: null,
      beleg_status: 'beleg_fehlt',
    };
    if (!wbwManuell) reset.wiederbeschaffungswert = null;
    await supabase.from('inventar_units').update(reset).eq('id', id);
  } else {
    // Erste verbleibende Position als neue Quelle nutzen.
    const remainingPosId = (rest[0] as { beleg_position_id: string }).beleg_position_id;
    const { data: position } = await supabase
      .from('beleg_positionen')
      .select('einzelpreis_netto, mwst_satz, beleg:belege(beleg_datum)')
      .eq('id', remainingPosId)
      .single();

    if (position) {
      const { data: taxRow } = await supabase
        .from('admin_settings').select('value').eq('key', 'tax_mode').maybeSingle();
      const taxMode = (typeof taxRow?.value === 'object' && (taxRow!.value as { mode?: string }).mode === 'regelbesteuerung')
        || (typeof taxRow?.value === 'string' && taxRow.value === 'regelbesteuerung')
        ? 'regelbesteuerung'
        : 'kleinunternehmer';

      const positionNetto = Number((position as { einzelpreis_netto: number }).einzelpreis_netto);
      const positionMwst = Number((position as { mwst_satz: number | null }).mwst_satz ?? 0);
      const anschaffung = taxMode === 'kleinunternehmer'
        ? positionNetto * (1 + positionMwst / 100)
        : positionNetto;
      const anschaffungRounded = Math.round(anschaffung * 100) / 100;

      const beleg = (position as unknown as { beleg: { beleg_datum: string } | null }).beleg;
      const update: Record<string, unknown> = {
        kaufpreis_netto: anschaffungRounded,
        beleg_status: 'verknuepft',
      };
      if (beleg?.beleg_datum) update.kaufdatum = beleg.beleg_datum;
      if (!wbwManuell) update.wiederbeschaffungswert = anschaffungRounded;

      await supabase.from('inventar_units').update(update).eq('id', id);
    }
  }

  await logAudit({
    action: 'inventar.verknuepfen.delete',
    entityType: 'inventar_unit',
    entityId: id,
    changes: {
      verknuepfung_id: verkId,
      cleanup: !rest || rest.length === 0 ? 'reset' : 'recompute_from_remaining',
    },
    request: req,
  });
  return NextResponse.json({ ok: true, remaining_links: rest?.length ?? 0 });
}

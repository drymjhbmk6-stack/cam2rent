import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/beleg-positionen/[id]/verknuepfen
 * Body: { items: [{ inventar_unit_id: uuid, wbw?: number|null }] }
 *
 * Verknuepft MEHRERE Inventar-Stuecke in einem Rutsch mit EINER Beleg-Position
 * — und setzt optional pro Stueck direkt einen Wiederbeschaffungswert (WBW).
 *
 * Hintergrund: Bei Bundle-Einkaeufen (z.B. 3 Akkus + Ladestation fuer 49,99 €)
 * ist der anteilige Beleg-Kaufpreis kein brauchbarer WBW. Mit diesem Endpoint
 * kann der Admin beim Verknuepfen direkt den realistischen Einzel-Ersatzwert
 * pro Stueck hinterlegen (= manueller WBW-Override).
 *
 * Mengen-Limit: Es duerfen pro Position max. `position.menge` Stuecke
 * verknuepft sein (bestehende + neue zusammen).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: positionId } = await params;
  const body = await req.json().catch(() => null) as
    | { items?: Array<{ inventar_unit_id?: string; wbw?: number | null }> }
    | null;
  const rawItems = Array.isArray(body?.items) ? body!.items! : null;
  if (!rawItems || rawItems.length === 0) {
    return NextResponse.json({ error: 'items Pflicht' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Position laden
  const { data: position, error: pErr } = await supabase
    .from('beleg_positionen')
    .select('id, menge, einzelpreis_netto, mwst_satz, bezeichnung, beleg:belege(beleg_datum)')
    .eq('id', positionId)
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 });

  const pos = position as unknown as {
    menge: number;
    einzelpreis_netto: number;
    mwst_satz: number | null;
    bezeichnung: string;
    beleg: { beleg_datum: string } | { beleg_datum: string }[] | null;
  };
  const positionMenge = Number(pos.menge ?? 1);

  // Bestehende Verknuepfungen dieser Position
  const { data: existingLinks } = await supabase
    .from('inventar_verknuepfung')
    .select('inventar_unit_id, stueck_anteil')
    .eq('beleg_position_id', positionId);
  const linkedUnitIds = new Set(
    (existingLinks ?? []).map((l) => (l as { inventar_unit_id: string }).inventar_unit_id),
  );
  const sumExisting = (existingLinks ?? []).reduce(
    (s, l) => s + Number((l as { stueck_anteil: number }).stueck_anteil ?? 1),
    0,
  );

  // Items saeubern: dedupe + bereits verknuepfte Units rausfiltern
  const seen = new Set<string>();
  const cleanItems: Array<{ unitId: string; wbw: number | null }> = [];
  for (const it of rawItems) {
    const uid = String(it?.inventar_unit_id ?? '').trim();
    if (!uid || seen.has(uid) || linkedUnitIds.has(uid)) continue;
    seen.add(uid);
    const wbwNum = Number(it?.wbw);
    cleanItems.push({
      unitId: uid,
      wbw: Number.isFinite(wbwNum) && wbwNum > 0 ? Math.round(wbwNum * 100) / 100 : null,
    });
  }
  if (cleanItems.length === 0) {
    return NextResponse.json({ ok: true, linked: 0, skipped: rawItems.length });
  }

  // Mengen-Limit
  if (sumExisting + cleanItems.length > positionMenge) {
    const rest = Math.max(0, positionMenge - sumExisting);
    return NextResponse.json({
      error: `Position „${pos.bezeichnung}" hat Menge ${positionMenge} und ist bereits ${sumExisting}× verknüpft. Es können noch ${rest} Stück verknüpft werden (${cleanItems.length} gewählt). Tipp: Menge der Position erhöhen oder den Beleg in mehrere Positionen aufteilen.`,
    }, { status: 409 });
  }

  // Steuermodus → Anschaffungswert (Kleinunternehmer: brutto, sonst netto)
  const { data: taxRow } = await supabase
    .from('admin_settings').select('value').eq('key', 'tax_mode').maybeSingle();
  const taxVal = taxRow?.value;
  const taxMode = (typeof taxVal === 'object' && taxVal !== null && (taxVal as { mode?: string }).mode === 'regelbesteuerung')
    || taxVal === 'regelbesteuerung'
    ? 'regelbesteuerung'
    : 'kleinunternehmer';
  const positionNetto = Number(pos.einzelpreis_netto);
  const positionMwst = Number(pos.mwst_satz ?? 0);
  const anschaffung = Math.round(
    (taxMode === 'kleinunternehmer' ? positionNetto * (1 + positionMwst / 100) : positionNetto) * 100,
  ) / 100;
  const belegRel = pos.beleg;
  const belegDatum = (Array.isArray(belegRel) ? belegRel[0]?.beleg_datum : belegRel?.beleg_datum) ?? null;

  // Units laden
  const unitIds = cleanItems.map((c) => c.unitId);
  const { data: units } = await supabase
    .from('inventar_units')
    .select('id, kaufpreis_netto, kaufdatum, wbw_manuell_gesetzt, wiederbeschaffungswert')
    .in('id', unitIds);
  const unitMap = new Map(
    (units ?? []).map((u) => [(u as { id: string }).id, u as {
      id: string;
      kaufpreis_netto: number | null;
      kaufdatum: string | null;
      wbw_manuell_gesetzt: boolean;
      wiederbeschaffungswert: number | null;
    }]),
  );

  let linked = 0;
  const failed: string[] = [];
  for (const c of cleanItems) {
    const u = unitMap.get(c.unitId);
    if (!u) { failed.push(c.unitId); continue; }

    const { error: insErr } = await supabase.from('inventar_verknuepfung').insert({
      beleg_position_id: positionId,
      inventar_unit_id: c.unitId,
      stueck_anteil: 1,
    });
    if (insErr && insErr.code !== '23505') {
      failed.push(c.unitId);
      continue;
    }

    const update: Record<string, unknown> = { beleg_status: 'verknuepft' };
    if (u.kaufpreis_netto === null || u.kaufpreis_netto === undefined) {
      update.kaufpreis_netto = anschaffung;
    }
    if (!u.kaufdatum && belegDatum) {
      update.kaufdatum = belegDatum;
    }
    if (c.wbw !== null) {
      // Admin hat einen Einzelwert vorgegeben → manueller WBW-Override.
      update.wiederbeschaffungswert = c.wbw;
      update.wbw_manuell_gesetzt = true;
    } else if (!u.wbw_manuell_gesetzt && (u.wiederbeschaffungswert === null || u.wiederbeschaffungswert === undefined)) {
      // Kein Einzelwert → wie Einzel-Verknüpfung: WBW aus Beleg initialisieren,
      // wbw_manuell_gesetzt bleibt false, damit die Formel weiter greift.
      update.wiederbeschaffungswert = anschaffung;
      update.wbw_manuell_gesetzt = false;
    }

    const { error: updErr } = await supabase
      .from('inventar_units').update(update).eq('id', c.unitId);
    if (updErr) { failed.push(c.unitId); continue; }
    linked++;
  }

  await logAudit({
    action: 'inventar.verknuepfen_bulk',
    entityType: 'beleg_position',
    entityId: positionId,
    changes: { linked, mit_wbw: cleanItems.filter((c) => c.wbw !== null).length, failed: failed.length },
    request: req,
  });

  return NextResponse.json({ ok: true, linked, failed });
}

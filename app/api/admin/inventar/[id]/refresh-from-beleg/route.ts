import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/inventar/[id]/refresh-from-beleg
 *
 * Rechnet kaufpreis_netto + wiederbeschaffungswert (sofern KEIN Override
 * gesetzt) der Unit aus der ersten verknuepften beleg_position neu.
 *
 * Bei Kleinunternehmer-Modus wird brutto (netto * (1 + mwst/100)) als
 * Anschaffungswert geschrieben — Vorsteuer ist nicht abziehbar, also ist
 * der wirtschaftliche Anschaffungswert der Brutto-Betrag.
 *
 * Wird vom UI-Button "Aus Beleg neu berechnen" gerufen, damit Bestands-
 * Units (die vor dem Brutto-Fix verknuepft wurden) korrigiert werden
 * koennen, ohne die Verknuepfung loeschen + neu anlegen zu muessen.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Erste Verknuepfung der Unit holen
  const { data: link } = await supabase
    .from('inventar_verknuepfung')
    .select('beleg_position_id')
    .eq('inventar_unit_id', id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!link?.beleg_position_id) {
    return NextResponse.json({ error: 'Keine Beleg-Verknuepfung vorhanden — bitte zuerst einen Beleg verknuepfen.' }, { status: 400 });
  }

  const { data: position, error: pErr } = await supabase
    .from('beleg_positionen')
    .select('id, einzelpreis_netto, mwst_satz, beleg:belege(id, beleg_datum)')
    .eq('id', link.beleg_position_id)
    .single();
  if (pErr || !position) {
    return NextResponse.json({ error: 'Verknuepfte Position nicht gefunden' }, { status: 404 });
  }

  const { data: unit, error: uErr } = await supabase
    .from('inventar_units').select('wbw_manuell_gesetzt').eq('id', id).single();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 404 });

  // Steuermodus laden
  const { data: taxRow } = await supabase
    .from('admin_settings').select('value').eq('key', 'tax_mode').maybeSingle();
  const taxMode = (typeof taxRow?.value === 'object' && (taxRow!.value as { mode?: string }).mode === 'regelbesteuerung')
    || (typeof taxRow?.value === 'string' && taxRow.value === 'regelbesteuerung')
    ? 'regelbesteuerung'
    : 'kleinunternehmer';

  const positionNetto = Number((position as { einzelpreis_netto: number }).einzelpreis_netto);
  const positionMwst = Number((position as { mwst_satz: number | null }).mwst_satz ?? 0);
  const anschaffungsWert = taxMode === 'kleinunternehmer'
    ? positionNetto * (1 + positionMwst / 100)
    : positionNetto;
  const anschaffungsWertRounded = Math.round(anschaffungsWert * 100) / 100;

  const beleg = (position as unknown as { beleg: { beleg_datum: string } }).beleg;
  const update: Record<string, unknown> = {
    kaufpreis_netto: anschaffungsWertRounded,
  };
  if (beleg?.beleg_datum) {
    update.kaufdatum = beleg.beleg_datum;
  }
  // WBW nur ueberschreiben wenn KEIN manueller Override gesetzt
  if (!(unit as { wbw_manuell_gesetzt: boolean }).wbw_manuell_gesetzt) {
    update.wiederbeschaffungswert = anschaffungsWertRounded;
  }

  const { error: updErr } = await supabase
    .from('inventar_units').update(update).eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logAudit({
    action: 'inventar.refresh_from_beleg',
    entityType: 'inventar_unit',
    entityId: id,
    changes: {
      tax_mode: taxMode,
      mwst_satz: positionMwst,
      einzelpreis_netto: positionNetto,
      kaufpreis_neu: anschaffungsWertRounded,
    },
    request: req,
  });

  return NextResponse.json({
    ok: true,
    kaufpreis_netto: anschaffungsWertRounded,
    tax_mode: taxMode,
    used_brutto: taxMode === 'kleinunternehmer',
  });
}

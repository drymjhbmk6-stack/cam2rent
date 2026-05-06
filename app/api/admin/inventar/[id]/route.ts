import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { mirrorInventarToLegacy, deleteMirror } from '@/lib/inventar-mirror';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: unit, error } = await supabase
    .from('inventar_units')
    .select('*, produkt:produkte(id,name,marke,modell,bild_url)')
    .eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Verknuepfungen zu Belegen
  const { data: links } = await supabase
    .from('inventar_verknuepfung')
    .select('id, stueck_anteil, beleg_position:beleg_positionen(id, bezeichnung, beleg:belege(id, beleg_nr, beleg_datum, lieferant:lieferanten(name)))')
    .eq('inventar_unit_id', id);

  return NextResponse.json({ unit, links: links ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const supabase = createServiceClient();
  const update: Record<string, unknown> = {};
  for (const k of [
    'bezeichnung', 'produkt_id', 'seriennummer', 'inventar_code', 'bestand',
    'status', 'notizen', 'kaufpreis_netto', 'kaufdatum',
  ]) {
    if (k in body) update[k] = body[k];
  }
  // WBW-Override: zwei Felder gehoeren zusammen
  if (typeof body.wiederbeschaffungswert === 'number') {
    update.wiederbeschaffungswert = body.wiederbeschaffungswert;
    update.wbw_manuell_gesetzt = true;
  } else if (body.wiederbeschaffungswert === null) {
    // Override entfernen
    update.wiederbeschaffungswert = null;
    update.wbw_manuell_gesetzt = false;
  }

  const { data, error } = await supabase
    .from('inventar_units').update(update).eq('id', id).select('*').single();
  if (error) {
    if (error.code === '23505') {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('seriennummer')) {
        return NextResponse.json(
          { error: 'Diese Seriennummer ist bereits vergeben. Seriennummern muessen systemweit eindeutig sein.' },
          { status: 409 },
        );
      }
      if (msg.includes('inventar_code')) {
        return NextResponse.json(
          { error: 'Dieser Inventar-Code ist bereits vergeben. Inventar-Codes muessen systemweit eindeutig sein.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: 'Ein eindeutiges Feld ist bereits vergeben.', detail: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mirror synchronisieren — bei produkt_id-Aenderung wird ggf. neu gespiegelt,
  // bei Status-Aenderung wird der bestehende Mirror aktualisiert.
  await mirrorInventarToLegacy(supabase, data).catch((e) => {
    console.error('[inventar PATCH] mirror failed:', e);
  });

  await logAudit({ action: 'inventar.update', entityType: 'inventar_unit', entityId: id, changes: update, request: req });
  return NextResponse.json({ unit: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  // Sicherheit: nur loeschen wenn nie vermietet (status=verfuegbar)
  const { data: unit } = await supabase.from('inventar_units').select('status').eq('id', id).single();
  if (unit && (unit as { status: string }).status === 'vermietet') {
    return NextResponse.json({ error: 'Stueck ist vermietet — kann nicht geloescht werden' }, { status: 409 });
  }
  // Mirror in alter Welt zuerst entfernen — sonst bleiben Waisen-Eintraege.
  await deleteMirror(supabase, id).catch((e) => {
    console.error('[inventar DELETE] mirror cleanup failed:', e);
  });
  const { error } = await supabase.from('inventar_units').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ action: 'inventar.delete', entityType: 'inventar_unit', entityId: id, request: req });
  return NextResponse.json({ ok: true });
}

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
    .select('id, einzelpreis_netto, beleg:belege(id, beleg_datum)')
    .eq('id', body.beleg_position_id)
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 });

  // Verknuepfung anlegen
  const { error: insErr } = await supabase.from('inventar_verknuepfung').insert({
    beleg_position_id: body.beleg_position_id,
    inventar_unit_id: id,
    stueck_anteil: body.stueck_anteil ?? 1,
  });
  if (insErr && insErr.code !== '23505') {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Unit-Felder updaten falls leer
  const update: Record<string, unknown> = { beleg_status: 'verknuepft' };
  const u = unit as { kaufpreis_netto: number | null; kaufdatum: string | null; wbw_manuell_gesetzt: boolean; wiederbeschaffungswert: number | null };
  const beleg = (position as unknown as { beleg: { beleg_datum: string } }).beleg;
  const positionPrice = Number((position as { einzelpreis_netto: number }).einzelpreis_netto);

  if (u.kaufpreis_netto === null || u.kaufpreis_netto === undefined) {
    update.kaufpreis_netto = positionPrice;
  }
  if (!u.kaufdatum && beleg?.beleg_datum) {
    update.kaufdatum = beleg.beleg_datum;
  }
  // WBW nur initialisieren wenn KEIN Override + WBW noch leer
  if (!u.wbw_manuell_gesetzt && (u.wiederbeschaffungswert === null || u.wiederbeschaffungswert === undefined)) {
    update.wiederbeschaffungswert = positionPrice;
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
  await logAudit({ action: 'inventar.verknuepfen.delete', entityType: 'inventar_unit', entityId: id, request: req });
  return NextResponse.json({ ok: true });
}

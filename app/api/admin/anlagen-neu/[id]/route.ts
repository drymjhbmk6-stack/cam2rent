import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

async function pickTable(supabase: ReturnType<typeof createServiceClient>): Promise<'assets_neu' | 'assets'> {
  const { error } = await supabase.from('assets_neu').select('id', { head: true }).limit(1);
  if (error && error.code === '42P01') return 'assets';
  return 'assets_neu';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const tabelle = await pickTable(supabase);

  const { data: asset, error } = await supabase
    .from(tabelle)
    .select('*, beleg_position:beleg_positionen(id, bezeichnung, beleg:belege(id, beleg_nr, beleg_datum, lieferant:lieferanten(name)))')
    .eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: afaHistory } = await supabase
    .from('afa_buchungen')
    .select('*')
    .eq('asset_id', id)
    .order('buchungsdatum', { ascending: false });

  // Inventar-Link uber beleg_position
  let inventarUnit = null;
  const belegPositionId = (asset as { beleg_position_id: string }).beleg_position_id;
  if (belegPositionId) {
    const { data: link } = await supabase
      .from('inventar_verknuepfung')
      .select('inventar_unit:inventar_units(id, bezeichnung, inventar_code, seriennummer)')
      .eq('beleg_position_id', belegPositionId)
      .limit(1).maybeSingle();
    if (link) inventarUnit = (link as { inventar_unit: { id: string } | null }).inventar_unit;
  }

  return NextResponse.json({ asset, afa_history: afaHistory ?? [], inventar_unit: inventarUnit });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const supabase = createServiceClient();
  const tabelle = await pickTable(supabase);

  // Erlaubt: status (verkauft/ausgemustert/verloren), restwert, notizen
  const update: Record<string, unknown> = {};
  for (const k of ['status', 'restwert', 'notizen']) {
    if (k in body) update[k] = body[k];
  }

  // Sonder-AfA bei Status-Wechsel zu verkauft/ausgemustert/verloren
  if (typeof update.status === 'string' && ['verkauft', 'ausgemustert', 'verloren'].includes(update.status as string)) {
    const { data: current } = await supabase
      .from(tabelle).select('aktueller_buchwert, restwert').eq('id', id).single();
    if (current) {
      const buchwert = Number((current as { aktueller_buchwert: number }).aktueller_buchwert);
      const restwert = update.restwert !== undefined ? Number(update.restwert) : Number((current as { restwert: number }).restwert);
      const sonderafa = Math.round((buchwert - restwert) * 100) / 100;
      if (sonderafa > 0) {
        await supabase.from('afa_buchungen').insert({
          asset_id: id,
          buchungsdatum: new Date().toISOString().slice(0, 10),
          afa_betrag: sonderafa,
          buchwert_nach: restwert,
          typ: 'sonderafa',
          notizen: `Status-Wechsel zu ${update.status}`,
        });
      }
      update.aktueller_buchwert = restwert;
    }
  }

  const { data, error } = await supabase
    .from(tabelle).update(update).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ action: 'asset.update', entityType: 'asset', entityId: id, changes: update, request: req });
  return NextResponse.json({ asset: data });
}

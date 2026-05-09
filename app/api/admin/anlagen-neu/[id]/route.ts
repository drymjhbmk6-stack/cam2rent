import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

function isMissingTableError(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202') return true;
  if (typeof e.message === 'string' && /could not find the table .* in the schema cache/i.test(e.message)) return true;
  return false;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Beide Tabellen probieren — kein FK-Join (siehe anlagen-neu/route.ts).
  let { data: asset, error } = await supabase
    .from('assets').select('*').eq('id', id).maybeSingle();
  if (isMissingTableError(error) || !asset) {
    const r2 = await supabase.from('assets_neu').select('*').eq('id', id).maybeSingle();
    if (!isMissingTableError(r2.error) && r2.data) {
      asset = r2.data;
      error = null;
    }
  }
  if (!asset) return NextResponse.json({ error: 'Asset nicht gefunden' }, { status: 404 });

  // Beleg-Position + Beleg + Lieferant separat laden
  const belegPositionId = (asset as { beleg_position_id: string }).beleg_position_id;
  let belegPosition: unknown = null;
  if (belegPositionId) {
    const { data: pos } = await supabase
      .from('beleg_positionen').select('id, bezeichnung, beleg_id').eq('id', belegPositionId).maybeSingle();
    if (pos) {
      const p = pos as { id: string; bezeichnung: string; beleg_id: string };
      const { data: beleg } = await supabase
        .from('belege').select('id, beleg_nr, beleg_datum, lieferant_id').eq('id', p.beleg_id).maybeSingle();
      const b = beleg as { id: string; beleg_nr: string; beleg_datum: string; lieferant_id: string | null } | null;
      let lieferant: { name: string } | null = null;
      if (b?.lieferant_id) {
        const { data: lf } = await supabase
          .from('lieferanten').select('name').eq('id', b.lieferant_id).maybeSingle();
        if (lf) lieferant = lf as { name: string };
      }
      belegPosition = {
        id: p.id,
        bezeichnung: p.bezeichnung,
        beleg: b ? { id: b.id, beleg_nr: b.beleg_nr, beleg_datum: b.beleg_datum, lieferant } : null,
      };
    }
  }
  asset = { ...(asset as Record<string, unknown>), beleg_position: belegPosition };

  const { data: afaHistory } = await supabase
    .from('afa_buchungen')
    .select('*')
    .eq('asset_id', id)
    .order('buchungsdatum', { ascending: false });

  // Inventar-Link uber beleg_position
  let inventarUnit = null;
  if (belegPositionId) {
    const { data: link } = await supabase
      .from('inventar_verknuepfung')
      .select('inventar_unit_id')
      .eq('beleg_position_id', belegPositionId)
      .limit(1).maybeSingle();
    const invId = link ? (link as { inventar_unit_id: string }).inventar_unit_id : null;
    if (invId) {
      const { data: unit } = await supabase
        .from('inventar_units').select('id, bezeichnung, inventar_code, seriennummer').eq('id', invId).maybeSingle();
      if (unit) inventarUnit = unit;
    }
  }

  return NextResponse.json({ asset, afa_history: afaHistory ?? [], inventar_unit: inventarUnit });
}

async function pickTable(supabase: ReturnType<typeof createServiceClient>): Promise<'assets_neu' | 'assets'> {
  // Probe-fallback fuer PATCH (Update). Wenn assets_neu wirklich nicht
  // existiert, nimm assets — sonst assets_neu.
  const { error } = await supabase.from('assets_neu').select('id', { head: true }).limit(1);
  if (isMissingTableError(error)) return 'assets';
  return 'assets_neu';
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

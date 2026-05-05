import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { recomputeBelegSummen, sanitizePosition } from '@/lib/buchhaltung/beleg-utils';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: pos } = await supabase
    .from('beleg_positionen').select('id, beleg_id, locked').eq('id', id).single();
  if (!pos) return NextResponse.json({ error: 'Position nicht gefunden' }, { status: 404 });
  if ((pos as { locked: boolean }).locked) {
    return NextResponse.json({ error: 'Position ist gesperrt (Beleg festgeschrieben)' }, { status: 409 });
  }

  const update: Record<string, unknown> = {};
  for (const k of [
    'bezeichnung', 'menge', 'einzelpreis_netto', 'mwst_satz',
    'klassifizierung', 'kategorie', 'notizen', 'reihenfolge', 'folgekosten_asset_id',
  ]) {
    if (k in body) update[k] = body[k];
  }
  // Sanitize numeric/text-Felder
  if (typeof update.einzelpreis_netto === 'number') {
    update.einzelpreis_netto = Math.round(update.einzelpreis_netto * 100) / 100;
  }
  if (typeof update.menge === 'number') update.menge = Math.max(1, Math.floor(update.menge));
  if (typeof update.mwst_satz === 'number') {
    update.mwst_satz = Math.max(0, Math.min(100, Math.round(update.mwst_satz * 100) / 100));
  }
  if (typeof update.bezeichnung === 'string') update.bezeichnung = update.bezeichnung.trim().slice(0, 500);

  const { data, error } = await supabase
    .from('beleg_positionen').update(update).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recomputeBelegSummen(supabase, (pos as { beleg_id: string }).beleg_id);
  await logAudit({ action: 'beleg_position.update', entityType: 'beleg_position', entityId: id, changes: update, request: req });
  return NextResponse.json({ position: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: pos } = await supabase
    .from('beleg_positionen').select('id, beleg_id, locked').eq('id', id).single();
  if (!pos) return NextResponse.json({ error: 'nicht gefunden' }, { status: 404 });
  if ((pos as { locked: boolean }).locked) {
    return NextResponse.json({ error: 'Position gesperrt' }, { status: 409 });
  }
  const { error } = await supabase.from('beleg_positionen').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recomputeBelegSummen(supabase, (pos as { beleg_id: string }).beleg_id);
  await logAudit({ action: 'beleg_position.delete', entityType: 'beleg_position', entityId: id, request: req });
  return NextResponse.json({ ok: true });
}

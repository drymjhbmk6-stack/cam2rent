import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { recomputeBelegSummen } from '@/lib/buchhaltung/beleg-utils';

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

  return NextResponse.json({ beleg, positionen: positionen ?? [], anhaenge: anhaenge ?? [] });
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

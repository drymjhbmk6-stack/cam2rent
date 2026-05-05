import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  const supabase = createServiceClient();
  const update: Record<string, unknown> = {};
  for (const k of ['name', 'adresse', 'ust_id', 'email', 'notizen']) {
    if (k in body) update[k] = body[k];
  }
  const { data, error } = await supabase
    .from('lieferanten').update(update).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ action: 'lieferant.update', entityType: 'lieferant', entityId: id, changes: update, request: req });
  return NextResponse.json({ lieferant: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();
  // Pruefen ob noch belege darauf zeigen
  const { count } = await supabase
    .from('belege').select('*', { count: 'exact', head: true }).eq('lieferant_id', id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Nicht loeschbar: ${count} Belege verweisen noch auf diesen Lieferanten` },
      { status: 409 },
    );
  }
  const { error } = await supabase.from('lieferanten').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ action: 'lieferant.delete', entityType: 'lieferant', entityId: id, request: req });
  return NextResponse.json({ ok: true });
}

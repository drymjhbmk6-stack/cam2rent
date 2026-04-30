import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const EDITABLE = new Set(['name', 'mood', 'attribution', 'is_default']);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE.has(k)) update[k] = v;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Keine zulaessigen Felder' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Wenn is_default=true gesetzt wird, alle anderen auf false setzen
  if (update.is_default === true) {
    await supabase.from('social_reel_music').update({ is_default: false }).neq('id', id);
  }

  const { data, error } = await supabase.from('social_reel_music').update(update).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'reel_music.update',
    entityType: 'reel_music',
    entityId: id,
    changes: update,
    request: req,
  });

  return NextResponse.json({ track: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const supabase = createServiceClient();
  const { data: track } = await supabase.from('social_reel_music').select('storage_path').eq('id', id).maybeSingle();

  // Storage-Datei entfernen falls vorhanden
  if (track?.storage_path) {
    await supabase.storage.from('social-reels').remove([track.storage_path]).catch(() => {});
  }

  const { error } = await supabase.from('social_reel_music').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'reel_music.delete',
    entityType: 'reel_music',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}

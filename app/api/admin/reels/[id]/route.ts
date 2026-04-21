import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { deleteFacebookPost, deleteInstagramPost } from '@/lib/meta/graph-api';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/** GET /api/admin/reels/[id] */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_reels').select('*').eq('id', id).single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Nicht gefunden' }, { status: 404 });
  return NextResponse.json({ reel: data });
}

const EDITABLE_FIELDS = new Set([
  'caption',
  'hashtags',
  'link_url',
  'platforms',
  'fb_account_id',
  'ig_account_id',
  'scheduled_at',
  'status',
]);

/** PATCH /api/admin/reels/[id] */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE_FIELDS.has(k)) update[k] = v;
  }

  // Status-Whitelist — damit das Frontend nicht in illegale Zustände springt
  if (typeof update.status === 'string') {
    const allowed = ['draft', 'pending_review', 'approved', 'scheduled', 'failed'];
    if (!allowed.includes(update.status as string)) {
      return NextResponse.json({ error: `Status "${update.status}" nicht erlaubt via PATCH` }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Keine zulässigen Felder' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_reels').update(update).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'reel.update',
    entityType: 'social_reel',
    entityId: id,
    changes: update as Record<string, unknown>,
    request: req,
  });

  return NextResponse.json({ reel: data });
}

/** DELETE /api/admin/reels/[id]?remote=1 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const removeRemote = url.searchParams.get('remote') === '1';

  const supabase = createServiceClient();
  const { data: reel } = await supabase.from('social_reels').select('*').eq('id', id).single();

  // Optional: auf Meta löschen
  const remoteErrors: string[] = [];
  if (removeRemote && reel) {
    try {
      if (reel.fb_reel_id && reel.fb_account_id) {
        const { data: acc } = await supabase.from('social_accounts').select('access_token').eq('id', reel.fb_account_id).single();
        if (acc?.access_token) await deleteFacebookPost(reel.fb_reel_id, acc.access_token);
      }
    } catch (e) {
      remoteErrors.push(`FB: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    try {
      if (reel.ig_reel_id && reel.ig_account_id) {
        const { data: acc } = await supabase.from('social_accounts').select('access_token').eq('id', reel.ig_account_id).single();
        if (acc?.access_token) await deleteInstagramPost(reel.ig_reel_id, acc.access_token);
      }
    } catch (e) {
      remoteErrors.push(`IG: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  // Storage-Files aufräumen (best-effort)
  try {
    await supabase.storage.from('social-reels').remove([`${id}/video.mp4`, `${id}/thumb.jpg`]);
  } catch {
    /* ignore */
  }

  const { error } = await supabase.from('social_reels').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message, remoteErrors }, { status: 500 });

  await logAudit({
    action: 'reel.delete',
    entityType: 'social_reel',
    entityId: id,
    entityLabel: reel?.caption?.slice(0, 60),
    request: req,
  });

  return NextResponse.json({ success: true, remoteErrors });
}

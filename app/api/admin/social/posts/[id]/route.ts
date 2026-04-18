import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { deleteFacebookPost, deleteInstagramPost } from '@/lib/meta/graph-api';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_posts').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ post: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    'caption', 'hashtags', 'media_urls', 'media_type', 'link_url',
    'platforms', 'fb_account_id', 'ig_account_id',
    'status', 'scheduled_at',
  ];
  const updates: Record<string, unknown> = {};
  for (const k of allowedFields) {
    if (k in body) updates[k] = body[k];
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_posts').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

/** DELETE: Aus DB löschen + ggf. auf FB/IG entfernen */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const alsoDeleteRemote = url.searchParams.get('remote') === '1';

  const supabase = createServiceClient();
  const { data: post } = await supabase.from('social_posts').select('*, fb_account:social_accounts!fb_account_id(access_token), ig_account:social_accounts!ig_account_id(access_token)').eq('id', id).single();

  if (post && alsoDeleteRemote) {
    type AccRef = { access_token: string } | null;
    const p = post as unknown as { fb_post_id?: string | null; ig_post_id?: string | null; fb_account: AccRef; ig_account: AccRef };

    if (p.fb_post_id && p.fb_account?.access_token) {
      try { await deleteFacebookPost(p.fb_post_id, p.fb_account.access_token); } catch {}
    }
    if (p.ig_post_id && p.ig_account?.access_token) {
      try { await deleteInstagramPost(p.ig_post_id, p.ig_account.access_token); } catch {}
    }
  }

  const { error } = await supabase.from('social_posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

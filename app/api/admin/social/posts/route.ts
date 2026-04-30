import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/** GET /api/admin/social/posts?status=&limit=&offset= */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const offset = Number(url.searchParams.get('offset') ?? '0');

  const supabase = createServiceClient();
  let query = supabase
    .from('social_posts')
    .select('*, fb_account:social_accounts!fb_account_id(name,username), ig_account:social_accounts!ig_account_id(name,username)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [], total: count ?? 0 });
}

/** POST /api/admin/social/posts  → Entwurf anlegen oder Post planen/sofort posten */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    caption = '',
    hashtags = [],
    media_urls = [],
    media_type = 'image',
    link_url = null,
    platforms = [],
    fb_account_id = null,
    ig_account_id = null,
    status = 'draft',
    scheduled_at = null,
    source_type = 'manual',
    source_id = null,
    template_id = null,
    ai_generated = false,
    ai_prompt = null,
    ai_model = null,
    fb_image_position = 'center center',
    ig_image_position = 'center center',
  } = body;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('social_posts')
    .insert({
      caption,
      hashtags,
      media_urls,
      media_type,
      link_url,
      platforms,
      fb_account_id,
      ig_account_id,
      status,
      scheduled_at,
      source_type,
      source_id,
      template_id,
      ai_generated,
      ai_prompt,
      ai_model,
      fb_image_position,
      ig_image_position,
      created_by: 'admin',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'social_post.create',
    entityType: 'social_post',
    entityId: data?.id,
    changes: { status, platforms, scheduled_at, ai_generated },
    request: req,
  });

  return NextResponse.json({ post: data });
}

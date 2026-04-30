import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/blog/posts/[id] */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*, blog_categories(id, name, slug, color)')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ post: data });
}

/** PUT /api/admin/blog/posts/[id] */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const supabase = createServiceClient();

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  const fields = [
    'title', 'slug', 'content', 'excerpt', 'featured_image', 'featured_image_alt',
    'category_id', 'tags', 'status', 'seo_title', 'seo_description', 'author',
    'ai_generated', 'ai_prompt', 'ai_model', 'reading_time_min', 'scheduled_at',
  ];

  for (const f of fields) {
    if (f in body) updates[f] = body[f];
  }

  // published_at setzen wenn Status auf published wechselt
  if (body.status === 'published' && !body.keep_published_at) {
    // Aktuellen Status prüfen
    const { data: current } = await supabase
      .from('blog_posts')
      .select('status, published_at')
      .eq('id', id)
      .single();
    if (current && current.status !== 'published') {
      updates.published_at = now;
    }
  }

  const { data, error } = await supabase
    .from('blog_posts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const isPublishAction = updates.published_at != null && body.status === 'published';
  await logAudit({
    action: isPublishAction ? 'blog_post.publish' : 'blog_post.update',
    entityType: 'blog_post',
    entityId: id,
    entityLabel: data?.title,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ post: data });
}

/** DELETE /api/admin/blog/posts/[id] */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('blog_posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'blog_post.delete',
    entityType: 'blog_post',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}

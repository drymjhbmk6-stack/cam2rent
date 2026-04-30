import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/admin/blog/series/[id] */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  for (const f of ['title', 'slug', 'description', 'category_id', 'tone', 'target_length', 'status']) {
    if (f in body) updates[f] = body[f];
  }

  const { data, error } = await supabase
    .from('blog_series')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'blog_series.update',
    entityType: 'blog_series',
    entityId: id,
    entityLabel: data?.title,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ series: data });
}

/** DELETE /api/admin/blog/series/[id] */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('blog_series').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'blog_series.delete',
    entityType: 'blog_series',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}

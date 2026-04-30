import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/admin/blog/categories/[id] */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  for (const f of ['name', 'slug', 'description', 'color', 'sort_order']) {
    if (f in body) updates[f] = body[f];
  }

  const { data, error } = await supabase
    .from('blog_categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'blog_category.update',
    entityType: 'blog_category',
    entityId: id,
    entityLabel: data?.name,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ category: data });
}

/** DELETE /api/admin/blog/categories/[id] */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('blog_categories').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'blog_category.delete',
    entityType: 'blog_category',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}

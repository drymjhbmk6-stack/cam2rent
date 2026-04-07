import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

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
  return NextResponse.json({ category: data });
}

/** DELETE /api/admin/blog/categories/[id] */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('blog_categories').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

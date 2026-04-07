import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

type Ctx = { params: Promise<{ slug: string }> };

/** GET /api/blog/posts/[slug] - Einzelner Blog-Post (public) */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('*, blog_categories(id, name, slug, color)')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Artikel nicht gefunden.' }, { status: 404 });
  }

  // View-Count erhoehen (fire-and-forget)
  supabase
    .from('blog_posts')
    .update({ view_count: (data.view_count ?? 0) + 1 })
    .eq('id', data.id)
    .then(() => {});

  return NextResponse.json({ post: data });
}

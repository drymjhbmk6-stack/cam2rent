import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { trackBlogView } from '@/lib/blog-view-tracking';

type Ctx = { params: Promise<{ slug: string }> };

/** GET /api/blog/posts/[slug] - Einzelner Blog-Post (public) */
export async function GET(req: NextRequest, ctx: Ctx) {
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

  // View-Count + zeitgestempeltes Event (fire-and-forget). Bot vs. Mensch
  // getrennt gezählt über den User-Agent — siehe lib/blog-view-tracking.ts.
  trackBlogView(supabase, {
    postId: data.id,
    slug,
    userAgent: req.headers.get('user-agent'),
    currentViewCount: data.view_count ?? 0,
  });

  return NextResponse.json({ post: data });
}

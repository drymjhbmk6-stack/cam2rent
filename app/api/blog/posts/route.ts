import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/** GET /api/blog/posts - Oeffentliche Blog-Liste */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '9');
  const category = searchParams.get('category');

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = createServiceClient();
  let query = supabase
    .from('blog_posts')
    .select('id, title, slug, excerpt, featured_image, featured_image_alt, tags, author, reading_time_min, published_at, category_id, blog_categories(id, name, slug, color)', { count: 'exact' })
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(from, to);

  if (category) {
    // Kategorie per Slug filtern
    const { data: cat } = await supabase
      .from('blog_categories')
      .select('id')
      .eq('slug', category)
      .single();
    if (cat) {
      query = query.eq('category_id', cat.id);
    }
  }

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    posts: data ?? [],
    total: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

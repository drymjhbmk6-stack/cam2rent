import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET  /api/admin/blog/posts  → Alle Posts (mit Filter)
 * POST /api/admin/blog/posts  → Neuen Post erstellen
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const category = searchParams.get('category');
  const search = searchParams.get('search');

  const supabase = createServiceClient();
  let query = supabase
    .from('blog_posts')
    .select('*, blog_categories(id, name, slug, color)')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (category) {
    query = query.eq('category_id', category);
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title, slug, content, excerpt, featured_image, featured_image_alt,
    category_id, tags, status, seo_title, seo_description, author,
    ai_generated, ai_prompt, ai_model, reading_time_min,
    scheduled_at,
  } = body;

  if (!title || !slug) {
    return NextResponse.json({ error: 'Titel und Slug sind erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Slug-Duplikat prüfen
  const { data: existing } = await supabase
    .from('blog_posts')
    .select('id')
    .eq('slug', slug.trim())
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Ein Artikel mit diesem Slug existiert bereits.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('blog_posts')
    .insert({
      title: title.trim(),
      slug: slug.trim(),
      content: content ?? '',
      excerpt: excerpt ?? '',
      featured_image: featured_image || null,
      featured_image_alt: featured_image_alt ?? '',
      category_id: category_id || null,
      tags: tags ?? [],
      status: status ?? 'draft',
      seo_title: seo_title || null,
      seo_description: seo_description || null,
      author: author ?? 'cam2rent',
      ai_generated: ai_generated ?? false,
      ai_prompt: ai_prompt || null,
      ai_model: ai_model || null,
      reading_time_min: reading_time_min ?? 5,
      published_at: status === 'published' ? now : null,
      scheduled_at: status === 'scheduled' ? scheduled_at : null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

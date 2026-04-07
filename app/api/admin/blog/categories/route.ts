import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/** GET /api/admin/blog/categories */
export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('blog_categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data ?? [] });
}

/** POST /api/admin/blog/categories */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, slug, description, color, sort_order } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: 'Name und Slug sind erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('blog_categories')
    .insert({
      name: name.trim(),
      slug: slug.trim(),
      description: description ?? '',
      color: color ?? '#06b6d4',
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}

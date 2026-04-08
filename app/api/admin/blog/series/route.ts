import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/** GET /api/admin/blog/series */
export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('blog_series')
    .select('*, blog_categories(id, name, slug, color), blog_series_parts(id, part_number, topic, used, post_id)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ series: data ?? [] });
}

/** POST /api/admin/blog/series — Neue Serie mit Teilen erstellen */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, slug, description, category_id, tone, target_length, parts } = body;

  if (!title || !slug || !parts?.length) {
    return NextResponse.json({ error: 'Titel, Slug und mindestens ein Teil sind erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Serie erstellen
  const { data: series, error: seriesError } = await supabase
    .from('blog_series')
    .insert({
      title: title.trim(),
      slug: slug.trim(),
      description: description ?? '',
      category_id: category_id || null,
      tone: tone ?? 'informativ',
      target_length: target_length ?? 'mittel',
      total_parts: parts.length,
      generated_parts: 0,
      status: 'active',
    })
    .select()
    .single();

  if (seriesError) return NextResponse.json({ error: seriesError.message }, { status: 500 });

  // Teile erstellen
  const partsData = parts.map((p: { topic: string; keywords?: string[] }, i: number) => ({
    series_id: series.id,
    part_number: i + 1,
    topic: p.topic.trim(),
    keywords: p.keywords ?? [],
    used: false,
  }));

  const { error: partsError } = await supabase.from('blog_series_parts').insert(partsData);
  if (partsError) return NextResponse.json({ error: partsError.message }, { status: 500 });

  return NextResponse.json({ series });
}

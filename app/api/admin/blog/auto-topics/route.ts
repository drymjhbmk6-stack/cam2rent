import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/** GET /api/admin/blog/auto-topics */
export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('blog_auto_topics')
    .select('*, blog_categories(id, name, slug, color)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topics: data ?? [] });
}

/** POST /api/admin/blog/auto-topics */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { topic, keywords, category_id, tone, target_length } = body;

  if (!topic) {
    return NextResponse.json({ error: 'Thema ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('blog_auto_topics')
    .insert({
      topic: topic.trim(),
      keywords: keywords ?? [],
      category_id: category_id || null,
      tone: tone ?? 'informativ',
      target_length: target_length ?? 'mittel',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topic: data });
}

/** DELETE /api/admin/blog/auto-topics */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('blog_auto_topics').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

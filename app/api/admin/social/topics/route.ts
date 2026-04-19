import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/** GET /api/admin/social/topics — Themenpool laden (used + offene) */
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('social_topics')
    .select('*')
    .order('used', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topics: data ?? [] });
}

/** POST — einzelnes Thema anlegen */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_topics').insert({
    topic: body.topic,
    angle: body.angle ?? null,
    keywords: body.keywords ?? [],
    category: body.category ?? null,
    platforms: body.platforms ?? ['facebook', 'instagram'],
    with_image: body.with_image ?? true,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topic: data });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/** GET — Redaktionsplan-Eintraege */
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const fromDate = url.searchParams.get('from'); // YYYY-MM-DD
  const toDate = url.searchParams.get('to');

  const supabase = createServiceClient();
  let q = supabase
    .from('social_editorial_plan')
    .select('*, post:social_posts(id, caption, status, published_at), series:social_series(id, title), series_part:social_series_parts(id, part_number, topic)')
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
    .order('sort_order', { ascending: true });

  if (status) q = q.eq('status', status);
  if (fromDate) q = q.gte('scheduled_date', fromDate);
  if (toDate) q = q.lte('scheduled_date', toDate);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data ?? [] });
}

/** POST — neuen Eintrag anlegen (oder aus Topic/Series-Part importieren) */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('social_editorial_plan').insert({
    topic: body.topic,
    angle: body.angle ?? null,
    prompt: body.prompt ?? null,
    keywords: body.keywords ?? [],
    category: body.category ?? null,
    template_id: body.template_id ?? null,
    series_id: body.series_id ?? null,
    series_part_id: body.series_part_id ?? null,
    platforms: body.platforms ?? ['facebook', 'instagram'],
    with_image: body.with_image ?? true,
    scheduled_date: body.scheduled_date,
    scheduled_time: body.scheduled_time ?? '10:00',
    sort_order: body.sort_order ?? 0,
    status: 'planned',
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Wenn aus Themenpool importiert: als used markieren
  if (body.from_topic_id) {
    await supabase.from('social_topics').update({
      used: true,
      used_at: new Date().toISOString(),
    }).eq('id', body.from_topic_id);
  }

  return NextResponse.json({ entry: data });
}

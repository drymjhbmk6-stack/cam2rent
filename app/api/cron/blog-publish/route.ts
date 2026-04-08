import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/** POST /api/cron/blog-publish - Geplante Posts veroeffentlichen */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Alle geplanten Artikel veroeffentlichen deren scheduled_at erreicht ist
  const { data, error } = await supabase
    .from('blog_posts')
    .update({ status: 'published', published_at: now, updated_at: now })
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .select('id, title, slug, schedule_id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Zugehoerige Schedule-Eintraege als "published" markieren
  const scheduleIds = (data ?? []).map((p) => p.schedule_id).filter(Boolean);
  if (scheduleIds.length > 0) {
    await supabase
      .from('blog_schedule')
      .update({ status: 'published' })
      .in('id', scheduleIds);
  }

  return NextResponse.json({
    published: data?.length ?? 0,
    posts: data ?? [],
  });
}

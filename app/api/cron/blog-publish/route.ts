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

  // Zugehoerige Schedule-Eintraege: loggen + loeschen
  const scheduleIds = (data ?? []).map((p) => p.schedule_id).filter(Boolean);
  if (scheduleIds.length > 0) {
    // Eintraege laden fuer das Log
    const { data: scheduleEntries } = await supabase
      .from('blog_schedule')
      .select('*')
      .in('id', scheduleIds);

    // In Aktivitaetsprotokoll loggen
    for (const entry of scheduleEntries ?? []) {
      const post = (data ?? []).find((p) => p.schedule_id === entry.id);
      await supabase.from('admin_audit_log').insert({
        action: 'blog_published',
        entity_type: 'blog_post',
        entity_id: post?.id ?? entry.id,
        details: JSON.stringify({
          topic: entry.topic,
          scheduled_date: entry.scheduled_date,
          scheduled_time: entry.scheduled_time,
          post_title: post?.title,
          post_slug: post?.slug,
          published_at: now,
        }),
      });
    }

    // Schedule-Eintraege loeschen
    await supabase
      .from('blog_schedule')
      .delete()
      .in('id', scheduleIds);
  }

  return NextResponse.json({
    published: data?.length ?? 0,
    posts: data ?? [],
  });
}

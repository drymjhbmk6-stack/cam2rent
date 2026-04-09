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

  // 1. Alle geplanten Artikel veroeffentlichen deren scheduled_at erreicht ist
  const { data, error } = await supabase
    .from('blog_posts')
    .update({ status: 'published', published_at: now, updated_at: now })
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .select('id, title, slug, schedule_id');

  // 2. Fix: Artikel die als 'draft' gespeichert wurden aber einen schedule_id haben
  // und deren Zeitplan-Datum faellig ist — auf published setzen
  const { data: draftFixes } = await supabase
    .from('blog_schedule')
    .select('id, post_id, scheduled_date, scheduled_time')
    .in('status', ['generated', 'reviewed'])
    .not('post_id', 'is', null)
    .lte('scheduled_date', now.split('T')[0]);

  const fixedPosts: { id: string; title: string; slug: string; schedule_id: string }[] = [];
  for (const entry of draftFixes ?? []) {
    const scheduleDateTime = `${entry.scheduled_date}T${(entry.scheduled_time || '09:00').slice(0, 5)}:00`;
    if (new Date(scheduleDateTime) <= new Date(now)) {
      const { data: fixed } = await supabase
        .from('blog_posts')
        .update({ status: 'published', published_at: now, updated_at: now, scheduled_at: scheduleDateTime })
        .eq('id', entry.post_id)
        .in('status', ['draft', 'generated'])
        .select('id, title, slug, schedule_id');
      if (fixed?.length) fixedPosts.push(...fixed.map((f) => ({ ...f, schedule_id: entry.id })));
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Alle veroeffentlichten Posts zusammenfuehren
  const allPublished = [...(data ?? []), ...fixedPosts];

  // Zugehoerige Schedule-Eintraege: loggen + loeschen
  const scheduleIds = allPublished.map((p) => p.schedule_id).filter(Boolean);
  if (scheduleIds.length > 0) {
    // Eintraege laden fuer das Log
    const { data: scheduleEntries } = await supabase
      .from('blog_schedule')
      .select('*')
      .in('id', scheduleIds);

    // In Aktivitaetsprotokoll loggen
    for (const entry of scheduleEntries ?? []) {
      const post = allPublished.find((p) => p.schedule_id === entry.id);
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
    published: allPublished.length,
    posts: allPublished,
    fixed: fixedPosts.length,
  });
}

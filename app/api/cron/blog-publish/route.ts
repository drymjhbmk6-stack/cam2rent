import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';

/** POST /api/cron/blog-publish - Geplante Posts veroeffentlichen */
export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Blog-Settings laden (Semi/Voll Modus)
  const { data: settingsData } = await supabase
    .from('admin_settings').select('value').eq('key', 'blog_settings').single();

  let autoMode = 'semi';
  if (settingsData?.value) {
    try {
      const parsed = typeof settingsData.value === 'string' ? JSON.parse(settingsData.value) : settingsData.value;
      autoMode = parsed.auto_generate_mode ?? 'semi';
    } catch { /* leer */ }
  }

  // 1. Geplante Artikel veroeffentlichen deren scheduled_at erreicht ist
  const publishQuery = supabase
    .from('blog_posts')
    .select('id, title, slug, schedule_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);

  // Im Semi-Modus: nur Artikel veroeffentlichen deren Zeitplan-Eintrag als "gesehen" markiert ist
  // oder die keinen Zeitplan-Eintrag haben (manuell geplante)
  const { data: scheduledPosts } = await publishQuery;

  const postsToPublish: string[] = [];
  for (const post of scheduledPosts ?? []) {
    if (!post.schedule_id) {
      // Kein Zeitplan-Eintrag — immer veroeffentlichen
      postsToPublish.push(post.id);
    } else if (autoMode === 'voll') {
      // Voll-Modus — immer veroeffentlichen
      postsToPublish.push(post.id);
    } else {
      // Semi-Modus — nur wenn "gesehen"
      const { data: schedEntry } = await supabase
        .from('blog_schedule').select('reviewed').eq('id', post.schedule_id).single();
      if (schedEntry?.reviewed) {
        postsToPublish.push(post.id);
      }
    }
  }

  let data: { id: string; title: string; slug: string; schedule_id: string | null }[] = [];
  let error = null;
  if (postsToPublish.length > 0) {
    const result = await supabase
      .from('blog_posts')
      .update({ status: 'published', published_at: now, updated_at: now })
      .in('id', postsToPublish)
      .select('id, title, slug, schedule_id');
    data = result.data ?? [];
    error = result.error;
  }

  // 2. Artikel aus dem Zeitplan veroeffentlichen
  // Semi-Modus: NUR wenn "gesehen" (reviewed = true)
  // Voll-Modus: Immer wenn Datum faellig
  const allowedStatuses = autoMode === 'semi'
    ? ['reviewed']  // Semi: nur gesehene
    : ['generated', 'reviewed'];  // Voll: alle fertigen

  const { data: draftFixes } = await supabase
    .from('blog_schedule')
    .select('id, post_id, scheduled_date, scheduled_time, reviewed')
    .in('status', allowedStatuses)
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

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/blog/schedule/backfill-published
 *
 * Trägt für bereits veröffentlichte Blog-Beiträge, deren blog_schedule-Eintrag
 * früher beim Publish gelöscht wurde, wieder einen Eintrag nach (status='published').
 * Dadurch erscheinen sie wieder im Redaktionsplan-Kalender und der zugehörige
 * Serienteil gilt nicht mehr als „ungeplant".
 *
 * Idempotent: Beiträge, die bereits einen Schedule-Eintrag haben, werden übersprungen.
 */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  // 1. Veröffentlichte Beiträge laden
  const { data: posts, error: postErr } = await supabase
    .from('blog_posts')
    .select('id, title, category_id, scheduled_at, published_at, created_at, series_id, series_part')
    .eq('status', 'published');
  if (postErr) return NextResponse.json({ error: postErr.message }, { status: 500 });

  // 2. Bereits vorhandene Schedule-Einträge (post_id) — die überspringen
  const { data: existing, error: schedErr } = await supabase
    .from('blog_schedule')
    .select('post_id')
    .not('post_id', 'is', null);
  if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 });
  const haveSchedule = new Set((existing ?? []).map((e) => e.post_id));

  const candidates = (posts ?? []).filter((p) => !haveSchedule.has(p.id));
  if (candidates.length === 0) {
    return NextResponse.json({ created: 0, message: 'Nichts nachzutragen — alle veröffentlichten Beiträge haben bereits einen Plan-Eintrag.' });
  }

  // 3. Serien-Titel für Serien-Beiträge nachladen (für Topic-Match in der Serien-Liste)
  const seriesIds = [...new Set(candidates.map((p) => p.series_id).filter(Boolean))];
  const seriesTitle: Record<string, string> = {};
  if (seriesIds.length > 0) {
    const { data: seriesRows } = await supabase.from('blog_series').select('id, title').in('id', seriesIds);
    for (const s of seriesRows ?? []) seriesTitle[s.id] = s.title;
  }

  // 4. Schedule-Einträge bauen
  const rows = candidates.map((p) => {
    const dt = new Date(p.scheduled_at ?? p.published_at ?? p.created_at ?? Date.now());
    const scheduled_date = dt.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' }); // YYYY-MM-DD
    const scheduled_time = dt.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false });

    // Serien-Beitrag: Topic so bauen, dass die Serien-Liste ihn matcht
    // (braucht Serientitel + "Teil N" im Topic).
    let topic = p.title;
    if (p.series_id && p.series_part && seriesTitle[p.series_id]) {
      topic = `${seriesTitle[p.series_id]} — Teil ${p.series_part}: ${p.title}`;
    }

    return {
      topic,
      post_id: p.id,
      category_id: p.category_id ?? null,
      scheduled_date,
      scheduled_time,
      status: 'published',
      sort_order: 0,
    };
  });

  const { data: inserted, error: insErr } = await supabase
    .from('blog_schedule')
    .insert(rows)
    .select('id');
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  await logAudit({
    action: 'blog_schedule.backfill_published',
    entityType: 'blog_schedule',
    changes: { created: inserted?.length ?? 0 },
    request: req,
  });

  return NextResponse.json({ created: inserted?.length ?? 0 });
}

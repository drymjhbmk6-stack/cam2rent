/**
 * Cron: Social-Posts veröffentlichen
 *
 * Läuft alle 5 Minuten (siehe CLAUDE.md → Cron-Jobs).
 *
 * Aufgaben:
 *   1) Fällige geplante Posts veröffentlichen (scheduled_at <= now)
 *   2) Redaktionsplan-Einträge abarbeiten (next_run_at <= now) —
 *      KI-generierten Post erstellen und sofort oder zur nächsten vollen
 *      Stunde planen.
 *   3) Fehlgeschlagene Posts einmalig re-tryen (retry_count < 2)
 *
 * Crontab (Hetzner):
 *   *5 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://.../api/cron/social-publish
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { publishPost } from '@/lib/meta/publisher';
import { generateFromTemplate } from '@/lib/meta/ai-content';
import { isTestMode } from '@/lib/env-mode';
import { shouldPublishInTestMode } from '@/lib/test-mode-publish';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';

const MAX_RETRIES = 2;

async function processScheduledPosts() {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: duePosts } = await supabase
    .from('social_posts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .limit(10);

  if (!duePosts || duePosts.length === 0) return { count: 0, results: [] };

  const results: Array<{ id: string; success: boolean; error?: string }> = [];
  for (const { id } of duePosts) {
    try {
      const res = await publishPost(id);
      results.push({ id, success: res.success, error: res.errors.map((e) => `${e.platform}: ${e.message}`).join('; ') || undefined });
    } catch (err) {
      results.push({ id, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { count: duePosts.length, results };
}

async function processRetries() {
  const supabase = createServiceClient();
  const { data: failed } = await supabase
    .from('social_posts')
    .select('id, retry_count')
    .eq('status', 'failed')
    .lt('retry_count', MAX_RETRIES)
    .limit(5);

  if (!failed || failed.length === 0) return { count: 0 };

  for (const post of failed) {
    await supabase.from('social_posts').update({ retry_count: (post.retry_count ?? 0) + 1, status: 'scheduled', scheduled_at: new Date().toISOString() }).eq('id', post.id);
    await publishPost(post.id);
  }
  return { count: failed.length };
}

function computeNextRun(frequency: string, dayOfWeek: number | null, dayOfMonth: number | null, hour: number, minute: number): string {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(minute);
  next.setHours(hour);

  if (frequency === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly' && dayOfWeek !== null) {
    const currentDow = next.getDay();
    let diff = (dayOfWeek - currentDow + 7) % 7;
    if (diff === 0 && next <= now) diff = 7;
    next.setDate(next.getDate() + diff);
  } else if (frequency === 'monthly' && dayOfMonth !== null) {
    next.setDate(dayOfMonth);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}

async function processScheduleEntries() {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: entries } = await supabase
    .from('social_schedule')
    .select('*, template:social_templates(*)')
    .eq('is_active', true)
    .lte('next_run_at', nowIso)
    .limit(5);

  if (!entries || entries.length === 0) return { count: 0 };

  // Standard-Accounts ermitteln (erste aktive FB + IG)
  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, platform, linked_account_id')
    .eq('is_active', true);

  const fbAccount = accounts?.find((a) => a.platform === 'facebook');
  const igAccount = accounts?.find((a) => a.platform === 'instagram');

  const created: string[] = [];
  for (const entry of entries) {
    type Template = {
      id: string;
      caption_prompt: string;
      image_prompt: string | null;
      default_hashtags: string[];
      platforms: string[];
      media_type: string;
    };
    const tpl = (entry as { template: Template | null }).template;
    if (!tpl) continue;

    try {
      const ctx = (entry.context_json as Record<string, string | number | undefined>) ?? {};
      const generated = await generateFromTemplate({
        caption_prompt: tpl.caption_prompt,
        image_prompt: tpl.image_prompt,
        default_hashtags: tpl.default_hashtags,
        variables: ctx,
      });

      const { data: newPost } = await supabase
        .from('social_posts')
        .insert({
          caption: generated.caption,
          hashtags: generated.hashtags,
          media_urls: generated.image_url ? [generated.image_url] : [],
          media_type: generated.image_url ? 'image' : 'text',
          platforms: tpl.platforms,
          fb_account_id: tpl.platforms.includes('facebook') ? fbAccount?.id ?? null : null,
          ig_account_id: tpl.platforms.includes('instagram') ? igAccount?.id ?? null : null,
          status: 'scheduled',
          scheduled_at: new Date().toISOString(),
          source_type: 'auto_schedule',
          template_id: tpl.id,
          ai_generated: true,
          ai_model: 'claude-sonnet-4-6',
          created_by: 'system',
        })
        .select('id')
        .single();

      if (newPost) created.push(newPost.id);

      await supabase
        .from('social_schedule')
        .update({
          last_run_at: nowIso,
          next_run_at: computeNextRun(entry.frequency, entry.day_of_week, entry.day_of_month, entry.hour_of_day, entry.minute),
        })
        .eq('id', entry.id);
    } catch (err) {
      console.error('[cron/social-publish] schedule entry failed', entry.id, err);
    }
  }
  return { count: entries.length, created };
}

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Im Test-Modus nicht auf Meta publishen — Live-Reichweite ungewollt.
  // Ausnahme: Admin hat unter /admin/social/reels/einstellungen den Schalter
  // "Im Test-Modus echt veroeffentlichen" aktiviert.
  if (await isTestMode()) {
    if (!(await shouldPublishInTestMode())) {
      return NextResponse.json({ skipped: 'test_mode' });
    }
  }

  // Re-Entry-Schutz: doppelte Cron-Trigger duerfen nicht zweimal denselben
  // Post auf FB/IG publizieren.
  const lock = await acquireCronLock('social-publish');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: lock.reason });
  }

  try {
    // allSettled statt all: ein Fehler in einer Phase darf die anderen nicht
    // mit-killen. processScheduleEntries() kann z.B. an einem Template-Fehler
    // werfen, processRetries() soll trotzdem laufen.
    const settled = await Promise.allSettled([
      processScheduledPosts(),
      processScheduleEntries(),
      processRetries(),
    ]);

    const [scheduled, schedule, retries] = settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const phase = ['scheduled', 'schedule', 'retries'][i];
      console.error(`[social-publish] Phase '${phase}' fehlgeschlagen:`, r.reason);
      return { error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    });

    return NextResponse.json({ scheduled, schedule, retries });
  } finally {
    await releaseCronLock('social-publish');
  }
}

export const GET = POST;

/**
 * Cron: Reel generieren (analog social-generate / blog-generate)
 *
 * Läuft stündlich. Arbeitet den Redaktionsplan ab:
 * 1. Wählt nächsten offenen Eintrag aus social_reel_plan
 *    (scheduled_date <= heute + auto_generate_schedule_days_before Tage)
 * 2. Berücksichtigt Wochentag + Zeitfenster aus reels_settings
 * 3. Re-Entry-Schutz via acquireCronLock('reels-generate')
 * 4. Generiert Reel via generateReel() aus lib/reels/orchestrator
 * 5. Im Voll-Modus: status='scheduled' mit scheduled_at setzen
 *    Im Semi-Modus: bleibt 'pending_review' — Admin muss freigeben
 * 6. Updated plan-entry auf status='generated'
 *
 * Crontab: 0 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-generate
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { isTestMode } from '@/lib/env-mode';
import { shouldPublishInTestMode } from '@/lib/test-mode-publish';
import { createAdminNotification } from '@/lib/admin-notifications';
import { generateReel } from '@/lib/reels/orchestrator';

interface ReelsAutoSettings {
  auto_generate?: boolean;
  auto_generate_mode?: 'semi' | 'voll';
  auto_generate_weekdays?: string[];
  auto_generate_time_from?: string;
  auto_generate_time_to?: string;
  auto_generate_schedule_days_before?: number;
}

async function getReelsSettings(): Promise<ReelsAutoSettings> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'reels_settings')
    .maybeSingle();
  if (!data?.value) return {};
  try {
    return typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as ReelsAutoSettings);
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Im Test-Modus keine Generierung, außer der Admin hat den Override aktiviert.
  if (await isTestMode()) {
    if (!(await shouldPublishInTestMode())) {
      return NextResponse.json({ skipped: 'test_mode' });
    }
  }

  const lock = await acquireCronLock('reels-generate');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: lock.reason ?? 'locked' });
  }

  try {
    return await runGeneration(req);
  } finally {
    await releaseCronLock('reels-generate');
  }
}

async function runGeneration(req: NextRequest): Promise<NextResponse> {
  const supabase = createServiceClient();
  const settings = await getReelsSettings();
  const mode = settings.auto_generate_mode ?? 'semi';
  const daysBefore = settings.auto_generate_schedule_days_before ?? 3;

  // Auto-Gen deaktiviert?
  if (settings.auto_generate === false) {
    return NextResponse.json({ skipped: 'auto_generate disabled' });
  }

  // Force-Parameter: für manuelle Aufrufe, umgeht Zeitfenster-Check
  const force = req.nextUrl.searchParams.get('force') === '1';

  // Wochentag + Zeitfenster prüfen (Europe/Berlin)
  if (!force) {
    const berlinNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    const currentHour = berlinNow.getHours();
    const dayMap = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
    const todayKey = dayMap[berlinNow.getDay()];

    const weekdays = settings.auto_generate_weekdays ?? ['mo', 'do'];
    if (!weekdays.includes(todayKey)) {
      return NextResponse.json({ skipped: `heute (${todayKey}) nicht im Plan` });
    }

    const fromHour = settings.auto_generate_time_from ? parseInt(settings.auto_generate_time_from.split(':')[0]) : 9;
    const toHour = settings.auto_generate_time_to ? parseInt(settings.auto_generate_time_to.split(':')[0]) : 18;
    if (currentHour < fromHour || currentHour >= toHour) {
      return NextResponse.json({ skipped: `außerhalb Zeitfenster ${fromHour}-${toHour}` });
    }
  }

  // Nächsten offenen Plan-Eintrag finden
  const todayBerlin = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const [ly, lm, ld] = todayBerlin.split('-').map((n) => parseInt(n, 10));
  const latest = new Date(Date.UTC(ly, lm - 1, ld + daysBefore));
  const latestDateStr = latest.toISOString().split('T')[0];

  const { data: entry, error: entryError } = await supabase
    .from('social_reel_plan')
    .select('*')
    .eq('status', 'planned')
    .lte('scheduled_date', latestDateStr)
    .order('scheduled_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (entryError) return NextResponse.json({ error: entryError.message }, { status: 500 });
  if (!entry) return NextResponse.json({ skipped: 'kein offener Eintrag fällig' });

  // Plan-Eintrag sperren
  await supabase
    .from('social_reel_plan')
    .update({ status: 'generating' })
    .eq('id', entry.id);

  try {
    // Reel generieren — orchestrator übernimmt Script-KI, FFmpeg, Storage-Upload, DB-Row
    const result = await generateReel({
      templateId: entry.template_id ?? undefined,
      topic: entry.topic ?? 'Action-Cam Erlebnis',
      keywords: entry.keywords ?? [],
      platforms: entry.platforms ?? ['instagram', 'facebook'],
      previewRequired: mode === 'semi', // Semi → pending_review; Voll → rendered (auto-publish)
      postDate: entry.scheduled_date ? new Date(entry.scheduled_date) : undefined,
    });

    // Im Voll-Modus: direkt scheduled_at setzen, damit reels-publish den Cron übernimmt
    if (mode === 'voll' && result.reelId) {
      const scheduledAt = new Date(
        `${entry.scheduled_date}T${(entry.scheduled_time || '10:00').slice(0, 5)}:00`
      ).toISOString();
      await supabase
        .from('social_reels')
        .update({ status: 'scheduled', scheduled_at: scheduledAt })
        .eq('id', result.reelId);
    }

    // Plan-Eintrag als generiert markieren
    await supabase
      .from('social_reel_plan')
      .update({
        status: 'generated',
        generated_reel_id: result.reelId,
        error_message: null,
      })
      .eq('id', entry.id);

    // Push-Notification: nur im Semi-Modus (pending_review)
    if (mode === 'semi' && result.reelId) {
      await createAdminNotification(supabase, {
        type: 'reel_ready',
        title: 'Reel zum Reviewen',
        message: `Thema: ${entry.topic ?? 'Reel'}`,
        link: `/admin/social/reels/${result.reelId}`,
      });
    }

    return NextResponse.json({ generated: true, entry_id: entry.id, reel_id: result.reelId, mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('social_reel_plan')
      .update({ status: 'planned', error_message: msg })
      .eq('id', entry.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = POST;

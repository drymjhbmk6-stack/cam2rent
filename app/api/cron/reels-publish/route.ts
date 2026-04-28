import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { isTestMode } from '@/lib/env-mode';
import { publishReel } from '@/lib/reels/publisher';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET/POST /api/cron/reels-publish
 *
 * Findet alle Reels mit status='scheduled' und scheduled_at <= now() und
 * veröffentlicht sie via Meta Graph API.
 *
 * Im Test-Modus wird nur geloggt ohne echten Upload.
 * Empfohlener Crontab-Eintrag (alle 5 Min):
 *   5-59/5 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-publish
 */
/**
 * reels_settings.publish_in_test_mode — wenn true, laeuft der Cron auch im
 * Test-Modus durch (echte Publishes). Default false (= alter Schutz aktiv).
 */
async function shouldPublishInTestMode(supabase: ReturnType<typeof createServiceClient>): Promise<boolean> {
  try {
    const { data } = await supabase.from('admin_settings').select('value').eq('key', 'reels_settings').maybeSingle();
    if (!data?.value) return false;
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return Boolean(parsed?.publish_in_test_mode);
  } catch {
    return false;
  }
}

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  if (await isTestMode()) {
    if (!(await shouldPublishInTestMode(supabase))) {
      return NextResponse.json({ skipped: 'test_mode' });
    }
    // sonst durchlaufen lassen
  }
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from('social_reels')
    .select('id, caption, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(5); // Begrenzung pro Run (Reels-Render frisst Bandbreite/RAM)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due || due.length === 0) return NextResponse.json({ processed: 0 });

  // Plausibilitaetscheck: scheduled_at darf nicht zu weit in der Vergangenheit liegen
  // (z.B. Tippfehler 2026-04-01 statt 2026-05-01). Mehr als 7 Tage = ueberspringen +
  // Fehler dokumentieren, damit Admin entscheidet.
  const STALE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const stale: string[] = [];
  const fresh: typeof due = [];
  for (const reel of due) {
    const scheduledMs = new Date(reel.scheduled_at).getTime();
    if (Number.isFinite(scheduledMs) && nowMs - scheduledMs > STALE_LIMIT_MS) {
      stale.push(reel.id);
    } else {
      fresh.push(reel);
    }
  }
  if (stale.length) {
    await supabase
      .from('social_reels')
      .update({
        status: 'failed',
        error_message:
          'scheduled_at lag mehr als 7 Tage in der Vergangenheit — Cron hat den Reel uebersprungen. Bitte Datum pruefen.',
      })
      .in('id', stale);
  }

  const results = [];
  for (const reel of fresh) {
    try {
      const r = await publishReel(reel.id);
      results.push({ id: reel.id, success: r.success, errors: r.errors });
    } catch (err) {
      results.push({ id: reel.id, success: false, errors: [{ platform: 'system', message: err instanceof Error ? err.message : String(err) }] });
    }
  }
  if (stale.length) {
    results.push(
      ...stale.map((id) => ({
        id,
        success: false,
        errors: [{ platform: 'system', message: 'scheduled_at zu alt (>7 Tage), uebersprungen' }],
      })),
    );
  }

  return NextResponse.json({ processed: results.length, results });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

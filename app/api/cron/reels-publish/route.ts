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
async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (await isTestMode()) {
    return NextResponse.json({ skipped: 'test_mode' });
  }

  const supabase = createServiceClient();
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

  const results = [];
  for (const reel of due) {
    try {
      const r = await publishReel(reel.id);
      results.push({ id: reel.id, success: r.success, errors: r.errors });
    } catch (err) {
      results.push({ id: reel.id, success: false, errors: [{ platform: 'system', message: err instanceof Error ? err.message : String(err) }] });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

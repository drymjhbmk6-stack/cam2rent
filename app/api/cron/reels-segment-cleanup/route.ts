/**
 * Phase 3.4 — GET/POST /api/cron/reels-segment-cleanup
 *
 * Loescht persistierte Segment-Files (segments/ + audio/) fuer Reels die
 *   - status='published' UND
 *   - published_at < now() - 30 days
 * sind. Final video.mp4 + thumb.jpg bleiben — sind weiterhin der Output.
 *
 * Damit halten wir den Storage-Verbrauch in Grenzen: Pro Reel ~10-20 MB an
 * Segmenten + Voice-Files. Bei 60 Reels/Monat × 20 MB ≈ 1.2 GB/Monat. Mit
 * 30-Tage-Cleanup pendelt es sich bei ~1.2 GB ein, statt monatlich zu wachsen.
 *
 * acquireCronLock verhindert parallele Laeufe (z.B. Coolify-Restart waehrend
 * der Cron-Tick liefe).
 *
 * Empfohlener Crontab-Eintrag (taeglich 04:00):
 *   0 4 * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-segment-cleanup
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RETENTION_DAYS = 30;

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('reels-segment-cleanup');
  if (!lock) {
    return NextResponse.json({ skipped: 'lock_held' });
  }

  try {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Kandidaten: published Reels, deren published_at vor dem Cutoff liegt.
    const { data: reels, error: reelsErr } = await supabase
      .from('social_reels')
      .select('id, published_at')
      .eq('status', 'published')
      .lt('published_at', cutoff)
      .limit(50); // pro Run max 50 Reels — verhindert Cron-Timeout bei Backlog

    if (reelsErr) {
      // Defensiv: wenn social_reels-Tabelle existiert aber filter unklar, abbrechen
      return NextResponse.json({ error: reelsErr.message }, { status: 500 });
    }

    let deletedSegments = 0;
    let deletedAudio = 0;
    let processedReels = 0;
    const errors: Array<{ reelId: string; message: string }> = [];

    for (const reel of reels ?? []) {
      processedReels++;
      try {
        // Storage-Files unter {reelId}/segments/ und {reelId}/audio/ listen
        const { data: segFiles } = await supabase.storage
          .from('social-reels')
          .list(`${reel.id}/segments`, { limit: 100 });
        if (segFiles && segFiles.length > 0) {
          const paths = segFiles.map((f) => `${reel.id}/segments/${f.name}`);
          const { error: delErr } = await supabase.storage.from('social-reels').remove(paths);
          if (!delErr) deletedSegments += paths.length;
        }

        const { data: audioFiles } = await supabase.storage
          .from('social-reels')
          .list(`${reel.id}/audio`, { limit: 100 });
        if (audioFiles && audioFiles.length > 0) {
          const paths = audioFiles.map((f) => `${reel.id}/audio/${f.name}`);
          const { error: delErr } = await supabase.storage.from('social-reels').remove(paths);
          if (!delErr) deletedAudio += paths.length;
        }

        // social_reel_segments-Rows loeschen (defensiv: try/catch falls Migration fehlt)
        try {
          await supabase.from('social_reel_segments').delete().eq('reel_id', reel.id);
        } catch {
          /* Migration noch nicht durch — egal, Storage ist sauber */
        }
      } catch (err) {
        errors.push({
          reelId: reel.id as string,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      processedReels,
      deletedSegments,
      deletedAudio,
      retentionDays: RETENTION_DAYS,
      errors: errors.length > 0 ? errors : undefined,
    });
  } finally {
    await releaseCronLock('reels-segment-cleanup').catch(() => {});
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { runAfaCron } from '@/lib/buchhaltung/afa-cron';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { isTestMode } from '@/lib/env-mode';

/**
 * Cron: monatliche lineare AfA fortschreiben.
 *
 * Hetzner-Crontab (1. des Monats, 06:00):
 *   0 6 1 * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://cam2rent.de/api/cron/afa-buchung
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lock = await acquireCronLock('afa-buchung');
  if (!lock) return NextResponse.json({ skipped: true, reason: 'already running' });

  try {
    const supabase = createServiceClient();
    const testMode = await isTestMode();
    const result = await runAfaCron(supabase, { isTestMode: testMode });
    return NextResponse.json({ ok: true, mode: testMode ? 'test' : 'live', ...result });
  } finally {
    await releaseCronLock('afa-buchung');
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

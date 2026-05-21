import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { runStripeSync } from '@/lib/buchhaltung/stripe-sync';
import { logAudit } from '@/lib/audit';
import { getBerlinDateString } from '@/lib/timezone';

/**
 * Cron: Stripe-Abgleich automatisch synchronisieren.
 *
 * Macht dasselbe wie der manuelle "Synchronisieren"-Button im
 * Buchhaltungs-Cockpit (Stripe-Abgleich-Tab), aber automatisch — laedt alle
 * erfolgreichen PaymentIntents des aktuellen Monats und matcht sie gegen
 * Buchungen. User-gesetzte Verknuepfungen (manual/refunded) bleiben unangetastet.
 *
 * Hetzner-Crontab (stuendlich):
 *   0 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://cam2rent.de/api/cron/stripe-sync
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('stripe-sync');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: true, reason: lock.reason ?? 'already running' });
  }

  try {
    // Aktuellen Monat synchronisieren (Berlin-TZ), analog zum
    // "Aktueller Monat"-Default im Stripe-Abgleich-Tab.
    const today = getBerlinDateString(); // YYYY-MM-DD
    const from = `${today.slice(0, 7)}-01`;
    const to = today;

    const { synced } = await runStripeSync({ from, to });

    await logAudit({
      action: 'stripe.sync_run',
      entityType: 'stripe_transaction',
      changes: { from, to, synced, source: 'cron' },
      request: req,
    });

    return NextResponse.json({ ok: true, from, to, synced });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync fehlgeschlagen.';
    console.error('[cron/stripe-sync] error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await releaseCronLock('stripe-sync');
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

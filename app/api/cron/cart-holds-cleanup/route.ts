import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET/POST /api/cron/cart-holds-cleanup
 *
 * Loescht abgelaufene Warenkorb-Reservierungen (cart_holds.expires_at < now()).
 * Reine Tabellen-Hygiene — die Verfuegbarkeits-Lese-Filter ignorieren
 * abgelaufene Holds ohnehin schon (gt('expires_at', now())). Der Cron haelt
 * die Tabelle nur klein.
 *
 * Empfohlener Crontab-Eintrag (alle 15 Min, Cloudflare-Bypass mit --resolve):
 *   *​/15 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/cart-holds-cleanup
 */
async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('cart-holds-cleanup');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  try {
    const supabase = createServiceClient();
    const { error, count } = await supabase
      .from('cart_holds')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString());

    if (error) {
      // Fehlende Migration ist kein harter Fehler.
      if (/cart_holds|relation .* does not exist|42P01|PGRST/i.test(error.message)) {
        return NextResponse.json({ ok: true, skipped: 'table_missing' });
      }
      console.error('[cart-holds-cleanup] delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  } finally {
    await releaseCronLock('cart-holds-cleanup');
  }
}

export const GET = handle;
export const POST = handle;

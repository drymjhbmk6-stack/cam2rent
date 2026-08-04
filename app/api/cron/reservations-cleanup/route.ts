import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET/POST /api/cron/reservations-cleanup
 *
 * Setzt abgelaufene, noch offene Admin-Reservierungen auf `expired` (48h-Frist
 * ueberschritten) und schickt dem Kunden eine kurze "Reservierung abgelaufen"-
 * Mail. Die Verfuegbarkeits-Lese-Filter ignorieren abgelaufene Reservierungen
 * ohnehin schon (gt('expires_at', now) + status='open') — der Cron macht den
 * Ablauf nur explizit (Reporting) + benachrichtigt den Kunden.
 *
 * Empfohlener Crontab-Eintrag (alle 30 Min, Cloudflare-Bypass mit --resolve):
 *   *​/30 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reservations-cleanup
 */
async function handle(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('reservations-cleanup');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  try {
    const supabase = createServiceClient();
    const { data: expired, error } = await supabase
      .from('reservations')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'open')
      .lt('expires_at', new Date().toISOString())
      .select('id, customer_email, customer_name, rental_from, rental_to');

    if (error) {
      if (/reservations|relation .* does not exist|42P01|PGRST/i.test(error.message)) {
        return NextResponse.json({ ok: true, skipped: 'table_missing' });
      }
      console.error('[reservations-cleanup] update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = expired ?? [];
    let mailed = 0;
    if (rows.length > 0) {
      const { sendReservationExpired } = await import('@/lib/email');
      for (const r of rows) {
        if (!r.customer_email) continue;
        try {
          await sendReservationExpired({
            to: r.customer_email as string,
            customerName: (r.customer_name as string | null) ?? null,
            rentalFrom: r.rental_from as string,
            rentalTo: r.rental_to as string,
          });
          mailed++;
        } catch (mailErr) {
          console.warn('[reservations-cleanup] Mail-Fehler:', mailErr);
        }
      }
    }

    return NextResponse.json({ ok: true, expired: rows.length, mailed });
  } finally {
    await releaseCronLock('reservations-cleanup');
  }
}

export const GET = handle;
export const POST = handle;

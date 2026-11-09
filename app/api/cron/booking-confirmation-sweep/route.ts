import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { isTestMode } from '@/lib/env-mode';
import {
  ensureBookingConfirmationSent,
  hasBookingConfirmation,
} from '@/lib/booking-confirmation-fallback';

export const maxDuration = 300;

/**
 * Sicherheitsnetz: Buchungsbestaetigung nachsenden, falls sie nie rausging.
 *
 * Typischer Fall: Der Stripe-Webhook legt eine Warenkorb-Buchung an (schickt
 * dabei nur die Admin-Mail), der Kunde schliesst aber den Tab vor
 * `/buchung-bestaetigt` → `confirm-cart` laeuft nie → keine Kundenmail.
 *
 * Prueft bezahlte Stripe-Buchungen (payment_intent_id `pi_…`) der letzten
 * 3 Tage, die aelter als 15 Minuten sind (Schonfrist fuer confirm-cart), und
 * verschickt die Bestaetigung (mit Vertrag, falls gespeichert), wenn im
 * email_log weder `booking_confirmation` noch `manual_documents` steht.
 *
 * Crontab (alle 15 Min, --resolve umgeht Cloudflare):
 *   *\/15 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 \
 *     -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/booking-confirmation-sweep
 */

const GRACE_MS = 15 * 60 * 1000;
const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

async function run(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const lock = await acquireCronLock('booking-confirmation-sweep');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  try {
    const supabase = createServiceClient();
    const testMode = await isTestMode();
    const now = Date.now();

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, customer_email, booking_type')
      .like('payment_intent_id', 'pi_%')
      .neq('status', 'cancelled')
      .eq('is_test', testMode)
      .gte('created_at', new Date(now - WINDOW_MS).toISOString())
      .lte('created_at', new Date(now - GRACE_MS).toISOString())
      .not('customer_email', 'is', null)
      .limit(200);

    if (error) {
      console.error('[booking-confirmation-sweep] Ladefehler:', error);
      return NextResponse.json({ error: 'Buchungen konnten nicht geladen werden.' }, { status: 500 });
    }

    const sent: string[] = [];
    let checked = 0;
    for (const b of bookings ?? []) {
      // Verkaeufe bekommen eine eigene Rechnungsmail, keine Buchungsbestaetigung.
      if (b.booking_type === 'kauf') continue;
      checked++;
      if (await hasBookingConfirmation(supabase, b.id)) continue;

      // Gespeicherten Mietvertrag (falls vorhanden) mit anhaengen.
      let pdf: Buffer | undefined;
      try {
        const { data: ra } = await supabase
          .from('rental_agreements')
          .select('pdf_url')
          .eq('booking_id', b.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const path = ra?.pdf_url?.replace(/^contracts\//, '');
        if (path) {
          const { data: file } = await supabase.storage.from('contracts').download(path);
          if (file) pdf = Buffer.from(await file.arrayBuffer());
        }
      } catch (e) {
        console.error('[booking-confirmation-sweep] Vertrag nicht ladbar:', b.id, e);
      }

      if (await ensureBookingConfirmationSent(supabase, b.id, pdf)) sent.push(b.id);
    }

    return NextResponse.json({ success: true, checked, sent });
  } finally {
    await releaseCronLock('booking-confirmation-sweep');
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

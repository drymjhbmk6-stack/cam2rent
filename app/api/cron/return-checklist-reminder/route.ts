import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { getBerlinDateString } from '@/lib/timezone';
import { resolveBookingReturnItems } from '@/lib/booking-return-items';
import { sendReturnChecklist } from '@/lib/email';

// PDF-Rendering pro Buchung kann etwas dauern → großzügiges Limit.
export const maxDuration = 300;

/**
 * Rückgabe-Checkliste am letzten Miettag (~08:00 Berlin).
 *
 * Schickt Kunden, deren Mietzeitraum HEUTE endet (rental_to == heute), eine
 * Erinnerung mit einer Checkliste (Kamera + Seriennr. + Zubehör) als PDF —
 * für Versand UND persönliche Rückgabe/Abholung. Ersetzt die frühere schlichte
 * „Rückgabe heute"-Mail (return_reminder_0d) und deckt zusätzlich die Status
 * `delivered` (zugestellt) + `picked_up` (abgeholt) ab.
 *
 * Setup in Hetzner-Crontab (täglich 08:00 Berliner Zeit, --resolve umgeht
 * Cloudflare — siehe CLAUDE.md „Cloudflare-Vollintegration"):
 *   0 8 * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 \
 *     -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/return-checklist-reminder
 *
 * Idempotenz: Versand wird über email_log (email_type='return_checklist',
 * status='sent', booking_id) dedupliziert — sendAndLog schreibt das Log
 * selbst, ein erneuter Cron-Lauf am selben Tag schickt nichts doppelt.
 */

// Buchungs-Status, in denen die Kamera am letzten Miettag beim Kunden ist.
const ACTIVE_STATUSES = ['confirmed', 'shipped', 'delivered', 'picked_up'];

interface SendResult {
  bookingId: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('return-checklist-reminder');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  try {
    const supabase = createServiceClient();
    const today = getBerlinDateString();
    const results: SendResult[] = [];

    // 1. Buchungen, deren Mietzeitraum heute endet.
    const { data: bookings, error: bookingsErr } = await supabase
      .from('bookings')
      .select('*')
      .in('status', ACTIVE_STATUSES)
      .eq('rental_to', today);

    if (bookingsErr) {
      return NextResponse.json({ error: 'DB-Fehler', detail: bookingsErr.message }, { status: 500 });
    }
    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ ok: true, summary: { sent: 0, failed: 0, skipped: 0, total: 0 } });
    }

    // 2. Bereits versendete herausfiltern (Idempotenz).
    const bookingIds = bookings.map((b) => b.id);
    const { data: alreadySent } = await supabase
      .from('email_log')
      .select('booking_id')
      .in('booking_id', bookingIds)
      .eq('email_type', 'return_checklist')
      .eq('status', 'sent');
    const sentSet = new Set((alreadySent ?? []).map((r) => r.booking_id));

    // 3. Pro offener Buchung Checkliste auflösen + Mail mit PDF schicken.
    //    Parallel, allSettled — ein Fehler killt nicht die ganze Schleife.
    const pending = bookings.filter((b) => !sentSet.has(b.id));
    const sendPromises = pending.map(async (booking): Promise<SendResult> => {
      if (!booking.customer_email) {
        return { bookingId: booking.id, status: 'skipped', error: 'keine E-Mail hinterlegt' };
      }
      try {
        const { cameras, items } = await resolveBookingReturnItems(supabase, booking);
        await sendReturnChecklist({
          bookingId: booking.id,
          customerName: booking.customer_name ?? '',
          customerEmail: booking.customer_email,
          productName: booking.product_name ?? 'dein Mietartikel',
          rentalFrom: booking.rental_from ?? '',
          rentalTo: booking.rental_to ?? today,
          deliveryMode: booking.delivery_mode ?? 'versand',
          cameras,
          items,
        });
        return { bookingId: booking.id, status: 'sent' };
      } catch (err) {
        return {
          bookingId: booking.id,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    const settled = await Promise.allSettled(sendPromises);
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        results.push(s.value);
      } else {
        results.push({ bookingId: '?', status: 'failed', error: String(s.reason) });
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    return NextResponse.json({
      ok: true,
      date: today,
      summary: { sent, failed, skipped, total: results.length },
      details: results,
    });
  } finally {
    await releaseCronLock('return-checklist-reminder');
  }
}

// Manche Cron-Setups schicken POST statt GET.
export const POST = GET;

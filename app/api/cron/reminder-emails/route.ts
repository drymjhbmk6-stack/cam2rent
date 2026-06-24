import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import {
  sendReturnReminder,
  sendOverdueNotice,
  sendSecondOverdueNotice,
  sendReviewRequest,
  type ReminderEmailData,
} from '@/lib/reminder-emails';

// ─── Types ───────────────────────────────────────────────────────────────────

// 'return_reminder_0d' (Rückgabe heute) ist in den eigenständigen Cron
// `return-checklist-reminder` umgezogen — dort mit Checklisten-PDF + breiterer
// Status-Abdeckung (auch delivered/picked_up).
type EmailType =
  | 'return_reminder_2d'
  | 'overdue_1d'
  | 'overdue_3d'
  | 'review_request';

interface SendResult {
  bookingId: string;
  emailType: EmailType;
  status: 'sent' | 'failed';
  messageId?: string | null;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a date string in 'YYYY-MM-DD' format, offset by `days` from today in Berlin time. */
function dateOffset(days: number): string {
  // Erst Berlin-Datum von heute holen, dann Tage draufrechnen — sonst
  // wuerde der Cron zwischen 22-24 Uhr Berlin den Reminder fuer den
  // falschen Tag erzeugen (UTC-Datum ist dann noch der Vortag).
  const todayBerlin = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const [y, m, d] = todayBerlin.split('-').map((n) => parseInt(n, 10));
  const offset = new Date(Date.UTC(y, m - 1, d + days));
  return offset.toISOString().slice(0, 10);
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('reminder-emails');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: 'lock_held', reason: lock.reason });
  }

  try {
  const supabase = createServiceClient();
  const results: SendResult[] = [];

  // Date targets
  const in2Days = dateOffset(2);
  const yesterday = dateOffset(-1);
  const threeDaysAgo = dateOffset(-3);

  // ── Define email jobs ──────────────────────────────────────────────────────

  const jobs: {
    emailType: EmailType;
    targetDate: string;
    statuses: string[];
    sendFn: (data: ReminderEmailData) => Promise<string | null>;
  }[] = [
    {
      emailType: 'return_reminder_2d',
      targetDate: in2Days,
      statuses: ['confirmed', 'shipped'],
      sendFn: sendReturnReminder,
    },
    {
      emailType: 'overdue_1d',
      targetDate: yesterday,
      statuses: ['confirmed', 'shipped'],
      sendFn: sendOverdueNotice,
    },
    {
      emailType: 'overdue_3d',
      targetDate: threeDaysAgo,
      statuses: ['confirmed', 'shipped'],
      sendFn: sendSecondOverdueNotice,
    },
    {
      emailType: 'review_request',
      targetDate: threeDaysAgo,
      statuses: ['completed'],
      sendFn: sendReviewRequest,
    },
  ];

  // ── Process each job ───────────────────────────────────────────────────────

  for (const job of jobs) {
    // 1. Find matching bookings
    const { data: bookings, error: bookingsErr } = await supabase
      .from('bookings')
      .select('id, customer_email, customer_name, product_name, rental_to')
      .in('status', job.statuses)
      .eq('rental_to', job.targetDate);

    if (bookingsErr || !bookings || bookings.length === 0) continue;

    // 2. Check which bookings already received this email type
    const bookingIds = bookings.map((b) => b.id);
    const { data: alreadySent } = await supabase
      .from('email_log')
      .select('booking_id')
      .in('booking_id', bookingIds)
      .eq('email_type', job.emailType)
      .eq('status', 'sent');

    const sentSet = new Set((alreadySent ?? []).map((r) => r.booking_id));

    // 3. Send emails for bookings not yet notified — Logs sammeln, am Ende batchen
    type LogRow = {
      booking_id: string;
      customer_email: string;
      email_type: string;
      status: 'sent' | 'failed';
      resend_message_id: string | null;
    };
    // Parallel-Send statt sequenziell: jeder Resend-Call dauert ~200-400ms.
    // Bei 20 Bookings/Job × 5 Jobs sequenziell = 30-40s, parallel ~5s.
    // allSettled, damit ein einzelner Resend-Fehler die Schleife nicht killt.
    const pending = bookings.filter((b) => !sentSet.has(b.id));
    const sendPromises = pending.map((booking) => {
      const emailData: ReminderEmailData = {
        bookingId: booking.id,
        customerName: booking.customer_name,
        customerEmail: booking.customer_email,
        productName: booking.product_name,
        rentalTo: booking.rental_to,
      };
      return job.sendFn(emailData);
    });

    const settled = await Promise.allSettled(sendPromises);
    const logRows: LogRow[] = settled.map((s, idx) => {
      const booking = pending[idx];
      const ok = s.status === 'fulfilled';
      const messageId = ok ? s.value : null;
      const errorMsg = ok ? undefined : (s.reason instanceof Error ? s.reason.message : String(s.reason));
      results.push({
        bookingId: booking.id,
        emailType: job.emailType,
        status: ok ? 'sent' : 'failed',
        messageId,
        error: errorMsg,
      });
      return {
        booking_id: booking.id,
        customer_email: booking.customer_email,
        email_type: job.emailType,
        status: ok ? 'sent' : 'failed',
        resend_message_id: messageId,
      };
    });

    // 4. Batch-Insert aller Log-Rows fuer diesen Job statt N einzelner Inserts
    if (logRows.length) {
      const { error: logErr } = await supabase.from('email_log').insert(logRows);
      if (logErr) {
        console.error(`[reminder-emails] Log-Insert-Fehler (${job.emailType}):`, logErr);
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const sent = results.filter((r) => r.status === 'sent').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return NextResponse.json({
    ok: true,
    summary: { sent, failed, total: results.length },
    details: results,
  });
  } finally {
    await releaseCronLock('reminder-emails');
  }
}

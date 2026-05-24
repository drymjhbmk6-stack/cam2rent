import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { verifyCronAuth } from '@/lib/cron-auth';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-lock';
import { dispatchAppointmentReminder } from '@/lib/employee-reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Persönlicher-Termin-Reminder-Cron.
 *
 * Empfohlener Cron-Eintrag (alle 5 Min, --resolve umgeht Cloudflare, siehe CLAUDE.md):
 *   /5 * * * * curl -s -X POST --resolve cam2rent.de:443:127.0.0.1 -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/appointment-reminders
 *
 * Logik:
 *   - Lädt alle Termine mit reminder_minutes_before NOT NULL und reminder_sent_at IS NULL
 *     deren effektiver Reminder-Zeitpunkt zwischen (now - 1h) und (now + 30s) liegt.
 *   - Das -1h-Fenster fängt Cron-Ausfälle bis 1h ab; nichts wird zweimal gefeuert
 *     (sent_at-Markierung).
 *   - Für jeden Termin: Push an Owner + alle shared_with (sofern aktiv) +
 *     E-Mail an dieselben, jeweils respektierend reminder_push/reminder_email.
 *   - Markiert sent_at danach, damit der nächste Lauf nicht erneut feuert.
 */
async function isMissingTable(): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('employee_appointments')
    .select('id', { count: 'exact', head: true })
    .limit(1);
  if (!error) return false;
  return /employee_appointments|schema cache|does not exist/i.test(error.message);
}

async function run() {
  if (await isMissingTable()) {
    return { migration_pending: true, processed: 0 };
  }

  const supabase = createServiceClient();
  const now = Date.now();
  const windowEarliest = new Date(now - 60 * 60 * 1000); // 1h Lookback
  const windowLatest = new Date(now + 30 * 1000);        // +30s Lookahead

  const { data: pending, error } = await supabase
    .from('employee_appointments')
    .select('id, admin_user_id, title, description, location, starts_at, all_day, reminder_minutes_before, reminder_push, reminder_email, shared_with')
    .is('reminder_sent_at', null)
    .not('reminder_minutes_before', 'is', null)
    .order('starts_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('appointment-reminders load error:', error);
    return { error: error.message, processed: 0 };
  }

  if (!pending || pending.length === 0) return { processed: 0 };

  // Owner-Namen für die Push-Body-Anzeige
  const ownerIds = Array.from(new Set(pending.map((p) => p.admin_user_id).filter(Boolean))) as string[];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: users } = await supabase
      .from('admin_users')
      .select('id, name')
      .in('id', ownerIds);
    (users ?? []).forEach((u) => ownerNames.set(u.id, u.name));
  }

  let processed = 0;
  let sentPush = 0;
  let sentEmail = 0;
  const errors: string[] = [];

  for (const appt of pending) {
    const startsAt = new Date(appt.starts_at).getTime();
    const remindAt = startsAt - (appt.reminder_minutes_before as number) * 60 * 1000;
    if (remindAt < windowEarliest.getTime() || remindAt > windowLatest.getTime()) continue;

    // Sofort markieren (Race-Schutz: zweiter Cron-Tick im gleichen Lookback-Fenster
    // findet den Termin dann nicht mehr).
    const { data: marked, error: markErr } = await supabase
      .from('employee_appointments')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', appt.id)
      .is('reminder_sent_at', null)
      .select('id')
      .maybeSingle();
    if (markErr || !marked) continue; // schon vergeben

    try {
      const stats = await dispatchAppointmentReminder({
        appointmentId: appt.id,
        ownerId: appt.admin_user_id,
        ownerName: ownerNames.get(appt.admin_user_id) ?? null,
        title: appt.title,
        startsAt: appt.starts_at,
        minutesBefore: appt.reminder_minutes_before as number,
        location: appt.location,
        description: appt.description,
        isAllDay: !!appt.all_day,
        sharedWith: Array.isArray(appt.shared_with) ? (appt.shared_with as string[]) : [],
        reminderPush: !!appt.reminder_push,
        reminderEmail: !!appt.reminder_email,
      });
      sentPush += stats.pushSent;
      sentEmail += stats.emailSent;
      if (stats.errors.length) errors.push(...stats.errors);
      processed += 1;
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  return { processed, sentPush, sentEmail, errors: errors.slice(0, 10) };
}

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('appointment-reminders');
  if (!lock.acquired) {
    return NextResponse.json({ skipped: lock.reason ?? 'locked' });
  }

  try {
    const result = await run();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('appointment-reminders cron error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await releaseCronLock('appointment-reminders');
  }
}

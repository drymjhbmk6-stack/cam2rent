import { createServiceClient } from '@/lib/supabase';
import { sendPushToUser } from '@/lib/push';
import { sendAppointmentReminder } from '@/lib/email';

/**
 * Liefert die Empfänger eines Termin-Reminders: Owner + alle Mitarbeiter aus
 * `shared_with`. Berücksichtigt nur aktive Konten und filtert den Legacy-ENV-
 * User aus (hat keine E-Mail/Push-Subscription).
 */
async function loadReminderRecipients(opts: {
  ownerId: string;
  sharedWith: string[];
}): Promise<Array<{ id: string; name: string; email: string }>> {
  const supabase = createServiceClient();
  const ids = Array.from(new Set([opts.ownerId, ...(opts.sharedWith ?? [])]))
    .filter((id) => id && id !== 'legacy-env');
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('admin_users')
    .select('id, name, email, is_active')
    .in('id', ids);
  if (error || !data) return [];
  return data
    .filter((u) => u.is_active)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));
}

export interface DispatchReminderArgs {
  appointmentId: string;
  ownerId: string;
  ownerName?: string | null;
  title: string;
  startsAt: string;       // ISO
  minutesBefore: number;
  location?: string | null;
  description?: string | null;
  isAllDay: boolean;
  sharedWith: string[];
  reminderPush: boolean;
  reminderEmail: boolean;
}

/**
 * Sendet einen Termin-Reminder an Owner + geshared Mitarbeiter.
 * Non-blocking auf Empfänger-Ebene — ein Fehler bei einer Person blockt die
 * anderen nicht. Wirft selbst nicht; gibt Stats zurück.
 */
export async function dispatchAppointmentReminder(args: DispatchReminderArgs): Promise<{
  pushSent: number;
  emailSent: number;
  errors: string[];
}> {
  const stats = { pushSent: 0, emailSent: 0, errors: [] as string[] };

  const recipients = await loadReminderRecipients({
    ownerId: args.ownerId,
    sharedWith: args.sharedWith,
  });
  if (recipients.length === 0) return stats;

  await Promise.allSettled(
    recipients.map(async (r) => {
      const isShared = r.id !== args.ownerId;

      // Push
      if (args.reminderPush) {
        try {
          const push = await sendPushToUser(r.id, {
            title: `⏰ ${args.title}`,
            body: args.location
              ? `${args.location}`
              : (isShared ? `Geteilt von ${args.ownerName || 'Kollege'}` : 'Persönlicher Termin'),
            url: '/admin/mein/kalender',
            tag: `appointment-${args.appointmentId}`,
          });
          stats.pushSent += push.sent;
        } catch (err) {
          stats.errors.push(`push:${r.id}:${(err as Error).message}`);
        }
      }

      // E-Mail
      if (args.reminderEmail && r.email) {
        try {
          await sendAppointmentReminder({
            to: r.email,
            employeeName: r.name,
            appointmentTitle: args.title,
            startsAt: args.startsAt,
            minutesBefore: args.minutesBefore,
            location: args.location,
            description: args.description,
            isAllDay: args.isAllDay,
            isShared,
          });
          stats.emailSent += 1;
        } catch (err) {
          stats.errors.push(`email:${r.id}:${(err as Error).message}`);
        }
      }
    }),
  );

  return stats;
}

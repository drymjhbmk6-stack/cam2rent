import { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToAdmins } from '@/lib/push';

/**
 * Erstellt eine Admin-Benachrichtigung.
 *
 * Wenn VAPID konfiguriert ist und Admin-Geräte registrierte Push-
 * Subscriptions haben, wird zusätzlich eine Web-Push-Notification
 * verschickt (non-blocking — Push-Fehler unterbrechen den Workflow nicht).
 *
 * Beispiele:
 *   await createAdminNotification(supabase, {
 *     type: 'new_booking',
 *     title: 'Neue Buchung: BK-2026-00042',
 *     message: 'Max Mustermann hat eine GoPro Hero 12 gebucht.',
 *     link: '/admin/buchungen/abc-123',
 *   });
 */
export async function createAdminNotification(
  supabase: SupabaseClient,
  data: {
    type: string;
    title: string;
    message?: string;
    link?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('admin_notifications')
    .insert({
      type: data.type,
      title: data.title,
      message: data.message || null,
      link: data.link || null,
    });

  if (error) {
    console.error('[admin-notifications] Fehler beim Erstellen:', error.message);
    return;
  }

  // Push-Notification fire-and-forget: kein await, kein Throw bei Fehlern.
  void sendPushToAdmins({
    title: data.title,
    body: data.message,
    url: data.link || '/admin',
    tag: data.type,
  });
}

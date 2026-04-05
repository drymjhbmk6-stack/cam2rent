import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Erstellt eine Admin-Benachrichtigung.
 *
 * Beispiele:
 *   await createAdminNotification(supabase, {
 *     type: 'new_booking',
 *     title: 'Neue Buchung: BK-2026-00042',
 *     message: 'Max Mustermann hat eine GoPro Hero 12 gebucht.',
 *     link: '/admin/buchungen/abc-123',
 *   });
 *
 *   await createAdminNotification(supabase, {
 *     type: 'booking_cancelled',
 *     title: 'Buchung storniert: BK-2026-00042',
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
  }
}

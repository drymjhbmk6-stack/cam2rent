import type { SupabaseClient } from '@supabase/supabase-js';
import { sendReturnItemsCompleted } from '@/lib/email';

/**
 * Prüft, ob für eine Buchung keine offene Rückgabe-Position mehr übrig ist,
 * und schickt dem Kunden dann EINMAL die Mail „Alles erledigt".
 *
 * Dedup über `email_log` (email_type `return_items_completed`) — egal über
 * wie viele Pfade (Admin-Button, Webhook, Selbstheilung) die letzte Position
 * abgeschlossen wird. Best-effort: wirft nie.
 */
export async function notifyReturnItemsCompleted(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<boolean> {
  try {
    const { data: items, error } = await supabase
      .from('booking_return_open_items')
      .select('label, qty, status')
      .eq('booking_id', bookingId);
    if (error || !items || items.length === 0) return false;
    if (items.some((it) => it.status === 'open')) return false;

    const { data: existing } = await supabase
      .from('email_log')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('email_type', 'return_items_completed')
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle();
    if (existing) return false;

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email')
      .eq('id', bookingId)
      .maybeSingle();
    const email = String(booking?.customer_email ?? '').trim();
    if (!booking || !email) return false;

    await sendReturnItemsCompleted({
      bookingId,
      customerName: String(booking.customer_name ?? '').trim() || 'Kunde',
      customerEmail: email,
      items: items.map((it) => ({
        label: String(it.label ?? 'Position'),
        qty: Number(it.qty) || 1,
        outcome: (it.status === 'received' || it.status === 'charged' ? it.status : 'waived') as
          'received' | 'charged' | 'waived',
      })),
    });
    return true;
  } catch (err) {
    console.error('[notifyReturnItemsCompleted] failed:', err);
    return false;
  }
}

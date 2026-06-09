import { SupabaseClient } from '@supabase/supabase-js';
import { sendCompletionConfirmation } from '@/lib/email';
import { loadUgcSettings } from '@/lib/customer-ugc';

/**
 * Verschickt die Abschluss-Bestätigungsmail ("alles in Ordnung" + optionaler
 * Kundenmaterial-Hinweis) an den Kunden, sobald eine Buchung auf `completed`
 * steht. Funktioniert generisch für Abholung UND Versand.
 *
 * Wird von allen Abschluss-Pfaden aufgerufen (Retouren-Prüf-Tool, manueller
 * Status-Wechsel im Dropdown, Rückgabe-Checkliste). Ein Dedup-Check gegen
 * `email_log` stellt sicher, dass pro Buchung nur EINE Abschluss-Mail rausgeht,
 * egal über wie viele Pfade der Abschluss läuft.
 *
 * Best-effort / non-blocking: alle Fehler werden gefangen und nur geloggt — der
 * Buchungsabschluss selbst darf nie an dieser Mail scheitern.
 */
export async function dispatchCompletionEmail(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  try {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email, product_name, rental_from, rental_to, status')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking || booking.status !== 'completed' || !booking.customer_email) return;

    // Dedup: wurde für diese Buchung bereits eine Abschluss-Mail verschickt?
    const { data: existing } = await supabase
      .from('email_log')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('email_type', 'completion_confirmation')
      .limit(1)
      .maybeSingle();
    if (existing) return;

    // UGC-Settings für den Kundenmaterial-Block (Default: aktiv, 15 %).
    const ugc = await loadUgcSettings(supabase).catch(() => null);

    await sendCompletionConfirmation({
      bookingId: booking.id,
      customerName: booking.customer_name || 'Kunde',
      customerEmail: booking.customer_email,
      productName: booking.product_name || 'Kamera',
      rentalFrom: booking.rental_from,
      rentalTo: booking.rental_to,
      ugcEnabled: ugc?.enabled ?? false,
      ugcDiscountPercent: ugc?.approve_discount_percent ?? 0,
    });
  } catch (err) {
    console.error('[dispatchCompletionEmail] failed:', err);
  }
}

/**
 * Nachversand der Kunden-Buchungsbestaetigung fuer Buchungen, die der
 * Stripe-Webhook zuerst angelegt hat.
 *
 * Hintergrund: Der Webhook (`handleCartBooking`) verschickt bei Warenkorb-
 * Buchungen bewusst KEINE Kundenmail (nur die Admin-Mail) — das soll
 * `confirm-cart` mit Mietvertrag im Anhang tun. `confirm-cart` uebersprang
 * den Versand aber fuer jede Buchung, die es nicht selbst angelegt hat
 * (Doppel-Mail-Schutz). Gewann der Webhook das Rennen (PayPal/3DS, langsamer
 * Redirect), bekam der Kunde dadurch NIE eine Buchungsbestaetigung.
 *
 * Dieser Helper schliesst die Luecke: er verschickt die Bestaetigung genau
 * dann, wenn im email_log fuer diese Buchung noch keine erfolgreiche
 * `booking_confirmation` steht. Baut die Mail-Daten aus der gespeicherten
 * Buchungszeile (= exakt der gezahlte Betrag). Wirft nie.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendBookingConfirmation, type BookingEmailData } from '@/lib/email';

export async function hasBookingConfirmation(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('email_log')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('email_type', 'booking_confirmation')
    .eq('status', 'sent')
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * @returns true, wenn eine Mail verschickt wurde.
 */
export async function ensureBookingConfirmationSent(
  supabase: SupabaseClient,
  bookingId: string,
  contractPdfBuffer?: Buffer,
): Promise<boolean> {
  try {
    if (await hasBookingConfirmation(supabase, bookingId)) return false;

    const { data: b } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();
    if (!b || !b.customer_email || b.status === 'cancelled') return false;

    const { data: tx } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
    const txMap: Record<string, string> = {};
    for (const s of tx ?? []) txMap[s.key] = s.value;

    const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v ?? 0))) || 0;
    const discount =
      num(b.discount_amount) + num(b.duration_discount) + num(b.loyalty_discount)
      + num(b.early_bird_discount) + num(b.special_discount);

    const emailData: BookingEmailData = {
      bookingId: b.id,
      customerName: b.customer_name || '',
      customerEmail: b.customer_email,
      productName: b.product_name || '',
      rentalFrom: String(b.rental_from || '').slice(0, 10),
      rentalTo: String(b.rental_to || '').slice(0, 10),
      days: b.days || 1,
      deliveryMode: b.delivery_mode === 'abholung' ? 'abholung' : 'versand',
      shippingMethod: b.shipping_method || undefined,
      haftung: b.haftung || 'none',
      accessories: Array.isArray(b.accessories) ? b.accessories : [],
      accessoryItems: Array.isArray(b.accessory_items) && b.accessory_items.length > 0
        ? b.accessory_items
        : undefined,
      priceRental: num(b.price_rental),
      priceAccessories: num(b.price_accessories),
      priceHaftung: num(b.price_haftung),
      priceTotal: num(b.price_total),
      deposit: num(b.deposit),
      shippingPrice: num(b.shipping_price),
      discountAmount: discount > 0 ? Math.round(discount * 100) / 100 : undefined,
      couponCode: b.coupon_code || undefined,
      taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
      taxRate: parseFloat(txMap['tax_rate'] || '19'),
      ustId: txMap['ust_id'] || '',
      earlyServiceConsentAt: b.early_service_consent_at ?? null,
      earlyServiceConsentIp: b.early_service_consent_ip ?? null,
      verificationRequired: b.verification_required === true,
    };

    await sendBookingConfirmation(emailData, contractPdfBuffer);
    console.log(`[booking-confirmation-fallback] Bestaetigung nachgesendet: ${bookingId}`);
    return true;
  } catch (err) {
    console.error('[booking-confirmation-fallback] Fehler:', bookingId, err);
    return false;
  }
}

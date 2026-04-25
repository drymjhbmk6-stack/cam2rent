import { createServiceClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';
import { getSiteUrl } from '@/lib/env-mode';

/**
 * Kernlogik fuer das Freigeben einer pending_verification-Buchung:
 *  1) Stripe Product + Price + Payment Link anlegen
 *  2) Buchungs-Status auf awaiting_payment setzen, stripe_payment_link_id +
 *     URL (in notes) speichern
 *  3) Optional eine Payment-Link-Mail schicken
 *
 * Wird sowohl vom Admin-Approve-Flow (manuell, mit Mail) als auch vom
 * Auto-Approve-Flow nach Kunden-Verifizierung (ohne Mail) genutzt.
 *
 * Erwartet eine Buchung im Status `pending_verification` mit gueltigem
 * price_total/product_name/rental_from/rental_to. Verifiziert das Kunden-
 * Profil gleich mit, falls noch nicht passiert.
 */
export async function approvePendingBooking(
  bookingId: string,
  opts: { sendEmail?: boolean } = {},
): Promise<
  | { success: true; paymentLinkId: string; paymentUrl: string; emailSent: boolean; emailError: string | null }
  | { success: false; error: string; status?: number }
> {
  const supabase = createServiceClient();

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return { success: false, error: `Buchung nicht gefunden: ${bookingError?.message ?? 'unknown'}`, status: 404 };
  }
  if (booking.status !== 'pending_verification') {
    return {
      success: false,
      error: `Buchung ist im Status "${booking.status}" (erwartet: pending_verification).`,
      status: 400,
    };
  }
  if (typeof booking.price_total !== 'number' || booking.price_total <= 0) {
    return { success: false, error: `Buchung hat keinen gültigen price_total (${booking.price_total}).`, status: 400 };
  }
  if (!booking.product_name) {
    return { success: false, error: 'Buchung hat keinen product_name.', status: 400 };
  }
  if (!booking.rental_from || !booking.rental_to) {
    return { success: false, error: 'Buchung hat keinen rental_from/rental_to.', status: 400 };
  }

  // Profile als verifiziert markieren (idempotent)
  if (booking.user_id) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: 'admin',
      })
      .eq('id', booking.user_id);
    if (profileError) {
      console.warn('[approvePendingBooking] Konnte Profil nicht verifizieren:', profileError.message);
    }
  }

  const amountCents = Math.round(booking.price_total * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { success: false, error: `Ungültiger Betrag: ${amountCents} cents`, status: 400 };
  }

  let paymentLink: { id: string; url: string };
  try {
    const stripe = await getStripe();
    const siteUrl = await getSiteUrl();
    const days = booking.days ?? 1;
    const productName = String(booking.product_name).slice(0, 200);

    const stripeProduct = await stripe.products.create({
      name: `Buchung ${bookingId} — ${productName}`.slice(0, 250),
      description: `${days} Tage Miete (${booking.rental_from} bis ${booking.rental_to})`.slice(0, 500),
      metadata: { booking_id: bookingId },
    });
    const stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: amountCents,
      currency: 'eur',
    });
    const pl = await stripe.paymentLinks.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      metadata: { booking_id: bookingId, booking_type: 'pending_approval' },
      after_completion: {
        type: 'redirect',
        redirect: { url: `${siteUrl}/buchung-bestaetigt?from=approval&booking_id=${bookingId}` },
      },
      allow_promotion_codes: false,
      payment_method_types: ['card', 'paypal'],
    });
    paymentLink = { id: pl.id, url: pl.url };
  } catch (stripeErr) {
    const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
    console.error('[approvePendingBooking] Stripe-Fehler:', msg);
    return { success: false, error: `Stripe-Fehler: ${msg}`, status: 502 };
  }

  // notes-Spalte ist optional; mit Fallback ohne notes.
  const updatePrimary = {
    status: 'awaiting_payment',
    stripe_payment_link_id: paymentLink.id,
    notes: `Zahlungslink: ${paymentLink.url}`,
  };
  let updateResult = await supabase.from('bookings').update(updatePrimary).eq('id', bookingId);
  if (updateResult.error && /notes/i.test(updateResult.error.message)) {
    const { notes: _omit, ...fallback } = updatePrimary;
    void _omit;
    updateResult = await supabase.from('bookings').update(fallback).eq('id', bookingId);
  }
  if (updateResult.error) {
    return { success: false, error: `DB-Update fehlgeschlagen: ${updateResult.error.message}`, status: 500 };
  }

  let emailSent = false;
  let emailError: string | null = null;
  if (opts.sendEmail !== false && booking.customer_email) {
    try {
      const { buildPaymentLinkEmail } = await import('@/lib/payment-link-email');
      const { sendAndLog } = await import('@/lib/email');
      const deliveryMode: 'versand' | 'abholung' = booking.delivery_mode === 'abholung' ? 'abholung' : 'versand';
      const { subject, html, text } = await buildPaymentLinkEmail({
        bookingId,
        customerName: booking.customer_name,
        productName: String(booking.product_name ?? ''),
        days: booking.days ?? 1,
        rentalFrom: String(booking.rental_from ?? ''),
        rentalTo: String(booking.rental_to ?? ''),
        priceTotal: Number(booking.price_total ?? 0),
        deliveryMode,
        paymentUrl: paymentLink.url,
      });
      await sendAndLog({
        to: booking.customer_email,
        subject,
        html,
        text,
        bookingId,
        emailType: 'payment_link',
      });
      emailSent = true;
    } catch (mailErr) {
      emailError = mailErr instanceof Error ? mailErr.message : String(mailErr);
      console.error('[approvePendingBooking] E-Mail-Versand fehlgeschlagen:', emailError);
    }
  }

  return {
    success: true,
    paymentLinkId: paymentLink.id,
    paymentUrl: paymentLink.url,
    emailSent,
    emailError,
  };
}

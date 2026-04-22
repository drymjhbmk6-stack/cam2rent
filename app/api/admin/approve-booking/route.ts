import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getStripe } from '@/lib/stripe';
import { getSiteUrl } from '@/lib/env-mode';

/**
 * POST /api/admin/approve-booking
 *
 * Admin genehmigt eine pending_verification Buchung:
 * 1. Markiert Konto als verifiziert
 * 2. Erstellt Stripe Payment Link
 * 3. Speichert Link in der Buchung
 * 4. Sendet Email an Kunden mit Zahlungslink (non-blocking)
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { bookingId } = (await req.json()) as { bookingId: string };

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Buchung laden
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: `Buchung nicht gefunden: ${bookingError?.message ?? 'unknown'}` }, { status: 404 });
    }

    if (booking.status !== 'pending_verification') {
      return NextResponse.json({ error: `Buchung ist im Status "${booking.status}" (erwartet: pending_verification).` }, { status: 400 });
    }

    // Pflichtfelder validieren
    if (typeof booking.price_total !== 'number' || booking.price_total <= 0) {
      return NextResponse.json({ error: `Buchung hat keinen gültigen price_total (${booking.price_total}).` }, { status: 400 });
    }
    if (!booking.product_name) {
      return NextResponse.json({ error: 'Buchung hat keinen product_name.' }, { status: 400 });
    }
    if (!booking.rental_from || !booking.rental_to) {
      return NextResponse.json({ error: 'Buchung hat keinen rental_from/rental_to.' }, { status: 400 });
    }

    // 1. Konto als verifiziert markieren
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
        console.warn('[approve-booking] Konnte Profil nicht verifizieren:', profileError.message);
        // non-fatal — Buchung kann trotzdem freigegeben werden
      }
    }

    // 2. Stripe Product + Price + Payment Link erstellen
    // Payment Links haben keinen expires_at — der Link bleibt gueltig bis wir
    // ihn bei Storno deaktivieren. Der Cron /api/cron/awaiting-payment-cancel
    // storniert unbezahlte Buchungen 48h (Versand) bzw. 24h (Abholung) vor
    // Mietbeginn.
    const amountCents = Math.round(booking.price_total * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: `Ungültiger Betrag: ${amountCents} cents` }, { status: 400 });
    }

    let paymentLink: { id: string; url: string };
    try {
      const stripe = await getStripe();
      const siteUrl = await getSiteUrl();
      const days = booking.days ?? 1;
      const productName = String(booking.product_name).slice(0, 200);

      // 2a. Stripe Product anlegen
      const stripeProduct = await stripe.products.create({
        name: `Buchung ${bookingId} — ${productName}`.slice(0, 250),
        description: `${days} Tage Miete (${booking.rental_from} bis ${booking.rental_to})`.slice(0, 500),
        metadata: { booking_id: bookingId },
      });

      // 2b. Price
      const stripePrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: amountCents,
        currency: 'eur',
      });

      // 2c. Payment Link
      const pl = await stripe.paymentLinks.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        metadata: {
          booking_id: bookingId,
          booking_type: 'pending_approval',
        },
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
      console.error('[approve-booking] Stripe-Fehler:', msg);
      return NextResponse.json({ error: `Stripe-Fehler: ${msg}` }, { status: 502 });
    }

    // 3. Zahlungslink in Buchung speichern + Status aktualisieren
    // notes ist optional — manche aeltere DB-Schemas haben die Spalte nicht.
    // Wir versuchen zuerst mit, fallen zurueck ohne.
    const updatePrimary = {
      status: 'awaiting_payment',
      stripe_payment_link_id: paymentLink.id,
      notes: `Zahlungslink: ${paymentLink.url}`,
    };
    let updateResult = await supabase.from('bookings').update(updatePrimary).eq('id', bookingId);
    if (updateResult.error && /notes/i.test(updateResult.error.message)) {
      console.warn('[approve-booking] notes-Spalte fehlt, retry ohne notes');
      const { notes: _omit, ...fallback } = updatePrimary;
      void _omit;
      updateResult = await supabase.from('bookings').update(fallback).eq('id', bookingId);
    }
    if (updateResult.error) {
      return NextResponse.json({ error: `DB-Update fehlgeschlagen: ${updateResult.error.message}` }, { status: 500 });
    }

    // 4. Email an Kunden senden (non-blocking — Payment Link ist schon sicher)
    // Template + Deadline kommen aus dem zentralen Helper, damit Re-Send und
    // initialer Versand identisch aussehen (und beide deliverability-gehaertet sind).
    const deliveryMode: 'versand' | 'abholung' = booking.delivery_mode === 'abholung' ? 'abholung' : 'versand';
    let emailSent = false;
    let emailError: string | null = null;
    if (booking.customer_email) {
      try {
        const { buildPaymentLinkEmail } = await import('@/lib/payment-link-email');
        const { sendAndLog } = await import('@/lib/email');
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
        console.error('[approve-booking] E-Mail-Versand fehlgeschlagen:', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      paymentUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
      emailSent,
      emailError,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[approve-booking] Unerwarteter Fehler:', msg, err);
    return NextResponse.json(
      { error: `Unerwarteter Fehler: ${msg}` },
      { status: 500 }
    );
  }
}

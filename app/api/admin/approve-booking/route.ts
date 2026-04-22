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

    // 2. Stripe Checkout Session erstellen (Payment Link)
    const amountCents = Math.round(booking.price_total * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: `Ungültiger Betrag: ${amountCents} cents` }, { status: 400 });
    }

    let session: { id: string; url: string | null };
    try {
      const stripe = await getStripe();
      const siteUrl = await getSiteUrl();
      const days = booking.days ?? 1;
      const productName = String(booking.product_name).slice(0, 200); // Stripe 250-char-Limit
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card', 'paypal'],
        line_items: [{
          price_data: {
            currency: 'eur',
            unit_amount: amountCents,
            product_data: {
              name: `Buchung ${bookingId} — ${productName}`.slice(0, 250),
              description: `${days} Tage Miete (${booking.rental_from} bis ${booking.rental_to})`.slice(0, 500),
            },
          },
          quantity: 1,
        }],
        metadata: {
          booking_id: bookingId,
          booking_type: 'pending_approval',
        },
        success_url: `${siteUrl}/buchung-bestaetigt?from=approval&booking_id=${bookingId}`,
        cancel_url: `${siteUrl}/konto/buchungen`,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 23, // 23 Stunden gueltig (Stripe-Max: 24h)
      });
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      console.error('[approve-booking] Stripe-Fehler:', msg);
      return NextResponse.json({ error: `Stripe-Fehler: ${msg}` }, { status: 502 });
    }

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe lieferte keinen Payment-Link zurück.' }, { status: 502 });
    }

    // 3. Zahlungslink in Buchung speichern + Status aktualisieren
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'awaiting_payment',
        payment_intent_id: session.id,
        notes: `Zahlungslink: ${session.url}`,
      })
      .eq('id', bookingId);

    if (updateError) {
      return NextResponse.json({ error: `DB-Update fehlgeschlagen: ${updateError.message}` }, { status: 500 });
    }

    // 4. Email an Kunden senden (non-blocking — Stripe-Session ist schon sicher)
    let emailSent = false;
    let emailError: string | null = null;
    if (booking.customer_email) {
      try {
        const { sendAndLog } = await import('@/lib/email');
        const priceFmt = Number(booking.price_total).toFixed(2);
        const customerName = booking.customer_name || 'dort';
        const days = booking.days ?? 1;
        await sendAndLog({
          to: booking.customer_email,
          subject: `Deine Buchung ${bookingId} wurde freigegeben — jetzt bezahlen`,
          html: `
            <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-weight: 900; font-size: 20px; letter-spacing: -0.5px;">
                  cam<span style="color: #3b82f6;">2</span>rent
                </span>
              </div>

              <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #1a1a1a;">
                Deine Buchung wurde freigegeben!
              </h1>
              <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
                Hallo ${customerName},<br/>
                dein Konto wurde erfolgreich verifiziert und deine Buchung <strong>${bookingId}</strong> ist bereit zur Bezahlung.
              </p>

              <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 4px; font-size: 13px; color: #94a3b8;">Buchungsdetails</p>
                <p style="margin: 0; font-weight: 700; font-size: 16px; color: #1a1a1a;">${booking.product_name}</p>
                <p style="margin: 4px 0 0; font-size: 14px; color: #64748b;">
                  ${days} Tage &middot; ${booking.rental_from} bis ${booking.rental_to}
                </p>
                <p style="margin: 12px 0 0; font-weight: 700; font-size: 20px; color: #1a1a1a;">
                  ${priceFmt} €
                </p>
              </div>

              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${session.url}" style="display: inline-block; background: #3b82f6; color: white; font-weight: 700; font-size: 16px; padding: 14px 36px; border-radius: 10px; text-decoration: none;">
                  Jetzt bezahlen
                </a>
              </div>

              <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                Der Zahlungslink ist 23 Stunden gültig. Falls du nicht rechtzeitig bezahlst, wird die Buchung automatisch storniert.
              </p>
            </div>
          `,
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
      paymentUrl: session.url,
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

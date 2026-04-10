import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/admin/approve-booking
 *
 * Admin genehmigt eine pending_verification Buchung:
 * 1. Markiert Konto als verifiziert
 * 2. Erstellt Stripe Payment Link
 * 3. Speichert Link in der Buchung
 * 4. Sendet Email an Kunden mit Zahlungslink
 */
export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    if (booking.status !== 'pending_verification') {
      return NextResponse.json({ error: 'Buchung ist nicht im Status "Warte auf Freigabe".' }, { status: 400 });
    }

    // 1. Konto als verifiziert markieren
    if (booking.user_id) {
      await supabase
        .from('profiles')
        .update({
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: 'admin',
        })
        .eq('id', booking.user_id);
    }

    // 2. Stripe Checkout Session erstellen (Payment Link)
    const amountCents = Math.round(booking.price_total * 100);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'paypal'],
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: amountCents,
          product_data: {
            name: `Buchung ${bookingId} — ${booking.product_name}`,
            description: `${booking.days} Tage Miete (${booking.rental_from} bis ${booking.rental_to})`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        booking_id: bookingId,
        booking_type: 'pending_approval',
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://test.cam2rent.de'}/buchung-bestaetigt?from=approval&booking_id=${bookingId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://test.cam2rent.de'}/konto/buchungen`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 72, // 72 Stunden gueltig
    });

    // 3. Zahlungslink in Buchung speichern + Status aktualisieren
    await supabase
      .from('bookings')
      .update({
        status: 'awaiting_payment',
        payment_intent_id: session.id,
        notes: `Zahlungslink: ${session.url}`,
      })
      .eq('id', bookingId);

    // 4. Email an Kunden senden
    if (booking.customer_email) {
      const { sendAndLog } = await import('@/lib/email');
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
              Hallo ${booking.customer_name || 'dort'},<br/>
              dein Konto wurde erfolgreich verifiziert und deine Buchung <strong>${bookingId}</strong> ist bereit zur Bezahlung.
            </p>

            <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <p style="margin: 0 0 4px; font-size: 13px; color: #94a3b8;">Buchungsdetails</p>
              <p style="margin: 0; font-weight: 700; font-size: 16px; color: #1a1a1a;">${booking.product_name}</p>
              <p style="margin: 4px 0 0; font-size: 14px; color: #64748b;">
                ${booking.days} Tage &middot; ${booking.rental_from} bis ${booking.rental_to}
              </p>
              <p style="margin: 12px 0 0; font-weight: 700; font-size: 20px; color: #1a1a1a;">
                ${booking.price_total.toFixed(2)} €
              </p>
            </div>

            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${session.url}" style="display: inline-block; background: #3b82f6; color: white; font-weight: 700; font-size: 16px; padding: 14px 36px; border-radius: 10px; text-decoration: none;">
                Jetzt bezahlen
              </a>
            </div>

            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              Der Zahlungslink ist 72 Stunden gueltig. Falls du nicht rechtzeitig bezahlst, wird die Buchung automatisch storniert.
            </p>
          </div>
        `,
        bookingId,
        emailType: 'payment_link',
      });
    }

    return NextResponse.json({
      success: true,
      paymentUrl: session.url,
    });
  } catch (err) {
    console.error('Approve booking error:', err);
    return NextResponse.json(
      { error: 'Fehler beim Genehmigen der Buchung.' },
      { status: 500 }
    );
  }
}

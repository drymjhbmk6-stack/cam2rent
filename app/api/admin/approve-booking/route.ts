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
    // Deadline aus admin_settings.awaiting_payment_cancel_rules berechnen.
    // Format: { versand: { days_before_rental, cutoff_hour_berlin }, abholung: {...} }
    let rules = {
      versand: { days_before_rental: 3, cutoff_hour_berlin: 18 },
      abholung: { days_before_rental: 1, cutoff_hour_berlin: 18 },
    };
    try {
      const { data: ruleSetting } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'awaiting_payment_cancel_rules')
        .maybeSingle();
      if (ruleSetting?.value) {
        const parsed = typeof ruleSetting.value === 'string' ? JSON.parse(ruleSetting.value) : ruleSetting.value;
        if (parsed?.versand) rules.versand = { ...rules.versand, ...parsed.versand };
        if (parsed?.abholung) rules.abholung = { ...rules.abholung, ...parsed.abholung };
      }
    } catch { /* default */ }

    const deliveryMode: 'versand' | 'abholung' = booking.delivery_mode === 'abholung' ? 'abholung' : 'versand';
    const rule = rules[deliveryMode];

    // Deadline berechnen fuer die E-Mail
    let deadlineLabel = 'vor Mietbeginn';
    try {
      const [y, m, d] = String(booking.rental_from).split('-').map((s) => parseInt(s, 10));
      const pivot = new Date(Date.UTC(y, m - 1, d - rule.days_before_rental));
      const dateStr = `${pivot.getUTCFullYear()}-${String(pivot.getUTCMonth() + 1).padStart(2, '0')}-${String(pivot.getUTCDate()).padStart(2, '0')}`;
      const { getBerlinOffsetString } = await import('@/lib/timezone');
      const offset = getBerlinOffsetString(new Date(`${dateStr}T12:00:00Z`));
      const deadlineDate = new Date(`${dateStr}T${String(rule.cutoff_hour_berlin).padStart(2, '0')}:00:00${offset}`);
      // Formatieren in Berlin-Zeit
      deadlineLabel = deadlineDate.toLocaleString('de-DE', {
        timeZone: 'Europe/Berlin',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' Uhr';
    } catch { /* fallback label */ }

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
                <a href="${paymentLink.url}" style="display: inline-block; background: #3b82f6; color: white; font-weight: 700; font-size: 16px; padding: 14px 36px; border-radius: 10px; text-decoration: none;">
                  Jetzt bezahlen
                </a>
              </div>

              <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                Bitte bezahle spätestens bis <strong>${deadlineLabel}</strong>. Erfolgt bis dahin keine Zahlung, wird die Buchung automatisch storniert.
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

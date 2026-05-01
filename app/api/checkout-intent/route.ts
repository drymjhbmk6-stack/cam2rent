import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase';
import { calcPriceFromTable, type AdminProduct } from '@/lib/price-config';
import { getStripe, buildPaymentDescription } from '@/lib/stripe';
import { getCheckoutConfig } from '@/lib/checkout-config';
import { generateBookingId } from '@/lib/booking-id';

const checkoutLimiter = rateLimit({ maxAttempts: 10, windowMs: 60 * 1000 }); // 10 pro Min

/**
 * POST /api/checkout-intent
 *
 * Erstellt einen Stripe PaymentIntent für den Warenkorb-Checkout.
 * Der Betrag umfasst alle Artikel + Versand - Rabatt.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = checkoutLimiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte warte kurz.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { amountCents, depositCents, customerName, customerEmail, userId, checkoutContext } = body as {
      amountCents: number;
      depositCents?: number;
      customerName: string;
      customerEmail: string;
      userId?: string;
      checkoutContext?: Record<string, unknown>;
    };

    if (!amountCents || amountCents < 50) {
      return NextResponse.json(
        { error: 'Ungültiger Betrag.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // ── Preis-Plausibilitätsprüfung (Defense gegen Client-Manipulation) ──
    // Der Client liefert amountCents — der Server rechnet aus den DB-Produkten
    // nach, ob das plausibel ist. Schutz gegen "Client schickt 1 € statt 500 €".
    // Tolerant: bis 70 % Gesamtnachlass erlaubt (Rabatte + Coupons + Loyalty).
    const items = (checkoutContext?.items as Array<{ productId: string; days: number; subtotal?: number }> | undefined) ?? [];
    if (items.length > 0) {
      try {
        const { data: prodRow } = await supabase
          .from('admin_config')
          .select('value')
          .eq('key', 'products')
          .maybeSingle();

        if (prodRow?.value && typeof prodRow.value === 'object') {
          const productMap = prodRow.value as Record<string, AdminProduct>;
          let expectedMinCents = 0;
          let hasData = false;
          for (const item of items) {
            const product = productMap[item.productId];
            if (!product || !Array.isArray(product.priceTable)) continue;
            const base = calcPriceFromTable(product, item.days);
            expectedMinCents += Math.round(base * 100);
            hasData = true;
          }

          if (hasData) {
            const floorCents = Math.floor(expectedMinCents * 0.3); // 70 % Rabatt-Puffer
            if (amountCents < floorCents) {
              console.error('[checkout-intent] Preis-Plausibilität verletzt:', {
                userId,
                amountCents,
                expectedMinCents,
                floorCents,
                items: items.map((i) => ({ productId: i.productId, days: i.days, subtotal: i.subtotal })),
              });
              return NextResponse.json(
                { error: 'Ungültige Preisangabe.' },
                { status: 400 },
              );
            }
          }
        }
      } catch (plausErr) {
        console.error('Preis-Plausibilitätsprüfung fehlgeschlagen:', plausErr);
        // Nicht hart blocken — Check ist Defense-in-Depth, nicht primäre Auth
      }
    }

    // Konto ist Pflicht — kein Gast-Checkout
    if (!userId) {
      return NextResponse.json(
        { error: 'Bitte erstelle ein Konto, um eine Buchung durchzuführen.', code: 'LOGIN_REQUIRED' },
        { status: 403 }
      );
    }

    // Verifizierungs- und Blacklist-Check
    const { data: profile } = await supabase
      .from('profiles')
      .select('verification_status, blacklisted')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.blacklisted) {
      return NextResponse.json(
        { error: 'Buchung nicht möglich.', code: 'BLACKLISTED' },
        { status: 403 }
      );
    }

    // Verifizierungspflicht VOR Zahlung:
    //   - Default-Verhalten (Flag aus): Kunde muss verifiziert sein, sonst 403.
    //   - Mit Flag `verificationDeferred`: unverifizierte Kunden duerfen zahlen.
    //     Die Buchung wird dann in confirm-cart mit `verification_required=true`
    //     markiert und erscheint in der Versand-Liste erst nach Freigabe.
    const checkoutCfg = await getCheckoutConfig();
    const isVerified = profile?.verification_status === 'verified';
    const verificationRequired = !isVerified;

    if (!isVerified && !checkoutCfg.verificationDeferred) {
      return NextResponse.json(
        { error: 'Dein Konto muss zuerst verifiziert werden. Bitte lade deinen Ausweis unter "Mein Konto" hoch.', code: 'NOT_VERIFIED' },
        { status: 403 }
      );
    }

    // Zusatz-Schranke: Express-Signup-Regeln (Max-Betrag, Vorlaufzeit) schuetzen
    // gegen "Neukunde bucht 5000-EUR-Setup fuer morgen". Nur relevant, wenn
    // verificationDeferred an ist — sonst greift oben bereits der harte 403.
    if (verificationRequired && checkoutCfg.verificationDeferred) {
      if (checkoutCfg.maxRentalValueForExpressSignup !== null) {
        const maxCents = Math.round(checkoutCfg.maxRentalValueForExpressSignup * 100);
        if (amountCents > maxCents) {
          return NextResponse.json(
            {
              error: `Fuer diese Buchungshoehe bitte zuerst Ausweis unter "Mein Konto" verifizieren.`,
              code: 'VERIFICATION_REQUIRED_FOR_AMOUNT',
            },
            { status: 403 }
          );
        }
      }
      if (checkoutCfg.minHoursBeforeRentalStart !== null) {
        const items = (checkoutContext?.items as Array<{ rentalFrom?: string }> | undefined) ?? [];
        const earliest = items
          .map((i) => i.rentalFrom)
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .sort()[0];
        if (earliest) {
          const start = new Date(earliest);
          if (!isNaN(start.getTime())) {
            const diffH = (start.getTime() - Date.now()) / 3_600_000;
            if (diffH < checkoutCfg.minHoursBeforeRentalStart) {
              return NextResponse.json(
                {
                  error: 'Fuer kurzfristige Buchungen bitte zuerst Ausweis verifizieren.',
                  code: 'VERIFICATION_REQUIRED_FOR_SHORT_NOTICE',
                },
                { status: 403 }
              );
            }
          }
        }
      }
    }

    const metadata: Record<string, string> = {
      booking_type: 'cart',
      customer_name: customerName,
      customer_email: customerEmail,
      user_id: userId ?? '',
    };
    if (verificationRequired) {
      // Stripe-Metadata hat nur String-Werte; wird in confirm-booking
      // ausgelesen und in bookings.verification_required uebernommen.
      metadata.verification_required = '1';
    }

    // Sprechende Description fuer PayPal-Verwendungszweck + Stripe-Quittung
    const cartItems = (checkoutContext?.items as Array<{
      productName?: string;
      rentalFrom?: string;
      rentalTo?: string;
    }> | undefined) ?? [];
    const firstItem = cartItems[0];

    // Buchungsnummer vorab generieren — damit der Kunde sie schon in PayPal
    // sieht ("Buchung BK-XXX-001 · ..."). confirm-cart nimmt sie aus metadata
    // statt eine neue zu erzeugen. Theoretische Race (zwei Checkouts in
    // derselben Woche zur selben Zeit) wird in confirm-cart per Fallback auf
    // generateBookingId() abgefangen, falls der Insert mit 23505 scheitert.
    let preBookingId: string | null = null;
    try {
      preBookingId = await generateBookingId();
    } catch (idErr) {
      console.warn('[checkout-intent] generateBookingId failed, fallback to no-id description:', idErr);
    }
    if (preBookingId) {
      metadata.pre_booking_id = preBookingId;
    }

    const description = buildPaymentDescription({
      bookingId: preBookingId,
      productName: firstItem?.productName,
      rentalFrom: firstItem?.rentalFrom,
      rentalTo: firstItem?.rentalTo,
      extraItemCount: cartItems.length > 1 ? cartItems.length - 1 : 0,
    });

    const stripe = await getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      description,
      automatic_payment_methods: { enabled: true },
      metadata,
      ...(depositCents && depositCents > 0 ? { setup_future_usage: 'off_session' } : {}),
    });

    // Deposit-Hold (Kaution-Vorautorisierung)
    let depositIntentId: string | null = null;
    if (depositCents && depositCents > 0) {
      const { data: setting } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'deposit_mode')
        .maybeSingle();

      const depositMode = setting?.value || 'haftung';
      if (depositMode === 'kaution') {
        const depositIntent = await stripe.paymentIntents.create({
          amount: depositCents,
          currency: 'eur',
          capture_method: 'manual',
          payment_method_types: ['card'],
          description: `Kaution · ${description}`.slice(0, 200),
          metadata: { ...metadata, type: 'deposit_hold' },
        });
        depositIntentId = depositIntent.id;
      }
    }

    // Checkout-Kontext serverseitig speichern (sessionStorage ist nach Stripe-Redirect unzuverlaessig)
    if (checkoutContext) {
      try {
        // Client-IP zur Consent-Zustimmung ergänzen (Beweiskraft § 356 Abs. 4 BGB)
        const ctxToStore: Record<string, unknown> = { ...checkoutContext };
        if (ctxToStore.earlyServiceConsentAt) {
          ctxToStore.earlyServiceConsentIp = ip;
        }
        // Flag wird in confirm-cart in die Buchung geschrieben
        if (verificationRequired) {
          ctxToStore.verificationRequired = true;
        }
        // Vorab-Buchungsnummer durchreichen, damit confirm-cart sie nutzt
        if (preBookingId) {
          ctxToStore.preBookingId = preBookingId;
        }
        await supabase
          .from('admin_settings')
          .upsert({
            key: `checkout_${paymentIntent.id}`,
            value: JSON.stringify(ctxToStore),
            updated_at: new Date().toISOString(),
          });
      } catch (ctxErr) {
        console.error('Checkout-Kontext speichern fehlgeschlagen:', ctxErr);
        // Nicht abbrechen — sessionStorage ist noch als Fallback da
      }
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      ...(depositIntentId ? { depositIntentId } : {}),
    });
  } catch (error) {
    console.error('Checkout PaymentIntent error:', error);
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json(
      { error: `Zahlung konnte nicht initialisiert werden: ${message}` },
      { status: 500 }
    );
  }
}

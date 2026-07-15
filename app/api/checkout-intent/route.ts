import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase';
import { calcPriceFromTable, getActiveSpecialDiscountPercent, type AdminProduct } from '@/lib/price-config';
import { getStripe, buildPaymentDescription } from '@/lib/stripe';
import { generateBookingId } from '@/lib/booking-id';
import { isUserTester, getTesterStripe } from '@/lib/tester-mode';
import { findCameraOverbookingConflict } from '@/lib/camera-availability-check';
import { isAllowedCountry, DEFAULT_COUNTRY, countryName, loadAllowedCountryCodes } from '@/lib/allowed-countries';

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
    const { amountCents, depositCents, customerName, customerEmail, userId: bodyUserId, checkoutContext } = body as {
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

    // Auth-Pinning: userId MUSS aus der Supabase-Session stammen, nicht aus dem
    // Body. Sonst koennte ein Angreifer (a) eigene Sperre via fremder userId
    // umgehen, (b) Buchungen im Namen anderer Kunden anlegen oder (c) eine
    // bekannte Tester-userId einschleusen, um auf Test-Stripe-Keys umzuschalten.
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Bitte erstelle ein Konto, um eine Buchung durchzuführen.', code: 'LOGIN_REQUIRED' },
        { status: 403 }
      );
    }
    if (bodyUserId && bodyUserId !== user.id) {
      return NextResponse.json(
        { error: 'User-ID stimmt nicht mit Session überein.' },
        { status: 403 }
      );
    }
    const userId = user.id;

    const supabase = createServiceClient();

    // ── Länder-Sperre (Server-seitig) ──────────────────────────────────────
    // cam2rent liefert vorerst nur innerhalb Deutschlands. Bei Versand muss das
    // im Checkout gewählte Lieferland erlaubt sein (siehe lib/allowed-countries).
    // Für Abholung irrelevant (kein Versand). Fehlt das Feld (alter Client),
    // gilt der Default (DE) → kein Bruch.
    const ctxDeliveryMode = (checkoutContext as { deliveryMode?: string } | undefined)?.deliveryMode;
    if (ctxDeliveryMode === 'versand') {
      const ctxCountry = ((checkoutContext as { country?: string } | undefined)?.country ?? DEFAULT_COUNTRY);
      const allowedCodes = await loadAllowedCountryCodes(supabase);
      if (!isAllowedCountry(ctxCountry, allowedCodes)) {
        return NextResponse.json(
          {
            error: allowedCodes.length > 1
              ? 'Dieses Lieferland ist nicht verfügbar.'
              : `Wir liefern aktuell nur innerhalb ${countryName(allowedCodes[0] ?? DEFAULT_COUNTRY)}s.`,
            code: 'COUNTRY_NOT_ALLOWED',
          },
          { status: 403 },
        );
      }
    }

    // ── Harte Ueberbuchungs-Sperre (Server-seitig, gegen Manipulation) ──────
    // Jeder Warenkorb-Artikel wird gegen den echten Live-Bestand geprueft. Ist
    // eine Kamera im gewaehlten Zeitraum voll belegt → 409, bevor gezahlt werden
    // kann (fangt veraltete Tabs + parallele Buchungen + Direktlinks ab).
    const overbookItems = (checkoutContext?.items as Array<{
      productId?: string;
      productName?: string;
      rentalFrom?: string;
      rentalTo?: string;
      deliveryMode?: string;
    }> | undefined) ?? [];
    for (const it of overbookItems) {
      if (!it.productId || !it.rentalFrom || !it.rentalTo) continue;
      const conflict = await findCameraOverbookingConflict(supabase, {
        productId: it.productId,
        rentalFrom: it.rentalFrom,
        rentalTo: it.rentalTo,
        deliveryMode: it.deliveryMode === 'abholung' ? 'abholung' : 'versand',
        excludeUserId: userId,
      });
      if (conflict) {
        return NextResponse.json(
          {
            error: `"${it.productName ?? 'Diese Kamera'}" ist im gewählten Zeitraum leider nicht mehr verfügbar. Bitte passe deinen Warenkorb an.`,
            code: 'NOT_AVAILABLE',
            productId: it.productId,
          },
          { status: 409 },
        );
      }
    }

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
            // Discount-aware Floor: Rabatte stapeln additiv (Aktion + Mengen +
            // Frühbucher + Treue + Coupon) und koennen >50% erreichen. Wir
            // ziehen die vom Client gemeldeten Rabatte vom Erwartungswert ab und
            // verlangen, dass der Kunde mindestens (Liste − Rabatte) zahlt — mit
            // 5%-Hard-Floor gegen grobe "1 EUR statt 500 EUR"-Manipulation. Die
            // finale, harte Pruefung passiert weiterhin in confirm-cart.
            const ctxDisc = (k: string): number => {
              const v = (checkoutContext as Record<string, unknown> | undefined)?.[k];
              return typeof v === 'number' && v > 0 ? v : 0;
            };
            const claimedCents = Math.round(
              (ctxDisc('discountAmount') + ctxDisc('productDiscount') + ctxDisc('durationDiscount')
                + ctxDisc('earlyBirdDiscount') + ctxDisc('loyaltyDiscount')) * 100,
            );
            // Sonderkondition (Kunden-Rabatt) serverseitig aus profiles auflösen
            // (maßgeblich, nicht aus dem Client). Sie ERSETZT die Auto-Rabatte,
            // läuft im Floor aber additiv zur Coupon-Schicht (discountAmount).
            let serverSpecialCents = 0;
            try {
              const { data: sp } = await supabase
                .from('profiles')
                .select('special_discount_percent, special_discount_valid_until')
                .eq('id', userId)
                .maybeSingle();
              const spPct = getActiveSpecialDiscountPercent({
                percent: (sp as { special_discount_percent?: number | null } | null)?.special_discount_percent ?? null,
                validUntil: (sp as { special_discount_valid_until?: string | null } | null)?.special_discount_valid_until ?? null,
              });
              if (spPct > 0) serverSpecialCents = Math.round((expectedMinCents * spPct) / 100);
            } catch { /* defensiv: Migration evtl. nicht durch → kein Special-Floor */ }
            const floorCents = Math.max(
              Math.floor(expectedMinCents * 0.05),
              expectedMinCents - claimedCents - serverSpecialCents - 100,
            );
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

    // (Auth-Pinning oben bereits geprueft.)

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

    // Tester-Konto: ueberspringt Verifizierungs-Pflicht, nutzt Test-Stripe-Keys
    // (echte Karten/PayPal werden nicht belastet — nur 4242-... funktioniert).
    // Buchung wird unten als is_test=true markiert.
    const tester = await isUserTester(userId);

    // Verifizierungspflicht: Neukunden zahlen sofort — kein Zahlungslink-Umweg
    // mehr. Ein noch nicht verifizierter Account darf bezahlen; die Buchung
    // wird in confirm-cart mit `verification_required=true` markiert (Status
    // bleibt 'confirmed') und erscheint in der Versand-Liste erst nach der
    // Ausweis-Freigabe. Der Ausweis wird also vor dem Versand geprueft, nicht
    // vor der Zahlung. Tester: Verifizierung wird komplett uebersprungen.
    const isVerified = tester || profile?.verification_status === 'verified';
    const verificationRequired = !isVerified;

    // Refund-Loop-Schutz (Audit Sweep 6, Vuln 16): wenn der Kunde bereits 2x
    // wegen fehlendem Ausweis-Upload automatisch storniert wurde, neue
    // Buchungen ablehnen — sonst kann er unendlich oft buchen + erstattet
    // bekommen, was Stripe-Gebuehren verursacht und Inventar fuer 48h blockt.
    if (verificationRequired) {
      const { count: priorAutoCancels } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'cancelled')
        .ilike('notes', '%Ausweis-Upload wurde nicht fristgerecht%');
      if ((priorAutoCancels ?? 0) >= 2) {
        return NextResponse.json(
          {
            error: 'Bitte lade zuerst deinen Ausweis unter "Mein Konto" hoch — frueher gestartete Buchungen wurden mehrfach automatisch storniert.',
            code: 'TOO_MANY_AUTO_CANCELS',
          },
          { status: 403 }
        );
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
    if (tester) {
      // Wird in confirm-cart ausgelesen — bookings.is_test=true setzen
      metadata.tester = '1';
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
    // Tester-User behalten is_test=true auch im Live-Modus — der Generator
    // muss diesen Wert kennen, damit Tester- und Live-Buchungen NICHT auf
    // derselben Wochennummer kollidieren (zwei getrennte Counter-Pools).
    let preBookingId: string | null = null;
    try {
      preBookingId = await generateBookingId({ isTest: tester || undefined });
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

    // Tester-Konto nutzt Test-Stripe-Keys (auch wenn die Seite live ist).
    // Damit werden echte Karten/PayPal nicht belastet — der Tester-Flow
    // funktioniert nur mit Test-Karten (z.B. 4242 4242 4242 4242).
    const stripe = tester ? getTesterStripe() : await getStripe();
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

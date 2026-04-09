import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
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
    if (!profile || profile.verification_status !== 'verified') {
      return NextResponse.json(
        { error: 'Dein Konto muss zuerst verifiziert werden. Bitte lade deinen Ausweis unter "Mein Konto" hoch.', code: 'NOT_VERIFIED' },
        { status: 403 }
      );
    }

    const metadata = {
      booking_type: 'cart',
      customer_name: customerName,
      customer_email: customerEmail,
      user_id: userId ?? '',
    };

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
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

      const depositMode = setting?.value || 'both';
      if (depositMode === 'kaution' || depositMode === 'both') {
        const depositIntent = await stripe.paymentIntents.create({
          amount: depositCents,
          currency: 'eur',
          capture_method: 'manual',
          payment_method_types: ['card'],
          metadata: { ...metadata, type: 'deposit_hold' },
        });
        depositIntentId = depositIntent.id;
      }
    }

    // Checkout-Kontext serverseitig speichern (sessionStorage ist nach Stripe-Redirect unzuverlaessig)
    if (checkoutContext) {
      try {
        await supabase
          .from('admin_settings')
          .upsert({
            key: `checkout_${paymentIntent.id}`,
            value: JSON.stringify(checkoutContext),
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

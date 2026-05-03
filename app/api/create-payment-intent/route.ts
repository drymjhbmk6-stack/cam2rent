import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase';
import { getStripe, buildPaymentDescription } from '@/lib/stripe';
import { isUserTester, getTesterStripe } from '@/lib/tester-mode';

const paymentLimiter = rateLimit({ maxAttempts: 10, windowMs: 60 * 1000 }); // 10 pro Min

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = paymentLimiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte warte kurz.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { amountCents, depositCents, metadata } = body as {
      amountCents: number;
      depositCents?: number;
      metadata: Record<string, string>;
    };

    if (!amountCents || amountCents < 50) {
      return NextResponse.json(
        { error: 'Ungültiger Betrag.' },
        { status: 400 }
      );
    }

    // Auth-Pinning: metadata.user_id MUSS aus der Session kommen, nicht aus dem
    // Body. Verhindert: Schwarze-Liste-Bypass via fremder userId, Buchungs-
    // Attribution an Opfer, Tester-Flag-Injection.
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
    if (metadata.user_id && metadata.user_id !== user.id) {
      return NextResponse.json(
        { error: 'User-ID stimmt nicht mit Session überein.' },
        { status: 403 }
      );
    }
    metadata.user_id = user.id;

    // Verifizierungs- und Blacklist-Check
    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('verification_status, blacklisted')
      .eq('id', metadata.user_id)
      .maybeSingle();

    if (profile?.blacklisted) {
      return NextResponse.json(
        { error: 'Buchung nicht möglich.', code: 'BLACKLISTED' },
        { status: 403 }
      );
    }

    // Tester-Konto: ueberspringt Verification, nutzt Test-Stripe-Keys.
    // user.id ist die session-gepinnte Quelle der Wahrheit (siehe oben).
    const tester = await isUserTester(user.id);
    if (!tester && (!profile || profile.verification_status !== 'verified')) {
      return NextResponse.json(
        { error: 'Dein Konto muss zuerst verifiziert werden. Bitte lade deinen Ausweis unter "Mein Konto" hoch.', code: 'NOT_VERIFIED' },
        { status: 403 }
      );
    }
    const stripe = tester ? getTesterStripe() : await getStripe();
    if (tester) metadata.tester = '1';

    // Sprechende Description fuer PayPal-Verwendungszweck + Stripe-Quittung
    const description = buildPaymentDescription({
      productName: metadata.product_name ?? null,
      rentalFrom: metadata.rental_from ?? null,
      rentalTo: metadata.rental_to ?? null,
    });

    // Haupt-PaymentIntent
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
      // Deposit-Modus prüfen
      const supabase = createServiceClient();
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
          metadata: {
            ...metadata,
            type: 'deposit_hold',
          },
        });
        depositIntentId = depositIntent.id;
      }
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      ...(depositIntentId ? { depositIntentId } : {}),
    });
  } catch (error) {
    console.error('Stripe PaymentIntent error:', error);
    return NextResponse.json(
      { error: 'Zahlung konnte nicht initialisiert werden.' },
      { status: 500 }
    );
  }
}

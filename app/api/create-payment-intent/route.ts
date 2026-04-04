import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
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

    // Verifizierungs- und Blacklist-Check
    if (metadata.user_id) {
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
      if (profile && profile.verification_status !== 'verified') {
        return NextResponse.json(
          { error: 'Bitte verifiziere zuerst dein Konto.', code: 'NOT_VERIFIED' },
          { status: 403 }
        );
      }
    }

    // Haupt-PaymentIntent
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
      // Deposit-Modus prüfen
      const supabase = createServiceClient();
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

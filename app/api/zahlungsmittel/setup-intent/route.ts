import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  resolveUserStripe,
  getOrCreateStripeCustomer,
} from '@/lib/stripe-customer';

const limiter = rateLimit({ maxAttempts: 15, windowMs: 60 * 1000 });

/**
 * POST /api/zahlungsmittel/setup-intent
 * Erzeugt einen SetupIntent, damit der Kunde im Konto eine Karte hinterlegen
 * kann (ohne sofortige Zahlung). Legt bei Bedarf den Stripe-Customer an.
 * Antwort: { clientSecret }.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen. Bitte warte kurz.' }, { status: 429 });
  }

  try {
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
      return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
    }

    const { stripe, useTest } = await resolveUserStripe(user.id);
    const customerId = await getOrCreateStripeCustomer({
      userId: user.id,
      email: user.email,
      name: (user.user_metadata?.full_name as string | undefined) ?? user.email,
      stripe,
      useTest,
    });
    if (!customerId) {
      return NextResponse.json(
        { error: 'Zahlungsmittel-Verwaltung ist gerade nicht verfügbar. Bitte später erneut versuchen.' },
        { status: 503 },
      );
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (error) {
    console.error('[zahlungsmittel/setup-intent] Fehler:', error);
    return NextResponse.json(
      { error: 'Zahlungsmittel konnte nicht vorbereitet werden.' },
      { status: 500 },
    );
  }
}

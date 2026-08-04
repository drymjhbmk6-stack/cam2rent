import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  resolveUserStripe,
  getStoredCustomerId,
  listSavedCards,
} from '@/lib/stripe-customer';

const limiter = rateLimit({ maxAttempts: 30, windowMs: 60 * 1000 });

async function getSessionUser() {
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
  return user;
}

/** GET — Liste der gespeicherten Karten des eingeloggten Kunden. */
export async function GET(req: NextRequest) {
  if (!limiter.check(getClientIp(req)).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

    const { stripe, useTest } = await resolveUserStripe(user.id);
    const customerId = await getStoredCustomerId(user.id, useTest);
    if (!customerId) return NextResponse.json({ cards: [] });

    const cards = await listSavedCards(stripe, customerId);
    return NextResponse.json({ cards });
  } catch (error) {
    console.error('[zahlungsmittel] GET Fehler:', error);
    return NextResponse.json({ cards: [] });
  }
}

/** DELETE — Ein gespeichertes Zahlungsmittel entfernen (detach). */
export async function DELETE(req: NextRequest) {
  if (!limiter.check(getClientIp(req)).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const paymentMethodId = typeof body?.paymentMethodId === 'string' ? body.paymentMethodId : '';
    if (!paymentMethodId.startsWith('pm_')) {
      return NextResponse.json({ error: 'Ungültiges Zahlungsmittel.' }, { status: 400 });
    }

    const { stripe, useTest } = await resolveUserStripe(user.id);
    const customerId = await getStoredCustomerId(user.id, useTest);
    if (!customerId) {
      return NextResponse.json({ error: 'Kein Zahlungsmittel hinterlegt.' }, { status: 404 });
    }

    // Ownership-Check: die PaymentMethod muss zum Customer DIESES Users gehoeren.
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== customerId) {
      return NextResponse.json({ error: 'Nicht berechtigt.' }, { status: 403 });
    }

    await stripe.paymentMethods.detach(paymentMethodId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[zahlungsmittel] DELETE Fehler:', error);
    return NextResponse.json({ error: 'Zahlungsmittel konnte nicht entfernt werden.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';

/**
 * GET /api/booking/[id]/pay
 *
 * Liefert den Stripe Payment Link URL fuer eine Buchung des eingeloggten
 * Kunden zurueck. Optional Redirect (?redirect=1) auf die Stripe-Seite.
 *
 * Nur fuer Buchungen im Status `awaiting_payment` mit gesetztem
 * stripe_payment_link_id. Pruefung: Buchung gehoert zum eingeloggten User
 * (user_id ODER customer_email).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const wantsRedirect = req.nextUrl.searchParams.get('redirect') === '1';

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, user_id, customer_email, status, stripe_payment_link_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // Sweep 7 Vuln 15 — E-Mail-Fallback entfernt:
  // Vorher konnte ein Angreifer per Express-Signup ein Konto auf die E-Mail
  // einer Gastbuchung anlegen und dann den Stripe-Payment-Link einer fremden
  // Gastbuchung anfordern (Geldwaesche-Vehikel: gestohlene Karte → Zahlung →
  // Ware geht an die echte Lieferadresse des Opfers). Sweep 6 hat den gleichen
  // Fallback in /api/meine-buchungen entfernt — hier wurde er uebersehen.
  if (booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  if (booking.status !== 'awaiting_payment' || !booking.stripe_payment_link_id) {
    return NextResponse.json(
      { error: `Buchung im Status "${booking.status}" kann nicht bezahlt werden.` },
      { status: 400 },
    );
  }

  // Aktuellen Payment-Link-URL aus Stripe holen (statt aus notes parsen,
  // damit der URL immer aktuell ist und keine Storage-Side-Effects auftreten).
  let url: string;
  try {
    const stripe = await getStripe();
    const pl = await stripe.paymentLinks.retrieve(booking.stripe_payment_link_id);
    if (!pl.url) {
      return NextResponse.json({ error: 'Stripe-Link ohne URL.' }, { status: 502 });
    }
    url = pl.url;
  } catch (stripeErr) {
    const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
    console.error('[booking/pay] Stripe-Fehler:', msg);
    return NextResponse.json({ error: `Stripe-Fehler: ${msg}` }, { status: 502 });
  }

  if (wantsRedirect) {
    return NextResponse.redirect(url, 303);
  }
  return NextResponse.json({ paymentUrl: url });
}

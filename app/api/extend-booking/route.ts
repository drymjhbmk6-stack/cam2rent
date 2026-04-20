import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getPriceForDays } from '@/data/products';
import { getProducts } from '@/lib/get-products';
import { calcHaftungTieredPrice, DEFAULT_HAFTUNG } from '@/lib/price-config';
import { getStripe } from '@/lib/stripe';

const limiter = rateLimit({ maxAttempts: 5, windowMs: 60_000 });

/**
 * POST /api/extend-booking
 * Calculate extension price + create Stripe PaymentIntent.
 * Body: { bookingId: string, newRentalTo: string }
 */
export async function POST(req: NextRequest) {
  const products = await getProducts();
  const ip = getClientIp(req);
  const { success } = limiter.check(ip);
  if (!success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

  // Auth check
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
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const { bookingId, newRentalTo } = await req.json();
  if (!bookingId || !newRentalTo) {
    return NextResponse.json({ error: 'Fehlende Parameter.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single();

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // Check status
  if (!['confirmed', 'shipped'].includes(booking.status)) {
    return NextResponse.json({ error: 'Buchung kann nicht verlängert werden.' }, { status: 400 });
  }

  // Check rental hasn't ended — "heute" in Berlin-Zeit, sonst wuerde ein
  // Kunde um 23:30 Berlin am Miet-Endtag die Verlaengerung abgelehnt kriegen
  // (UTC ist 21:30 = noch "heute", aber Berlin ist auch "heute" — nur andersrum
  // kann es zu frueh ablehnen: 00:30 Berlin des Folgetages = 22:30 UTC des Vortags).
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  if (booking.rental_to < today) {
    return NextResponse.json({ error: 'Mietdauer ist bereits abgelaufen.' }, { status: 400 });
  }

  // Check newRentalTo > rental_to
  if (newRentalTo <= booking.rental_to) {
    return NextResponse.json({ error: 'Neues Rückgabedatum muss nach dem aktuellen liegen.' }, { status: 400 });
  }

  // Find product
  const product = products.find((p) => p.id === booking.product_id);
  if (!product) {
    return NextResponse.json({ error: 'Produkt nicht gefunden.' }, { status: 404 });
  }

  // Check availability for extended period (day after current rental_to to newRentalTo)
  const extendFrom = booking.rental_to; // We include the old end date since it's already booked
  const { count: overlapCount, error: availError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', booking.product_id)
    .neq('id', bookingId) // Exclude current booking
    .in('status', ['confirmed', 'shipped'])
    .lte('rental_from', newRentalTo)
    .gte('rental_to', extendFrom);

  if (availError) {
    return NextResponse.json({ error: 'Verfügbarkeitsprüfung fehlgeschlagen.' }, { status: 500 });
  }

  const bookedCount = overlapCount ?? 0;
  if (bookedCount >= product.stock) {
    return NextResponse.json({ error: 'Kamera ist im gewünschten Zeitraum leider nicht verfügbar.' }, { status: 409 });
  }

  // Calculate price difference
  const oldDays = booking.days;
  const newFrom = new Date(booking.rental_from);
  const newTo = new Date(newRentalTo);
  const newDays = Math.ceil((newTo.getTime() - newFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const oldRentalPrice = getPriceForDays(product, oldDays);
  const newRentalPrice = getPriceForDays(product, newDays);
  const priceDifference = Math.max(0, newRentalPrice - oldRentalPrice);

  // Haftung: Differenz zwischen altem und neuem Staffelpreis
  let haftungDiff = 0;
  if (booking.haftung === 'standard') {
    const oldH = calcHaftungTieredPrice(DEFAULT_HAFTUNG.standard, DEFAULT_HAFTUNG.standardIncrement, oldDays);
    const newH = calcHaftungTieredPrice(DEFAULT_HAFTUNG.standard, DEFAULT_HAFTUNG.standardIncrement, newDays);
    haftungDiff = Math.max(0, newH - oldH);
  } else if (booking.haftung === 'premium') {
    const oldH = calcHaftungTieredPrice(DEFAULT_HAFTUNG.premium, DEFAULT_HAFTUNG.premiumIncrement, oldDays);
    const newH = calcHaftungTieredPrice(DEFAULT_HAFTUNG.premium, DEFAULT_HAFTUNG.premiumIncrement, newDays);
    haftungDiff = Math.max(0, newH - oldH);
  }

  const totalDifference = priceDifference + haftungDiff;

  if (totalDifference < 0.50) {
    // Stripe minimum is 50 cents
    return NextResponse.json({ error: 'Aufpreis ist zu gering für eine Zahlung.' }, { status: 400 });
  }

  const amountCents = Math.round(totalDifference * 100);

  // Create Stripe PaymentIntent
  const stripe = await getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'eur',
    automatic_payment_methods: { enabled: true },
    metadata: {
      type: 'extension',
      booking_id: bookingId,
      original_rental_to: booking.rental_to,
      new_rental_to: newRentalTo,
      old_days: String(oldDays),
      new_days: String(newDays),
    },
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    priceDifference: totalDifference,
    rentalPriceDiff: priceDifference,
    haftungDiff,
    newDays,
    additionalDays: newDays - oldDays,
    newRentalTo,
  });
}

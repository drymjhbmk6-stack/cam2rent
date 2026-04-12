import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { getPriceForDays } from '@/data/products';
import { getProducts } from '@/lib/get-products';
import { calcHaftungTieredPrice, DEFAULT_HAFTUNG } from '@/lib/price-config';
import { sendExtensionConfirmation } from '@/lib/email';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/confirm-extension
 * Confirm payment + update booking.
 * Body: { bookingId: string, paymentIntentId: string, newRentalTo: string }
 */
export async function POST(req: NextRequest) {
  const products = await getProducts();
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

  const { bookingId, paymentIntentId, newRentalTo } = await req.json();
  if (!bookingId || !paymentIntentId || !newRentalTo) {
    return NextResponse.json({ error: 'Fehlende Parameter.' }, { status: 400 });
  }

  // Verify PaymentIntent
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') {
    return NextResponse.json({ error: `Zahlung nicht abgeschlossen (Status: ${paymentIntent.status}).` }, { status: 400 });
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

  // Idempotency: if already extended with this payment
  if (booking.extension_payment_intent_id === paymentIntentId) {
    return NextResponse.json({ success: true, message: 'Bereits verlängert.' });
  }

  // Re-check availability
  const product = products.find((p) => p.id === booking.product_id);
  if (product) {
    const { count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', booking.product_id)
      .neq('id', bookingId)
      .in('status', ['confirmed', 'shipped'])
      .lte('rental_from', newRentalTo)
      .gte('rental_to', booking.rental_to);

    if ((count ?? 0) >= product.stock) {
      // Refund the payment
      await stripe.refunds.create({ payment_intent: paymentIntentId });
      return NextResponse.json({ error: 'Leider nicht mehr verfügbar. Zahlung wurde erstattet.' }, { status: 409 });
    }
  }

  // Calculate new values
  const newFrom = new Date(booking.rental_from);
  const newTo = new Date(newRentalTo);
  const newDays = Math.ceil((newTo.getTime() - newFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const additionalDays = newDays - booking.days;

  const productData = products.find((p) => p.id === booking.product_id);
  const newRentalPrice = productData ? getPriceForDays(productData, newDays) : booking.price_rental + (additionalDays * (booking.price_rental / booking.days));

  let newHaftungPrice = booking.price_haftung || 0;
  if (booking.haftung === 'standard') {
    newHaftungPrice = calcHaftungTieredPrice(DEFAULT_HAFTUNG.standard, DEFAULT_HAFTUNG.standardIncrement, newDays);
  } else if (booking.haftung === 'premium') {
    newHaftungPrice = calcHaftungTieredPrice(DEFAULT_HAFTUNG.premium, DEFAULT_HAFTUNG.premiumIncrement, newDays);
  }

  const priceDifference = (paymentIntent.amount ?? 0) / 100;
  const newTotal = (booking.price_total || 0) + priceDifference;

  // Update booking
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      original_rental_to: booking.original_rental_to || booking.rental_to,
      rental_to: newRentalTo,
      days: newDays,
      price_rental: newRentalPrice,
      price_haftung: newHaftungPrice,
      price_total: newTotal,
      extension_payment_intent_id: paymentIntentId,
      extended_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  if (updateError) {
    console.error('Extension update error:', updateError);
    return NextResponse.json({ error: 'Buchung konnte nicht aktualisiert werden: ' + updateError.message }, { status: 500 });
  }

  // Send confirmation email (fire-and-forget)
  const customerName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Kunde';
  sendExtensionConfirmation({
    bookingId,
    customerName,
    customerEmail: user.email || '',
    productName: booking.product_name,
    originalRentalTo: booking.rental_to,
    newRentalTo,
    additionalDays,
    priceDifference,
    newTotal,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    newRentalTo,
    newDays,
    newTotal,
  });
}

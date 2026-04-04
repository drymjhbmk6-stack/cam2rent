import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import Stripe from 'stripe';
import { getRefundPercentage, isSelfServiceCancellable } from '@/data/cancellation';
import {
  sendCancellationConfirmation,
  sendAdminCancellationNotification,
} from '@/lib/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();

  // Verify session server-side
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
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const body = await req.json();
  const { bookingId } = body as { bookingId: string };

  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId fehlt.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch booking and verify it belongs to the user
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single();

  if (error || !booking) {
    return NextResponse.json(
      { error: 'Buchung nicht gefunden.' },
      { status: 404 }
    );
  }

  // Only allow self-service cancellation ≥ 7 days before rental start
  if (!isSelfServiceCancellable(booking.rental_from, booking.status)) {
    return NextResponse.json(
      {
        error:
          'Selbstservice-Stornierung ist nur bis 7 Tage vor Mietstart möglich. Bitte kontaktiere uns per E-Mail.',
      },
      { status: 400 }
    );
  }

  // Calculate refund
  const refundPercentage = getRefundPercentage(booking.rental_from);
  const refundAmountCents = Math.round(
    (booking.price_total ?? 0) * refundPercentage * 100
  );

  // Process Stripe refund (if any amount to refund)
  if (refundAmountCents > 0) {
    try {
      await stripe.refunds.create({
        payment_intent: booking.payment_intent_id,
        amount: refundAmountCents,
      });
    } catch (stripeErr) {
      console.error('[cancel-booking] Stripe refund error:', stripeErr);
      return NextResponse.json(
        {
          error:
            'Rückerstattung bei Stripe fehlgeschlagen. Bitte kontaktiere uns direkt.',
        },
        { status: 500 }
      );
    }
  }

  // Update booking status to cancelled
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId);

  if (updateError) {
    console.error('[cancel-booking] DB update error:', updateError);
    return NextResponse.json(
      { error: 'Buchungsstatus konnte nicht aktualisiert werden.' },
      { status: 500 }
    );
  }

  // Send emails (fire and forget)
  const emailData = {
    bookingId: booking.id,
    customerName: booking.customer_name ?? '',
    customerEmail: booking.customer_email ?? user.email ?? '',
    productName: booking.product_name,
    productId: booking.product_id,
    rentalFrom: booking.rental_from,
    rentalTo: booking.rental_to,
    days: booking.days,
    priceTotal: booking.price_total ?? 0,
    refundAmount: refundAmountCents / 100,
    refundPercentage,
  };

  Promise.all([
    sendCancellationConfirmation(emailData),
    sendAdminCancellationNotification(emailData),
  ]).catch((err) => console.error('[cancel-booking] Email error:', err));

  return NextResponse.json({
    success: true,
    refundAmount: refundAmountCents / 100,
    refundPercentage,
  });
}

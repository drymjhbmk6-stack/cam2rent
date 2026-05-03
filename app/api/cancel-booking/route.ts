import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { getRefundPercentage, isSelfServiceCancellable } from '@/data/cancellation';
import {
  sendCancellationConfirmation,
  sendAdminCancellationNotification,
} from '@/lib/email';
import { createAdminNotification } from '@/lib/admin-notifications';
import { getStripe } from '@/lib/stripe';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';

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

  const stripe = await getStripe();

  // ATOMIC GUARD: Status-Flip ZUERST. Verhindert dass zwei parallele
  // Storno-Anfragen vom selben Browser/Tab beide den Refund ausfuehren.
  // Ohne idempotencyKey wuerde Stripe das auch so durchwinken (= Doppel-Refund).
  const { data: claimed, error: claimError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .in('status', ['confirmed', 'shipped'])
    .select('id')
    .maybeSingle();

  if (claimError) {
    console.error('[cancel-booking] DB update error:', claimError);
    return NextResponse.json(
      { error: 'Buchungsstatus konnte nicht aktualisiert werden.' },
      { status: 500 }
    );
  }
  if (!claimed) {
    return NextResponse.json(
      { error: 'Buchung wurde bereits bearbeitet.' },
      { status: 409 }
    );
  }

  // Process Stripe refund (if any amount to refund). Manuelle Buchungen haben
  // payment_intent_id wie "MANUAL-..." → Stripe wuerde 404 zurueckgeben.
  // idempotencyKey verhindert doppelte Refunds bei Network-Retries.
  const isStripePI = !!booking.payment_intent_id?.startsWith('pi_');
  if (refundAmountCents > 0 && isStripePI) {
    try {
      await stripe.refunds.create(
        {
          payment_intent: booking.payment_intent_id,
          amount: refundAmountCents,
        },
        { idempotencyKey: `cancel-refund:${bookingId}` }
      );
    } catch (stripeErr) {
      console.error('[cancel-booking] Stripe refund error:', stripeErr);
      // Sweep 7 Vuln 24 — Refund-Fehler tracken + Admin-Notification.
      // Vorher wurde der Fehler nur geloggt; Kunde sah "Storno bestaetigt",
      // glaubt das Geld kommt zurueck, merkt aber erst beim Kontoauszug,
      // dass nichts angekommen ist.
      try {
        await supabase
          .from('bookings')
          .update({ refund_status: 'failed_pending_admin' })
          .eq('id', bookingId);
      } catch (rsErr) {
        // Spalte existiert evtl. noch nicht in alten DBs — defensive
        console.warn('[cancel-booking] refund_status-Update fehlgeschlagen:', rsErr);
      }
      try {
        const { createAdminNotification } = await import('@/lib/admin-notifications');
        await createAdminNotification(supabase, {
          type: 'payment_failed',
          title: `Refund fehlgeschlagen: ${bookingId}`,
          message: `Stornierung wurde durchgefuehrt, aber Stripe-Refund von ${(refundAmountCents / 100).toFixed(2)} EUR ist fehlgeschlagen. Bitte manuell pruefen.`,
          link: `/admin/buchungen/${bookingId}`,
        });
      } catch (notifErr) {
        console.error('[cancel-booking] Admin-Notification fehlgeschlagen:', notifErr);
      }
      // Status ist bereits cancelled — Customer-Response 200, aber Admin
      // ist jetzt informiert.
    }
  }

  // Kautions-Pre-Auth aufheben (sonst bleibt der Hold ~7 Tage auf der Karte
  // und liesse sich theoretisch noch nachtraeglich capturen, obwohl die
  // Buchung storniert ist). Verifications-Auto-Cancel macht es genauso.
  if (booking.deposit_intent_id && booking.deposit_status === 'held') {
    try {
      await stripe.paymentIntents.cancel(booking.deposit_intent_id);
      await supabase
        .from('bookings')
        .update({ deposit_status: 'released' })
        .eq('id', bookingId);
    } catch (depErr) {
      // Nicht-fatal: Storno laeuft weiter, Admin kann den Hold manuell freigeben.
      console.error('[cancel-booking] Deposit release failed:', depErr);
    }
  }

  // Zubehoer-Exemplare freigeben (non-blocking)
  releaseAccessoryUnitsFromBooking(bookingId)
    .catch((err) => console.error('[cancel-booking] accessory-unit release failed:', err));

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

  // Admin-Benachrichtigung (fire-and-forget)
  createAdminNotification(supabase, {
    type: 'booking_cancelled',
    title: `Buchung storniert: ${booking.id}`,
    message: `${booking.customer_name} — ${booking.product_name}`,
    link: `/admin/buchungen/${booking.id}`,
  });

  return NextResponse.json({
    success: true,
    refundAmount: refundAmountCents / 100,
    refundPercentage,
  });
}

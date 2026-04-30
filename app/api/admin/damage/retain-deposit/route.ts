import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/damage/retain-deposit
 * Kaution (teil-)einbehalten bei Schaden.
 * Body: { bookingId, amount }
 *
 * Wenn ein Deposit-Hold vorhanden ist (deposit_intent_id mit status 'held'),
 * wird der Betrag über Stripe captured. Andernfalls wird nur in der DB gespeichert.
 */
export async function POST(req: NextRequest) {
  try {
    const { bookingId, amount } = (await req.json()) as {
      bookingId: string;
      amount: number;
    };

    if (!bookingId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'bookingId und positiver Betrag erforderlich.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Buchung laden
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, payment_intent_id, deposit, deposit_intent_id, deposit_status')
      .eq('id', bookingId)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    if (amount > (booking.deposit || 0)) {
      return NextResponse.json(
        { error: `Betrag übersteigt die Kaution (${booking.deposit} €).` },
        { status: 400 }
      );
    }

    // Stripe Capture — wenn Deposit-Hold vorhanden
    let stripeCaptured = false;
    if (booking.deposit_intent_id && booking.deposit_status === 'held') {
      try {
        const amountCents = Math.round(amount * 100);
        const stripe = await getStripe();
        await stripe.paymentIntents.capture(booking.deposit_intent_id, {
          amount_to_capture: amountCents,
        });
        stripeCaptured = true;

        // Booking Status aktualisieren
        await supabase
          .from('bookings')
          .update({ deposit_status: 'captured' })
          .eq('id', bookingId);
      } catch (stripeErr) {
        console.error('Stripe capture error:', stripeErr);
        return NextResponse.json(
          { error: 'Stripe-Capture fehlgeschlagen. Bitte prüfe den Hold im Stripe-Dashboard.' },
          { status: 500 }
        );
      }
    }

    // Schadensmeldung aktualisieren
    const { error: updateErr } = await supabase
      .from('damage_reports')
      .update({ deposit_retained: amount })
      .eq('booking_id', bookingId)
      .eq('status', 'confirmed');

    if (updateErr) {
      console.error('Update damage_report deposit error:', updateErr);
    }

    await logAudit({
      action: 'damage.retain_deposit',
      entityType: 'damage',
      entityId: bookingId,
      changes: { retained: amount, stripeCaptured },
      request: req,
    });

    return NextResponse.json({
      success: true,
      retained: amount,
      stripeCaptured,
      message: stripeCaptured
        ? `${amount.toFixed(2)} € über Stripe eingezogen.`
        : `${amount.toFixed(2)} € als Kaution einbehalten (kein Stripe-Hold vorhanden).`,
    });
  } catch (err) {
    console.error('POST /api/admin/damage/retain-deposit error:', err);
    return NextResponse.json(
      { error: 'Fehler beim Einbehalten der Kaution.' },
      { status: 500 }
    );
  }
}

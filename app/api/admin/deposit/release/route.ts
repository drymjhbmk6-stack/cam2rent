import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/admin/deposit/release
 * Gibt die Kaution-Vorautorisierung frei (cancelt den Hold).
 * Body: { bookingId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { bookingId } = (await req.json()) as { bookingId: string };

    if (!bookingId) {
      return NextResponse.json({ error: 'Buchungs-ID fehlt.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('deposit_intent_id, deposit_status')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    if (!booking.deposit_intent_id) {
      return NextResponse.json({ error: 'Keine Kaution-Vorautorisierung vorhanden.' }, { status: 400 });
    }

    if (booking.deposit_status !== 'held') {
      return NextResponse.json({ error: 'Kaution ist nicht aktiv gehalten.' }, { status: 400 });
    }

    // Stripe: Hold aufheben
    await stripe.paymentIntents.cancel(booking.deposit_intent_id);

    // DB: Status aktualisieren
    await supabase
      .from('bookings')
      .update({ deposit_status: 'released' })
      .eq('id', bookingId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/deposit/release error:', err);
    return NextResponse.json({ error: 'Fehler beim Freigeben der Kaution.' }, { status: 500 });
  }
}

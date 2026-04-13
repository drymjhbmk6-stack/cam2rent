import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * POST /api/survey
 * Speichert Kundenfeedback nach Rückgabe.
 * Body: { bookingId, rating (1-5), feedback (optional text) }
 */
export async function POST(req: NextRequest) {
  try {
    const { bookingId, rating, feedback } = await req.json();

    if (!bookingId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Ungültige Daten.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Buchung laden für Kontext
    const { data: booking } = await supabase
      .from('bookings')
      .select('customer_name, customer_email, product_name')
      .eq('id', bookingId)
      .maybeSingle();

    // Survey in reviews Tabelle speichern (oder eigene survey Tabelle)
    const { error } = await supabase.from('reviews').insert({
      booking_id: bookingId,
      customer_name: booking?.customer_name ?? '',
      customer_email: booking?.customer_email ?? '',
      product_name: booking?.product_name ?? '',
      rating,
      comment: feedback || null,
      source: 'survey',
      status: rating >= 4 ? 'approved' : 'pending',
    });

    if (error) {
      console.error('Survey save error:', error);
      return NextResponse.json({ error: 'Feedback konnte nicht gespeichert werden.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Survey error:', err);
    return NextResponse.json({ error: 'Fehler.' }, { status: 500 });
  }
}

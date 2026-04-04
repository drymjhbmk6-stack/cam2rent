import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendReviewRequest } from '@/lib/email';

/**
 * PATCH /api/admin/update-booking-status
 * Body: { bookingId: string; status: 'completed' | 'confirmed' | 'cancelled' }
 *
 * Erlaubte Übergänge:
 *   confirmed  → completed  (Abholung-Rückgabe)
 *   shipped    → completed  (Rückgabe nach Versand)
 */
export async function PATCH(req: NextRequest) {
  const { bookingId, status } = (await req.json()) as {
    bookingId?: string;
    status?: string;
  };

  if (!bookingId || !status) {
    return NextResponse.json({ error: 'bookingId und status erforderlich.' }, { status: 400 });
  }

  const allowed = ['confirmed', 'shipped', 'completed', 'cancelled', 'damaged'];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId);

  if (error) {
    console.error('Status update error:', error);
    return NextResponse.json({ error: 'Status konnte nicht aktualisiert werden.' }, { status: 500 });
  }

  // Nach Abschluss: Bewertungsanfrage per E-Mail (non-blocking)
  if (status === 'completed') {
    Promise.resolve(
      supabase
        .from('bookings')
        .select('id, customer_name, customer_email, product_name, product_id')
        .eq('id', bookingId)
        .maybeSingle()
    ).then(({ data: booking }) => {
      if (booking?.customer_email) {
        sendReviewRequest({
          bookingId: booking.id,
          customerName: booking.customer_name || 'Kunde',
          customerEmail: booking.customer_email,
          productName: booking.product_name || 'Kamera',
        }).catch((err: unknown) => console.error('Review request email error:', err));
      }
    }).catch((err: unknown) => console.error('Review request lookup error:', err));
  }

  return NextResponse.json({ success: true });
}

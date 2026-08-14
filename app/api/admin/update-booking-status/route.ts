import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendReviewRequest } from '@/lib/email';
import { dispatchCompletionEmail } from '@/lib/booking-completion-email';
import { logAudit } from '@/lib/audit';
import { deductConsumablesForBooking } from '@/lib/verbrauch-deduct';
import { propagateShipmentStatus } from '@/lib/shipment-group';

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

  // 'cancelled' bewusst NICHT erlaubt — Storno muss über den PATCH-Pfad
  // (/api/admin/booking/[id]) mit allen Nebenwirkungen (Refund, Kaution-Release,
  // Zubehör-Freigabe, Storno-Mail/Beleg) laufen, nicht über diesen guardlosen Endpoint.
  const allowed = ['confirmed', 'preparing_shipment', 'awaiting_pickup', 'shipped', 'delivered', 'picked_up', 'completed', 'damaged'];
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

  await logAudit({
    action: 'booking.update_status',
    entityType: 'booking',
    entityId: bookingId,
    changes: { status },
    request: req,
  });

  // Verbrauchsmaterial-Auto-Abzug bei Versand/Abholung (idempotent pro Buchung).
  if (status === 'shipped' || status === 'picked_up') {
    deductConsumablesForBooking(supabase, bookingId).catch(() => {});
  }

  // Verknüpfte Bestellungen (gemeinsamer Versand/Retoure) ziehen mit.
  const shippedAt = status === 'shipped' ? { shipped_at: new Date().toISOString() } : {};
  propagateShipmentStatus(supabase, bookingId, status, shippedAt).catch(() => {});

  // Nach Abschluss: Abschluss-Bestätigung ("alles in Ordnung" + Kundenmaterial),
  // non-blocking. Dedup im Helper verhindert Doppel-Mail mit dem Retouren-Pfad.
  if (status === 'completed') {
    dispatchCompletionEmail(supabase, bookingId)
      .catch((err: unknown) => console.error('Completion email error:', err));
    // Verbrauchsmaterial mit Rückgabe-Trigger abziehen (idempotent pro Buchung).
    deductConsumablesForBooking(supabase, bookingId, 'return').catch(() => {});
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

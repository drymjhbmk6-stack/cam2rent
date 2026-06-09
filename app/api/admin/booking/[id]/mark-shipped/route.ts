import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { sendShippingConfirmation } from '@/lib/email';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/booking/[id]/mark-shipped
 *
 * Schneller "Als versendet markieren"-Schritt aus dem Dashboard-Aufgaben-Widget.
 * Setzt eine Versand-Buchung (Status preparing_shipment oder confirmed) atomar
 * auf 'shipped' + shipped_at und schickt dem Kunden die Versandbestaetigung —
 * mit Trackinglink, falls bereits eine Sendung (z.B. via Sendcloud-Etikett)
 * an der Buchung hinterlegt ist, sonst ohne Tracking-Block.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const cols =
    'id, status, delivery_mode, customer_email, customer_name, product_name, rental_from, rental_to, tracking_number, tracking_url, tracking_carrier';
  let { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select(cols)
    .eq('id', id)
    .maybeSingle();
  // Defensiv: tracking_carrier-Migration evtl. noch nicht durch.
  if (fetchError && /tracking_carrier/i.test(fetchError.message || '')) {
    ({ data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select(
        'id, status, delivery_mode, customer_email, customer_name, product_name, rental_from, rental_to, tracking_number, tracking_url',
      )
      .eq('id', id)
      .maybeSingle());
  }

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }
  if (booking.delivery_mode === 'abholung') {
    return NextResponse.json(
      { error: 'Abholbuchungen können nicht als versendet markiert werden.' },
      { status: 400 },
    );
  }
  if (booking.status !== 'preparing_shipment' && booking.status !== 'confirmed') {
    return NextResponse.json(
      { error: `Buchung im Status „${booking.status}" kann nicht als versendet markiert werden.` },
      { status: 409 },
    );
  }

  // Atomar gegen Doppelklick / Race: nur wenn Status noch der gelesene ist.
  const preStatus = booking.status;
  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'shipped', shipped_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', preStatus)
    .select('id')
    .maybeSingle();

  if (updateError) {
    console.error('[mark-shipped] update error:', updateError);
    return NextResponse.json({ error: 'Status konnte nicht aktualisiert werden.' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'Status wurde parallel geändert — bitte Liste neu laden.' },
      { status: 409 },
    );
  }

  // Versandbestaetigung an den Kunden (fire-and-forget). Tracking wird genutzt,
  // falls vorhanden — sonst sendet die Mail ohne Tracking-Block.
  const b = booking as typeof booking & { tracking_carrier?: string | null };
  if (b.customer_email) {
    sendShippingConfirmation({
      bookingId: b.id,
      customerName: b.customer_name ?? '',
      customerEmail: b.customer_email,
      productName: b.product_name,
      rentalFrom: b.rental_from,
      rentalTo: b.rental_to,
      trackingNumber: b.tracking_number ?? '',
      trackingUrl: b.tracking_url ?? '',
      carrier: b.tracking_carrier ?? '',
    }).catch((err) => console.error('[mark-shipped] shipping email error:', err));
  }

  await logAudit({
    action: 'booking.ship',
    entityType: 'booking',
    entityId: id,
    changes: { from: preStatus, source: 'dashboard_quick_action', tracking: !!b.tracking_number },
    request: req,
  });

  return NextResponse.json({ success: true, emailSent: !!b.customer_email });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sendShippingConfirmation } from '@/lib/email';
import { logAudit } from '@/lib/audit';

// Träger-spezifische Tracking-URLs
function buildTrackingUrl(carrier: string, trackingNumber: string): string {
  const clean = trackingNumber.trim();
  if (carrier === 'DPD') {
    return `https://www.dpd.com/de/de/empfangen/sendungsverfolgung/?parcelId=${clean}`;
  }
  // DHL (Standard)
  return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${clean}`;
}

/**
 * POST /api/admin/ship-booking
 * Body: { bookingId, trackingNumber, carrier }
 *
 * 1. Buchung in Supabase auf status='shipped' setzen
 * 2. Tracking-Daten speichern
 * 3. Versand-E-Mail an Kunden schicken
 *
 * Kein Auth-Guard hier (kommt in Session 11 mit Admin-Auth).
 * Vorerst nur aus /admin/* aufrufbar.
 */
export async function POST(req: NextRequest) {
  try {
    const { bookingId, trackingNumber, carrier } = (await req.json()) as {
      bookingId: string;
      trackingNumber: string;
      carrier: string;
    };

    if (!bookingId || !trackingNumber || !carrier) {
      return NextResponse.json(
        { error: 'bookingId, trackingNumber und carrier sind erforderlich.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Buchung laden
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select(
        'id, status, product_name, rental_from, rental_to, customer_email, customer_name, delivery_mode'
      )
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchError || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
    }

    if (booking.status !== 'confirmed') {
      return NextResponse.json(
        { error: `Buchung hat Status "${booking.status}" und kann nicht als versendet markiert werden.` },
        { status: 400 }
      );
    }

    if (booking.delivery_mode === 'abholung') {
      return NextResponse.json(
        { error: 'Abholbuchungen können nicht als versendet markiert werden.' },
        { status: 400 }
      );
    }

    const trackingUrl = buildTrackingUrl(carrier, trackingNumber);

    // Status auf shipped setzen + Tracking speichern
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'shipped',
        tracking_number: trackingNumber.trim(),
        tracking_url: trackingUrl,
        shipped_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return NextResponse.json(
        { error: 'Status konnte nicht aktualisiert werden.' },
        { status: 500 }
      );
    }

    // Versand-E-Mail an Kunden (fire-and-forget)
    if (booking.customer_email) {
      sendShippingConfirmation({
        bookingId: booking.id,
        customerName: booking.customer_name ?? '',
        customerEmail: booking.customer_email,
        productName: booking.product_name,
        rentalFrom: booking.rental_from,
        rentalTo: booking.rental_to,
        trackingNumber: trackingNumber.trim(),
        trackingUrl,
        carrier,
      }).catch((err) => console.error('Shipping email error:', err));
    }

    await logAudit({
      action: 'booking.ship',
      entityType: 'booking',
      entityId: bookingId,
      changes: { carrier, trackingNumber: trackingNumber.trim() },
      request: req,
    });

    return NextResponse.json({
      success: true,
      trackingNumber: trackingNumber.trim(),
      trackingUrl,
    });
  } catch (err) {
    console.error('ship-booking error:', err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}

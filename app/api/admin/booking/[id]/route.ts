import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/booking/[id]
 * Gibt eine einzelne Buchung mit allen Feldern + Kundenprofil zurück.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      'id, product_id, product_name, user_id, rental_from, rental_to, days, delivery_mode, shipping_method, shipping_price, shipping_address, haftung, accessories, price_rental, price_accessories, price_haftung, price_total, deposit, deposit_status, deposit_intent_id, status, customer_name, customer_email, tracking_number, tracking_url, shipped_at, return_condition, return_notes, returned_at, created_at, original_rental_to, extended_at, contract_signed, contract_signed_at, suspicious, suspicious_reasons'
    )
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // Kundenprofil laden, falls user_id vorhanden
  let customer = null;
  if (booking.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, address_street, address_zip, address_city, blacklisted, verification_status')
      .eq('id', booking.user_id)
      .maybeSingle();
    customer = profile;
  }

  return NextResponse.json({ booking, customer });
}

/**
 * PATCH /api/admin/booking/[id]
 * Body: { status: string }
 * Aktualisiert den Buchungsstatus.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status } = body as { status?: string };

  if (!status) {
    return NextResponse.json({ error: 'Status erforderlich.' }, { status: 400 });
  }

  const allowed = ['confirmed', 'shipped', 'completed', 'cancelled', 'damaged'];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Status update error:', error);
    return NextResponse.json({ error: 'Status konnte nicht aktualisiert werden.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

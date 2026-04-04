import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/booking/[id]
 * Gibt eine einzelne Buchung mit allen Feldern zurück (für Print/Detail-Ansicht).
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
      'id, product_id, product_name, rental_from, rental_to, days, delivery_mode, shipping_method, shipping_price, haftung, accessories, price_rental, price_accessories, price_haftung, price_total, deposit, status, customer_name, customer_email, tracking_number, tracking_url, shipped_at, return_condition, return_notes, returned_at, shipping_address, created_at'
    )
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  return NextResponse.json({ booking });
}

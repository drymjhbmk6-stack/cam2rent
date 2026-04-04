import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/versand-buchungen
 * Gibt alle Versand-Buchungen zurück (confirmed + shipped).
 * Inkl. vollständiger Felder für Fulfillment-Hub.
 */
export async function GET() {
  const supabase = createServiceClient();

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(
      'id, product_id, product_name, rental_from, rental_to, days, customer_name, customer_email, shipping_method, shipping_address, status, tracking_number, tracking_url, shipped_at, accessories, haftung, price_total, deposit, return_condition, return_notes, returned_at, created_at, label_url, return_label_url'
    )
    .eq('delivery_mode', 'versand')
    .in('status', ['confirmed', 'shipped'])
    .order('rental_from', { ascending: true });

  if (error) {
    console.error('versand-buchungen error:', error);
    return NextResponse.json({ bookings: [] });
  }

  return NextResponse.json({ bookings: bookings ?? [] });
}

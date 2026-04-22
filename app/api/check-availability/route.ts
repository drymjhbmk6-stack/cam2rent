import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getProducts } from '@/lib/get-products';
import { RESERVING_BOOKING_STATUSES } from '@/lib/booking-statuses';

/**
 * GET /api/check-availability?product_id=1&from=2026-04-10&to=2026-04-14
 *
 * Returns { available: boolean, remainingStock: number, stock: number }
 *
 * Counts confirmed bookings that overlap with the requested date range.
 * Two date ranges overlap when: A.start <= B.end AND A.end >= B.start
 */
export async function GET(req: NextRequest) {
  const products = await getProducts();
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('product_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!productId || !from || !to) {
    return NextResponse.json({ error: 'Fehlende Parameter.' }, { status: 400 });
  }

  const product = products.find((p) => p.id === productId);
  if (!product) {
    return NextResponse.json({ error: 'Produkt nicht gefunden.' }, { status: 404 });
  }

  const supabase = createServiceClient();

  const { count, error } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', productId)
    .in('status', [...RESERVING_BOOKING_STATUSES])
    .lte('rental_from', to)   // booking starts on or before request end
    .gte('rental_to', from);  // booking ends on or after request start

  if (error) {
    console.error('Supabase availability check error:', error);
    return NextResponse.json(
      { error: 'Verfügbarkeit konnte nicht geprüft werden.' },
      { status: 500 }
    );
  }

  const bookedCount = count ?? 0;
  const remainingStock = product.stock - bookedCount;
  const available = remainingStock > 0;

  return NextResponse.json({ available, remainingStock, stock: product.stock });
}

import { createServiceClient } from '@/lib/supabase';

/**
 * Lädt Reviews (optional gefiltert), angereichert um Kunden-/Produktinfo.
 * Geteilt von `GET /api/admin/reviews` UND der server-gerenderten
 * `/admin/bewertungen`-Page → keine Divergenz. Wirft nie.
 */
export interface ReviewRow {
  id: string;
  booking_id: string;
  product_id?: string;
  approved?: boolean;
  customer_name?: string;
  customer_email?: string;
  product_name?: string;
  [k: string]: unknown;
}

export async function loadReviews(
  filter: string = 'all',
): Promise<{ reviews: ReviewRow[]; error: string | null }> {
  const supabase = createServiceClient();

  let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
  if (filter === 'pending') {
    query = query.eq('approved', false);
  } else if (filter === 'approved') {
    query = query.eq('approved', true);
  }

  const { data: reviews, error } = await query;
  if (error) {
    return { reviews: [], error: error.message };
  }

  const bookingIds = [...new Set((reviews ?? []).map((r) => r.booking_id))];
  const bookingsMap: Record<string, { customer_name: string; customer_email: string; product_name: string }> = {};
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email, product_name')
      .in('id', bookingIds);
    for (const b of bookings ?? []) {
      bookingsMap[b.id] = {
        customer_name: b.customer_name || 'Unbekannt',
        customer_email: b.customer_email || '',
        product_name: b.product_name || '',
      };
    }
  }

  const enriched: ReviewRow[] = (reviews ?? []).map((r) => ({
    ...r,
    customer_name: bookingsMap[r.booking_id]?.customer_name || 'Unbekannt',
    customer_email: bookingsMap[r.booking_id]?.customer_email || '',
    product_name: bookingsMap[r.booking_id]?.product_name || r.product_id,
  }));

  return { reviews: enriched, error: null };
}

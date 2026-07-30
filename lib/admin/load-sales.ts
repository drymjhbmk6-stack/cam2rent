import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';

/**
 * Lädt die Verkaufs-Liste (bookings mit booking_type='kauf'), neueste zuerst.
 * Geteilt von `GET /api/admin/verkauf` (Listen-Zweig) UND der server-
 * gerenderten `/admin/verkauf`-Page → keine Divergenz. Wirft nie.
 */
export interface SaleRow {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  price_total: number | null;
  status: string;
  created_at: string;
  sale_items: unknown;
  stripe_payment_link_id: string | null;
  notes: string | null;
  [k: string]: unknown;
}

export async function loadSales(): Promise<{
  sales: SaleRow[];
  migrationPending: boolean;
  error: string | null;
}> {
  const supabase = createServiceClient();
  // booking_type/sale_items sind (noch) nicht im generierten Schema-Typ.
  const sb = supabase as unknown as SupabaseClient;

  const res = (await sb
    .from('bookings')
    .select('id, customer_name, customer_email, price_total, status, created_at, sale_items, stripe_payment_link_id, notes')
    .eq('booking_type', 'kauf')
    .order('created_at', { ascending: false })
    .limit(200)) as unknown as { data: SaleRow[] | null; error: { message: string } | null };

  if (res.error && /booking_type/i.test(res.error.message || '')) {
    // Migration noch nicht ausgeführt → es gibt schlicht keine Verkäufe.
    return { sales: [], migrationPending: true, error: null };
  }
  if (res.error) {
    return { sales: [], migrationPending: false, error: res.error.message };
  }
  return { sales: res.data ?? [], migrationPending: false, error: null };
}

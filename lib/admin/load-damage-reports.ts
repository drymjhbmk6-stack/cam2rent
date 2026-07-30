import { createServiceClient } from '@/lib/supabase';

/**
 * Lädt Schadensmeldungen (neueste zuerst), angereichert um Buchungs-Details.
 * Geteilt von `GET /api/admin/damage` UND der server-gerenderten
 * `/admin/schaeden`-Page → keine Divergenz. Wirft nie.
 */
export interface DamageReportRow {
  id: string;
  booking_id: string;
  booking?: {
    product_name: string;
    customer_name: string;
    customer_email: string;
    deposit: number;
    product_id: string;
    deposit_intent_id: string | null;
    deposit_status: string | null;
    price_haftung: number | null;
  } | null;
  [k: string]: unknown;
}

export async function loadDamageReports(
  opts: { status?: string | null; bookingId?: string | null } = {},
): Promise<{ reports: DamageReportRow[]; error: string | null }> {
  try {
    const supabase = createServiceClient();

    let query = supabase.from('damage_reports').select('*').order('created_at', { ascending: false });
    if (opts.status && ['open', 'confirmed', 'resolved'].includes(opts.status)) {
      query = query.eq('status', opts.status);
    }
    if (opts.bookingId) {
      query = query.eq('booking_id', opts.bookingId);
    }

    const { data: reports, error } = await query;
    if (error) throw error;

    const bookingIds = [...new Set((reports || []).map((r) => r.booking_id))];
    const bookingsMap: Record<string, NonNullable<DamageReportRow['booking']>> = {};

    if (bookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select(
          'id, product_name, product_id, customer_name, customer_email, deposit, deposit_intent_id, deposit_status, price_haftung',
        )
        .in('id', bookingIds);
      if (bookings) {
        for (const b of bookings) {
          bookingsMap[b.id] = {
            product_name: b.product_name,
            customer_name: b.customer_name,
            customer_email: b.customer_email,
            deposit: b.deposit,
            product_id: b.product_id,
            deposit_intent_id: b.deposit_intent_id ?? null,
            deposit_status: b.deposit_status ?? null,
            price_haftung: b.price_haftung ?? null,
          };
        }
      }
    }

    const enriched: DamageReportRow[] = (reports || []).map((r) => ({
      ...r,
      booking: bookingsMap[r.booking_id] || null,
    }));

    return { reports: enriched, error: null };
  } catch (err) {
    console.error('load damage reports error:', err);
    return { reports: [], error: 'Fehler beim Laden.' };
  }
}

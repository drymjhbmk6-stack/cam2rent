import { createServiceClient } from '@/lib/supabase';

/**
 * Lädt UGC-Einreichungen (optional gefiltert) + Status-Counts.
 * Geteilt von `GET /api/admin/customer-ugc` UND der server-gerenderten
 * `/admin/kunden-material`-Page → keine Divergenz. Wirft nie.
 */
export interface UgcEntryRow {
  id: string;
  status: string;
  [k: string]: unknown;
}

export type UgcCounts = {
  pending: number;
  approved: number;
  featured: number;
  rejected: number;
  withdrawn: number;
};

const UGC_COLS =
  'id, booking_id, user_id, customer_email, customer_name, file_paths, file_kinds, file_sizes, caption, consent_use_website, consent_use_social, consent_use_blog, consent_use_marketing, consent_name_visible, status, reward_coupon_code, bonus_coupon_code, featured_at, featured_channel, admin_note, rejected_reason, created_at, reviewed_at, is_test';

export async function loadCustomerUgc(
  opts: { status?: string | null; limit?: number } = {},
): Promise<{ entries: UgcEntryRow[]; counts: UgcCounts; error: string | null }> {
  const supabase = createServiceClient();
  const status = opts.status ?? null;
  const limit = Math.min(opts.limit ?? 100, 200);

  const emptyCounts: UgcCounts = { pending: 0, approved: 0, featured: 0, rejected: 0, withdrawn: 0 };

  let query = supabase
    .from('customer_ugc_submissions')
    .select(UGC_COLS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin/ugc] load Fehler:', error.message);
    return { entries: [], counts: emptyCounts, error: error.message };
  }

  const { data: allCounts } = await supabase.from('customer_ugc_submissions').select('status');
  const counts: UgcCounts = { ...emptyCounts };
  (allCounts ?? []).forEach((r) => {
    if (r.status in counts) counts[r.status as keyof UgcCounts]++;
  });

  return { entries: (data ?? []) as UgcEntryRow[], counts, error: null };
}

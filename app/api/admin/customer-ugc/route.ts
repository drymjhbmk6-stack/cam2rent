import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * GET /api/admin/customer-ugc?status=pending
 * Liste aller UGC-Einreichungen mit optionalem Status-Filter.
 * Auth: Admin-Middleware.
 */
export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 100), 200);

  let query = supabase
    .from('customer_ugc_submissions')
    .select(
      'id, booking_id, user_id, customer_email, customer_name, file_paths, file_kinds, file_sizes, caption, consent_use_website, consent_use_social, consent_use_blog, consent_use_marketing, consent_name_visible, status, reward_coupon_code, bonus_coupon_code, featured_at, featured_channel, admin_note, rejected_reason, created_at, reviewed_at, is_test',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[admin/ugc] GET Fehler:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Counts pro Status als Dashboard-Kacheln
  const { data: allCounts } = await supabase
    .from('customer_ugc_submissions')
    .select('status');

  const counts = {
    pending: 0,
    approved: 0,
    featured: 0,
    rejected: 0,
    withdrawn: 0,
  } as Record<string, number>;

  (allCounts ?? []).forEach((r) => {
    if (r.status in counts) counts[r.status as string]++;
  });

  return NextResponse.json({ entries: data ?? [], counts });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * GET /api/admin/newsletter/subscribers
 * Query: ?confirmed=all|true|false&q=email-suche&page=1&limit=50
 */
export async function GET(req: NextRequest) {
  const supabase = createServiceClient();

  const sp = req.nextUrl.searchParams;
  const confirmedFilter = sp.get('confirmed') ?? 'all';
  const q = sp.get('q')?.trim() ?? '';
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(10, parseInt(sp.get('limit') ?? '50', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('newsletter_subscribers')
    .select(
      'id, email, confirmed, confirmed_at, unsubscribed, unsubscribed_at, source, created_at, is_test',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (confirmedFilter === 'true') query = query.eq('confirmed', true).eq('unsubscribed', false);
  else if (confirmedFilter === 'pending') query = query.eq('confirmed', false).eq('unsubscribed', false);
  else if (confirmedFilter === 'unsubscribed') query = query.eq('unsubscribed', true);

  if (q) query = query.ilike('email', `%${q}%`);

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stats global
  const { data: allRows } = await supabase
    .from('newsletter_subscribers')
    .select('confirmed, unsubscribed');
  const stats = {
    total: allRows?.length ?? 0,
    confirmed: allRows?.filter((r) => r.confirmed && !r.unsubscribed).length ?? 0,
    pending: allRows?.filter((r) => !r.confirmed && !r.unsubscribed).length ?? 0,
    unsubscribed: allRows?.filter((r) => r.unsubscribed).length ?? 0,
  };

  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
    stats,
  });
}

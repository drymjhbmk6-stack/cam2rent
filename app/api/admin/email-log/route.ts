import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/email-log
 *
 * Paginierte Abfrage aller gesendeten E-Mails.
 * Query-Parameter: page, limit, type, status, search, bookingId
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = parseInt(sp.get('page') || '1', 10);
  const limit = parseInt(sp.get('limit') || '50', 10);
  const typeFilter = sp.get('type') || '';
  const statusFilter = sp.get('status') || '';
  const search = sp.get('search') || '';
  const bookingId = sp.get('bookingId') || '';

  const offset = (page - 1) * limit;
  const supabase = createServiceClient();

  let query = supabase
    .from('email_log')
    .select('*', { count: 'exact' })
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (typeFilter) query = query.eq('email_type', typeFilter);
  if (statusFilter) query = query.eq('status', statusFilter);
  if (bookingId) query = query.eq('booking_id', bookingId);
  if (search) query = query.or(`customer_email.ilike.%${search}%,booking_id.ilike.%${search}%,subject.ilike.%${search}%`);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    emails: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

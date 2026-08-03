import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeSearchInput } from '@/lib/search-sanitize';

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
  // "type" kann ein einzelner Typ ODER eine kommagetrennte Liste sein (Filter-Gruppen,
  // z.B. "auto_cancel,auto_cancel_payment,..." fuer "Auto-Storno (alle)").
  const typeList = (sp.get('type') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const statusFilter = sp.get('status') || '';
  const search = sp.get('search') || '';
  const bookingId = sp.get('bookingId') || '';

  const offset = (page - 1) * limit;
  const supabase = createServiceClient();
  const safeSearch = search ? sanitizeSearchInput(search) : '';
  const orFilter = safeSearch
    ? `customer_email.ilike.%${safeSearch}%,booking_id.ilike.%${safeSearch}%,subject.ilike.%${safeSearch}%`
    : '';

  let query = supabase
    .from('email_log')
    .select('*', { count: 'exact' })
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (typeList.length === 1) query = query.eq('email_type', typeList[0]);
  else if (typeList.length > 1) query = query.in('email_type', typeList);
  if (bookingId) query = query.eq('booking_id', bookingId);
  if (orFilter) query = query.or(orFilter);
  if (statusFilter) query = query.eq('status', statusFilter);

  // Gesamtzaehler ueber ALLE Treffer (nicht nur die aktuelle Seite) — respektieren dieselben
  // Filter (ausser Status), damit "Gesendet"/"Fehlgeschlagen" die echte Summe zeigen.
  const buildStatusCount = (status: 'sent' | 'failed') => {
    let q = supabase.from('email_log').select('*', { count: 'exact', head: true });
    if (typeList.length === 1) q = q.eq('email_type', typeList[0]);
    else if (typeList.length > 1) q = q.in('email_type', typeList);
    if (bookingId) q = q.eq('booking_id', bookingId);
    if (orFilter) q = q.or(orFilter);
    return q.eq('status', status);
  };

  const [{ data, count, error }, sentRes, failedRes] = await Promise.all([
    query,
    buildStatusCount('sent'),
    buildStatusCount('failed'),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    emails: data ?? [],
    total: count ?? 0,
    sentCount: sentRes.count ?? 0,
    failedCount: failedRes.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

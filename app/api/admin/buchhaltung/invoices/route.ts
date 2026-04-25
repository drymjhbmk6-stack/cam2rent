import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { sanitizeSearchInput } from '@/lib/search-sanitize';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
  const offset = (page - 1) * limit;
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';

  const supabase = createServiceClient();

  let query = supabase
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('is_test', false)
    .order('invoice_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  if (search) {
    const safe = sanitizeSearchInput(search);
    if (safe) {
      query = query.or(
        `invoice_number.ilike.%${safe}%,booking_id.ilike.%${safe}%,sent_to_email.ilike.%${safe}%`
      );
    }
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Kundennamen aus Buchungen anreichern — Bulk-Lookup statt 1 Query/Invoice (war N+1).
  const bookingIds = (data || []).map((i) => i.booking_id).filter((id): id is string => !!id);
  const bookingMap = new Map<string, { customer_name: string | null; customer_email: string | null }>();
  if (bookingIds.length) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email')
      .in('id', bookingIds);
    (bookings ?? []).forEach((b) => bookingMap.set(b.id, b));
  }

  const invoices = (data || []).map((inv) => {
    const booking = inv.booking_id ? bookingMap.get(inv.booking_id) : undefined;
    return {
      ...inv,
      customer_name: booking?.customer_name || '',
      customer_email: inv.sent_to_email || booking?.customer_email || '',
      tax_mode: inv.tax_mode || 'kleinunternehmer',
      tax_rate: inv.tax_rate || 0,
      status: inv.status || 'paid',
    };
  });

  return NextResponse.json({
    invoices,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

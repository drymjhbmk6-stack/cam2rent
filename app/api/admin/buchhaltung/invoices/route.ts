import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

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
    query = query.or(
      `invoice_number.ilike.%${search}%,booking_id.ilike.%${search}%,sent_to_email.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Kundennamen aus Buchungen anreichern
  const invoices = await Promise.all((data || []).map(async (inv) => {
    let customerName = '';
    let customerEmail = inv.sent_to_email || '';

    if (inv.booking_id) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('customer_name, customer_email')
        .eq('id', inv.booking_id)
        .maybeSingle();

      if (booking) {
        customerName = booking.customer_name || '';
        customerEmail = customerEmail || booking.customer_email || '';
      }
    }

    return {
      ...inv,
      customer_name: customerName,
      customer_email: customerEmail,
      tax_mode: inv.tax_mode || 'kleinunternehmer',
      tax_rate: inv.tax_rate || 0,
      status: inv.status || 'paid',
    };
  }));

  return NextResponse.json({
    invoices,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

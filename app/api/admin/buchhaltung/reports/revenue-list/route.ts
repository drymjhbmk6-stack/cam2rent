import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from und to erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: invoices } = await supabase
    .from('invoices')
    .select('invoice_number, invoice_date, booking_id, sent_to_email, net_amount, tax_amount, gross_amount, status')
    .neq('status', 'cancelled')
    .gte('invoice_date', from)
    .lte('invoice_date', to)
    .order('invoice_date', { ascending: true });

  const items = await Promise.all((invoices || []).map(async (inv) => {
    let customerName = '';
    if (inv.booking_id) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('customer_name')
        .eq('id', inv.booking_id)
        .maybeSingle();
      customerName = booking?.customer_name || '';
    }
    return {
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      customer_name: customerName || inv.sent_to_email || '',
      net_amount: inv.net_amount || 0,
      tax_amount: inv.tax_amount || 0,
      gross_amount: inv.gross_amount || 0,
    };
  }));

  const total = items.reduce((sum, i) => sum + i.gross_amount, 0);

  return NextResponse.json({ items, total });
}

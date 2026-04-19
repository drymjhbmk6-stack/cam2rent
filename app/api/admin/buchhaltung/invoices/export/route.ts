import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const format = searchParams.get('format') || 'csv';
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';

  const supabase = createServiceClient();

  let query = supabase
    .from('invoices')
    .select('*')
    .order('invoice_date', { ascending: false });

  if (status) query = query.eq('status', status);
  if (search) query = query.or(`invoice_number.ilike.%${search}%,booking_id.ilike.%${search}%,sent_to_email.ilike.%${search}%`);

  const { data } = await query;

  if (format === 'csv') {
    const lines = ['Rechnungsnr.;Datum;Buchungs-Nr.;E-Mail;Netto;Steuer;Brutto;Status'];
    for (const inv of data || []) {
      lines.push([
        inv.invoice_number || '',
        inv.invoice_date || '',
        inv.booking_id || '',
        inv.sent_to_email || '',
        (inv.net_amount || 0).toFixed(2).replace('.', ','),
        (inv.tax_amount || 0).toFixed(2).replace('.', ','),
        (inv.gross_amount || 0).toFixed(2).replace('.', ','),
        inv.status || 'paid',
      ].join(';'));
    }

    const csv = '\uFEFF' + lines.join('\r\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="rechnungen-export-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: 'Format nicht unterstützt' }, { status: 400 });
}

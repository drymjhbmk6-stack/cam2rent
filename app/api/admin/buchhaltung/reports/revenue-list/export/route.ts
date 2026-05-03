import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { buildCsvRow } from '@/lib/csv';

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
    .select('invoice_number, invoice_date, sent_to_email, net_amount, tax_amount, gross_amount')
    .neq('status', 'cancelled')
    .gte('invoice_date', from)
    .lte('invoice_date', to)
    .order('invoice_date', { ascending: true });

  const lines = ['Rechnungsnr.;Datum;E-Mail;Netto;Steuer;Brutto'];
  for (const inv of invoices || []) {
    lines.push(buildCsvRow([
      inv.invoice_number || '',
      inv.invoice_date || '',
      inv.sent_to_email || '',
      (inv.net_amount || 0).toFixed(2).replace('.', ','),
      (inv.tax_amount || 0).toFixed(2).replace('.', ','),
      (inv.gross_amount || 0).toFixed(2).replace('.', ','),
    ]));
  }

  const csv = '\uFEFF' + lines.join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="umsatzliste-${from}-${to}.csv"`,
    },
  });
}

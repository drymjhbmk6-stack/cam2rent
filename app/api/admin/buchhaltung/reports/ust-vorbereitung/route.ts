import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { calculateTax, type TaxMode } from '@/lib/accounting/tax';

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

  // Steuermodus
  const { data: taxRow } = await supabase.from('admin_settings').select('value').eq('key', 'tax_mode').maybeSingle();
  const taxMode = (taxRow?.value || 'kleinunternehmer') as TaxMode;
  const { data: rateRow } = await supabase.from('admin_settings').select('value').eq('key', 'tax_rate').maybeSingle();
  const taxRate = parseFloat(rateRow?.value || '19');

  // Umsätze aus Buchungen
  const { data: bookings } = await supabase
    .from('bookings')
    .select('price_total')
    .eq('is_test', false)
    .neq('status', 'cancelled')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);

  const totalRevenue = (bookings || []).reduce((sum, b) => sum + (b.price_total || 0), 0);
  const taxCalc = calculateTax(totalRevenue, taxMode, taxRate, 'gross');

  // Vorsteuer aus Ausgaben
  const { data: expenses } = await supabase
    .from('expenses')
    .select('tax_amount')
    .eq('is_test', false)
    .gte('expense_date', from)
    .lte('expense_date', to)
    .is('deleted_at', null);

  const vorsteuer = (expenses || []).reduce((sum, e) => sum + (e.tax_amount || 0), 0);

  return NextResponse.json({
    taxMode,
    revenue19: taxCalc.net,
    ust19: taxCalc.tax,
    vorsteuer,
    zahllast: taxCalc.tax - vorsteuer,
  });
}

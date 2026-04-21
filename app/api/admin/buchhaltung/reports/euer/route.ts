import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

const CATEGORY_LABELS: Record<string, string> = {
  stripe_fees: 'Zahlungsgebühren',
  shipping: 'Versandkosten',
  software: 'Software & Abos',
  hardware: 'Hardware & Equipment',
  marketing: 'Marketing & Werbung',
  office: 'Bürobedarf',
  travel: 'Reisekosten',
  insurance: 'Versicherungen',
  legal: 'Rechts- & Beratungskosten',
  depreciation: 'Abschreibungen (AfA)',
  asset_purchase: 'GWG-Sofortabzug',
  other: 'Sonstiges',
};

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
  const { data: taxRow } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'tax_mode')
    .maybeSingle();
  const taxMode = taxRow?.value || 'kleinunternehmer';

  // Einnahmen aus Buchungen — Test-Daten ausgeschlossen
  const { data: bookings } = await supabase
    .from('bookings')
    .select('price_rental, price_accessories, price_haftung, shipping_price, price_total, status')
    .eq('is_test', false)
    .neq('status', 'cancelled')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);

  const rental = (bookings || []).reduce((sum, b) => sum + (b.price_rental || 0) + (b.price_accessories || 0), 0);
  const haftung = (bookings || []).reduce((sum, b) => sum + (b.price_haftung || 0), 0);
  const shipping = (bookings || []).reduce((sum, b) => sum + (b.shipping_price || 0), 0);
  const incomeTotal = rental + haftung + shipping;

  // Ausgaben
  const { data: expenses } = await supabase
    .from('expenses')
    .select('category, gross_amount')
    .eq('is_test', false)
    .gte('expense_date', from)
    .lte('expense_date', to);

  const categoryTotals: Record<string, number> = {};
  for (const exp of expenses || []) {
    categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + (exp.gross_amount || 0);
  }

  // Stripe-Gebühren automatisch hinzufügen
  const { data: stripeTx } = await supabase
    .from('stripe_transactions')
    .select('fee')
    .eq('is_test', false)
    .gte('stripe_created_at', `${from}T00:00:00`)
    .lte('stripe_created_at', `${to}T23:59:59`);

  const stripeFees = (stripeTx || []).reduce((sum, t) => sum + (t.fee || 0), 0);
  if (stripeFees > 0) {
    categoryTotals.stripe_fees = (categoryTotals.stripe_fees || 0) + stripeFees;
  }

  const categories = Object.entries(categoryTotals).map(([category, amount]) => ({
    category,
    label: CATEGORY_LABELS[category] || category,
    amount,
  }));

  const expenseTotal = categories.reduce((sum, c) => sum + c.amount, 0);

  return NextResponse.json({
    income: {
      rental,
      haftung,
      shipping,
      other: 0,
      total: incomeTotal,
    },
    expenses: {
      categories,
      total: expenseTotal,
    },
    profit: incomeTotal - expenseTotal,
    taxMode,
    period: { from, to },
  });
}

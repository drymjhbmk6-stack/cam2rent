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
    .select('price_rental, price_accessories, price_haftung, shipping_price, price_total, discount_amount, duration_discount, loyalty_discount, status, delivery_mode')
    .eq('is_test', false)
    .neq('status', 'cancelled')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);

  const rental = (bookings || []).reduce((sum, b) => sum + (b.price_rental || 0), 0);
  const accessories = (bookings || []).reduce((sum, b) => sum + (b.price_accessories || 0), 0);
  const haftung = (bookings || []).reduce((sum, b) => sum + (b.price_haftung || 0), 0);
  const shipping = (bookings || []).reduce((sum, b) => sum + (b.shipping_price || 0), 0);
  const discounts = (bookings || []).reduce(
    (sum, b) => sum + (b.discount_amount || 0) + (b.duration_discount || 0) + (b.loyalty_discount || 0),
    0,
  );
  const bookingCount = (bookings || []).length;
  const pickupCount = (bookings || []).filter((b) => b.delivery_mode === 'abholung').length;
  const shippedCount = bookingCount - pickupCount;
  const incomeTotal = rental + accessories + haftung + shipping - discounts;

  // Ausgaben (inkl. Detail-Items pro Kategorie fuer aufklappbare Ansicht)
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, category, gross_amount, description, vendor, expense_date')
    .eq('is_test', false)
    .gte('expense_date', from)
    .lte('expense_date', to)
    .order('expense_date', { ascending: false });

  type ExpenseItem = {
    id: string;
    date: string;
    description: string;
    vendor: string;
    amount: number;
  };

  const categoryTotals: Record<string, number> = {};
  const categoryItems: Record<string, ExpenseItem[]> = {};
  for (const exp of expenses || []) {
    categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + (exp.gross_amount || 0);
    if (!categoryItems[exp.category]) categoryItems[exp.category] = [];
    categoryItems[exp.category].push({
      id: exp.id,
      date: exp.expense_date,
      description: exp.description ?? '',
      vendor: exp.vendor ?? '',
      amount: exp.gross_amount || 0,
    });
  }

  // Stripe-Gebühren automatisch hinzufügen (einzelne Transaktionen als Posten)
  const { data: stripeTx } = await supabase
    .from('stripe_transactions')
    .select('id, stripe_payment_intent_id, booking_id, fee, stripe_created_at')
    .eq('is_test', false)
    .gte('stripe_created_at', `${from}T00:00:00`)
    .lte('stripe_created_at', `${to}T23:59:59`)
    .order('stripe_created_at', { ascending: false });

  const stripeFees = (stripeTx || []).reduce((sum, t) => sum + (t.fee || 0), 0);
  if (stripeFees > 0) {
    categoryTotals.stripe_fees = (categoryTotals.stripe_fees || 0) + stripeFees;
    if (!categoryItems.stripe_fees) categoryItems.stripe_fees = [];
    for (const t of stripeTx || []) {
      if (!t.fee || t.fee <= 0) continue;
      // Nur Stripe-Gebuehren-Posten ergaenzen, die nicht schon als expense
      // importiert wurden (sonst Dopplung). source_type='stripe_fee' wird
      // in import-fees beim Import gesetzt; wir pruefen hier defensiv via
      // stripe_payment_intent_id in der Beschreibung.
      const alreadyImported = categoryItems.stripe_fees.some(
        (it) => it.description.includes(t.stripe_payment_intent_id),
      );
      if (alreadyImported) continue;
      categoryItems.stripe_fees.push({
        id: t.id,
        date: (t.stripe_created_at || '').slice(0, 10),
        description: t.booking_id
          ? `Stripe-Gebühr Buchung ${t.booking_id}`
          : `Stripe-Gebühr ${t.stripe_payment_intent_id?.slice(0, 14) ?? ''}`,
        vendor: 'Stripe',
        amount: t.fee,
      });
    }
  }

  const categories = Object.entries(categoryTotals)
    .map(([category, amount]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      amount,
      items: (categoryItems[category] ?? []).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    }))
    .sort((a, b) => b.amount - a.amount);

  const expenseTotal = categories.reduce((sum, c) => sum + c.amount, 0);

  return NextResponse.json({
    income: {
      rental,
      accessories,
      haftung,
      shipping,
      discounts,
      other: 0,
      total: incomeTotal,
    },
    bookingStats: {
      count: bookingCount,
      pickup: pickupCount,
      shipped: shippedCount,
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

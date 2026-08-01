import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { calculateTax, type TaxMode } from '@/lib/accounting/tax';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

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

  // Umsätze aus Buchungen — wird in beiden Modi geliefert (im Klein-Modus
  // als Brutto fuer die § 19 UStG-Grenzbeobachtung 22.000 EUR / 100.000 EUR).
  const fromIso = getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`;
  const toIso = getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`;

  // refund_amount vom Umsatz abziehen (konsistent zur EÜR bei Erstattungen).
  // Zufluss-Prinzip: awaiting_payment / pending_verification zaehlen NICHT.
  const buildRevenueQuery = (cols: string) => supabase
    .from('bookings')
    .select(cols)
    .eq('is_test', false)
    .neq('status', 'cancelled')
    .not('status', 'in', '(awaiting_payment,pending_verification)')
    .gte('created_at', fromIso)
    .lte('created_at', toIso);

  let { data: bookings, error: bookingsErr } = await buildRevenueQuery('price_total, refund_amount');
  if (bookingsErr && /refund_amount|column|schema cache|PGRST/i.test(bookingsErr.message)) {
    // Migration supabase-bookings-refund.sql noch nicht durch — ohne die Spalte
    // (refund_amount wird dann als 0 behandelt).
    ({ data: bookings, error: bookingsErr } = await buildRevenueQuery('price_total'));
  }

  const bookingRows = (bookings || []) as unknown as Array<{ price_total: number | null; refund_amount?: number | null }>;
  const totalRevenue = bookingRows.reduce(
    (sum, b) => sum + (b.price_total || 0) - (b.refund_amount || 0),
    0,
  );

  // Im Kleinunternehmer-Modus rechtlich KEIN Vorsteuerabzug (§ 19 UStG).
  // Vorher wurde Vorsteuer aus expenses.tax_amount summiert und zahllast als
  // 0 - vorsteuer ausgegeben → "negative Zahllast" als vermeintliche
  // Erstattung. Das ist falsch und irrefuehrend. Daher: harter Early-Return
  // mit ust19=0, vorsteuer=0, zahllast=0 + Hinweis fuer die UI.
  if (taxMode === 'kleinunternehmer') {
    return NextResponse.json({
      taxMode,
      revenue19: totalRevenue,
      ust19: 0,
      vorsteuer: 0,
      zahllast: 0,
      hinweis: 'Kleinunternehmer nach § 19 UStG — keine Umsatzsteuer, kein Vorsteuerabzug. Umsatz wird nur zur Grenzbeobachtung gezeigt.',
    });
  }

  const taxCalc = calculateTax(totalRevenue, taxMode, taxRate, 'gross');

  // Vorsteuer aus Ausgaben (nur Regelbesteuerung).
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

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { calculateTax, type TaxMode } from '@/lib/accounting/tax';
import { computeEuerData } from '@/lib/buchhaltung/euer-data';

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

  // Umsatz aus derselben Quelle wie die EÜR (lib/buchhaltung/euer-data.ts) —
  // massgeblich ist der tatsaechlich kassierte Betrag inkl. Storno-Einbehalt,
  // ohne unbezahlte Belege. Vorher summierte diese Route roh `price_total`
  // und lieferte damit eine zweite, abweichende "Umsatz"-Zahl fuer denselben
  // Zeitraum (relevant fuer die § 19-Grenzbeobachtung).
  let totalRevenue = 0;
  try {
    const euer = await computeEuerData(supabase, from, to);
    totalRevenue = euer.income.total;
  } catch (err) {
    console.error('[USt] EÜR-Umsatz konnte nicht berechnet werden:', err);
    return NextResponse.json({ error: 'Umsatz konnte nicht berechnet werden.' }, { status: 500 });
  }

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

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
  // Quelle 1: alte expenses-Tabelle (Stripe-Gebuehren-Import, migrierte Altdaten)
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

  // Quelle 2: beleg_positionen aus der NEUEN Buchhaltungs-Welt
  // (Konsolidierungs-Refactor 2026-05-05). Festgeschriebene Belege mit
  // Klassifizierung='ausgabe' fliessen direkt in die EÜR.
  // AfA/GWG-Positionen erzeugen separate Asset/Afa-Eintraege und werden
  // hier NICHT mitgezaehlt (sonst Doppel-Buchung).
  try {
    const { data: belegPositionen } = await supabase
      .from('beleg_positionen')
      .select(`
        id, bezeichnung, gesamt_brutto, kategorie, klassifizierung, ki_vorschlag,
        beleg:belege!inner(id, beleg_datum, status, is_test, lieferant:lieferanten(name))
      `)
      // 'verbrauch' (SD-Karten/ND-Filter/Schrauben) ist steuerlich identisch
      // zu 'ausgabe' und gehoert genauso in die EUeR.
      .in('klassifizierung', ['ausgabe', 'verbrauch', 'gwg'])
      .order('reihenfolge');

    type RawPos = {
      id: string;
      bezeichnung: string;
      gesamt_brutto: number;
      kategorie: string | null;
      klassifizierung: string | null;
      ki_vorschlag: { kategorie?: string } | null;
      // PostgREST liefert nested joins als Array (auch bei !inner) oder Objekt
      beleg: unknown;
    };
    for (const pos of ((belegPositionen ?? []) as unknown as RawPos[])) {
      const belegRaw = pos.beleg;
      const beleg = (Array.isArray(belegRaw) ? belegRaw[0] : belegRaw) as
        | { id: string; beleg_datum: string; status: string; is_test: boolean; lieferant: unknown }
        | null
        | undefined;
      if (!beleg) continue;
      // Filter: nur festgeschriebene Belege, nicht-Test, im Zeitraum
      if (beleg.status !== 'festgeschrieben') continue;
      if (beleg.is_test) continue;
      if (beleg.beleg_datum < from || beleg.beleg_datum > to) continue;

      const lieferantRaw = beleg.lieferant;
      const lieferant = (Array.isArray(lieferantRaw) ? lieferantRaw[0] : lieferantRaw) as
        | { name: string }
        | null
        | undefined;

      // GWG-Positionen immer als asset_purchase (GWG-Sofortabzug) buchen.
      const cat =
        pos.klassifizierung === 'gwg'
          ? 'asset_purchase'
          : pos.kategorie || pos.ki_vorschlag?.kategorie || 'other';
      const amount = Number(pos.gesamt_brutto || 0);
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
      if (!categoryItems[cat]) categoryItems[cat] = [];
      categoryItems[cat].push({
        id: pos.id,
        date: beleg.beleg_datum,
        description: pos.bezeichnung,
        vendor: lieferant?.name ?? '',
        amount,
      });
    }
  } catch (err) {
    console.error('[EÜR] beleg_positionen lesen fehlgeschlagen:', err);
    // defensiv — wenn Tabelle fehlt, läuft EÜR mit nur expenses + stripe weiter
  }

  // Stripe-Gebühren kommen ausschliesslich aus der expenses-Tabelle
  // (importiert via "Gebühren als Ausgaben" im Stripe-Abgleich).
  // stripe_transactions wird hier NICHT mehr gelesen — sonst Dopplung.

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

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

  // Einnahmen aus Buchungen — Test-Daten ausgeschlossen.
  // Aktionsrabatte (discount_amount, duration_discount, loyalty_discount)
  // werden proportional auf Miete + Zubehoer verteilt. Haftung + Versand
  // bleiben gross, weil die typisch nicht rabattiert sind und sonst die
  // Zuordnung verzerrt waere.
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, product_name, rental_from, rental_to, days, price_rental, price_accessories, price_haftung, shipping_price, price_total, discount_amount, duration_discount, loyalty_discount, coupon_code, status, delivery_mode, created_at')
    .eq('is_test', false)
    .neq('status', 'cancelled')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false });

  type IncomeItem = {
    id: string;
    date: string;
    description: string;
    amount: number;
    note?: string;
  };

  let rental = 0;
  let accessories = 0;
  let haftung = 0;
  let shipping = 0;
  let discounts = 0;
  const rentalItems: IncomeItem[] = [];
  const accessoryItems: IncomeItem[] = [];
  const haftungItems: IncomeItem[] = [];
  const shippingItems: IncomeItem[] = [];

  for (const b of bookings ?? []) {
    const r = Number(b.price_rental ?? 0);
    const a = Number(b.price_accessories ?? 0);
    const h = Number(b.price_haftung ?? 0);
    const s = Number(b.shipping_price ?? 0);
    const d = Number(b.discount_amount ?? 0) + Number(b.duration_discount ?? 0) + Number(b.loyalty_discount ?? 0);
    discounts += d;

    // Rabatt proportional auf Miete + Zubehoer verteilen — sonst zeigt die
    // EUeR z.B. 12 EUR Kamera-Einnahmen obwohl effektiv nur 6 EUR (12 - 6 EUR
    // Release50-Rabatt) realisiert wurden. Haftung + Versand bleiben gross.
    const base = r + a;
    let rentalNet = r;
    let accessoriesNet = a;
    let rentalDiscountCut = 0;
    let accDiscountCut = 0;
    if (d > 0 && base > 0) {
      const rentalShare = r / base;
      const accessoriesShare = a / base;
      rentalDiscountCut = Math.min(r, Math.round(d * rentalShare * 100) / 100);
      accDiscountCut = Math.min(a, Math.round(d * accessoriesShare * 100) / 100);
      rentalNet = Math.max(0, r - rentalDiscountCut);
      accessoriesNet = Math.max(0, a - accDiscountCut);
    }

    rental += rentalNet;
    accessories += accessoriesNet;
    haftung += h;
    shipping += s;

    const bookingId = String(b.id);
    const dateIso = (b.created_at ?? '').toString().slice(0, 10);
    const productName = (b.product_name ?? '').toString();
    const days = b.days ?? 1;
    const rentalFromShort = (b.rental_from ?? '').toString().slice(0, 10);
    const couponNote = b.coupon_code ? ` · ${b.coupon_code}` : '';

    if (rentalNet > 0 || r > 0) {
      rentalItems.push({
        id: `${bookingId}-rental`,
        date: dateIso,
        description: `${bookingId} · ${productName} · ${days} ${days === 1 ? 'Tag' : 'Tage'} ab ${rentalFromShort}`,
        amount: rentalNet,
        note: rentalDiscountCut > 0 ? `brutto ${r.toFixed(2)} EUR − ${rentalDiscountCut.toFixed(2)} EUR Rabatt${couponNote}` : undefined,
      });
    }
    if (accessoriesNet > 0 || a > 0) {
      accessoryItems.push({
        id: `${bookingId}-acc`,
        date: dateIso,
        description: `${bookingId} · Zubehör/Set`,
        amount: accessoriesNet,
        note: accDiscountCut > 0 ? `brutto ${a.toFixed(2)} EUR − ${accDiscountCut.toFixed(2)} EUR Rabatt${couponNote}` : undefined,
      });
    }
    if (h > 0) {
      haftungItems.push({
        id: `${bookingId}-haftung`,
        date: dateIso,
        description: `${bookingId} · Haftungsschutz`,
        amount: h,
      });
    }
    if (s > 0) {
      shippingItems.push({
        id: `${bookingId}-shipping`,
        date: dateIso,
        description: `${bookingId} · Versand`,
        amount: s,
      });
    }
  }
  const bookingCount = (bookings || []).length;
  const pickupCount = (bookings || []).filter((b) => b.delivery_mode === 'abholung').length;
  const shippedCount = bookingCount - pickupCount;
  // discounts wird nicht mehr separat abgezogen — schon in rental/accessories
  // verrechnet. Total = direkter Sum der Netto-Kategorien.
  const incomeTotal = Math.round((rental + accessories + haftung + shipping) * 100) / 100;

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
      // Pro-Buchung-Items fuer aufklappbare Anzeige in der UI — analog
      // zu expenses.categories. Betraege sind bereits NETTO nach Rabatt-
      // Verrechnung (Miete/Zubehoer); Haftung/Versand sind brutto.
      items: {
        rental: rentalItems,
        accessories: accessoryItems,
        haftung: haftungItems,
        shipping: shippingItems,
      },
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

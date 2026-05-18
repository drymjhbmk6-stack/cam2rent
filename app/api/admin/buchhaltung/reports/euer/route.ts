import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

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
  // Datumsgrenzen in Berlin-Zeit. Vorher wurden die Strings ohne TZ-Suffix
  // an Postgres geschickt — auf dem UTC-Server interpretierte die DB sie als
  // UTC-Mitternacht. Eine Buchung am 01.01. 00:30 Berlin (= 31.12. 23:30 UTC)
  // landete dann ausserhalb des Januar-Filters.
  const fromIso = getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`;
  const toIso = getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`;

  const bookingCols = 'id, product_name, rental_from, rental_to, days, price_rental, price_accessories, price_haftung, shipping_price, price_total, discount_amount, duration_discount, loyalty_discount, refund_amount, coupon_code, status, delivery_mode, created_at';
  const buildBookingQuery = (cols: string) => supabase
    .from('bookings')
    .select(cols)
    .eq('is_test', false)
    .neq('status', 'cancelled')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false });

  let { data: bookings, error: bookingsErr } = await buildBookingQuery(bookingCols);
  if (bookingsErr && /refund_amount|column|schema cache|PGRST/i.test(bookingsErr.message)) {
    // Migration supabase-bookings-refund.sql noch nicht durch — ohne die
    // Spalte weiterlaufen (refund_amount wird dann als 0 behandelt).
    ({ data: bookings, error: bookingsErr } = await buildBookingQuery(bookingCols.replace(', refund_amount', '')));
  }

  // .select(<string-variable>) verliert die PostgREST-Typinferenz → expliziter
  // Cast (etabliertes Muster, vgl. beleg_positionen weiter unten).
  type BookingRow = {
    id: string; product_name: string | null; rental_from: string | null;
    rental_to: string | null; days: number | null;
    price_rental: number | null; price_accessories: number | null;
    price_haftung: number | null; shipping_price: number | null;
    price_total: number | null; discount_amount: number | null;
    duration_discount: number | null; loyalty_discount: number | null;
    refund_amount: number | null; coupon_code: string | null;
    status: string | null; delivery_mode: string | null; created_at: string | null;
  };
  const bookingRows = (bookings ?? []) as unknown as BookingRow[];

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
  let refunds = 0;
  const rentalItems: IncomeItem[] = [];
  const accessoryItems: IncomeItem[] = [];
  const haftungItems: IncomeItem[] = [];
  const shippingItems: IncomeItem[] = [];

  for (const b of bookingRows) {
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

    // Rückerstattungen (Teilerstattung / Fehlbuchung, bookings.refund_amount)
    // mindern das realisierte Einkommen. Wasserfall Miete → Zubehör →
    // Haftung → Versand, damit keine Kategorie negativ wird und die Summe
    // exakt um die erstattete Summe sinkt (gedeckelt auf die Einnahme).
    let refundLeft = Number(b.refund_amount ?? 0);
    const applyRefund = (val: number): number => {
      if (refundLeft <= 0 || val <= 0) return val;
      const c = Math.min(val, refundLeft);
      refundLeft = Math.round((refundLeft - c) * 100) / 100;
      return Math.round((val - c) * 100) / 100;
    };
    const rentalRefBefore = rentalNet;
    const accRefBefore = accessoriesNet;
    rentalNet = applyRefund(rentalNet);
    accessoriesNet = applyRefund(accessoriesNet);
    const hNet = applyRefund(h);
    const sNet = applyRefund(s);
    const rentalRefCut = Math.round((rentalRefBefore - rentalNet) * 100) / 100;
    const accRefCut = Math.round((accRefBefore - accessoriesNet) * 100) / 100;
    refunds += Math.round(((rentalRefBefore - rentalNet) + (accRefBefore - accessoriesNet) + (h - hNet) + (s - sNet)) * 100) / 100;

    rental += rentalNet;
    accessories += accessoriesNet;
    haftung += hNet;
    shipping += sNet;

    const bookingId = String(b.id);
    const dateIso = (b.created_at ?? '').toString().slice(0, 10);
    const productName = (b.product_name ?? '').toString();
    const days = b.days ?? 1;
    const rentalFromShort = (b.rental_from ?? '').toString().slice(0, 10);
    const couponNote = b.coupon_code ? ` · ${b.coupon_code}` : '';

    const buildNote = (gross: number, discountCut: number, refundCut: number): string | undefined => {
      const parts: string[] = [];
      if (discountCut > 0) parts.push(`${discountCut.toFixed(2)} EUR Rabatt${couponNote}`);
      if (refundCut > 0) parts.push(`${refundCut.toFixed(2)} EUR Erstattung`);
      return parts.length ? `brutto ${gross.toFixed(2)} EUR − ${parts.join(' − ')}` : undefined;
    };

    if (rentalNet > 0 || r > 0) {
      rentalItems.push({
        id: `${bookingId}-rental`,
        date: dateIso,
        description: `${bookingId} · ${productName} · ${days} ${days === 1 ? 'Tag' : 'Tage'} ab ${rentalFromShort}`,
        amount: rentalNet,
        note: buildNote(r, rentalDiscountCut, rentalRefCut),
      });
    }
    if (accessoriesNet > 0 || a > 0) {
      accessoryItems.push({
        id: `${bookingId}-acc`,
        date: dateIso,
        description: `${bookingId} · Zubehör/Set`,
        amount: accessoriesNet,
        note: buildNote(a, accDiscountCut, accRefCut),
      });
    }
    if (hNet > 0 || h > 0) {
      haftungItems.push({
        id: `${bookingId}-haftung`,
        date: dateIso,
        description: `${bookingId} · Haftungsschutz`,
        amount: hNet,
        note: h - hNet > 0 ? `brutto ${h.toFixed(2)} EUR − ${(h - hNet).toFixed(2)} EUR Erstattung` : undefined,
      });
    }
    if (sNet > 0 || s > 0) {
      shippingItems.push({
        id: `${bookingId}-shipping`,
        date: dateIso,
        description: `${bookingId} · Versand`,
        amount: sNet,
        note: s - sNet > 0 ? `brutto ${s.toFixed(2)} EUR − ${(s - sNet).toFixed(2)} EUR Erstattung` : undefined,
      });
    }
  }
  const bookingCount = bookingRows.length;
  const pickupCount = bookingRows.filter((b) => b.delivery_mode === 'abholung').length;
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
      refunds,
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

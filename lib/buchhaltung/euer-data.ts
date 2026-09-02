import type { SupabaseClient } from '@supabase/supabase-js';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString, getBerlinDateString } from '@/lib/timezone';
import { computeBookingRevenue, buildInvoicePaidMap } from '@/lib/buchhaltung/booking-revenue';

/**
 * Geteilte EÜR-Berechnung — einzige Quelle der Wahrheit fuer alle Reports,
 * die auf der EÜR aufsetzen (Report-Tab, PDF/CSV-Export, WISO-Export).
 *
 * Der komplette Rechenkern (Rabatt-Wasserfall, Erstattungs-Wasserfall,
 * beleg_positionen der neuen Welt, afa_buchungen) lebt hier, damit
 * verschiedene Exportformate nie auseinanderlaufen.
 *
 * Herausgeloest aus app/api/admin/buchhaltung/reports/euer/route.ts
 * (Verhalten 1:1 unveraendert).
 */

/**
 * Laedt ALLE Zeilen einer Abfrage seitenweise.
 *
 * PostgREST liefert per Default maximal 1000 Zeilen. Die EÜR fragte
 * `beleg_positionen` bisher ohne Limit ab — ab der 1001. Position waeren
 * aeltere Ausgaben still aus der EÜR verschwunden.
 */
async function fetchAllRows(
  page: (offset: number, limit: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ rows: unknown[]; error: string | null }> {
  const PAGE = 1000;
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await page(offset, PAGE);
    if (error) return { rows, error: error.message };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    // Sicherheitsnetz gegen Endlosschleifen bei unerwarteten Antworten.
    if (offset > 100_000) break;
  }
  return { rows, error: null };
}

export const CATEGORY_LABELS: Record<string, string> = {
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

export type EuerIncomeItem = {
  id: string;
  date: string;
  description: string;
  amount: number;
  note?: string;
};

export type EuerExpenseItem = {
  id: string;
  date: string;
  description: string;
  vendor: string;
  amount: number;
};

export type EuerData = {
  income: {
    rental: number;
    accessories: number;
    haftung: number;
    shipping: number;
    /** Einbehaltene Stornogebuehren (dokumentierte Stornos). */
    cancellationFees: number;
    discounts: number;
    refunds: number;
    other: number;
    total: number;
    items: {
      rental: EuerIncomeItem[];
      accessories: EuerIncomeItem[];
      haftung: EuerIncomeItem[];
      shipping: EuerIncomeItem[];
      cancellationFees: EuerIncomeItem[];
    };
  };
  bookingStats: { count: number; pickup: number; shipped: number };
  expenses: {
    categories: Array<{ category: string; label: string; amount: number; items: EuerExpenseItem[] }>;
    total: number;
  };
  profit: number;
  taxMode: string;
  period: { from: string; to: string };
};

export async function computeEuerData(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<EuerData> {
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

  const bookingCols = 'id, product_name, rental_from, rental_to, days, price_rental, price_accessories, price_haftung, shipping_price, price_total, discount_amount, duration_discount, loyalty_discount, early_bird_discount, special_discount, refund_amount, refund_note, adjustment_status, adjustment_amount, coupon_code, status, delivery_mode, payment_intent_id, created_at';
  // Optionale Spalten, die je nach ausstehender Migration fehlen koennen
  // (refund_amount/refund_note / early_bird_discount / special_discount /
  // adjustment_status+adjustment_amount). Beim Schema-Fehler werden sie aus der
  // Select-Liste gestrippt und der Query wiederholt.
  const OPTIONAL_BOOKING_COLS = [', early_bird_discount', ', special_discount', ', refund_amount', ', refund_note', ', adjustment_status', ', adjustment_amount'];
  // KEIN Status-Filter mehr in SQL: welche Buchung Umsatz erzeugt, entscheidet
  // ausschliesslich computeBookingRevenue() — inkl. stornierter Buchungen mit
  // einbehaltener Stornogebuehr und unbezahlter Belege (Zufluss-Prinzip).
  const buildBookingQuery = (cols: string) => (offset: number, limit: number) => supabase
    .from('bookings')
    .select(cols)
    .eq('is_test', false)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  let hasRefundColumn = true;
  let bookings = await fetchAllRows(buildBookingQuery(bookingCols));
  if (bookings.error && /refund_amount|refund_note|early_bird_discount|special_discount|adjustment_status|adjustment_amount|column|schema cache|PGRST/i.test(bookings.error)) {
    // Migration(en) noch nicht durch — ohne die optionalen Spalten weiterlaufen
    // (die betroffenen Werte werden dann als 0 behandelt).
    let stripped = bookingCols;
    for (const c of OPTIONAL_BOOKING_COLS) stripped = stripped.replace(c, '');
    hasRefundColumn = false;
    bookings = await fetchAllRows(buildBookingQuery(stripped));
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
    early_bird_discount: number | null; special_discount: number | null;
    refund_amount: number | null; refund_note: string | null;
    adjustment_status: string | null; adjustment_amount: number | null;
    coupon_code: string | null;
    status: string | null; delivery_mode: string | null;
    payment_intent_id: string | null; created_at: string | null;
  };
  const bookingRows = bookings.rows as unknown as BookingRow[];

  // Bezahlt-Status aus den Rechnungen nachladen — "Als bezahlt markieren"
  // aendert `bookings.payment_intent_id` nicht, ein bar bezahlter Manuell-Beleg
  // traegt also weiterhin `MANUAL-UNPAID-…`. Ohne diesen Blick wuerde er
  // dauerhaft aus der EÜR fallen.
  const invoicePaidMap = await (async () => {
    const ids = bookingRows.map((b) => b.id).filter(Boolean);
    if (ids.length === 0) return new Map<string, boolean>();
    try {
      const rows: Array<{ booking_id: string | null; status: string | null; payment_status: string | null }> = [];
      // In Bloecken abfragen, damit die URL nicht ueberlaeuft.
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
          .from('invoices')
          .select('booking_id, status, payment_status')
          .in('booking_id', ids.slice(i, i + 200));
        if (data) rows.push(...(data as typeof rows));
      }
      return buildInvoicePaidMap(rows);
    } catch (err) {
      console.error('[EÜR] invoices-Zahlstatus lesen fehlgeschlagen:', err);
      return new Map<string, boolean>();
    }
  })();

  let rental = 0;
  let accessories = 0;
  let haftung = 0;
  let shipping = 0;
  let cancellationFees = 0;
  let discounts = 0;
  let refunds = 0;
  const rentalItems: EuerIncomeItem[] = [];
  const accessoryItems: EuerIncomeItem[] = [];
  const haftungItems: EuerIncomeItem[] = [];
  const shippingItems: EuerIncomeItem[] = [];
  const cancellationItems: EuerIncomeItem[] = [];
  let countedBookings = 0;
  let countedPickup = 0;

  for (const b of bookingRows) {
    // Massgeblich ist der tatsaechlich kassierte Betrag (price_total), nicht
    // die Summe der Einzelposten — siehe lib/buchhaltung/booking-revenue.ts.
    const rev = computeBookingRevenue(b, {
      invoicePaid: invoicePaidMap.has(b.id) ? invoicePaidMap.get(b.id) : null,
      hasRefundColumn,
    });
    if (!rev.counts) continue;

    countedBookings += 1;
    if (b.delivery_mode === 'abholung') countedPickup += 1;

    const bookingId = String(b.id);
    // Anzeige-Datum in Berlin-Zeit — created_at ist ein UTC-Timestamp; das
    // reine slice(0,10) haette bei Buchungen nach 22:00/23:00 Berlin den
    // Vortag angezeigt.
    const dateIso = b.created_at ? getBerlinDateString(new Date(b.created_at)) : '';
    const productName = (b.product_name ?? '').toString();
    const days = b.days ?? 1;
    const rentalFromShort = (b.rental_from ?? '').toString().slice(0, 10);
    const couponNote = b.coupon_code ? ` · ${b.coupon_code}` : '';

    // ── Stornierte Buchung: nur die einbehaltene Stornogebuehr ─────────────
    if (rev.kind === 'cancelled_retained') {
      cancellationFees += rev.total;
      refunds += rev.refundTotal;
      cancellationItems.push({
        id: `${bookingId}-storno`,
        date: dateIso,
        description: `${bookingId} · ${productName} · Storno-Einbehalt`,
        amount: rev.total,
        note: (() => {
          const gross = Number(b.price_total ?? 0).toFixed(2);
          const parts: string[] = [];
          if (rev.refundTotal > 0) parts.push(`${rev.refundTotal.toFixed(2)} EUR erstattet`);
          if (rev.pendingTotal > 0.005) parts.push(`${rev.pendingTotal.toFixed(2)} EUR Nachzahlung offen`);
          return parts.length
            ? `gezahlt ${gross} EUR − ${parts.join(' − ')}`
            : `gezahlt ${gross} EUR − keine Erstattung`;
        })(),
      });
      continue;
    }

    discounts += rev.discountTotal;
    refunds += rev.refundTotal;
    rental += rev.net.rental;
    accessories += rev.net.accessories;
    haftung += rev.net.haftung;
    shipping += rev.net.shipping;

    const buildNote = (
      gross: number, discountCut: number, refundCut: number, pendingCut: number,
    ): string | undefined => {
      const parts: string[] = [];
      if (discountCut > 0.005) parts.push(`${discountCut.toFixed(2)} EUR Rabatt${couponNote}`);
      if (refundCut > 0.005) parts.push(`${refundCut.toFixed(2)} EUR Erstattung`);
      if (pendingCut > 0.005) parts.push(`${pendingCut.toFixed(2)} EUR Nachzahlung offen`);
      return parts.length ? `brutto ${gross.toFixed(2)} EUR − ${parts.join(' − ')}` : undefined;
    };

    if (rev.net.rental > 0 || rev.gross.rental > 0) {
      rentalItems.push({
        id: `${bookingId}-rental`,
        date: dateIso,
        description: `${bookingId} · ${productName} · ${days} ${days === 1 ? 'Tag' : 'Tage'} ab ${rentalFromShort}`,
        amount: rev.net.rental,
        note: buildNote(rev.gross.rental, rev.discountCut.rental, rev.refundCut.rental, rev.pendingCut.rental),
      });
    }
    if (rev.net.accessories > 0 || rev.gross.accessories > 0) {
      accessoryItems.push({
        id: `${bookingId}-acc`,
        date: dateIso,
        description: `${bookingId} · Zubehör/Set`,
        amount: rev.net.accessories,
        note: buildNote(rev.gross.accessories, rev.discountCut.accessories, rev.refundCut.accessories, rev.pendingCut.accessories),
      });
    }
    if (rev.net.haftung > 0 || rev.gross.haftung > 0) {
      haftungItems.push({
        id: `${bookingId}-haftung`,
        date: dateIso,
        description: `${bookingId} · Haftungsschutz`,
        amount: rev.net.haftung,
        note: buildNote(rev.gross.haftung, rev.discountCut.haftung, rev.refundCut.haftung, rev.pendingCut.haftung),
      });
    }
    if (rev.net.shipping > 0 || rev.gross.shipping > 0) {
      shippingItems.push({
        id: `${bookingId}-shipping`,
        date: dateIso,
        description: `${bookingId} · Versand`,
        amount: rev.net.shipping,
        note: buildNote(rev.gross.shipping, rev.discountCut.shipping, rev.refundCut.shipping, rev.pendingCut.shipping),
      });
    }
  }
  const bookingCount = countedBookings;
  const pickupCount = countedPickup;
  const shippedCount = bookingCount - pickupCount;
  // discounts wird nicht mehr separat abgezogen — schon in rental/accessories
  // verrechnet. Total = direkter Sum der Netto-Kategorien.
  const incomeTotal = Math.round((rental + accessories + haftung + shipping + cancellationFees) * 100) / 100;
  // Aufsummierte Cent-Betraege sauber runden (Float-Drift bei vielen Posten).
  rental = Math.round(rental * 100) / 100;
  accessories = Math.round(accessories * 100) / 100;
  haftung = Math.round(haftung * 100) / 100;
  shipping = Math.round(shipping * 100) / 100;
  cancellationFees = Math.round(cancellationFees * 100) / 100;
  discounts = Math.round(discounts * 100) / 100;
  refunds = Math.round(refunds * 100) / 100;

  // Ausgaben (inkl. Detail-Items pro Kategorie fuer aufklappbare Ansicht)
  // Quelle 1: alte expenses-Tabelle (Stripe-Gebuehren-Import, migrierte Altdaten)
  const expensesPage = await fetchAllRows((offset, limit) => supabase
    .from('expenses')
    .select('id, category, gross_amount, description, vendor, expense_date')
    .eq('is_test', false)
    .is('deleted_at', null)
    .gte('expense_date', from)
    .lte('expense_date', to)
    .order('expense_date', { ascending: false })
    .range(offset, offset + limit - 1));
  if (expensesPage.error) console.error('[EÜR] expenses:', expensesPage.error);
  const expenses = expensesPage.rows as Array<{
    id: string; category: string; gross_amount: number | null;
    description: string | null; vendor: string | null; expense_date: string;
  }>;

  const categoryTotals: Record<string, number> = {};
  const categoryItems: Record<string, EuerExpenseItem[]> = {};
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
    // Zeitraum + Status schon in SQL filtern (nicht erst in JS) und seitenweise
    // laden — sonst kappt PostgREST bei 1000 Zeilen und aeltere Ausgaben
    // verschwinden still aus der EÜR.
    const posPage = await fetchAllRows((offset, limit) => supabase
      .from('beleg_positionen')
      .select(`
        id, bezeichnung, gesamt_brutto, kategorie, klassifizierung, ki_vorschlag,
        beleg:belege!inner(id, beleg_datum, status, is_test, lieferant:lieferanten(name))
      `)
      // 'verbrauch' (SD-Karten/ND-Filter/Schrauben) ist steuerlich identisch
      // zu 'ausgabe' und gehoert genauso in die EUeR.
      .in('klassifizierung', ['ausgabe', 'verbrauch', 'gwg'])
      .eq('belege.status', 'festgeschrieben')
      .eq('belege.is_test', false)
      .gte('belege.beleg_datum', from)
      .lte('belege.beleg_datum', to)
      .order('reihenfolge')
      .range(offset, offset + limit - 1));
    if (posPage.error) console.error('[EÜR] beleg_positionen:', posPage.error);
    const belegPositionen = posPage.rows;

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

  // Quelle 3: lineare AfA der NEUEN Buchhaltungs-Welt (afa_buchungen).
  // Der monatliche AfA-Cron schreibt pro Anlagegut eine afa_buchungen-Zeile
  // fort — diese Abschreibungen wurden bisher von KEINEM Report gelesen und
  // gehoeren als Aufwand in die EÜR. Keine Doppelzaehlung: die alte Welt
  // laeuft ueber expenses.category='depreciation', GWG ueber beleg_positionen
  // (asset_purchase) — afa_buchungen ist bislang nirgends erfasst.
  // afa_buchungen selbst hat kein is_test — der Test/Live-Split haengt am
  // Asset (assets_neu). Defensiv bei fehlender Tabelle → leer.
  try {
    const loadAfa = (assetTable: 'assets_neu' | 'assets') => supabase
      .from('afa_buchungen')
      .select(`id, afa_betrag, buchungsdatum, notizen, ${assetTable}!inner(bezeichnung, is_test)`)
      .eq(`${assetTable}.is_test`, false)
      // buchungsdatum ist eine DATE-Spalte → reine Datums-Strings (wie expenses).
      .gte('buchungsdatum', from)
      .lte('buchungsdatum', to);

    let afaTable: 'assets_neu' | 'assets' = 'assets_neu';
    let { data: afaRows, error: afaErr } = await loadAfa('assets_neu');
    if (afaErr) {
      // Hybrid-Fallback: falls assets_neu nicht existiert (Alt-Welt).
      afaTable = 'assets';
      ({ data: afaRows, error: afaErr } = await loadAfa('assets'));
    }
    if (!afaErr && afaRows) {
      for (const raw of (afaRows as unknown as Record<string, unknown>[])) {
        const assetRaw = raw[afaTable];
        const asset = (Array.isArray(assetRaw) ? assetRaw[0] : assetRaw) as
          | { bezeichnung?: string }
          | null
          | undefined;
        const amount = Number(raw.afa_betrag || 0);
        if (amount <= 0) continue;
        categoryTotals['depreciation'] = (categoryTotals['depreciation'] || 0) + amount;
        if (!categoryItems['depreciation']) categoryItems['depreciation'] = [];
        categoryItems['depreciation'].push({
          id: String(raw.id),
          date: String(raw.buchungsdatum ?? ''),
          description: String(raw.notizen || asset?.bezeichnung || 'Abschreibung'),
          vendor: asset?.bezeichnung ?? '',
          amount,
        });
      }
    }
  } catch (err) {
    console.error('[EÜR] afa_buchungen lesen fehlgeschlagen:', err);
    // defensiv — ohne AfA-Buchungen weiterlaufen
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

  return {
    income: {
      rental,
      accessories,
      haftung,
      shipping,
      cancellationFees,
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
        cancellationFees: cancellationItems,
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
  };
}

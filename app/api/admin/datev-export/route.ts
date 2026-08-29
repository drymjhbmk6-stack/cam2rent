import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { loadKontenrahmen, accountForBestand, type BestandKey } from '@/lib/accounting/kontenrahmen';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';
import { computeBookingRevenue, buildInvoicePaidMap } from '@/lib/buchhaltung/booking-revenue';

/**
 * GET /api/admin/datev-export?from=2026-01-01&to=2026-03-31
 * Optional: &preview=1  → returns { count, revenue } JSON instead of CSV
 *
 * Generates a DATEV Buchungsstapel CSV for the given date range.
 */

interface Booking {
  id: string;
  product_name: string;
  customer_name: string;
  customer_email: string;
  price_total: number;
  price_rental: number;
  price_accessories: number;
  price_haftung: number;
  shipping_price: number;
  discount_amount: number;
  duration_discount: number;
  loyalty_discount: number;
  early_bird_discount: number;
  special_discount: number;
  refund_amount: number;
  refund_note: string | null;
  payment_intent_id: string | null;
  status: string;
  created_at: string;
}

interface DatevConfig {
  erloeskonto: string;
  umsatzsteuerkonto: string;
  kautionskonto: string;
  versandkostenkonto: string;
  beraternummer: string;
  mandantennummer: string;
  wirtschaftsjahr_beginn: string;
}

const DEFAULT_CONFIG: DatevConfig = {
  erloeskonto: '8400',
  umsatzsteuerkonto: '1776',
  kautionskonto: '1590',
  versandkostenkonto: '3800',
  beraternummer: '',
  mandantennummer: '',
  wirtschaftsjahr_beginn: '01',
};

function formatDateDATEV(isoDate: string): string {
  // DATEV format: DDMM (day + month, no separators).
  // Berlin-Zeit: sonst rutscht eine Buchung am 01.01. 00:30 Berlin
  // (= 31.12. 23:30 UTC) auf der Server-Seite in den Vortag/Vormonat.
  const parts = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit',
    timeZone: 'Europe/Berlin',
  }).formatToParts(new Date(isoDate));
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${day}${month}`;
}

function formatAmount(amount: number): string {
  // DATEV uses comma as decimal separator, no thousands separator
  return Math.abs(amount).toFixed(2).replace('.', ',');
}

// Wrapper auf zentralen Helper aus lib/csv.ts (CSV-Formula-Injection-Schutz).
import { escapeCsvField } from '@/lib/csv';
function escapeField(val: string): string {
  return escapeCsvField(val, ';');
}

export async function GET(req: NextRequest) {
  // Auth check
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const isPreview = req.nextUrl.searchParams.get('preview') === '1';

  if (!from || !to) {
    return NextResponse.json({ error: 'Parameter "from" und "to" erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Datumsgrenzen Berlin-TZ-bewusst — sonst rutscht 01.01. 00:30 Berlin
  // (= 31.12. 23:30 UTC) aus dem Januar-Filter raus.
  const fromIso = getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`;
  const toIso = getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`;

  // Fetch bookings in date range — Test-Daten ausgeschlossen (GoBD)
  const datevCols = 'id, product_name, customer_name, customer_email, price_total, price_rental, price_accessories, price_haftung, shipping_price, discount_amount, duration_discount, loyalty_discount, early_bird_discount, special_discount, refund_amount, refund_note, payment_intent_id, status, created_at';
  // Optionale Spalten, die je nach ausstehender Migration fehlen koennen.
  const OPTIONAL_DATEV_COLS = [', early_bird_discount', ', special_discount', ', refund_amount', ', refund_note'];
  const buildDatevQuery = (cols: string) => supabase
    .from('bookings')
    .select(cols)
    .eq('is_test', false)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: true });

  let hasRefundColumn = true;
  let { data: bookings, error: bookingsError } = await buildDatevQuery(datevCols);
  if (bookingsError && /refund_amount|refund_note|early_bird_discount|special_discount|column|schema cache|PGRST/i.test(bookingsError.message)) {
    hasRefundColumn = false;
    // Migration(en) noch nicht durch — ohne die optionalen Spalten exportieren
    // (die betroffenen Werte zaehlen dann als 0).
    let stripped = datevCols;
    for (const c of OPTIONAL_DATEV_COLS) stripped = stripped.replace(c, '');
    ({ data: bookings, error: bookingsError } = await buildDatevQuery(stripped));
  }

  if (bookingsError) {
    return NextResponse.json({ error: bookingsError.message }, { status: 500 });
  }

  const allBookings = (bookings || []) as unknown as Booking[];

  // Preview mode: return count and revenue
  // Bezahlt-Status aus den Rechnungen (analog EÜR — "Als bezahlt markieren"
  // aendert `bookings.payment_intent_id` nicht).
  const invoicePaidMap = await (async () => {
    const ids = allBookings.map((b) => b.id).filter(Boolean);
    if (ids.length === 0) return new Map<string, boolean>();
    try {
      const rows: Array<{ booking_id: string | null; status: string | null; payment_status: string | null }> = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
          .from('invoices')
          .select('booking_id, status, payment_status')
          .in('booking_id', ids.slice(i, i + 200));
        if (data) rows.push(...(data as typeof rows));
      }
      return buildInvoicePaidMap(rows);
    } catch {
      return new Map<string, boolean>();
    }
  })();
  const revenueOf = (b: Booking) => computeBookingRevenue(b, {
    invoicePaid: invoicePaidMap.has(b.id) ? invoicePaidMap.get(b.id) : null,
    hasRefundColumn,
  });

  if (isPreview) {
    const counted = allBookings.map(revenueOf).filter((r) => r.counts);
    const revenue = counted.reduce((sum, r) => sum + r.total, 0);
    return NextResponse.json({ count: counted.length, revenue: Math.round(revenue * 100) / 100 });
  }

  // Load DATEV config — admin_config.datev_config (Beraternummer/Mandantennummer/
  // Wirtschaftsjahr) hat Vorrang. Konto-Codes werden aus dem zentralen Kontenrahmen
  // (admin_settings.kontenrahmen_mapping) gezogen, damit der Buchhalter Konten
  // ueber die Einstellungen-UI veraendern kann ohne Code-Deploy.
  const { data: configRow } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', 'datev_config')
    .maybeSingle();

  const adminCfg = (configRow?.value as Partial<DatevConfig>) ?? {};
  const kontenrahmen = await loadKontenrahmen();

  // Steuermodus pre-load (wird unten nochmal gelesen — hier fuer Konten-Auswahl)
  const { data: taxModeRow } = await supabase
    .from('admin_settings').select('value').eq('key', 'tax_mode').maybeSingle();
  const preTaxMode = (taxModeRow?.value as 'kleinunternehmer' | 'regelbesteuerung' | undefined) ?? 'kleinunternehmer';
  const erloesKonto = preTaxMode === 'kleinunternehmer'
    ? kontenrahmen.erloese.mietumsatz_kleinunternehmer
    : kontenrahmen.erloese.mietumsatz;

  const cfg: DatevConfig = {
    erloeskonto: adminCfg.erloeskonto ?? erloesKonto,
    umsatzsteuerkonto: adminCfg.umsatzsteuerkonto ?? kontenrahmen.ust_19,
    kautionskonto: adminCfg.kautionskonto ?? kontenrahmen.erloese.haftungsschutz,
    versandkostenkonto: adminCfg.versandkostenkonto ?? kontenrahmen.erloese.versand_an_kunden,
    beraternummer: adminCfg.beraternummer ?? DEFAULT_CONFIG.beraternummer,
    mandantennummer: adminCfg.mandantennummer ?? DEFAULT_CONFIG.mandantennummer,
    wirtschaftsjahr_beginn: adminCfg.wirtschaftsjahr_beginn ?? DEFAULT_CONFIG.wirtschaftsjahr_beginn,
  };

  // Load tax settings
  const { data: taxRows } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate']);

  const taxSettings: Record<string, string> = {};
  (taxRows || []).forEach((r: { key: string; value: string }) => {
    taxSettings[r.key] = r.value;
  });
  const taxMode = taxSettings.tax_mode || 'kleinunternehmer';
  const taxRate = parseFloat(taxSettings.tax_rate || '19'); void taxRate;

  // ─── Build DATEV CSV ────────────────────────────────────────────────
  const lines: string[] = [];

  // DATEV Header (line 1)
  // Format version 700, data category 21 (Buchungsstapel), format name "Buchungsstapel"
  const fromYear = from.substring(0, 4);
  const wirtschaftsjahrBeginn = parseInt(cfg.wirtschaftsjahr_beginn, 10); void wirtschaftsjahrBeginn;
  const headerFields = [
    'EXTF',                                    // Format identifier
    '700',                                     // Version
    '21',                                      // Data category (Buchungsstapel)
    'Buchungsstapel',                          // Format name
    '12',                                      // Format version
    '',                                        // Created at (generated)
    '',                                        // Imported (empty)
    'cam2rent',                                // Source
    '',                                        // Exported by
    '',                                        // Imported by
    cfg.beraternummer || '0',                  // Beraternummer
    cfg.mandantennummer || '0',                // Mandantennummer
    `${fromYear}0101`,                         // Wirtschaftsjahr-Beginn
    '4',                                       // Sachkontenlange
    `${from.replace(/-/g, '')}`,               // Datum von
    `${to.replace(/-/g, '')}`,                 // Datum bis
    '',                                        // Bezeichnung
    '',                                        // Diktatzeichen
    '0',                                       // Buchungstyp (0 = Finanzbuchfuhrung)
    '0',                                       // Rechnungslegungszweck
    '',                                        // Reserved
    '',                                        // WKZ
    '',                                        // Reserved
    '',                                        // Reserved
    '',                                        // Reserved
    '',                                        // Reserved
    '',                                        // Reserved
  ];
  lines.push(headerFields.join(';'));

  // Column header (line 2)
  const columnHeaders = [
    'Umsatz (ohne Soll/Haben-Kz)',
    'Soll/Haben-Kennzeichen',
    'WKZ Umsatz',
    'Kurs',
    'Basis-Umsatz',
    'WKZ Basis-Umsatz',
    'Konto',
    'Gegenkonto (ohne BU-Schlussel)',
    'BU-Schlussel',
    'Belegdatum',
    'Belegfeld 1',
    'Belegfeld 2',
    'Skonto',
    'Buchungstext',
    'Postensperre',
    'Diverse Adressnummer',
    'Geschaftsbereich',
    'Kostfeld 1',
    'Kostfeld 2',
    'Kost-Menge',
    'EU-Land u. UStID',
    'EU-Steuersatz',
    'Abw. Versteuerungsart',
  ];
  lines.push(columnHeaders.join(';'));

  // Booking lines
  for (const booking of allBookings) {
    const bookingDate = formatDateDATEV(booking.created_at);
    const belegfeld = `B-${booking.id.substring(0, 8)}`;
    const customerText = escapeField(
      `${booking.product_name || 'Vermietung'} - ${booking.customer_name || 'Kunde'}`
    );

    // Massgeblich ist der tatsaechlich kassierte Betrag (price_total), nicht die
    // Summe der Einzelposten — identische Logik wie in der EÜR, damit beide
    // Reports nie wieder unterschiedliche Umsatzzahlen liefern.
    const rev = revenueOf(booking);
    if (!rev.counts) continue;

    // Stornierte Buchung: nur die einbehaltene Stornogebuehr ist Erloes.
    if (rev.kind === 'cancelled_retained') {
      lines.push(buildLine(
        formatAmount(rev.total),
        'S',
        cfg.erloeskonto,
        '1200',
        taxMode === 'regelbesteuerung' ? '3' : '',
        bookingDate,
        belegfeld,
        escapeField(`Stornogebuehr - ${booking.customer_name || 'Kunde'}`),
      ));
      continue;
    }

    // Main rental revenue (Miete + Zubehoer, nach Rabatt/Erstattung).
    const rentalAmount = Math.round((rev.net.rental + rev.net.accessories) * 100) / 100;
    if (rentalAmount > 0) {
      const buSchluessel = taxMode === 'regelbesteuerung' ? '3' : '';
      const line = buildLine(
        formatAmount(rentalAmount),
        'S',
        cfg.erloeskonto,
        '1200',
        buSchluessel,
        bookingDate,
        belegfeld,
        customerText,
      );
      lines.push(line);
    }

    // Haftung (deposit/liability option)
    if (rev.net.haftung > 0) {
      const line = buildLine(
        formatAmount(rev.net.haftung),
        'S',
        cfg.kautionskonto,
        '1200',
        '',
        bookingDate,
        belegfeld,
        escapeField(`Haftungsoption - ${booking.customer_name || 'Kunde'}`),
      );
      lines.push(line);
    }

    // Shipping
    if (rev.net.shipping > 0) {
      const buSchluessel = taxMode === 'regelbesteuerung' ? '3' : '';
      const line = buildLine(
        formatAmount(rev.net.shipping),
        'S',
        cfg.versandkostenkonto,
        '1200',
        buSchluessel,
        bookingDate,
        belegfeld,
        escapeField(`Versand - ${booking.customer_name || 'Kunde'}`),
      );
      lines.push(line);
    }
  }

  // ── AfA-Buchungen (Abschreibungen) ────────────────────────────────────────
  // Wenn das asset-Modul aktiv ist und expenses.category='depreciation'-Eintraege
  // im Zeitraum existieren, werden sie als DATEV-Zeilen exportiert:
  // Soll AfA-Aufwandskonto (4830) an Anlagen-Bestandskonto (0420/0430/0400/0490).
  try {
    const { data: depExpenses } = await supabase
      .from('expenses')
      .select('id, expense_date, gross_amount, description, asset_id, assets:asset_id(kind)')
      .eq('category', 'depreciation')
      .eq('is_test', false)
      .gte('expense_date', from)
      .lte('expense_date', to);

    // Bestandskonten aus dem Kontenrahmen — Buchhalter kann Konten in
    // /admin/buchhaltung Einstellungen aendern ohne Code-Deploy.
    const afaKonto = kontenrahmen.aufwand.depreciation;

    for (const exp of depExpenses ?? []) {
      const rawKind = (Array.isArray(exp.assets) ? exp.assets[0]?.kind : (exp.assets as { kind?: string } | null)?.kind) || 'other';
      // 'tool'/'other' aus assets.kind sind keine BestandKey-Werte — auf Default mappen.
      const bestandKey: BestandKey = ['rental_camera','rental_accessory','office_equipment','vehicle','software_asset'].includes(rawKind)
        ? (rawKind as BestandKey)
        : 'office_equipment';
      const bestandskonto = await accountForBestand(bestandKey);
      const line = buildLine(
        formatAmount(Number(exp.gross_amount)),
        'S',
        afaKonto,
        bestandskonto,
        '',
        formatDateDATEV(exp.expense_date),
        `AfA-${exp.id.slice(0, 6)}`,
        escapeField(exp.description || 'Abschreibung'),
      );
      lines.push(line);
    }
  } catch (err) {
    console.error('[datev-export] AfA-Abruf fehlgeschlagen', err);
    // Nicht blockend: wenn assets-Tabelle noch nicht existiert oder keine AfA-Daten,
    // bleibt der Export trotzdem gueltig.
  }

  // ── Lineare AfA der NEUEN Buchhaltungs-Welt (afa_buchungen) ────────────────
  // Der monatliche AfA-Cron schreibt pro Anlagegut eine afa_buchungen-Zeile
  // fort. Diese wurden bisher von KEINEM Export gelesen. Keine Doppelzaehlung:
  // die alte Welt laeuft ueber expenses.category='depreciation' (oben), die neue
  // ueber afa_buchungen. afa_buchungen hat kein is_test — der Split haengt am
  // Asset (assets_neu). Soll AfA-Aufwandskonto (4830) an Bestandskonto nach art.
  try {
    // art (neue Welt) → BestandKey fuer den Kontenrahmen.
    const artToBestand: Record<string, BestandKey> = {
      kamera: 'rental_camera',
      zubehoer: 'rental_accessory',
      buero: 'office_equipment',
      werkzeug: 'office_equipment',
      sonstiges: 'office_equipment',
    };
    const afaKonto = kontenrahmen.aufwand.depreciation;

    const loadAfa = (assetTable: 'assets_neu' | 'assets') => supabase
      .from('afa_buchungen')
      .select(`id, afa_betrag, buchungsdatum, notizen, ${assetTable}!inner(bezeichnung, is_test, art)`)
      .eq(`${assetTable}.is_test`, false)
      // buchungsdatum ist eine DATE-Spalte → reine Datums-Strings.
      .gte('buchungsdatum', from)
      .lte('buchungsdatum', to);

    let afaTable: 'assets_neu' | 'assets' = 'assets_neu';
    let { data: afaRows, error: afaErr } = await loadAfa('assets_neu');
    if (afaErr) {
      afaTable = 'assets';
      ({ data: afaRows, error: afaErr } = await loadAfa('assets'));
    }
    if (!afaErr && afaRows) {
      for (const raw of (afaRows as unknown as Record<string, unknown>[])) {
        const assetRaw = raw[afaTable];
        const asset = (Array.isArray(assetRaw) ? assetRaw[0] : assetRaw) as
          | { bezeichnung?: string; art?: string }
          | null
          | undefined;
        const amount = Number(raw.afa_betrag || 0);
        if (amount <= 0) continue;
        const bestandKey: BestandKey = artToBestand[asset?.art ?? ''] ?? 'office_equipment';
        const bestandskonto = await accountForBestand(bestandKey);
        const line = buildLine(
          formatAmount(amount),
          'S',
          afaKonto,
          bestandskonto,
          '',
          formatDateDATEV(String(raw.buchungsdatum)),
          `AfA-${String(raw.id).slice(0, 6)}`,
          escapeField(String(raw.notizen || asset?.bezeichnung || 'Abschreibung')),
        );
        lines.push(line);
      }
    }
  } catch (err) {
    console.error('[datev-export] afa_buchungen-Abruf fehlgeschlagen', err);
    // Nicht blockend — Export bleibt ohne die neue-Welt-AfA gueltig.
  }

  // Build CSV with UTF-8 BOM
  const csvContent = lines.join('\r\n');
  const bom = '\uFEFF';
  const fullCsv = bom + csvContent;

  const filename = `cam2rent-DATEV-${from}-bis-${to}.csv`;

  return new Response(fullCsv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function buildLine(
  umsatz: string,
  sollHaben: string,
  konto: string,
  gegenkonto: string,
  buSchluessel: string,
  belegdatum: string,
  belegfeld1: string,
  buchungstext: string,
): string {
  // 23 fields matching the column headers
  return [
    umsatz,              // Umsatz
    sollHaben,           // Soll/Haben-Kennzeichen
    'EUR',               // WKZ Umsatz
    '',                  // Kurs
    '',                  // Basis-Umsatz
    '',                  // WKZ Basis-Umsatz
    konto,               // Konto
    gegenkonto,          // Gegenkonto
    buSchluessel,        // BU-Schlussel
    belegdatum,          // Belegdatum
    belegfeld1,          // Belegfeld 1
    '',                  // Belegfeld 2
    '',                  // Skonto
    buchungstext,        // Buchungstext
    '',                  // Postensperre
    '',                  // Diverse Adressnummer
    '',                  // Geschaftsbereich
    '',                  // Kostfeld 1
    '',                  // Kostfeld 2
    '',                  // Kost-Menge
    '',                  // EU-Land u. UStID
    '',                  // EU-Steuersatz
    '',                  // Abw. Versteuerungsart
  ].join(';');
}

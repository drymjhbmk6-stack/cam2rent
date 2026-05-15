import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { loadKontenrahmen, accountForBestand, type BestandKey } from '@/lib/accounting/kontenrahmen';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';

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
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, product_name, customer_name, customer_email, price_total, price_rental, price_accessories, price_haftung, shipping_price, discount_amount, status, created_at')
    .eq('is_test', false)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: true });

  if (bookingsError) {
    return NextResponse.json({ error: bookingsError.message }, { status: 500 });
  }

  const allBookings = (bookings || []) as Booking[];

  // Preview mode: return count and revenue
  if (isPreview) {
    const activeBookings = allBookings.filter((b) => b.status !== 'cancelled');
    const revenue = activeBookings.reduce((sum, b) => sum + (b.price_total || 0), 0);
    return NextResponse.json({ count: allBookings.length, revenue });
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
    const isCancelled = booking.status === 'cancelled';
    const bookingDate = formatDateDATEV(booking.created_at);
    const belegfeld = `B-${booking.id.substring(0, 8)}`;
    const customerText = escapeField(
      `${booking.product_name || 'Vermietung'} - ${booking.customer_name || 'Kunde'}`
    );

    // Main rental revenue
    const rentalAmount = (booking.price_rental || 0) + (booking.price_accessories || 0) - (booking.discount_amount || 0);
    if (rentalAmount > 0) {
      const buSchluessel = taxMode === 'regelbesteuerung' ? '3' : '';
      const line = buildLine(
        formatAmount(rentalAmount),
        isCancelled ? 'H' : 'S',
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
    if ((booking.price_haftung || 0) > 0) {
      const line = buildLine(
        formatAmount(booking.price_haftung),
        isCancelled ? 'H' : 'S',
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
    if ((booking.shipping_price || 0) > 0) {
      const buSchluessel = taxMode === 'regelbesteuerung' ? '3' : '';
      const line = buildLine(
        formatAmount(booking.shipping_price),
        isCancelled ? 'H' : 'S',
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

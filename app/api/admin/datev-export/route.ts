import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';

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
  // DATEV format: DDMM (day + month, no separators)
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}${month}`;
}

function formatAmount(amount: number): string {
  // DATEV uses comma as decimal separator, no thousands separator
  return Math.abs(amount).toFixed(2).replace('.', ',');
}

function escapeField(val: string): string {
  if (val.includes(';') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET(req: NextRequest) {
  // Auth check
  const cookieStore = await cookies();
  const adminHash = cookieStore.get('admin_session')?.value;
  if (!adminHash) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const isPreview = req.nextUrl.searchParams.get('preview') === '1';

  if (!from || !to) {
    return NextResponse.json({ error: 'Parameter "from" und "to" erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch bookings in date range
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, product_name, customer_name, customer_email, price_total, price_rental, price_accessories, price_haftung, shipping_price, discount_amount, status, created_at')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
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

  // Load DATEV config
  const { data: configRow } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', 'datev_config')
    .maybeSingle();

  const cfg: DatevConfig = configRow?.value
    ? { ...DEFAULT_CONFIG, ...(configRow.value as Partial<DatevConfig>) }
    : DEFAULT_CONFIG;

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

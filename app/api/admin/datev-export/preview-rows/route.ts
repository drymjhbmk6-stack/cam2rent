import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { getBerlinDayStartFromDateString, getBerlinDayEndFromDateString } from '@/lib/timezone';
import { computeBookingRevenue, buildInvoicePaidMap } from '@/lib/buchhaltung/booking-revenue';

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

  // DATEV Config laden
  const { data: configRow } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', 'datev_config')
    .maybeSingle();

  const cfg = configRow?.value || {};
  const erloeskonto = cfg.erloeskonto || '8400';
  const versandkonto = cfg.versandkostenkonto || '3800';
  const kautionskonto = cfg.kautionskonto || '1590';

  // Tax
  const { data: taxRow } = await supabase.from('admin_settings').select('value').eq('key', 'tax_mode').maybeSingle();
  const taxMode = taxRow?.value || 'kleinunternehmer';

  const fromIso = getBerlinDayStartFromDateString(from) ?? `${from}T00:00:00Z`;
  const toIso = getBerlinDayEndFromDateString(to) ?? `${to}T23:59:59Z`;
  const previewCols = 'id, product_name, customer_name, price_total, price_rental, price_accessories, price_haftung, shipping_price, discount_amount, duration_discount, loyalty_discount, early_bird_discount, special_discount, refund_amount, refund_note, payment_intent_id, status, created_at';
  // Optionale Spalten, die je nach ausstehender Migration fehlen koennen.
  const OPTIONAL_PREVIEW_COLS = [', early_bird_discount', ', special_discount', ', refund_amount', ', refund_note'];
  const buildPreviewQuery = (cols: string) => supabase
    .from('bookings')
    .select(cols)
    .eq('is_test', false)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: true })
    .limit(10);

  let hasRefundColumn = true;
  let { data: bookings, error: previewErr } = await buildPreviewQuery(previewCols);
  if (previewErr && /refund_amount|refund_note|early_bird_discount|special_discount|column|schema cache|PGRST/i.test(previewErr.message)) {
    hasRefundColumn = false;
    let stripped = previewCols;
    for (const c of OPTIONAL_PREVIEW_COLS) stripped = stripped.replace(c, '');
    ({ data: bookings, error: previewErr } = await buildPreviewQuery(stripped));
  }

  const rows: Array<{
    datum: string;
    konto: string;
    gegenkonto: string;
    betrag: string;
    buSchluessel: string;
    buchungstext: string;
  }> = [];

  type PreviewRow = {
    id: string; product_name: string | null; customer_name: string | null;
    price_total: number | null;
    price_rental: number | null; price_accessories: number | null;
    price_haftung: number | null; shipping_price: number | null;
    discount_amount: number | null; duration_discount: number | null;
    loyalty_discount: number | null; early_bird_discount: number | null;
    special_discount: number | null; refund_amount: number | null;
    refund_note: string | null; payment_intent_id: string | null;
    status: string | null; created_at: string;
  };
  const previewRows = (bookings ?? []) as unknown as PreviewRow[];
  const invoicePaidMap = await (async () => {
    const ids = previewRows.map((b) => b.id).filter(Boolean);
    if (ids.length === 0) return new Map<string, boolean>();
    try {
      const { data } = await supabase
        .from('invoices')
        .select('booking_id, status, payment_status')
        .in('booking_id', ids);
      return buildInvoicePaidMap(data as Array<{ booking_id: string | null; status: string | null; payment_status: string | null }> | null);
    } catch {
      return new Map<string, boolean>();
    }
  })();

  for (const b of previewRows) {
    const date = new Date(b.created_at);
    const datum = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
    // Identische Umsatzlogik wie CSV-Export + EÜR (massgeblich: price_total).
    const rev = computeBookingRevenue(b, {
      invoicePaid: invoicePaidMap.has(b.id) ? invoicePaidMap.get(b.id) : null,
      hasRefundColumn,
    });
    if (!rev.counts) continue;

    if (rev.kind === 'cancelled_retained') {
      rows.push({
        datum,
        konto: erloeskonto,
        gegenkonto: '1200',
        betrag: `${rev.total.toFixed(2).replace('.', ',')} €`,
        buSchluessel: taxMode === 'regelbesteuerung' ? '3' : '',
        buchungstext: `Stornogebuehr - ${b.customer_name || 'Kunde'}`,
      });
      continue;
    }

    const rental = Math.round((rev.net.rental + rev.net.accessories) * 100) / 100;
    if (rental > 0) {
      rows.push({
        datum,
        konto: erloeskonto,
        gegenkonto: '1200',
        betrag: `${rental.toFixed(2).replace('.', ',')} €`,
        buSchluessel: taxMode === 'regelbesteuerung' ? '3' : '',
        buchungstext: `${b.product_name || 'Vermietung'} - ${b.customer_name || 'Kunde'}`,
      });
    }

    if (rev.net.haftung > 0) {
      rows.push({
        datum,
        konto: kautionskonto,
        gegenkonto: '1200',
        betrag: `${rev.net.haftung.toFixed(2).replace('.', ',')} €`,
        buSchluessel: '',
        buchungstext: `Haftungsoption - ${b.customer_name || 'Kunde'}`,
      });
    }

    if (rev.net.shipping > 0) {
      rows.push({
        datum,
        konto: versandkonto,
        gegenkonto: '1200',
        betrag: `${rev.net.shipping.toFixed(2).replace('.', ',')} €`,
        buSchluessel: taxMode === 'regelbesteuerung' ? '3' : '',
        buchungstext: `Versand - ${b.customer_name || 'Kunde'}`,
      });
    }
  }

  return NextResponse.json({ rows, totalBookings: (bookings || []).length });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

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

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, product_name, customer_name, price_rental, price_accessories, price_haftung, shipping_price, discount_amount, status, created_at')
    .eq('is_test', false)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: true })
    .limit(10);

  const rows: Array<{
    datum: string;
    konto: string;
    gegenkonto: string;
    betrag: string;
    buSchluessel: string;
    buchungstext: string;
  }> = [];

  for (const b of bookings || []) {
    const date = new Date(b.created_at);
    const datum = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
    const isCancelled = b.status === 'cancelled';

    const rental = (b.price_rental || 0) + (b.price_accessories || 0) - (b.discount_amount || 0);
    if (rental > 0) {
      rows.push({
        datum,
        konto: erloeskonto,
        gegenkonto: '1200',
        betrag: `${isCancelled ? '-' : ''}${rental.toFixed(2).replace('.', ',')} €`,
        buSchluessel: taxMode === 'regelbesteuerung' ? '3' : '',
        buchungstext: `${b.product_name || 'Vermietung'} - ${b.customer_name || 'Kunde'}`,
      });
    }

    if ((b.price_haftung || 0) > 0) {
      rows.push({
        datum,
        konto: kautionskonto,
        gegenkonto: '1200',
        betrag: `${isCancelled ? '-' : ''}${(b.price_haftung || 0).toFixed(2).replace('.', ',')} €`,
        buSchluessel: '',
        buchungstext: `Haftungsoption - ${b.customer_name || 'Kunde'}`,
      });
    }

    if ((b.shipping_price || 0) > 0) {
      rows.push({
        datum,
        konto: versandkonto,
        gegenkonto: '1200',
        betrag: `${isCancelled ? '-' : ''}${(b.shipping_price || 0).toFixed(2).replace('.', ',')} €`,
        buSchluessel: taxMode === 'regelbesteuerung' ? '3' : '',
        buchungstext: `Versand - ${b.customer_name || 'Kunde'}`,
      });
    }
  }

  return NextResponse.json({ rows, totalBookings: (bookings || []).length });
}

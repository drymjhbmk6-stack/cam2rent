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
  const warnings: Array<{ type: 'error' | 'warning' | 'success'; message: string }> = [];

  // Buchungen ohne Rechnung
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id')
    .neq('status', 'cancelled')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);

  const bookingIds = (bookings || []).map(b => b.id);

  if (bookingIds.length > 0) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('booking_id')
      .in('booking_id', bookingIds);

    const invoiceBookingIds = new Set((invoices || []).map(i => i.booking_id));
    const withoutInvoice = bookingIds.filter(id => !invoiceBookingIds.has(id));

    if (withoutInvoice.length > 0) {
      warnings.push({ type: 'error', message: `${withoutInvoice.length} Buchung${withoutInvoice.length !== 1 ? 'en' : ''} ohne zugeordnete Rechnung im Zeitraum` });
    }
  }

  // Stornierte Buchungen ohne Gutschrift
  const { data: cancelledBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('status', 'cancelled')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);

  if ((cancelledBookings || []).length > 0) {
    const cancelledIds = cancelledBookings!.map(b => b.id);
    const { data: creditNotes } = await supabase
      .from('credit_notes')
      .select('booking_id')
      .in('booking_id', cancelledIds)
      .neq('status', 'rejected');

    const cnBookingIds = new Set((creditNotes || []).map(cn => cn.booking_id));
    const withoutCn = cancelledIds.filter(id => !cnBookingIds.has(id));

    if (withoutCn.length > 0) {
      warnings.push({ type: 'warning', message: `${withoutCn.length} stornierte Buchung${withoutCn.length !== 1 ? 'en' : ''} ohne Gutschrift` });
    }
  }

  if (warnings.length === 0) {
    warnings.push({ type: 'success', message: 'Alle Buchungen vollständig' });
  }

  return NextResponse.json({ warnings });
}

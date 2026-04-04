import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { createServiceClient } from '@/lib/supabase';
import { InvoicePDF, type InvoiceData } from '@/lib/invoice-pdf';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  if (!bookingId) {
    return NextResponse.json({ error: 'Fehlende Buchungsnummer.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch booking
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // Format invoice date from created_at or today
  const raw = booking.created_at ? new Date(booking.created_at) : new Date();
  const invoiceDate = raw.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Fetch tax config
  const { data: taxSettings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate', 'ust_id']);

  const taxMap: Record<string, string> = {};
  for (const s of taxSettings ?? []) taxMap[s.key] = s.value;

  const data: InvoiceData = {
    bookingId: booking.id,
    invoiceDate,
    customerName: booking.customer_name ?? '',
    customerEmail: booking.customer_email ?? '',
    productName: booking.product_name ?? '',
    rentalFrom: booking.rental_from ?? '',
    rentalTo: booking.rental_to ?? '',
    days: booking.days ?? 1,
    deliveryMode: booking.delivery_mode ?? 'versand',
    shippingMethod: booking.shipping_method ?? undefined,
    haftung: booking.haftung ?? 'none',
    accessories: Array.isArray(booking.accessories) ? booking.accessories : [],
    priceRental: booking.price_rental ?? 0,
    priceAccessories: booking.price_accessories ?? 0,
    priceHaftung: booking.price_haftung ?? 0,
    shippingPrice: booking.shipping_price ?? 0,
    priceTotal: booking.price_total ?? 0,
    deposit: booking.deposit ?? 0,
    taxMode: (taxMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
    taxRate: parseFloat(taxMap['tax_rate'] || '19'),
    ustId: taxMap['ust_id'] || '',
  };

  const pdfBuffer = await renderToBuffer(
    createElement(InvoicePDF, { data }) as ReactElement<DocumentProps>
  );

  const filename = `Rechnung-${booking.id}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

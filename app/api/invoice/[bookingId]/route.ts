import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { createServiceClient } from '@/lib/supabase';
import { InvoicePDF, type InvoiceData } from '@/lib/invoice-pdf';
import { ensureBusinessConfig } from '@/lib/load-business-config';
import { BUSINESS } from '@/lib/business-config';
import QRCode from 'qrcode';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  await ensureBusinessConfig();

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

  // Kundenadresse aus Profil laden
  let customerAddress = booking.shipping_address ?? '';
  if (!customerAddress && booking.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('address_street, address_zip, address_city')
      .eq('id', booking.user_id)
      .maybeSingle();
    if (profile?.address_street) {
      customerAddress = `${profile.address_street}, ${profile.address_zip} ${profile.address_city}`;
    }
  }

  const invoiceNumber = booking.id.replace(/^(C2R|BK)-/, 'RE-');

  const data: InvoiceData = {
    bookingId: booking.id,
    invoiceNumber,
    invoiceDate,
    customerName: booking.customer_name ?? '',
    customerEmail: booking.customer_email ?? '',
    customerAddress,
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
    paymentMethod: booking.payment_intent_id?.startsWith('MANUAL') ? 'Ueberweisung' : booking.payment_intent_id?.startsWith('PENDING') ? 'Ausstehend' : 'Stripe',
    stripePaymentId: booking.payment_intent_id?.startsWith('pi_') ? booking.payment_intent_id : undefined,
    paymentStatus: booking.payment_status ?? undefined,
  };

  // EPC QR-Code für Banking generieren
  try {
    const epcData = [
      'BCD',           // Service Tag
      '002',           // Version
      '1',             // Character set (UTF-8)
      'SCT',           // Identification
      BUSINESS.bic,    // BIC
      BUSINESS.owner,  // Empfaenger
      BUSINESS.iban,   // IBAN (ohne Leerzeichen)
      `EUR${data.priceTotal.toFixed(2)}`, // Betrag
      '',              // Purpose Code
      '',              // Structured Reference
      `${invoiceNumber} ${data.customerName}`, // Verwendungszweck
    ].join('\n');
    data.qrCodeDataUrl = await QRCode.toDataURL(epcData, { width: 200, margin: 1 });
  } catch (qrErr) {
    console.error('QR-Code Fehler:', qrErr);
  }

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

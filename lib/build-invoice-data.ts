/**
 * Baut das vollstaendige InvoiceData-Objekt aus einer bookings-Row.
 *
 * Einzige Quelle der Wahrheit fuer die Kundenrechnung — wird von
 * /api/invoice/[bookingId] (Live-Anzeige) UND lib/invoice-versions.ts
 * (archivierte Fassung) genutzt, damit eine archivierte Rechnung
 * byte-fuer-byte derselben Logik folgt wie die live erzeugte.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { BUSINESS } from '@/lib/business-config';
import { normalizeAccessoryItems } from '@/lib/booking-accessories';
import { computeInvoiceLines } from '@/lib/invoice-lines';
import type { InvoiceData } from '@/lib/invoice-pdf';

export async function buildInvoiceData(
  supabase: SupabaseClient,
  booking: Record<string, unknown>,
): Promise<InvoiceData> {
  // Rechnungsdatum aus created_at oder heute (Berlin-Zeit).
  const raw = booking.created_at ? new Date(booking.created_at as string) : new Date();
  const invoiceDate = raw.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  });

  // Steuer-Konfiguration
  const { data: taxSettings } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
  const taxMap: Record<string, string> = {};
  for (const s of taxSettings ?? []) taxMap[s.key] = s.value;

  // Kundenadresse aus Profil laden
  let customerAddress = (booking.shipping_address as string) ?? '';
  if (!customerAddress && booking.user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('address_street, address_zip, address_city')
      .eq('id', booking.user_id as string)
      .maybeSingle();
    if (profile?.address_street) {
      customerAddress = `${profile.address_street}, ${profile.address_zip} ${profile.address_city}`;
    }
  }

  const bookingId = booking.id as string;
  const invoiceNumber = bookingId.replace(/^(C2R|BK)-/, 'RE-');

  const accItems = normalizeAccessoryItems(booking.accessory_items, booking.accessories);
  const { cameraLines, accessoryLines } = await computeInvoiceLines(
    supabase,
    booking as Parameters<typeof computeInvoiceLines>[1],
  );

  const piId = booking.payment_intent_id as string | undefined;

  const data: InvoiceData = {
    bookingId,
    invoiceNumber,
    invoiceDate,
    customerName: (booking.customer_name as string) ?? '',
    customerEmail: (booking.customer_email as string) ?? '',
    customerAddress,
    productName: (booking.product_name as string) ?? '',
    rentalFrom: (booking.rental_from as string) ?? '',
    rentalTo: (booking.rental_to as string) ?? '',
    days: (booking.days as number) ?? 1,
    deliveryMode: (booking.delivery_mode as string) ?? 'versand',
    shippingMethod: (booking.shipping_method as string) ?? undefined,
    haftung: (booking.haftung as string) ?? 'none',
    accessories: Array.isArray(booking.accessories) ? (booking.accessories as string[]) : [],
    accessoryItems: accItems,
    cameraLines,
    accessoryLines,
    priceRental: (booking.price_rental as number) ?? 0,
    priceAccessories: (booking.price_accessories as number) ?? 0,
    priceHaftung: (booking.price_haftung as number) ?? 0,
    shippingPrice: (booking.shipping_price as number) ?? 0,
    discountAmount:
      ((booking.discount_amount as number) ?? 0)
      + ((booking.duration_discount as number) ?? 0)
      + ((booking.loyalty_discount as number) ?? 0),
    couponCode: (booking.coupon_code as string) ?? undefined,
    priceTotal: (booking.price_total as number) ?? 0,
    deposit: (booking.deposit as number) ?? 0,
    taxMode: (taxMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
    taxRate: parseFloat(taxMap['tax_rate'] || '19'),
    ustId: taxMap['ust_id'] || '',
    paymentMethod: piId?.startsWith('MANUAL') ? 'Ueberweisung' : piId?.startsWith('PENDING') ? 'Ausstehend' : 'Stripe',
    stripePaymentId: piId?.startsWith('pi_') ? piId : undefined,
    paymentStatus: piId?.includes('UNPAID') ? 'unpaid'
      : booking.payment_status === 'unpaid' ? 'unpaid'
      : (typeof booking.notes === 'string' && booking.notes.includes('Überweisung ausstehend')) ? 'unpaid'
      : undefined,
  };

  // EPC-QR-Code (Banking)
  try {
    const epcData = [
      'BCD', '002', '1', 'SCT',
      BUSINESS.bic,
      BUSINESS.owner,
      BUSINESS.iban,
      `EUR${data.priceTotal.toFixed(2)}`,
      '', '',
      `${invoiceNumber} ${data.customerName}`,
    ].join('\n');
    data.qrCodeDataUrl = await QRCode.toDataURL(epcData, {
      width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (qrErr) {
    console.error('QR-Code Fehler:', qrErr);
  }

  return data;
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import { assignUnitToBooking } from '@/lib/unit-assignment';
import { createAdminNotification } from '@/lib/admin-notifications';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';
import { sendBookingConfirmation, sendAdminNotification, type BookingEmailData } from '@/lib/email';

/**
 * POST /api/admin/manual-booking
 *
 * Erstellt eine manuelle Buchung (Gast-Buchung).
 * Optional: Vertrag generieren (wenn Signatur vorhanden), E-Mail senden.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      product_id,
      product_name,
      rental_from,
      rental_to,
      days,
      delivery_mode,
      shipping_method,
      shipping_price,
      haftung,
      accessories,
      price_rental,
      price_accessories,
      price_haftung,
      price_total,
      deposit,
      customer_name,
      customer_email,
      shipping_address,
      payment_status,
      send_email,
      contractSignature,
    } = body;

    if (!product_id || !product_name || !rental_from || !rental_to || !days || !customer_name) {
      return NextResponse.json(
        { error: 'Pflichtfelder fehlen (Produkt, Zeitraum, Name).' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const bookingId = await generateBookingId();
    const isUnpaid = payment_status === 'unpaid';
    const paymentIntentId = isUnpaid
      ? `MANUAL-UNPAID-${bookingId}-${Date.now()}`
      : `MANUAL-${bookingId}-${Date.now()}`;
    const bookingNotes = body.notes || null;

    const insertData: Record<string, unknown> = {
      id: bookingId,
      payment_intent_id: paymentIntentId,
      product_id,
      product_name,
      rental_from,
      rental_to,
      days: parseInt(days, 10),
      delivery_mode: delivery_mode || 'versand',
      shipping_method: shipping_method || null,
      shipping_price: parseFloat(shipping_price || '0'),
      haftung: haftung || 'none',
      accessories: accessories || [],
      price_rental: parseFloat(price_rental || '0'),
      price_accessories: parseFloat(price_accessories || '0'),
      price_haftung: parseFloat(price_haftung || '0'),
      price_total: parseFloat(price_total || '0'),
      deposit: parseFloat(deposit || '0'),
      status: 'confirmed',
      customer_name,
      customer_email: customer_email || null,
      shipping_address: shipping_address || null,
    };

    if (body.user_id) insertData.user_id = body.user_id;
    if (body.unit_id) insertData.unit_id = body.unit_id;
    if (bookingNotes) insertData.notes = bookingNotes;
    if (payment_status) insertData.payment_status = payment_status;

    // Vertrag als signiert markieren wenn Signatur vorhanden
    if (contractSignature?.agreedToTerms) {
      insertData.contract_signed = true;
    }

    let result = await supabase.from('bookings').insert(insertData);

    if (result.error) {
      console.warn('Insert with optional fields failed, retrying without:', result.error.message);
      delete insertData.notes;
      delete insertData.payment_status;
      delete insertData.contract_signed;
      result = await supabase.from('bookings').insert(insertData);
    }

    if (result.error) {
      console.error('Manual booking insert error:', result.error);
      return NextResponse.json(
        { error: 'Buchung konnte nicht erstellt werden.' },
        { status: 500 }
      );
    }

    // Unit automatisch zuordnen falls keine manuell gewählt
    if (!body.unit_id) {
      assignUnitToBooking(bookingId, product_id, rental_from, rental_to)
        .catch((err) => console.error(`Unit assignment error for ${bookingId}:`, err));
    }

    // Transaktionsgebühren als Ausgabe verbuchen
    const fees = parseFloat(body.payment_fees || '0');
    if (fees > 0 && body.payment_method) {
      const methodLabels: Record<string, string> = {
        paypal: 'PayPal', stripe: 'Stripe', bank_transfer: 'Banküberweisung', bar: 'Barzahlung',
      };
      const label = methodLabels[body.payment_method] || body.payment_method;
      await supabase.from('expenses').insert({
        expense_date: new Date().toISOString().split('T')[0],
        category: 'fees',
        description: `${label}-Gebühr für Buchung ${bookingId}`,
        vendor: label,
        net_amount: fees,
        tax_amount: 0,
        gross_amount: fees,
        source_type: 'booking_fee',
        source_id: bookingId,
      }).then(({ error }) => {
        if (error) console.error('Expense insert error:', error.message);
      });
    }

    // ── Response sofort senden — PDF + E-Mail im Hintergrund ──

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip') || 'unknown';

    const fmtD = (iso: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return `${d}.${m}.${y}`;
    };

    // Steuer-Config laden
    const { data: taxSettings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
    const txMap: Record<string, string> = {};
    for (const s of taxSettings ?? []) txMap[s.key] = s.value;

    // Hintergrund: Vertrag generieren + E-Mail senden
    (async () => {
      try {
        let contractPdfBuffer: Buffer | undefined;

        // Vertrag generieren wenn Signatur vorhanden
        if (contractSignature?.agreedToTerms && contractSignature?.signerName) {
          try {
            const contractResult = await generateContractPDF({
              bookingId,
              bookingNumber: bookingId,
              customerName: contractSignature.signerName,
              customerEmail: customer_email || '',
              productName: product_name,
              accessories: accessories || [],
              rentalFrom: fmtD(rental_from),
              rentalTo: fmtD(rental_to),
              rentalDays: parseInt(days, 10),
              priceRental: parseFloat(price_rental || '0'),
              priceAccessories: parseFloat(price_accessories || '0'),
              priceHaftung: parseFloat(price_haftung || '0'),
              priceShipping: parseFloat(shipping_price || '0'),
              priceTotal: parseFloat(price_total || '0'),
              deposit: parseFloat(deposit || '0'),
              taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
              taxRate: parseFloat(txMap['tax_rate'] || '19'),
              signatureDataUrl: contractSignature.signatureDataUrl,
              signatureMethod: contractSignature.signatureMethod,
              signerName: contractSignature.signerName,
              ipAddress: ip,
            });
            contractPdfBuffer = contractResult.pdfBuffer;

            await storeContract(bookingId, contractResult.pdfBuffer, {
              contractHash: contractResult.contractHash,
              customerName: contractSignature.signerName,
              ipAddress: ip,
              signedAt: new Date().toISOString(),
              signatureMethod: contractSignature.signatureMethod,
            });
          } catch (err) {
            console.error('[manual-booking] Contract generation error:', err);
          }
        }

        // E-Mail senden wenn gewünscht
        if (send_email && customer_email) {
          const emailData: BookingEmailData = {
            bookingId,
            customerName: customer_name,
            customerEmail: customer_email,
            productName: product_name,
            rentalFrom: rental_from,
            rentalTo: rental_to,
            days: parseInt(days, 10),
            deliveryMode: (delivery_mode || 'versand') as 'versand' | 'abholung',
            shippingMethod: shipping_method,
            haftung: haftung || 'none',
            accessories: accessories || [],
            priceRental: parseFloat(price_rental || '0'),
            priceAccessories: parseFloat(price_accessories || '0'),
            priceHaftung: parseFloat(price_haftung || '0'),
            priceTotal: parseFloat(price_total || '0'),
            deposit: parseFloat(deposit || '0'),
            shippingPrice: parseFloat(shipping_price || '0'),
            taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
            taxRate: parseFloat(txMap['tax_rate'] || '19'),
            ustId: txMap['ust_id'] || '',
          };

          await Promise.all([
            sendBookingConfirmation(emailData, contractPdfBuffer),
            sendAdminNotification(emailData),
          ]);
          console.log(`[manual-booking] E-Mails gesendet für ${bookingId}`);
        }
      } catch (err) {
        console.error('[manual-booking] Background task error:', err);
      }
    })();

    // Admin-Benachrichtigung (fire-and-forget)
    createAdminNotification(supabase, {
      type: 'new_booking',
      title: `Manuelle Buchung: ${bookingId}`,
      message: `${customer_name} — ${product_name} (${days} Tage)`,
      link: `/admin/buchungen/${bookingId}`,
    });

    return NextResponse.json({ success: true, bookingId });
  } catch (err) {
    console.error('Manual booking error:', err);
    return NextResponse.json(
      { error: 'Unerwarteter Fehler.' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import { assignUnitToBooking } from '@/lib/unit-assignment';
import { assignAccessoryUnitsToBooking } from '@/lib/accessory-unit-assignment';
import { createAdminNotification } from '@/lib/admin-notifications';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';
import { sendBookingConfirmation, sendAdminNotification, type BookingEmailData } from '@/lib/email';
import { isTestMode } from '@/lib/env-mode';
import { isUserTester } from '@/lib/tester-mode';
import { logAudit } from '@/lib/audit';

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

    // is_test = globaler Test-Modus ODER ausgewaehlter Kunde ist Tester-Konto.
    // Bei manueller Buchung gibt es kein Stripe — nur das DB-Flag ist relevant,
    // damit die Buchung in Reports/EUeR/DATEV ausgefiltert wird.
    const globalTestMode = await isTestMode();
    const userIsTester = body.user_id ? await isUserTester(body.user_id) : false;
    const testMode = globalTestMode || userIsTester;

    const insertData: Record<string, unknown> = {
      id: bookingId,
      payment_intent_id: paymentIntentId,
      is_test: testMode,
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
      // accessory_items qty-aware: nimmt bevorzugt body.accessory_items, sonst
      // baut es eine Eins-zu-Eins-Liste aus accessories[] (qty=1 pro Eintrag).
      // So loesen Rechnung, Mietvertrag und Packliste auch hier Sets korrekt
      // in ihre Einzelteile auf.
      accessory_items: Array.isArray(body.accessory_items) && body.accessory_items.length > 0
        ? body.accessory_items
        : (Array.isArray(accessories) && accessories.length > 0
            ? (accessories as string[]).map((id) => ({ accessory_id: id, qty: 1 }))
            : null),
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

    // Manueller Rabatt (optional, Spalten existieren in bookings).
    const manualDiscount = parseFloat(body.discount_amount || '0');
    if (manualDiscount > 0) {
      insertData.discount_amount = manualDiscount;
    }

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
      delete insertData.discount_amount;
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

    // Zubehoer-Exemplare automatisch zuordnen (non-blocking)
    const finalAccessoryItems: { accessory_id: string; qty: number }[] =
      Array.isArray(body.accessory_items) && body.accessory_items.length > 0
        ? body.accessory_items
        : Array.isArray(accessories) && accessories.length > 0
          ? (accessories as string[]).map((id) => ({ accessory_id: id, qty: 1 }))
          : [];
    if (finalAccessoryItems.length > 0) {
      assignAccessoryUnitsToBooking(bookingId, finalAccessoryItems, rental_from, rental_to)
        .catch((err) => console.error(`Accessory-unit assignment error for ${bookingId}:`, err));
    }

    // Transaktionsgebühren als Ausgabe verbuchen
    const fees = parseFloat(body.payment_fees || '0');
    if (fees > 0 && body.payment_method) {
      const methodLabels: Record<string, string> = {
        paypal: 'PayPal', stripe: 'Stripe', bank_transfer: 'Banküberweisung', bar: 'Barzahlung',
      };
      const label = methodLabels[body.payment_method] || body.payment_method;
      await supabase.from('expenses').insert({
        // Berlin-Datum, damit Gebuehren-Ausgaben abends nicht auf den Folgetag rutschen
        expense_date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }),
        category: 'stripe_fees',
        description: `${label}-Gebühr für Buchung ${bookingId}`,
        vendor: label,
        net_amount: fees,
        tax_amount: 0,
        gross_amount: fees,
        source_type: 'booking_fee',
        source_id: bookingId,
        is_test: testMode,
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
              unitId: body.unit_id ?? null,
              // Tester-User → Wasserzeichen "MUSTER / TESTVERTRAG" auch im
              // Live-Modus, damit klar ist dass das ein Test war.
              ...(userIsTester ? { forceTestMode: true } : {}),
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

    await logAudit({
      action: 'booking.create_manual',
      entityType: 'booking',
      entityId: bookingId,
      entityLabel: `${customer_name} — ${product_name}`,
      changes: {
        product_id,
        days: parseInt(days, 10),
        rental_from,
        rental_to,
        payment_status: payment_status || 'paid',
        price_total: parseFloat(price_total || '0'),
        ...(manualDiscount > 0 ? { discount_amount: manualDiscount } : {}),
      },
      request: req,
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

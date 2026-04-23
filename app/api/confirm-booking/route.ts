import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { detectSuspicious } from '@/lib/suspicious';
import { ensureBusinessConfig } from '@/lib/load-business-config';
import { generateBookingId } from '@/lib/booking-id';
import { assignUnitToBooking } from '@/lib/unit-assignment';
import { createAdminNotification } from '@/lib/admin-notifications';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { calcPriceFromTable, type AdminProduct } from '@/lib/price-config';
import { parseMetadataAccessoryItems, itemsToLegacyIds } from '@/lib/booking-accessories';
import {
  sendBookingConfirmation,
  sendAdminNotification,
  type BookingEmailData,
} from '@/lib/email';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';
import { confirmBookingBodySchema, firstZodError } from '@/lib/api-schemas';
import { getStripe } from '@/lib/stripe';
import { isTestMode } from '@/lib/env-mode';

// Confirm ist eine teure Operation (Stripe-Verify + DB + PDF + E-Mails).
// 5/Minute pro IP — erlaubt Retry, blockt Spam.
const confirmLimiter = rateLimit({ maxAttempts: 5, windowMs: 60_000 });

/**
 * POST /api/confirm-booking
 * Body: { payment_intent_id: string }
 *
 * 1. Verifies the PaymentIntent with Stripe (server-side, tamper-proof)
 * 2. Saves the booking to Supabase with status "confirmed"
 * 3. Idempotent: returns existing booking if already saved
 *
 * Returns { success: true, booking_id: "BK-2026-00042" }
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!confirmLimiter.check(`confirm:${ip}`).success) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte einen Moment warten.' },
      { status: 429 }
    );
  }
  await ensureBusinessConfig();
  try {
    // Zod-Validierung statt Type-Assertion: Schützt vor manipulierten
    // Request-Bodies (z.B. Signatur-URL mit 10 MB, falsche Payment-Intent-IDs).
    const parsed = confirmBookingBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
    }
    const { payment_intent_id, deposit_intent_id, contractSignature } = parsed.data;

    // 1. Verify payment with Stripe
    const stripe = await getStripe();
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (intent.status !== 'succeeded') {
      return NextResponse.json(
        { error: 'Zahlung nicht abgeschlossen.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // 2. Idempotency check — booking may already exist if page reloaded
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_intent_id', payment_intent_id)
      .maybeSingle();

    if (existing) {
      // Buchung existiert bereits (Webhook oder Reload) — Vertrag noch signieren falls nötig
      console.log('[confirm-booking] Idempotent: existing=', existing.id, 'contractSignature=', contractSignature ? 'vorhanden' : 'FEHLT');
      if (contractSignature?.agreedToTerms && contractSignature?.signerName) {
        const { data: bk } = await supabase.from('bookings').select('contract_signed').eq('id', existing.id).single();
        if (bk && !bk.contract_signed) {
          const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || req.headers.get('x-real-ip') || 'unknown';
          try {
            const { data: fullBooking } = await supabase.from('bookings').select('*').eq('id', existing.id).single();
            if (fullBooking) {
              const fmtD = (iso: string) => { const [y, m, d] = (iso || '').split('T')[0].split('-'); return `${d}.${m}.${y}`; };
              const { data: txS } = await supabase.from('admin_settings').select('key, value').in('key', ['tax_mode', 'tax_rate']);
              const txM: Record<string, string> = {}; for (const s of txS ?? []) txM[s.key] = s.value;
              const result = await generateContractPDF({
                bookingId: existing.id, bookingNumber: existing.id,
                customerName: contractSignature.signerName,
                customerEmail: fullBooking.customer_email || '',
                productName: fullBooking.product_name || '',
                accessories: Array.isArray(fullBooking.accessories) ? fullBooking.accessories : [],
                accessoryItems: Array.isArray(fullBooking.accessory_items) && fullBooking.accessory_items.length > 0
                  ? fullBooking.accessory_items as { accessory_id: string; qty: number }[]
                  : undefined,
                rentalFrom: fmtD(fullBooking.rental_from), rentalTo: fmtD(fullBooking.rental_to),
                rentalDays: fullBooking.days || 1,
                priceRental: fullBooking.price_rental || 0, priceAccessories: fullBooking.price_accessories || 0,
                priceHaftung: fullBooking.price_haftung || 0, priceShipping: fullBooking.shipping_price || 0,
                priceTotal: fullBooking.price_total || 0, deposit: fullBooking.deposit || 0,
                taxMode: (txM['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
                taxRate: parseFloat(txM['tax_rate'] || '19'),
                signatureDataUrl: contractSignature.signatureDataUrl,
                signatureMethod: contractSignature.signatureMethod,
                signerName: contractSignature.signerName, ipAddress: ip,
                unitId: fullBooking.unit_id ?? null,
              });
              await storeContract(existing.id, result.pdfBuffer, {
                contractHash: result.contractHash, customerName: contractSignature.signerName,
                ipAddress: ip, signedAt: new Date().toISOString(), signatureMethod: contractSignature.signatureMethod,
              });
              console.log('[confirm-booking] Vertrag gespeichert für', existing.id);
            }
          } catch (err) { console.error('[confirm-booking] Contract generation error:', err); }
        }
      }
      return NextResponse.json({ success: true, booking_id: existing.id });
    }

    // 3. Buchungsnummer generieren
    const bookingId = await generateBookingId();

    // 4. Parse Stripe metadata
    const meta = intent.metadata;
    const accessoryItems = parseMetadataAccessoryItems(meta.accessory_items, meta.accessories);
    const accessories = accessoryItems.length > 0
      ? itemsToLegacyIds(accessoryItems)
      : (meta.accessories ? meta.accessories.split(',').filter(Boolean) : []);

    // 4a. Preis-Plausibilitätsprüfung (Defense-in-Depth):
    // intent.amount ist der echte bei Stripe gezahlte Betrag (nicht manipulierbar).
    // Wir prüfen nur, ob er plausibel zu dem gebuchten Produkt + Dauer passt.
    // 70% Rabatt-Puffer, damit Gutscheine und Admin-Sonderpreise nicht fälschlich
    // blockiert werden. Nur bei massiven Abweichungen wird abgebrochen.
    try {
      if (meta.product_id && meta.days) {
        const days = parseInt(meta.days, 10);
        if (days > 0) {
          const { data: prodRow } = await supabase
            .from('admin_config')
            .select('value')
            .eq('key', 'products')
            .maybeSingle();
          if (prodRow?.value && typeof prodRow.value === 'object') {
            const productMap = prodRow.value as Record<string, AdminProduct>;
            const product = productMap[meta.product_id];
            if (product && Array.isArray(product.priceTable)) {
              const expectedCents = Math.round(calcPriceFromTable(product, days) * 100);
              const floorCents = Math.floor(expectedCents * 0.3); // 70 % Rabatt-Puffer
              if (intent.amount < floorCents) {
                console.error('[confirm-booking] Preis-Plausibilität verletzt:', {
                  paymentIntent: payment_intent_id,
                  paidAmount: intent.amount,
                  expectedCents,
                  floorCents,
                });
                return NextResponse.json(
                  { error: 'Preis-Plausibilitätsprüfung fehlgeschlagen. Buchung wurde nicht bestätigt.' },
                  { status: 400 },
                );
              }
            }
          }
        }
      }
    } catch (plausErr) {
      // Plausibilitätsprüfung darf Buchungsbestätigung nicht blockieren, wenn
      // die Berechnung selbst crasht (z.B. DB-Hiccup). Dann greift nur der
      // Basis-Stripe-Verify oben.
      console.error('[confirm-booking] Plausibilitätsprüfung fehlgeschlagen:', plausErr);
    }

    // 4b. Lieferadresse aus Profil holen
    let shippingAddress: string | null = null;
    if (meta.user_id && meta.delivery_mode === 'versand') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('address_street, address_zip, address_city')
        .eq('id', meta.user_id)
        .maybeSingle();
      if (profile?.address_street) {
        shippingAddress = [
          profile.address_street,
          [profile.address_zip, profile.address_city].filter(Boolean).join(' '),
        ].filter(Boolean).join(', ');
      }
    }

    // 5. Deposit-Vorautorisierung bestätigen (falls vorhanden)
    let confirmedDepositIntentId: string | null = null;
    let depositStatus = 'none';

    if (deposit_intent_id) {
      try {
        const paymentMethod = intent.payment_method;
        if (paymentMethod) {
          await stripe.paymentIntents.confirm(deposit_intent_id, {
            payment_method: typeof paymentMethod === 'string' ? paymentMethod : paymentMethod.id,
          });
          confirmedDepositIntentId = deposit_intent_id;
          depositStatus = 'held';
        }
      } catch (depositErr) {
        console.error('Deposit hold error:', depositErr);
        // Buchung trotzdem speichern — Kaution konnte nicht gehalten werden
      }
    }

    // 6. Save booking
    const testMode = await isTestMode();
    // Verifizierungsflag aus Stripe-Metadata (von checkout-intent gesetzt).
    const verificationRequired = meta.verification_required === '1';
    const { error } = await supabase.from('bookings').insert({
      id: bookingId,
      payment_intent_id,
      is_test: testMode,
      product_id: meta.product_id,
      product_name: meta.product_name,
      rental_from: meta.rental_from,
      rental_to: meta.rental_to,
      days: parseInt(meta.days, 10),
      delivery_mode: meta.delivery_mode,
      shipping_method: meta.shipping_method ?? null,
      shipping_price: parseFloat(meta.shipping_price ?? '0'),
      haftung: meta.haftung,
      accessories,
      accessory_items: accessoryItems.length > 0 ? accessoryItems : null,
      price_rental: parseFloat(meta.price_rental ?? '0'),
      price_accessories: parseFloat(meta.price_accessories ?? '0'),
      price_haftung: parseFloat(meta.price_haftung ?? '0'),
      price_total: intent.amount / 100,
      deposit: parseFloat(meta.deposit ?? '0'),
      deposit_intent_id: confirmedDepositIntentId,
      deposit_status: depositStatus,
      status: 'confirmed',
      user_id: meta.user_id || null,
      customer_email: meta.customer_email || null,
      customer_name: meta.customer_name || null,
      shipping_address: shippingAddress,
      // Nur setzen wenn true — so bleibt Insert ohne Migration ruckwaerts-kompatibel
      ...(verificationRequired ? { verification_required: true } : {}),
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { error: 'Buchung konnte nicht gespeichert werden.' },
        { status: 500 }
      );
    }

    // 6a. Unit automatisch zuordnen (non-blocking)
    assignUnitToBooking(bookingId, meta.product_id, meta.rental_from, meta.rental_to)
      .catch((err) => console.error(`Unit assignment error for ${bookingId}:`, err));

    // 6b. Abandoned Cart als recovered markieren (non-blocking)
    if (meta.user_id) {
      Promise.resolve(
        supabase
          .from('abandoned_carts')
          .update({ recovered: true })
          .eq('user_id', meta.user_id)
          .eq('recovered', false)
      ).catch((err: unknown) => console.error('Abandoned cart recovery error:', err));
    }

    // 6c. Suspicious Detection (non-blocking)
    detectSuspicious(supabase, {
      userId: meta.user_id || null,
      priceTotal: intent.amount / 100,
      rentalFrom: meta.rental_from,
      days: parseInt(meta.days, 10),
    }).then(async (result) => {
      if (result.suspicious) {
        await supabase
          .from('bookings')
          .update({ suspicious: true, suspicious_reasons: result.reasons })
          .eq('id', bookingId);
      }
    }).catch((err) => console.error('Suspicious detection error:', err));

    // 6. Look up customer info — from metadata or Supabase profile
    const customerEmail = meta.customer_email ?? '';
    let customerName = meta.customer_name ?? '';

    if (!customerName && meta.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', meta.user_id)
        .maybeSingle();
      if (profile?.full_name) customerName = profile.full_name;
    }

    // 7. Fetch tax config for emails/PDFs
    const { data: taxSettings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
    const txMap: Record<string, string> = {};
    for (const s of taxSettings ?? []) txMap[s.key] = s.value;

    // 8. Vertrag generieren (wenn Signaturdaten vorhanden)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';

    const fmtDate = (iso: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return `${d}.${m}.${y}`;
    };

    // Seriennummer laden falls Unit zugeordnet
    let serialNumber = '';
    let bookingUnitId: string | null = null;
    try {
      const { data: bkRow } = await supabase.from('bookings').select('unit_id').eq('id', bookingId).maybeSingle();
      if (bkRow?.unit_id) {
        bookingUnitId = bkRow.unit_id;
        const { data: unitRow } = await supabase.from('product_units').select('serial_number').eq('id', bkRow.unit_id).maybeSingle();
        serialNumber = unitRow?.serial_number ?? '';
      }
    } catch { /* ignore */ }

    let contractPdfBuffer: Buffer | undefined;
    if (contractSignature?.agreedToTerms && contractSignature?.signerName) {
      try {
        // Kundenprofil für Adresse laden
        let custStreet = '';
        let custZip = '';
        let custCity = '';
        if (meta.user_id) {
          const { data: addrProfile } = await supabase
            .from('profiles')
            .select('address_street, address_zip, address_city')
            .eq('id', meta.user_id)
            .maybeSingle();
          if (addrProfile?.address_street) {
            custStreet = addrProfile.address_street;
            custZip = addrProfile.address_zip || '';
            custCity = addrProfile.address_city || '';
          }
        }

        const result = await generateContractPDF({
          bookingId,
          bookingNumber: bookingId,
          customerName: contractSignature.signerName,
          customerEmail,
          customerStreet: custStreet,
          customerZip: custZip,
          customerCity: custCity,
          productName: meta.product_name || '',
          accessories,
          accessoryItems: accessoryItems.length > 0 ? accessoryItems : undefined,
          serialNumber,
          rentalFrom: fmtDate(meta.rental_from),
          rentalTo: fmtDate(meta.rental_to),
          rentalDays: parseInt(meta.days, 10),
          priceRental: parseFloat(meta.price_rental ?? '0'),
          priceAccessories: parseFloat(meta.price_accessories ?? '0'),
          priceHaftung: parseFloat(meta.price_haftung ?? '0'),
          priceShipping: parseFloat(meta.shipping_price ?? '0'),
          priceTotal: intent.amount / 100,
          deposit: parseFloat(meta.deposit ?? '0'),
          taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
          taxRate: parseFloat(txMap['tax_rate'] || '19'),
          signatureDataUrl: contractSignature.signatureDataUrl,
          signatureMethod: contractSignature.signatureMethod,
          signerName: contractSignature.signerName,
          ipAddress: ip,
          unitId: bookingUnitId,
        });

        contractPdfBuffer = result.pdfBuffer;

        // Vertrag in Supabase speichern
        await storeContract(bookingId, result.pdfBuffer, {
          contractHash: result.contractHash,
          customerName: contractSignature.signerName,
          ipAddress: ip,
          signedAt: new Date().toISOString(),
          signatureMethod: contractSignature.signatureMethod,
        });
      } catch (err) {
        console.error('Contract generation error:', err);
      }
    }

    // 9. Send confirmation emails with Rechnung + Vertrag (fire-and-forget)
    if (customerEmail) {
      const emailData: BookingEmailData = {
        bookingId,
        customerName,
        customerEmail,
        productName: meta.product_name,
        rentalFrom: meta.rental_from,
        rentalTo: meta.rental_to,
        days: parseInt(meta.days, 10),
        deliveryMode: (meta.delivery_mode as 'versand' | 'abholung') ?? 'versand',
        shippingMethod: meta.shipping_method,
        haftung: meta.haftung,
        accessories,
        accessoryItems: accessoryItems.length > 0 ? accessoryItems : undefined,
        priceRental: parseFloat(meta.price_rental ?? '0'),
        priceAccessories: parseFloat(meta.price_accessories ?? '0'),
        priceHaftung: parseFloat(meta.price_haftung ?? '0'),
        priceTotal: intent.amount / 100,
        deposit: parseFloat(meta.deposit ?? '0'),
        shippingPrice: parseFloat(meta.shipping_price ?? '0'),
        taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
        taxRate: parseFloat(txMap['tax_rate'] || '19'),
        ustId: txMap['ust_id'] || '',
        verificationRequired,
      };

      Promise.all([
        sendBookingConfirmation(emailData, contractPdfBuffer),
        sendAdminNotification(emailData),
      ]).catch((err) => console.error('Email send error:', err));
    }

    // Admin-Benachrichtigung (fire-and-forget)
    createAdminNotification(supabase, {
      type: 'new_booking',
      title: verificationRequired
        ? `Neue Buchung (Ausweis prüfen!): ${bookingId}`
        : `Neue Buchung: ${bookingId}`,
      message: verificationRequired
        ? `${meta.customer_name} — ${meta.product_name} (${meta.days} Tage) · Ausweis-Check steht aus`
        : `${meta.customer_name} — ${meta.product_name} (${meta.days} Tage)`,
      link: `/admin/buchungen/${bookingId}`,
    });

    return NextResponse.json({ success: true, booking_id: bookingId });
  } catch (err) {
    console.error('Confirm booking error:', err);
    return NextResponse.json(
      { error: 'Fehler beim Bestätigen der Buchung.' },
      { status: 500 }
    );
  }
}

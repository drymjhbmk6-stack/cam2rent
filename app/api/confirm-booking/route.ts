import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';
import { detectSuspicious } from '@/lib/suspicious';
import { ensureBusinessConfig } from '@/lib/load-business-config';
import { generateBookingId } from '@/lib/booking-id';
import {
  sendBookingConfirmation,
  sendAdminNotification,
  type BookingEmailData,
} from '@/lib/email';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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
  await ensureBusinessConfig();
  try {
    const { payment_intent_id, deposit_intent_id, contractSignature } = (await req.json()) as {
      payment_intent_id: string;
      deposit_intent_id?: string;
      contractSignature?: {
        signatureDataUrl: string | null;
        signatureMethod: 'canvas' | 'typed';
        signerName: string;
        agreedToTerms: boolean;
      };
    };

    if (!payment_intent_id) {
      return NextResponse.json(
        { error: 'Fehlende Zahlungsreferenz.' },
        { status: 400 }
      );
    }

    // 1. Verify payment with Stripe
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
      return NextResponse.json({ success: true, booking_id: existing.id });
    }

    // 3. Buchungsnummer generieren
    const bookingId = await generateBookingId();

    // 4. Parse Stripe metadata
    const meta = intent.metadata;
    const accessories = meta.accessories
      ? meta.accessories.split(',').filter(Boolean)
      : [];

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
    const { error } = await supabase.from('bookings').insert({
      id: bookingId,
      payment_intent_id,
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
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { error: 'Buchung konnte nicht gespeichert werden.' },
        { status: 500 }
      );
    }

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

    let contractPdfBuffer: Buffer | undefined;
    if (contractSignature?.agreedToTerms && contractSignature?.signerName) {
      try {
        // Kundenprofil fuer Adresse laden
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
        });

        contractPdfBuffer = result.pdfBuffer;

        // Vertrag in Supabase speichern (non-blocking fuer Response)
        storeContract(bookingId, result.pdfBuffer, {
          contractHash: result.contractHash,
          customerName: contractSignature.signerName,
          ipAddress: ip,
          signedAt: new Date().toISOString(),
          signatureMethod: contractSignature.signatureMethod,
        }).catch((err) => console.error('Contract store error:', err));
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
        priceRental: parseFloat(meta.price_rental ?? '0'),
        priceAccessories: parseFloat(meta.price_accessories ?? '0'),
        priceHaftung: parseFloat(meta.price_haftung ?? '0'),
        priceTotal: intent.amount / 100,
        deposit: parseFloat(meta.deposit ?? '0'),
        shippingPrice: parseFloat(meta.shipping_price ?? '0'),
        taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
        taxRate: parseFloat(txMap['tax_rate'] || '19'),
        ustId: txMap['ust_id'] || '',
      };

      Promise.all([
        sendBookingConfirmation(emailData, contractPdfBuffer),
        sendAdminNotification(emailData),
      ]).catch((err) => console.error('Email send error:', err));
    }

    return NextResponse.json({ success: true, booking_id: bookingId });
  } catch (err) {
    console.error('Confirm booking error:', err);
    return NextResponse.json(
      { error: 'Fehler beim Bestätigen der Buchung.' },
      { status: 500 }
    );
  }
}

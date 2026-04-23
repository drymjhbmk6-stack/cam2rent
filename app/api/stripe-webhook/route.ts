import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import type { CartItem } from '@/components/CartProvider';
import {
  sendBookingConfirmation,
  sendAdminNotification,
  type BookingEmailData,
} from '@/lib/email';
import { getStripe, getStripeWebhookSecretOrThrow } from '@/lib/stripe';
import { isTestMode } from '@/lib/env-mode';
import { createAdminNotification } from '@/lib/admin-notifications';
import { parseMetadataAccessoryItems, itemsToLegacyIds } from '@/lib/booking-accessories';

/**
 * Vergleicht die Summe einzelner Preiskomponenten gegen den von Stripe
 * signierten Gesamtbetrag. Eine Abweichung > 5 Cent deutet auf manipulierte
 * PaymentIntent-Metadata hin (Theorie: Angreifer setzt einzelne price_*-Felder
 * im Metadata, intent.amount selbst ist Stripe-signiert). Wir blockieren NICHT
 * den Webhook (Stripe wuerde dauerhaft retry), sondern legen eine
 * Admin-Notification an, damit der Vorfall manuell geprueft werden kann.
 */
async function verifyAmountConsistency(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string,
  intentId: string,
  expectedSumCents: number,
  actualAmountCents: number,
) {
  const diffCents = Math.abs(expectedSumCents - actualAmountCents);
  if (diffCents <= 5) return; // 5 Cent Toleranz fuer Float-Rundung
  const msg = `PaymentIntent ${intentId}: Komponenten-Summe ${(expectedSumCents / 100).toFixed(2)} € weicht vom Stripe-Gesamtbetrag ${(actualAmountCents / 100).toFixed(2)} € ab (Differenz ${(diffCents / 100).toFixed(2)} €).`;
  console.error(`[Webhook] PRICE-MISMATCH ${bookingId}: ${msg}`);
  try {
    await createAdminNotification(supabase, {
      type: 'payment_failed',
      title: `Preis-Plausibilitaet verletzt (${bookingId})`,
      message: msg,
      link: `/admin/buchungen/${bookingId}`,
    });
  } catch (e) {
    console.error('[Webhook] Konnte Notification nicht anlegen:', e);
  }
}

/**
 * POST /api/stripe-webhook
 *
 * Stripe Webhook-Handler — wird von Stripe Server-zu-Server aufgerufen.
 * Sicherheitsnetz: Erstellt Buchungen falls der Client-seitige Confirm-Flow
 * fehlgeschlagen ist (Browser geschlossen, Netzwerkfehler, etc.).
 *
 * Behandelt:
 * - payment_intent.succeeded → Buchung erstellen falls noch nicht vorhanden
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Keine Signatur.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = await getStripe();
    const webhookSecret = await getStripeWebhookSecretOrThrow();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook-Signatur ungueltig:', err);
    return NextResponse.json({ error: 'Ungueltige Signatur.' }, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const meta = intent.metadata;

    // Deposit-Holds ignorieren
    if (meta.type === 'deposit_hold') {
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceClient();

    // Idempotenz: Prüfen ob Buchung bereits existiert.
    // payment_intent_id wird in handleSingleBooking/handleCartBooking exakt
    // als intent.id gespeichert — daher reicht ein Equality-Check.
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_intent_id', intent.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Buchung existiert bereits — alles gut
      return NextResponse.json({ received: true, already_exists: true });
    }

    // Steuerkonfiguration laden
    const { data: taxSettings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
    const txMap: Record<string, string> = {};
    for (const s of taxSettings ?? []) txMap[s.key] = s.value;

    const taxMode = (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer';
    const taxRate = parseFloat(txMap['tax_rate'] || '19');
    const ustId = txMap['ust_id'] || '';

    if (meta.booking_type === 'cart') {
      // ── Warenkorb-Flow ──────────────────────────────────────────────
      await handleCartBooking(supabase, intent, txMap);
    } else if (meta.product_id) {
      // ── Einzelbuchung-Flow ──────────────────────────────────────────
      await handleSingleBooking(supabase, intent, meta, { taxMode, taxRate, ustId });
    }
    // Andere PaymentIntents (z.B. ohne booking metadata) ignorieren
  }

  // Zahlungslink-Flow: Kunde bezahlt über genehmigten Link
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata ?? {};

    if (meta.booking_type === 'pending_approval' && meta.booking_id) {
      const supabase = createServiceClient();

      // Buchung auf "confirmed" setzen
      const { data: booking } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', meta.booking_id)
        .single();

      if (booking && (booking.status === 'awaiting_payment' || booking.status === 'pending_verification')) {
        await supabase
          .from('bookings')
          .update({
            status: 'confirmed',
            payment_intent_id: session.payment_intent as string ?? session.id,
          })
          .eq('id', meta.booking_id);

        console.log(`[Webhook] Pending-Buchung ${meta.booking_id} nach Zahlung bestätigt.`);

        // Bestätigungs-Email senden
        if (booking.customer_email) {
          const { data: taxSettings } = await supabase
            .from('admin_settings')
            .select('key, value')
            .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
          const txMap: Record<string, string> = {};
          for (const s of taxSettings ?? []) txMap[s.key] = s.value;

          const emailData: BookingEmailData = {
            bookingId: meta.booking_id,
            customerName: booking.customer_name ?? '',
            customerEmail: booking.customer_email,
            productName: booking.product_name,
            rentalFrom: booking.rental_from,
            rentalTo: booking.rental_to,
            days: booking.days,
            deliveryMode: booking.delivery_mode ?? 'versand',
            shippingMethod: booking.shipping_method ?? 'standard',
            haftung: booking.haftung,
            accessories: booking.accessories ?? [],
            priceRental: booking.price_rental,
            priceAccessories: booking.price_accessories,
            priceHaftung: booking.price_haftung,
            priceTotal: booking.price_total,
            deposit: booking.deposit ?? 0,
            shippingPrice: booking.shipping_price ?? 0,
            taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
            taxRate: parseFloat(txMap['tax_rate'] || '19'),
            ustId: txMap['ust_id'] || '',
            earlyServiceConsentAt: booking.early_service_consent_at ?? null,
          };
          Promise.all([
            sendBookingConfirmation(emailData),
            sendAdminNotification(emailData),
          ]).catch((err) => console.error('[Webhook] Email-Fehler:', err));
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}

// ── Einzelbuchung (Metadata komplett im PaymentIntent) ─────────────────────

async function handleSingleBooking(
  supabase: ReturnType<typeof createServiceClient>,
  intent: Stripe.PaymentIntent,
  meta: Stripe.Metadata,
  tax: { taxMode: string; taxRate: number; ustId: string },
) {
  const bookingId = await generateBookingId();

  // Neue qty-aware Darstellung aus metadata.accessory_items (id:qty,...).
  // Fallback auf meta.accessories (reine IDs) wenn Metadata alt ist.
  const accessoryItems = parseMetadataAccessoryItems(meta.accessory_items, meta.accessories);
  const accessories = accessoryItems.length > 0
    ? itemsToLegacyIds(accessoryItems)
    : (meta.accessories ? meta.accessories.split(',').filter(Boolean) : []);

  // Lieferadresse aus Profil
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

  const testMode = await isTestMode();
  const { error } = await supabase.from('bookings').insert({
    id: bookingId,
    payment_intent_id: intent.id,
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
    status: 'confirmed',
    user_id: meta.user_id || null,
    customer_email: meta.customer_email || null,
    customer_name: meta.customer_name || null,
    shipping_address: shippingAddress,
  });

  if (error) {
    console.error(`[Webhook] Einzelbuchung ${bookingId} Fehler:`, error);
    return;
  }

  // Plausibilitaet: Komponenten-Summe gegen Stripe-Gesamtbetrag pruefen
  const expectedSumCents = Math.round(
    (parseFloat(meta.price_rental ?? '0') +
      parseFloat(meta.price_accessories ?? '0') +
      parseFloat(meta.price_haftung ?? '0') +
      parseFloat(meta.shipping_price ?? '0')) * 100,
  );
  await verifyAmountConsistency(supabase, bookingId, intent.id, expectedSumCents, intent.amount);

  console.log(`[Webhook] Einzelbuchung ${bookingId} nachgeholt.`);

  // Email senden
  const customerEmail = meta.customer_email ?? '';
  const customerName = meta.customer_name ?? '';
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
      taxMode: tax.taxMode as 'kleinunternehmer' | 'regelbesteuerung',
      taxRate: tax.taxRate,
      ustId: tax.ustId,
    };
    Promise.all([
      sendBookingConfirmation(emailData),
      sendAdminNotification(emailData),
    ]).catch((err) => console.error('[Webhook] Email-Fehler:', err));
  }
}

// ── Warenkorb-Buchung (Kontext aus DB) ─────────────────────────────────────

async function handleCartBooking(
  supabase: ReturnType<typeof createServiceClient>,
  intent: Stripe.PaymentIntent,
  txMap: Record<string, string>,
) {
  // Checkout-Kontext aus DB laden
  const { data: ctxRow } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', `checkout_${intent.id}`)
    .maybeSingle();

  if (!ctxRow?.value) {
    console.error(`[Webhook] Kein Checkout-Kontext für ${intent.id} gefunden.`);
    return;
  }

  let ctx: Record<string, unknown>;
  try {
    ctx = typeof ctxRow.value === 'string' ? JSON.parse(ctxRow.value) : ctxRow.value;
  } catch {
    console.error(`[Webhook] Checkout-Kontext für ${intent.id} ungültig.`);
    return;
  }

  const items = (ctx.items ?? []) as CartItem[];
  if (!items.length) {
    console.error(`[Webhook] Keine Items im Kontext für ${intent.id}.`);
    return;
  }

  const customerName = (ctx.customerName as string) ?? '';
  const customerEmail = (ctx.customerEmail as string) ?? '';
  const userId = (ctx.userId as string) ?? null;
  const deliveryMode = (ctx.deliveryMode as string) ?? 'versand';
  const shippingMethod = (ctx.shippingMethod as string) ?? 'standard';
  const shippingPrice = (ctx.shippingPrice as number) ?? 0;
  const discountAmount = (ctx.discountAmount as number) ?? 0;
  const couponCode = (ctx.couponCode as string) ?? '';
  const durationDiscount = (ctx.durationDiscount as number) ?? 0;
  const loyaltyDiscount = (ctx.loyaltyDiscount as number) ?? 0;

  // Lieferadresse
  let shippingAddress: string | null = null;
  if (ctx.street) {
    shippingAddress = [ctx.street, [ctx.zip, ctx.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  if (userId && deliveryMode === 'versand' && !shippingAddress) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('address_street, address_zip, address_city')
      .eq('id', userId)
      .maybeSingle();
    if (profile?.address_street) {
      shippingAddress = [
        profile.address_street,
        [profile.address_zip, profile.address_city].filter(Boolean).join(' '),
      ].filter(Boolean).join(', ');
    }
  }

  // EINE Buchung für den gesamten Warenkorb
  const bookingId = await generateBookingId();
  const firstItem = items[0];
  const productName = items.length === 1
    ? firstItem.productName
    : items.map((it) => it.productName).join(', ');
  const allAccessories = [...new Set(items.flatMap((it) => it.accessories))];

  const testModeCart = await isTestMode();
  const { error } = await supabase.from('bookings').insert({
    id: bookingId,
    payment_intent_id: intent.id,
    is_test: testModeCart,
    product_id: firstItem.productId,
    product_name: productName,
    rental_from: firstItem.rentalFrom,
    rental_to: firstItem.rentalTo,
    days: firstItem.days,
    delivery_mode: deliveryMode,
    shipping_method: deliveryMode === 'versand' ? shippingMethod : null,
    shipping_price: shippingPrice,
    haftung: firstItem.haftung,
    accessories: allAccessories,
    price_rental: items.reduce((s, it) => s + it.priceRental, 0),
    price_accessories: items.reduce((s, it) => s + it.priceAccessories, 0),
    price_haftung: items.reduce((s, it) => s + it.priceHaftung, 0),
    price_total: intent.amount / 100,
    deposit: items.reduce((s, it) => s + it.deposit, 0),
    status: 'confirmed',
    user_id: userId,
    customer_email: customerEmail,
    customer_name: customerName,
    shipping_address: shippingAddress,
    coupon_code: couponCode || null,
    discount_amount: discountAmount,
    duration_discount: durationDiscount,
    loyalty_discount: loyaltyDiscount,
  });

  if (error) {
    console.error(`[Webhook] Cart-Buchung ${bookingId} Fehler:`, error);
    return;
  }

  // Plausibilitaet: Items-Summe + Versand - Rabatte gegen Stripe-Gesamtbetrag
  const expectedSumCents = Math.round(
    (items.reduce((s, it) => s + it.priceRental + it.priceAccessories + it.priceHaftung, 0) +
      shippingPrice -
      discountAmount -
      durationDiscount -
      loyaltyDiscount) * 100,
  );
  await verifyAmountConsistency(supabase, bookingId, intent.id, expectedSumCents, intent.amount);

  console.log(`[Webhook] Cart-Buchung ${bookingId} nachgeholt.`);

  // Coupon used_count erhoehen
  if (couponCode) {
    const { data: couponRow } = await supabase
      .from('coupons')
      .select('id, used_count')
      .ilike('code', couponCode)
      .maybeSingle();
    if (couponRow) {
      await supabase
        .from('coupons')
        .update({ used_count: (couponRow.used_count ?? 0) + 1 })
        .eq('id', couponRow.id);
    }
  }

  // User booking_count erhoehen
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('booking_count')
      .eq('id', userId)
      .maybeSingle();
    if (profile) {
      await supabase
        .from('profiles')
        .update({ booking_count: (profile.booking_count ?? 0) + 1 })
        .eq('id', userId);
    }
  }

  // Email senden
  if (customerEmail) {
    const emailData: BookingEmailData = {
      bookingId,
      customerName,
      customerEmail,
      productName,
      rentalFrom: firstItem.rentalFrom,
      rentalTo: firstItem.rentalTo,
      days: firstItem.days,
      deliveryMode: deliveryMode as 'versand' | 'abholung',
      shippingMethod,
      haftung: firstItem.haftung,
      accessories: allAccessories,
      priceRental: items.reduce((s, it) => s + it.priceRental, 0),
      priceAccessories: items.reduce((s, it) => s + it.priceAccessories, 0),
      priceHaftung: items.reduce((s, it) => s + it.priceHaftung, 0),
      priceTotal: intent.amount / 100,
      deposit: items.reduce((s, it) => s + it.deposit, 0),
      shippingPrice,
      taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
      taxRate: parseFloat(txMap['tax_rate'] || '19'),
      ustId: txMap['ust_id'] || '',
    };
    Promise.all([
      sendBookingConfirmation(emailData),
      sendAdminNotification(emailData),
    ]).catch((err) => console.error('[Webhook] Email-Fehler:', err));
  }

  // Checkout-Kontext aufraeumen
  Promise.resolve(
    supabase
      .from('admin_settings')
      .delete()
      .eq('key', `checkout_${intent.id}`)
  ).catch(() => {});
}

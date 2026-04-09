import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';
import type { CartItem } from '@/components/CartProvider';
import {
  sendBookingConfirmation,
  sendAdminNotification,
  type BookingEmailData,
} from '@/lib/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

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

    // Idempotenz: Pruefen ob Buchung bereits existiert
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .like('payment_intent_id', `${intent.id}%`)
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

  return NextResponse.json({ received: true });
}

// ── Einzelbuchung (Metadata komplett im PaymentIntent) ─────────────────────

async function handleSingleBooking(
  supabase: ReturnType<typeof createServiceClient>,
  intent: Stripe.PaymentIntent,
  meta: Stripe.Metadata,
  tax: { taxMode: string; taxRate: number; ustId: string },
) {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });
  const seq = String((count ?? 0) + 1).padStart(5, '0');
  const bookingId = `BK-${year}-${seq}`;

  const accessories = meta.accessories
    ? meta.accessories.split(',').filter(Boolean)
    : [];

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

  const { error } = await supabase.from('bookings').insert({
    id: bookingId,
    payment_intent_id: intent.id,
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
    console.error(`[Webhook] Kein Checkout-Kontext fuer ${intent.id} gefunden.`);
    return;
  }

  let ctx: Record<string, unknown>;
  try {
    ctx = typeof ctxRow.value === 'string' ? JSON.parse(ctxRow.value) : ctxRow.value;
  } catch {
    console.error(`[Webhook] Checkout-Kontext fuer ${intent.id} ungueltig.`);
    return;
  }

  const items = (ctx.items ?? []) as CartItem[];
  if (!items.length) {
    console.error(`[Webhook] Keine Items im Kontext fuer ${intent.id}.`);
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
  const productDiscount = (ctx.productDiscount as number) ?? 0;
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

  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });
  let seq = (count ?? 0) + 1;
  const bookingIds: string[] = [];

  const totalDiscountAll = discountAmount + productDiscount + durationDiscount + loyaltyDiscount;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const bookingId = `BK-${year}-${String(seq).padStart(5, '0')}`;
    seq++;

    const itemShare = items.length > 1 ? item.subtotal / items.reduce((s, it) => s + it.subtotal, 0) : 1;
    const itemTotalDiscount = Math.round(totalDiscountAll * itemShare * 100) / 100;
    const itemShipping = i === 0 ? shippingPrice : 0;
    const itemTotal = item.subtotal - itemTotalDiscount + itemShipping;

    const { error } = await supabase.from('bookings').insert({
      id: bookingId,
      payment_intent_id: `${intent.id}_${i}`,
      product_id: item.productId,
      product_name: item.productName,
      rental_from: item.rentalFrom,
      rental_to: item.rentalTo,
      days: item.days,
      delivery_mode: deliveryMode,
      shipping_method: deliveryMode === 'versand' ? shippingMethod : null,
      shipping_price: i === 0 ? shippingPrice : 0,
      haftung: item.haftung,
      accessories: item.accessories,
      price_rental: item.priceRental,
      price_accessories: item.priceAccessories,
      price_haftung: item.priceHaftung,
      price_total: Math.max(0, itemTotal),
      deposit: item.deposit,
      status: 'confirmed',
      user_id: userId,
      customer_email: customerEmail,
      customer_name: customerName,
      shipping_address: shippingAddress,
      coupon_code: couponCode || null,
      discount_amount: Math.round((discountAmount) * itemShare * 100) / 100,
      duration_discount: Math.round((durationDiscount) * itemShare * 100) / 100,
      loyalty_discount: Math.round((loyaltyDiscount) * itemShare * 100) / 100,
    });

    if (error) {
      console.error(`[Webhook] Cart-Buchung ${bookingId} Fehler:`, error);
    } else {
      bookingIds.push(bookingId);
    }
  }

  if (bookingIds.length === 0) return;

  console.log(`[Webhook] ${bookingIds.length} Cart-Buchung(en) nachgeholt: ${bookingIds.join(', ')}`);

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
        .update({ booking_count: (profile.booking_count ?? 0) + bookingIds.length })
        .eq('id', userId);
    }
  }

  // Email senden
  if (customerEmail) {
    const firstItem = items[0];
    const emailData: BookingEmailData = {
      bookingId: bookingIds.join(', '),
      customerName,
      customerEmail,
      productName: items.length === 1
        ? firstItem.productName
        : `${firstItem.productName} + ${items.length - 1} weitere${items.length > 2 ? 's' : ''} Produkt${items.length > 2 ? 'e' : ''}`,
      rentalFrom: firstItem.rentalFrom,
      rentalTo: firstItem.rentalTo,
      days: firstItem.days,
      deliveryMode: deliveryMode as 'versand' | 'abholung',
      shippingMethod,
      haftung: firstItem.haftung,
      accessories: firstItem.accessories,
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
  supabase
    .from('admin_settings')
    .delete()
    .eq('key', `checkout_${intent.id}`)
    .then(() => {})
    .catch(() => {});
}

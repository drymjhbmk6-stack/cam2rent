import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';
import { detectSuspicious } from '@/lib/suspicious';
import type { CartItem } from '@/components/CartProvider';
import {
  sendBookingConfirmation,
  sendAdminNotification,
  sendReferralReward,
  type BookingEmailData,
} from '@/lib/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/confirm-cart
 *
 * Bestätigt einen Warenkorb-Checkout nach erfolgreicher Stripe-Zahlung.
 * Verifiziert die Zahlung und speichert alle Buchungen in Supabase.
 *
 * Body: {
 *   payment_intent_id: string
 *   items: CartItem[]
 *   customerName: string
 *   customerEmail: string
 *   userId?: string
 *   deliveryMode: 'versand' | 'abholung'
 *   shippingMethod: string
 *   shippingPrice: number
 *   discountAmount: number
 *   couponCode?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      payment_intent_id,
      deposit_intent_id,
      items,
      customerName,
      customerEmail,
      userId,
      deliveryMode,
      shippingMethod,
      shippingPrice,
      discountAmount,
      couponCode,
      productDiscount,
      durationDiscount,
      loyaltyDiscount,
      referralCode,
      shippingAddress,
    } = body as {
      payment_intent_id: string;
      deposit_intent_id?: string;
      items: CartItem[];
      customerName: string;
      customerEmail: string;
      userId?: string;
      deliveryMode: string;
      shippingMethod: string;
      shippingPrice: number;
      discountAmount: number;
      couponCode?: string;
      productDiscount?: number;
      durationDiscount?: number;
      loyaltyDiscount?: number;
      referralCode?: string;
      shippingAddress?: string | null;
    };

    if (!payment_intent_id) {
      return NextResponse.json(
        { error: 'Fehlende Pflichtfelder.' },
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

    // 2. Idempotency: check if booking already exists for this payment intent
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .like('payment_intent_id', `${payment_intent_id}%`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Bereits bestaetigte Buchung: IDs zurueckgeben
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('id')
        .like('payment_intent_id', `${payment_intent_id}%`);
      return NextResponse.json({
        success: true,
        already_confirmed: true,
        booking_ids: existingBookings?.map((b) => b.id) ?? [],
      });
    }

    // 2b. Fallback: Checkout-Kontext aus DB laden falls items leer (sessionStorage verloren nach Stripe-Redirect)
    let resolvedItems = items;
    let resolvedCustomerName = customerName;
    let resolvedCustomerEmail = customerEmail;
    let resolvedUserId = userId;
    let resolvedDeliveryMode = deliveryMode;
    let resolvedShippingMethod = shippingMethod;
    let resolvedShippingPrice = shippingPrice;
    let resolvedDiscountAmount = discountAmount;
    let resolvedCouponCode = couponCode;
    let resolvedProductDiscount = productDiscount;
    let resolvedDurationDiscount = durationDiscount;
    let resolvedLoyaltyDiscount = loyaltyDiscount;
    let resolvedReferralCode = referralCode;
    let resolvedShippingAddress = shippingAddress;

    if (!resolvedItems?.length) {
      const { data: ctxRow } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', `checkout_${payment_intent_id}`)
        .maybeSingle();

      if (ctxRow?.value) {
        try {
          const ctx = typeof ctxRow.value === 'string' ? JSON.parse(ctxRow.value) : ctxRow.value;
          resolvedItems = ctx.items ?? [];
          resolvedCustomerName = ctx.customerName ?? resolvedCustomerName;
          resolvedCustomerEmail = ctx.customerEmail ?? resolvedCustomerEmail;
          resolvedUserId = ctx.userId ?? resolvedUserId;
          resolvedDeliveryMode = ctx.deliveryMode ?? resolvedDeliveryMode;
          resolvedShippingMethod = ctx.shippingMethod ?? resolvedShippingMethod;
          resolvedShippingPrice = ctx.shippingPrice ?? resolvedShippingPrice;
          resolvedDiscountAmount = ctx.discountAmount ?? resolvedDiscountAmount;
          resolvedCouponCode = ctx.couponCode ?? resolvedCouponCode;
          resolvedProductDiscount = ctx.productDiscount ?? resolvedProductDiscount;
          resolvedDurationDiscount = ctx.durationDiscount ?? resolvedDurationDiscount;
          resolvedLoyaltyDiscount = ctx.loyaltyDiscount ?? resolvedLoyaltyDiscount;
          resolvedReferralCode = ctx.referralCode ?? resolvedReferralCode;
          if (ctx.street) {
            resolvedShippingAddress = [ctx.street, [ctx.zip, ctx.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          }
        } catch {
          // JSON parse error - ignore
        }
      }
    }

    if (!resolvedItems?.length) {
      return NextResponse.json(
        { error: 'Keine Artikel gefunden. Bitte versuche es erneut.' },
        { status: 400 }
      );
    }

    // 3. Get current booking count for sequential IDs
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true });

    let seq = (count ?? 0) + 1;
    const bookingIds: string[] = [];

    // Deposit-Vorautorisierung bestätigen
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
      }
    }

    // Lieferadresse aus Kundenprofil holen (wenn eingeloggt + Versand)
    let profileAddress: string | null = null;
    if (resolvedUserId && resolvedDeliveryMode === 'versand') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('address_street, address_zip, address_city')
        .eq('id', resolvedUserId)
        .maybeSingle();
      if (profile?.address_street) {
        profileAddress = [
          profile.address_street,
          [profile.address_zip, profile.address_city].filter(Boolean).join(' '),
        ].filter(Boolean).join(', ');
      }
    }

    // Calculate total discount for proportional split
    const totalDiscountAll = (resolvedDiscountAmount ?? 0) + (resolvedProductDiscount ?? 0) + (resolvedDurationDiscount ?? 0) + (resolvedLoyaltyDiscount ?? 0);

    // 4. Create one booking per cart item
    for (let i = 0; i < resolvedItems.length; i++) {
      const item = resolvedItems[i];
      const bookingId = `BK-${year}-${String(seq).padStart(5, '0')}`;
      seq++;

      // For multi-item: split discount proportionally by subtotal
      const itemShare = resolvedItems.length > 1 ? item.subtotal / resolvedItems.reduce((s, it) => s + it.subtotal, 0) : 1;
      const itemCouponDiscount = Math.round((resolvedDiscountAmount ?? 0) * itemShare * 100) / 100;
      const itemDurationDiscount = Math.round((resolvedDurationDiscount ?? 0) * itemShare * 100) / 100;
      const itemLoyaltyDiscount = Math.round((resolvedLoyaltyDiscount ?? 0) * itemShare * 100) / 100;
      const itemTotalDiscount = Math.round(totalDiscountAll * itemShare * 100) / 100;
      const itemShipping = i === 0 ? resolvedShippingPrice : 0;
      const itemTotal = item.subtotal - itemTotalDiscount + itemShipping;

      const { error } = await supabase.from('bookings').insert({
        id: bookingId,
        payment_intent_id: `${payment_intent_id}_${i}`,
        product_id: item.productId,
        product_name: item.productName,
        rental_from: item.rentalFrom,
        rental_to: item.rentalTo,
        days: item.days,
        delivery_mode: resolvedDeliveryMode,
        shipping_method: resolvedDeliveryMode === 'versand' ? resolvedShippingMethod : null,
        shipping_price: i === 0 ? resolvedShippingPrice : 0,
        haftung: item.haftung,
        accessories: item.accessories,
        price_rental: item.priceRental,
        price_accessories: item.priceAccessories,
        price_haftung: item.priceHaftung,
        price_total: Math.max(0, itemTotal),
        deposit: item.deposit,
        deposit_intent_id: i === 0 ? confirmedDepositIntentId : null,
        deposit_status: i === 0 ? depositStatus : 'none',
        status: 'confirmed',
        user_id: resolvedUserId ?? null,
        customer_email: resolvedCustomerEmail,
        customer_name: resolvedCustomerName,
        shipping_address: profileAddress ?? resolvedShippingAddress ?? null,
        coupon_code: resolvedCouponCode || null,
        discount_amount: itemCouponDiscount,
        duration_discount: itemDurationDiscount,
        loyalty_discount: itemLoyaltyDiscount,
      });

      if (error) {
        console.error(`Error saving booking ${bookingId}:`, error);
      } else {
        bookingIds.push(bookingId);
      }
    }

    // 4b. Increment coupon used_count
    if (resolvedCouponCode && bookingIds.length > 0) {
      const { data: couponRow } = await supabase
        .from('coupons')
        .select('id, used_count')
        .ilike('code', resolvedCouponCode)
        .maybeSingle();
      if (couponRow) {
        await supabase
          .from('coupons')
          .update({ used_count: (couponRow.used_count ?? 0) + 1 })
          .eq('id', couponRow.id);
      }
    }

    // 4c. Increment user booking_count
    if (resolvedUserId && bookingIds.length > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('booking_count')
        .eq('id', resolvedUserId)
        .maybeSingle();
      if (profile) {
        await supabase
          .from('profiles')
          .update({ booking_count: (profile.booking_count ?? 0) + bookingIds.length })
          .eq('id', resolvedUserId);
      }
    }

    // 4d. Process referral (if first booking for this user)
    if (resolvedReferralCode && resolvedUserId && bookingIds.length > 0) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('booking_count')
          .eq('id', resolvedUserId)
          .maybeSingle();

        // First booking: booking_count was just set to 1 (or the count of items)
        const isFirstBooking = (profile?.booking_count ?? 0) <= bookingIds.length;

        if (isFirstBooking) {
          // Find the referrer by referral_code
          const { data: referrer } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('referral_code', resolvedReferralCode)
            .maybeSingle();

          if (referrer && referrer.id !== resolvedUserId) {
            // Get reward value from config
            const { data: rewardConfig } = await supabase
              .from('admin_config')
              .select('value')
              .eq('key', 'referral_reward_value')
              .maybeSingle();
            const rewardValue = (rewardConfig?.value as number) ?? 10;

            // Create reward coupon for referrer
            const rewardCode = `REF-${Date.now().toString(36).toUpperCase()}`;
            const { data: rewardCoupon } = await supabase
              .from('coupons')
              .insert({
                code: rewardCode,
                type: 'fixed',
                value: rewardValue,
                description: `${rewardValue} € Empfehlungsbonus`,
                target_type: 'all',
                max_uses: 1,
                active: true,
              })
              .select('id')
              .single();

            // Create referral record
            await supabase.from('referrals').insert({
              referrer_user_id: referrer.id,
              referral_code: resolvedReferralCode,
              referred_email: resolvedCustomerEmail,
              referred_booking_id: bookingIds[0],
              reward_coupon_id: rewardCoupon?.id ?? null,
              status: 'rewarded',
            });

            // Send reward email to referrer (non-blocking)
            if (rewardCoupon) {
              const { data: referrerAuth } = await supabase.auth.admin.getUserById(referrer.id);
              if (referrerAuth?.user?.email) {
                sendReferralReward({
                  referrerName: referrer.full_name ?? 'dort',
                  referrerEmail: referrerAuth.user.email,
                  referredName: resolvedCustomerName,
                  rewardCode,
                  rewardValue,
                }).catch((err: unknown) => console.error('Referral email error:', err));
              }
            }
          }
        }
      } catch (refErr) {
        console.error('Referral processing error:', refErr);
      }
    }

    // 5. Abandoned Cart als recovered markieren (non-blocking)
    if (resolvedUserId) {
      Promise.resolve(
        supabase
          .from('abandoned_carts')
          .update({ recovered: true })
          .eq('user_id', resolvedUserId)
          .eq('recovered', false)
      ).catch((err: unknown) => console.error('Abandoned cart recovery error:', err));
    }

    // 6. Suspicious Detection (non-blocking)
    if (bookingIds.length > 0) {
      const firstItem = resolvedItems[0];
      detectSuspicious(supabase, {
        userId: resolvedUserId || null,
        priceTotal: intent.amount / 100,
        rentalFrom: firstItem.rentalFrom,
        days: firstItem.days,
      }).then(async (result) => {
        if (result.suspicious) {
          for (const bid of bookingIds) {
            await supabase
              .from('bookings')
              .update({ suspicious: true, suspicious_reasons: result.reasons })
              .eq('id', bid);
          }
        }
      }).catch((err) => console.error('Suspicious detection error:', err));
    }

    // 6. Fetch tax config for emails/PDFs
    const { data: taxSettings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
    const txMap: Record<string, string> = {};
    for (const s of taxSettings ?? []) txMap[s.key] = s.value;

    // 7. Send confirmation email (one summary email for all items in cart)
    if (resolvedCustomerEmail && bookingIds.length > 0) {
      const firstItem = resolvedItems[0];
      const emailData: BookingEmailData = {
        bookingId: bookingIds.join(', '),
        customerName: resolvedCustomerName,
        customerEmail: resolvedCustomerEmail,
        productName: resolvedItems.length === 1
          ? firstItem.productName
          : `${firstItem.productName} + ${resolvedItems.length - 1} weiteres${resolvedItems.length > 2 ? 'e' : ''} Produkt${resolvedItems.length > 2 ? 'e' : ''}`,
        rentalFrom: firstItem.rentalFrom,
        rentalTo: firstItem.rentalTo,
        days: firstItem.days,
        deliveryMode: resolvedDeliveryMode as 'versand' | 'abholung',
        shippingMethod: resolvedShippingMethod,
        haftung: firstItem.haftung,
        accessories: firstItem.accessories,
        priceRental: resolvedItems.reduce((s, it) => s + it.priceRental, 0),
        priceAccessories: resolvedItems.reduce((s, it) => s + it.priceAccessories, 0),
        priceHaftung: resolvedItems.reduce((s, it) => s + it.priceHaftung, 0),
        priceTotal: intent.amount / 100,
        deposit: resolvedItems.reduce((s, it) => s + it.deposit, 0),
        shippingPrice: resolvedShippingPrice,
        taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
        taxRate: parseFloat(txMap['tax_rate'] || '19'),
        ustId: txMap['ust_id'] || '',
      };

      Promise.all([
        sendBookingConfirmation(emailData),
        sendAdminNotification(emailData),
      ]).catch((err) => console.error('Email send error:', err));
    }

    // 8. Checkout-Kontext aus DB aufraumen (non-blocking)
    supabase
      .from('admin_settings')
      .delete()
      .eq('key', `checkout_${payment_intent_id}`)
      .then(() => {})
      .catch(() => {});

    return NextResponse.json({ success: true, booking_ids: bookingIds });
  } catch (err) {
    console.error('Confirm cart error:', err);
    return NextResponse.json(
      { error: 'Buchungen konnten nicht gespeichert werden.' },
      { status: 500 }
    );
  }
}

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

    if (!payment_intent_id || !items?.length) {
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
      return NextResponse.json({ success: true, already_confirmed: true });
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
    if (userId && deliveryMode === 'versand') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('address_street, address_zip, address_city')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.address_street) {
        profileAddress = [
          profile.address_street,
          [profile.address_zip, profile.address_city].filter(Boolean).join(' '),
        ].filter(Boolean).join(', ');
      }
    }

    // Calculate total discount for proportional split
    const totalDiscountAll = (discountAmount ?? 0) + (productDiscount ?? 0) + (durationDiscount ?? 0) + (loyaltyDiscount ?? 0);

    // 4. Create one booking per cart item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const bookingId = `BK-${year}-${String(seq).padStart(5, '0')}`;
      seq++;

      // For multi-item: split discount proportionally by subtotal
      const itemShare = items.length > 1 ? item.subtotal / items.reduce((s, it) => s + it.subtotal, 0) : 1;
      const itemCouponDiscount = Math.round((discountAmount ?? 0) * itemShare * 100) / 100;
      const itemDurationDiscount = Math.round((durationDiscount ?? 0) * itemShare * 100) / 100;
      const itemLoyaltyDiscount = Math.round((loyaltyDiscount ?? 0) * itemShare * 100) / 100;
      const itemTotalDiscount = Math.round(totalDiscountAll * itemShare * 100) / 100;
      const itemShipping = i === 0 ? shippingPrice : 0;
      const itemTotal = item.subtotal - itemTotalDiscount + itemShipping;

      const { error } = await supabase.from('bookings').insert({
        id: bookingId,
        payment_intent_id: `${payment_intent_id}_${i}`,
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
        deposit_intent_id: i === 0 ? confirmedDepositIntentId : null,
        deposit_status: i === 0 ? depositStatus : 'none',
        status: 'confirmed',
        user_id: userId ?? null,
        customer_email: customerEmail,
        customer_name: customerName,
        shipping_address: profileAddress ?? shippingAddress ?? null,
        coupon_code: couponCode || null,
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
    if (couponCode && bookingIds.length > 0) {
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

    // 4c. Increment user booking_count
    if (userId && bookingIds.length > 0) {
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

    // 4d. Process referral (if first booking for this user)
    if (referralCode && userId && bookingIds.length > 0) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('booking_count')
          .eq('id', userId)
          .maybeSingle();

        // First booking: booking_count was just set to 1 (or the count of items)
        const isFirstBooking = (profile?.booking_count ?? 0) <= bookingIds.length;

        if (isFirstBooking) {
          // Find the referrer by referral_code
          const { data: referrer } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('referral_code', referralCode)
            .maybeSingle();

          if (referrer && referrer.id !== userId) {
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
              referral_code: referralCode,
              referred_email: customerEmail,
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
                  referredName: customerName,
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
    if (userId) {
      Promise.resolve(
        supabase
          .from('abandoned_carts')
          .update({ recovered: true })
          .eq('user_id', userId)
          .eq('recovered', false)
      ).catch((err: unknown) => console.error('Abandoned cart recovery error:', err));
    }

    // 6. Suspicious Detection (non-blocking)
    if (bookingIds.length > 0) {
      const firstItem = items[0];
      detectSuspicious(supabase, {
        userId: userId || null,
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
    if (customerEmail && bookingIds.length > 0) {
      // Use the first item as the primary booking for the email
      const firstItem = items[0];
      const emailData: BookingEmailData = {
        bookingId: bookingIds.join(', '),
        customerName,
        customerEmail,
        productName: items.length === 1
          ? firstItem.productName
          : `${firstItem.productName} + ${items.length - 1} weiteres${items.length > 2 ? 'e' : ''} Produkt${items.length > 2 ? 'e' : ''}`,
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
      ]).catch((err) => console.error('Email send error:', err));
    }

    return NextResponse.json({ success: true, booking_ids: bookingIds });
  } catch (err) {
    console.error('Confirm cart error:', err);
    return NextResponse.json(
      { error: 'Buchungen konnten nicht gespeichert werden.' },
      { status: 500 }
    );
  }
}

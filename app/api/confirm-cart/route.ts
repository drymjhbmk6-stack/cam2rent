import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
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
 * Bestaetigt einen Warenkorb-Checkout nach erfolgreicher Stripe-Zahlung.
 * Erstellt EINE Buchung fuer den gesamten Warenkorb.
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
      .eq('payment_intent_id', payment_intent_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        already_confirmed: true,
        booking_ids: [existing.id],
      });
    }

    // 2b. Fallback: Checkout-Kontext aus DB laden falls items leer
    let r_items = items;
    let r_name = customerName;
    let r_email = customerEmail;
    let r_userId = userId;
    let r_deliveryMode = deliveryMode;
    let r_shippingMethod = shippingMethod;
    let r_shippingPrice = shippingPrice;
    let r_discountAmount = discountAmount;
    let r_couponCode = couponCode;
    let r_durationDiscount = durationDiscount;
    let r_loyaltyDiscount = loyaltyDiscount;
    let r_referralCode = referralCode;
    let r_shippingAddress = shippingAddress;

    if (!r_items?.length) {
      const { data: ctxRow } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', `checkout_${payment_intent_id}`)
        .maybeSingle();

      if (ctxRow?.value) {
        try {
          const ctx = typeof ctxRow.value === 'string' ? JSON.parse(ctxRow.value) : ctxRow.value;
          r_items = ctx.items ?? [];
          r_name = ctx.customerName ?? r_name;
          r_email = ctx.customerEmail ?? r_email;
          r_userId = ctx.userId ?? r_userId;
          r_deliveryMode = ctx.deliveryMode ?? r_deliveryMode;
          r_shippingMethod = ctx.shippingMethod ?? r_shippingMethod;
          r_shippingPrice = ctx.shippingPrice ?? r_shippingPrice;
          r_discountAmount = ctx.discountAmount ?? r_discountAmount;
          r_couponCode = ctx.couponCode ?? r_couponCode;
          r_durationDiscount = ctx.durationDiscount ?? r_durationDiscount;
          r_loyaltyDiscount = ctx.loyaltyDiscount ?? r_loyaltyDiscount;
          r_referralCode = ctx.referralCode ?? r_referralCode;
          if (ctx.street) {
            r_shippingAddress = [ctx.street, [ctx.zip, ctx.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          }
        } catch {
          // ignore
        }
      }
    }

    if (!r_items?.length) {
      return NextResponse.json(
        { error: 'Keine Artikel gefunden. Bitte versuche es erneut.' },
        { status: 400 }
      );
    }

    // 3. Buchungsnummer generieren
    const bookingId = await generateBookingId();

    // Deposit-Vorautorisierung bestaetigen
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

    // Lieferadresse aus Kundenprofil
    let profileAddress: string | null = null;
    if (r_userId && r_deliveryMode === 'versand') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('address_street, address_zip, address_city')
        .eq('id', r_userId)
        .maybeSingle();
      if (profile?.address_street) {
        profileAddress = [
          profile.address_street,
          [profile.address_zip, profile.address_city].filter(Boolean).join(' '),
        ].filter(Boolean).join(', ');
      }
    }

    // Preise zusammenrechnen
    const firstItem = r_items[0];
    const productName = r_items.length === 1
      ? firstItem.productName
      : r_items.map((it) => it.productName).join(', ');
    const allAccessories = [...new Set(r_items.flatMap((it) => it.accessories))];

    // 4. EINE Buchung fuer den gesamten Warenkorb
    const { error } = await supabase.from('bookings').insert({
      id: bookingId,
      payment_intent_id,
      product_id: firstItem.productId,
      product_name: productName,
      rental_from: firstItem.rentalFrom,
      rental_to: firstItem.rentalTo,
      days: firstItem.days,
      delivery_mode: r_deliveryMode,
      shipping_method: r_deliveryMode === 'versand' ? r_shippingMethod : null,
      shipping_price: r_shippingPrice,
      haftung: firstItem.haftung,
      accessories: allAccessories,
      price_rental: r_items.reduce((s, it) => s + it.priceRental, 0),
      price_accessories: r_items.reduce((s, it) => s + it.priceAccessories, 0),
      price_haftung: r_items.reduce((s, it) => s + it.priceHaftung, 0),
      price_total: intent.amount / 100,
      deposit: r_items.reduce((s, it) => s + it.deposit, 0),
      deposit_intent_id: confirmedDepositIntentId,
      deposit_status: depositStatus,
      status: 'confirmed',
      user_id: r_userId ?? null,
      customer_email: r_email,
      customer_name: r_name,
      shipping_address: profileAddress ?? r_shippingAddress ?? null,
      coupon_code: r_couponCode || null,
      discount_amount: r_discountAmount ?? 0,
      duration_discount: r_durationDiscount ?? 0,
      loyalty_discount: r_loyaltyDiscount ?? 0,
    });

    if (error) {
      console.error(`Error saving booking ${bookingId}:`, error);
      return NextResponse.json(
        { error: 'Buchung konnte nicht gespeichert werden.' },
        { status: 500 }
      );
    }

    // 5. Coupon used_count erhoehen
    if (r_couponCode) {
      const { data: couponRow } = await supabase
        .from('coupons')
        .select('id, used_count')
        .ilike('code', r_couponCode)
        .maybeSingle();
      if (couponRow) {
        await supabase
          .from('coupons')
          .update({ used_count: (couponRow.used_count ?? 0) + 1 })
          .eq('id', couponRow.id);
      }
    }

    // 6. User booking_count erhoehen
    if (r_userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('booking_count')
        .eq('id', r_userId)
        .maybeSingle();
      if (profile) {
        await supabase
          .from('profiles')
          .update({ booking_count: (profile.booking_count ?? 0) + 1 })
          .eq('id', r_userId);
      }
    }

    // 7. Referral verarbeiten
    if (r_referralCode && r_userId) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('booking_count')
          .eq('id', r_userId)
          .maybeSingle();

        const isFirstBooking = (profile?.booking_count ?? 0) <= 1;
        if (isFirstBooking) {
          const { data: referrer } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('referral_code', r_referralCode)
            .maybeSingle();

          if (referrer && referrer.id !== r_userId) {
            const { data: rewardConfig } = await supabase
              .from('admin_config')
              .select('value')
              .eq('key', 'referral_reward_value')
              .maybeSingle();
            const rewardValue = (rewardConfig?.value as number) ?? 10;

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

            await supabase.from('referrals').insert({
              referrer_user_id: referrer.id,
              referral_code: r_referralCode,
              referred_email: r_email,
              referred_booking_id: bookingId,
              reward_coupon_id: rewardCoupon?.id ?? null,
              status: 'rewarded',
            });

            if (rewardCoupon) {
              const { data: referrerAuth } = await supabase.auth.admin.getUserById(referrer.id);
              if (referrerAuth?.user?.email) {
                sendReferralReward({
                  referrerName: referrer.full_name ?? 'dort',
                  referrerEmail: referrerAuth.user.email,
                  referredName: r_name,
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

    // 8. Abandoned Cart als recovered markieren
    if (r_userId) {
      Promise.resolve(
        supabase
          .from('abandoned_carts')
          .update({ recovered: true })
          .eq('user_id', r_userId)
          .eq('recovered', false)
      ).catch((err: unknown) => console.error('Abandoned cart recovery error:', err));
    }

    // 9. Suspicious Detection
    detectSuspicious(supabase, {
      userId: r_userId || null,
      priceTotal: intent.amount / 100,
      rentalFrom: firstItem.rentalFrom,
      days: firstItem.days,
    }).then(async (result) => {
      if (result.suspicious) {
        await supabase
          .from('bookings')
          .update({ suspicious: true, suspicious_reasons: result.reasons })
          .eq('id', bookingId);
      }
    }).catch((err) => console.error('Suspicious detection error:', err));

    // 10. Steuer-Config + Email senden
    const { data: taxSettings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
    const txMap: Record<string, string> = {};
    for (const s of taxSettings ?? []) txMap[s.key] = s.value;

    if (r_email) {
      const emailData: BookingEmailData = {
        bookingId,
        customerName: r_name,
        customerEmail: r_email,
        productName,
        rentalFrom: firstItem.rentalFrom,
        rentalTo: firstItem.rentalTo,
        days: firstItem.days,
        deliveryMode: r_deliveryMode as 'versand' | 'abholung',
        shippingMethod: r_shippingMethod,
        haftung: firstItem.haftung,
        accessories: allAccessories,
        priceRental: r_items.reduce((s, it) => s + it.priceRental, 0),
        priceAccessories: r_items.reduce((s, it) => s + it.priceAccessories, 0),
        priceHaftung: r_items.reduce((s, it) => s + it.priceHaftung, 0),
        priceTotal: intent.amount / 100,
        deposit: r_items.reduce((s, it) => s + it.deposit, 0),
        shippingPrice: r_shippingPrice,
        taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
        taxRate: parseFloat(txMap['tax_rate'] || '19'),
        ustId: txMap['ust_id'] || '',
      };

      Promise.all([
        sendBookingConfirmation(emailData),
        sendAdminNotification(emailData),
      ]).catch((err) => console.error('Email send error:', err));
    }

    // 11. Checkout-Kontext aufraeumen
    Promise.resolve(
      supabase
        .from('admin_settings')
        .delete()
        .eq('key', `checkout_${payment_intent_id}`)
    ).catch(() => {});

    return NextResponse.json({ success: true, booking_ids: [bookingId] });
  } catch (err) {
    console.error('Confirm cart error:', err);
    return NextResponse.json(
      { error: 'Buchung konnte nicht gespeichert werden.' },
      { status: 500 }
    );
  }
}

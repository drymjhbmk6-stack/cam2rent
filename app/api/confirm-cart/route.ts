import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import { detectSuspicious } from '@/lib/suspicious';
import type { CartItem } from '@/components/CartProvider';
import { calcShipping } from '@/data/shipping';
import type { ShippingMethod } from '@/data/shipping';
import { DEFAULT_SHIPPING, type ShippingPriceConfig } from '@/lib/price-config';
import {
  sendBookingConfirmation,
  sendAdminNotification,
  sendReferralReward,
  type BookingEmailData,
} from '@/lib/email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Gruppiert Cart-Items nach Mietzeitraum.
 * Gibt ein Array von Gruppen zurueck, jede mit eigenem Zeitraum und Items.
 */
function groupByPeriod(items: CartItem[]) {
  const groups: Record<string, CartItem[]> = {};
  for (const item of items) {
    const key = `${item.rentalFrom}_${item.rentalTo}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.values(groups);
}

/**
 * POST /api/confirm-cart
 *
 * Bestaetigt einen Warenkorb-Checkout nach erfolgreicher Stripe-Zahlung.
 * Erstellt separate Buchungen pro Mietzeitraum.
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

    // 2. Idempotency: check if bookings already exist for this payment intent
    const { data: existingRows } = await supabase
      .from('bookings')
      .select('id')
      .like('payment_intent_id', `${payment_intent_id}%`);

    if (existingRows && existingRows.length > 0) {
      return NextResponse.json({
        success: true,
        already_confirmed: true,
        booking_ids: existingRows.map((r) => r.id),
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

    // 3. Versand-Config aus DB laden
    let shippingCfg: ShippingPriceConfig = DEFAULT_SHIPPING;
    const { data: shippingRow } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'shipping')
      .maybeSingle();
    if (shippingRow?.value) {
      shippingCfg = shippingRow.value as ShippingPriceConfig;
    }

    // 4. Items nach Mietzeitraum gruppieren → separate Buchungen
    const periodGroups = groupByPeriod(r_items);
    const totalCartSubtotal = r_items.reduce((s, it) => s + it.subtotal, 0);
    const bookingIds: string[] = [];

    for (let gi = 0; gi < periodGroups.length; gi++) {
      const groupItems = periodGroups[gi];
      const firstItem = groupItems[0];
      const groupSubtotal = groupItems.reduce((s, it) => s + it.subtotal, 0);

      // Rabatte proportional aufteilen
      const ratio = totalCartSubtotal > 0 ? groupSubtotal / totalCartSubtotal : 1 / periodGroups.length;
      const groupDiscount = Math.round((r_discountAmount ?? 0) * ratio * 100) / 100;
      const groupDurationDiscount = Math.round((r_durationDiscount ?? 0) * ratio * 100) / 100;
      const groupLoyaltyDiscount = Math.round((r_loyaltyDiscount ?? 0) * ratio * 100) / 100;
      // Versand pro Gruppe neu berechnen (jede Gruppe prueft Gratis-Schwelle)
      const groupShippingResult = calcShipping(
        groupSubtotal,
        r_shippingMethod as ShippingMethod,
        r_deliveryMode as 'versand' | 'abholung',
        shippingCfg
      );
      const groupShipping = groupShippingResult.price;
      const groupTotal = groupSubtotal - groupDiscount - groupDurationDiscount - groupLoyaltyDiscount + groupShipping;

      const bookingId = await generateBookingId();
      bookingIds.push(bookingId);

      const productName = groupItems.length === 1
        ? firstItem.productName
        : groupItems.map((it) => it.productName).join(', ');
      const allAccessories = [...new Set(groupItems.flatMap((it) => it.accessories))];

      // payment_intent_id: erste Gruppe bekommt die originale ID, weitere bekommen Suffix
      const piId = gi === 0 ? payment_intent_id : `${payment_intent_id}_g${gi + 1}`;

      const { error } = await supabase.from('bookings').insert({
        id: bookingId,
        payment_intent_id: piId,
        product_id: firstItem.productId,
        product_name: productName,
        rental_from: firstItem.rentalFrom,
        rental_to: firstItem.rentalTo,
        days: firstItem.days,
        delivery_mode: r_deliveryMode,
        shipping_method: r_deliveryMode === 'versand' ? r_shippingMethod : null,
        shipping_price: groupShipping,
        haftung: firstItem.haftung,
        accessories: allAccessories,
        price_rental: groupItems.reduce((s, it) => s + it.priceRental, 0),
        price_accessories: groupItems.reduce((s, it) => s + it.priceAccessories, 0),
        price_haftung: groupItems.reduce((s, it) => s + it.priceHaftung, 0),
        price_total: Math.max(0, groupTotal),
        deposit: groupItems.reduce((s, it) => s + it.deposit, 0),
        deposit_intent_id: gi === 0 ? confirmedDepositIntentId : null,
        deposit_status: gi === 0 ? depositStatus : 'none',
        status: 'confirmed',
        user_id: r_userId ?? null,
        customer_email: r_email,
        customer_name: r_name,
        shipping_address: profileAddress ?? r_shippingAddress ?? null,
        coupon_code: gi === 0 ? (r_couponCode || null) : null,
        discount_amount: groupDiscount,
        duration_discount: groupDurationDiscount,
        loyalty_discount: groupLoyaltyDiscount,
      });

      if (error) {
        console.error(`Error saving booking ${bookingId}:`, error);
        return NextResponse.json(
          { error: 'Buchung konnte nicht gespeichert werden.' },
          { status: 500 }
        );
      }
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

    // 6. User booking_count erhoehen (um Anzahl der Buchungen)
    if (r_userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('booking_count')
        .eq('id', r_userId)
        .maybeSingle();
      if (profile) {
        await supabase
          .from('profiles')
          .update({ booking_count: (profile.booking_count ?? 0) + periodGroups.length })
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

        const isFirstBooking = (profile?.booking_count ?? 0) <= periodGroups.length;
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
              referred_booking_id: bookingIds[0],
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

    // 9. Suspicious Detection (fuer erste Buchung)
    const firstGroupItems = periodGroups[0];
    detectSuspicious(supabase, {
      userId: r_userId || null,
      priceTotal: intent.amount / 100,
      rentalFrom: firstGroupItems[0].rentalFrom,
      days: firstGroupItems[0].days,
    }).then(async (result) => {
      if (result.suspicious) {
        // Alle Buchungen als verdaechtig markieren
        for (const bid of bookingIds) {
          await supabase
            .from('bookings')
            .update({ suspicious: true, suspicious_reasons: result.reasons })
            .eq('id', bid);
        }
      }
    }).catch((err) => console.error('Suspicious detection error:', err));

    // 10. Steuer-Config + Email senden (fuer jede Buchung)
    const { data: taxSettings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
    const txMap: Record<string, string> = {};
    for (const s of taxSettings ?? []) txMap[s.key] = s.value;

    if (r_email) {
      for (let gi = 0; gi < periodGroups.length; gi++) {
        const groupItems = periodGroups[gi];
        const firstItem = groupItems[0];
        const productName = groupItems.length === 1
          ? firstItem.productName
          : groupItems.map((it) => it.productName).join(', ');
        const allAccessories = [...new Set(groupItems.flatMap((it) => it.accessories))];
        const groupSubtotal = groupItems.reduce((s, it) => s + it.subtotal, 0);
        const ratio = totalCartSubtotal > 0 ? groupSubtotal / totalCartSubtotal : 1 / periodGroups.length;
        const emailShipping = calcShipping(
          groupSubtotal,
          r_shippingMethod as ShippingMethod,
          r_deliveryMode as 'versand' | 'abholung',
          shippingCfg
        ).price;
        const groupTotal = groupSubtotal
          - Math.round((r_discountAmount ?? 0) * ratio * 100) / 100
          - Math.round((r_durationDiscount ?? 0) * ratio * 100) / 100
          - Math.round((r_loyaltyDiscount ?? 0) * ratio * 100) / 100
          + emailShipping;

        const emailData: BookingEmailData = {
          bookingId: bookingIds[gi],
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
          priceRental: groupItems.reduce((s, it) => s + it.priceRental, 0),
          priceAccessories: groupItems.reduce((s, it) => s + it.priceAccessories, 0),
          priceHaftung: groupItems.reduce((s, it) => s + it.priceHaftung, 0),
          priceTotal: Math.max(0, groupTotal),
          deposit: groupItems.reduce((s, it) => s + it.deposit, 0),
          shippingPrice: emailShipping,
          taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
          taxRate: parseFloat(txMap['tax_rate'] || '19'),
          ustId: txMap['ust_id'] || '',
        };

        Promise.all([
          sendBookingConfirmation(emailData),
          sendAdminNotification(emailData),
        ]).catch((err) => console.error('Email send error:', err));
      }
    }

    // 11. Checkout-Kontext aufraeumen
    Promise.resolve(
      supabase
        .from('admin_settings')
        .delete()
        .eq('key', `checkout_${payment_intent_id}`)
    ).catch(() => {});

    return NextResponse.json({ success: true, booking_ids: bookingIds });
  } catch (err) {
    console.error('Confirm cart error:', err);
    return NextResponse.json(
      { error: 'Buchung konnte nicht gespeichert werden.' },
      { status: 500 }
    );
  }
}

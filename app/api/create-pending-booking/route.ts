import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import type { CartItem } from '@/components/CartProvider';
import { calcShipping } from '@/data/shipping';
import type { ShippingMethod } from '@/data/shipping';
import { DEFAULT_SHIPPING, type ShippingPriceConfig } from '@/lib/price-config';
import { sendAdminNotification, type BookingEmailData } from '@/lib/email';

/**
 * Gruppiert Cart-Items nach Mietzeitraum.
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
 * POST /api/create-pending-booking
 *
 * Erstellt Buchungen im Status "pending_verification" für unverifizierten Kunden.
 * Bei unterschiedlichen Mietzeiträumen werden separate Buchungen erstellt.
 * Keine Zahlung — der Kunde wartet auf Admin-Freigabe + Zahlungslink.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      items,
      customerName,
      customerEmail,
      userId,
      deliveryMode,
      shippingMethod,
      discountAmount,
      couponCode,
      durationDiscount,
      loyaltyDiscount,
    } = body as {
      items: CartItem[];
      customerName: string;
      customerEmail: string;
      userId: string;
      deliveryMode: string;
      shippingMethod: string;
      discountAmount: number;
      couponCode?: string;
      durationDiscount?: number;
      loyaltyDiscount?: number;
    };

    if (!userId) {
      return NextResponse.json(
        { error: 'Bitte erstelle ein Konto.' },
        { status: 403 }
      );
    }

    if (!items?.length) {
      return NextResponse.json(
        { error: 'Keine Artikel im Warenkorb.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Prüfen ob User schon eine pending Buchung hat
    const { data: existingPending } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending_verification')
      .limit(1)
      .maybeSingle();

    if (existingPending) {
      return NextResponse.json(
        { error: 'Du hast bereits eine Buchung die auf Freigabe wartet.', code: 'PENDING_EXISTS', bookingId: existingPending.id },
        { status: 400 }
      );
    }

    // Lieferadresse aus Profil
    let shippingAddress: string | null = null;
    if (deliveryMode === 'versand') {
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

    // Versand-Config aus DB laden
    let shippingCfg: ShippingPriceConfig = DEFAULT_SHIPPING;
    const { data: shippingRow } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'shipping')
      .maybeSingle();
    if (shippingRow?.value) {
      shippingCfg = shippingRow.value as ShippingPriceConfig;
    }

    // Items nach Mietzeitraum gruppieren
    const periodGroups = groupByPeriod(items);
    const totalCartSubtotal = items.reduce((s, it) => s + it.subtotal, 0);
    const bookingIds: string[] = [];

    for (let gi = 0; gi < periodGroups.length; gi++) {
      const groupItems = periodGroups[gi];
      const firstItem = groupItems[0];
      const groupSubtotal = groupItems.reduce((s, it) => s + it.subtotal, 0);

      // Rabatte proportional aufteilen
      const ratio = totalCartSubtotal > 0 ? groupSubtotal / totalCartSubtotal : 1 / periodGroups.length;
      const groupDiscountAmount = Math.round((discountAmount ?? 0) * ratio * 100) / 100;
      const groupDurationDiscount = Math.round((durationDiscount ?? 0) * ratio * 100) / 100;
      const groupLoyaltyDiscount = Math.round((loyaltyDiscount ?? 0) * ratio * 100) / 100;
      // Versand pro Gruppe neu berechnen (jede Gruppe prüft Gratis-Schwelle)
      const groupShippingResult = calcShipping(
        groupSubtotal,
        shippingMethod as ShippingMethod,
        deliveryMode as 'versand' | 'abholung',
        shippingCfg
      );
      const groupShipping = groupShippingResult.price;
      const groupTotalDiscount = groupDiscountAmount + groupDurationDiscount + groupLoyaltyDiscount;
      const priceTotal = groupSubtotal - groupTotalDiscount + groupShipping;

      const bookingId = await generateBookingId();
      bookingIds.push(bookingId);

      const productName = groupItems.length === 1
        ? firstItem.productName
        : groupItems.map((it) => it.productName).join(', ');
      const allAccessories = [...new Set(groupItems.flatMap((it) => it.accessories))];

      const { error } = await supabase.from('bookings').insert({
        id: bookingId,
        payment_intent_id: gi === 0 ? `PENDING-${bookingId}` : `PENDING-${bookingId}_g${gi + 1}`,
        product_id: firstItem.productId,
        product_name: productName,
        rental_from: firstItem.rentalFrom,
        rental_to: firstItem.rentalTo,
        days: firstItem.days,
        delivery_mode: deliveryMode,
        shipping_method: deliveryMode === 'versand' ? shippingMethod : null,
        shipping_price: groupShipping,
        haftung: firstItem.haftung,
        accessories: allAccessories,
        price_rental: groupItems.reduce((s, it) => s + it.priceRental, 0),
        price_accessories: groupItems.reduce((s, it) => s + it.priceAccessories, 0),
        price_haftung: groupItems.reduce((s, it) => s + it.priceHaftung, 0),
        price_total: Math.max(0, priceTotal),
        deposit: groupItems.reduce((s, it) => s + it.deposit, 0),
        status: 'pending_verification',
        user_id: userId,
        customer_email: customerEmail,
        customer_name: customerName,
        shipping_address: shippingAddress,
        coupon_code: gi === 0 ? (couponCode || null) : null,
        discount_amount: groupDiscountAmount,
        duration_discount: groupDurationDiscount,
        loyalty_discount: groupLoyaltyDiscount,
      });

      if (error) {
        console.error('Pending booking error:', error);
        return NextResponse.json(
          { error: 'Buchung konnte nicht gespeichert werden.' },
          { status: 500 }
        );
      }

      // Admin benachrichtigen (non-blocking)
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
        priceRental: groupItems.reduce((s, it) => s + it.priceRental, 0),
        priceAccessories: groupItems.reduce((s, it) => s + it.priceAccessories, 0),
        priceHaftung: groupItems.reduce((s, it) => s + it.priceHaftung, 0),
        priceTotal: Math.max(0, priceTotal),
        deposit: groupItems.reduce((s, it) => s + it.deposit, 0),
        shippingPrice: groupShipping,
        taxMode: 'kleinunternehmer',
        taxRate: 19,
        ustId: '',
      };
      sendAdminNotification(emailData).catch((err) =>
        console.error('Admin notification error:', err)
      );
    }

    // Ergebnis: bei einer Gruppe single booking_id, bei mehreren booking_ids Array
    return NextResponse.json({
      success: true,
      booking_id: bookingIds[0],
      booking_ids: bookingIds,
    });
  } catch (err) {
    console.error('Create pending booking error:', err);
    return NextResponse.json(
      { error: 'Fehler beim Erstellen der Buchung.' },
      { status: 500 }
    );
  }
}

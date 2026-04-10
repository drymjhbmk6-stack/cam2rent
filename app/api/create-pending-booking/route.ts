import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import type { CartItem } from '@/components/CartProvider';
import { sendAdminNotification, type BookingEmailData } from '@/lib/email';

/**
 * POST /api/create-pending-booking
 *
 * Erstellt eine Buchung im Status "pending_verification" fuer unverifizierten Kunden.
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
      shippingPrice,
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
      shippingPrice: number;
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

    // Pruefen ob User schon eine pending Buchung hat
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

    // Buchungsnummer generieren
    const bookingId = await generateBookingId();

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

    const firstItem = items[0];
    const productName = items.length === 1
      ? firstItem.productName
      : items.map((it) => it.productName).join(', ');
    const allAccessories = [...new Set(items.flatMap((it) => it.accessories))];

    // Gesamtpreis berechnen
    const totalDiscount = (discountAmount ?? 0) + (durationDiscount ?? 0) + (loyaltyDiscount ?? 0);
    const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
    const priceTotal = subtotal - totalDiscount + (shippingPrice ?? 0);

    // Buchung als pending_verification speichern
    const { error } = await supabase.from('bookings').insert({
      id: bookingId,
      payment_intent_id: `PENDING-${bookingId}`,
      product_id: firstItem.productId,
      product_name: productName,
      rental_from: firstItem.rentalFrom,
      rental_to: firstItem.rentalTo,
      days: firstItem.days,
      delivery_mode: deliveryMode,
      shipping_method: deliveryMode === 'versand' ? shippingMethod : null,
      shipping_price: shippingPrice ?? 0,
      haftung: firstItem.haftung,
      accessories: allAccessories,
      price_rental: items.reduce((s, it) => s + it.priceRental, 0),
      price_accessories: items.reduce((s, it) => s + it.priceAccessories, 0),
      price_haftung: items.reduce((s, it) => s + it.priceHaftung, 0),
      price_total: Math.max(0, priceTotal),
      deposit: items.reduce((s, it) => s + it.deposit, 0),
      status: 'pending_verification',
      user_id: userId,
      customer_email: customerEmail,
      customer_name: customerName,
      shipping_address: shippingAddress,
      coupon_code: couponCode || null,
      discount_amount: discountAmount ?? 0,
      duration_discount: durationDiscount ?? 0,
      loyalty_discount: loyaltyDiscount ?? 0,
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
      priceRental: items.reduce((s, it) => s + it.priceRental, 0),
      priceAccessories: items.reduce((s, it) => s + it.priceAccessories, 0),
      priceHaftung: items.reduce((s, it) => s + it.priceHaftung, 0),
      priceTotal: Math.max(0, priceTotal),
      deposit: items.reduce((s, it) => s + it.deposit, 0),
      shippingPrice: shippingPrice ?? 0,
      taxMode: 'kleinunternehmer',
      taxRate: 19,
      ustId: '',
    };
    sendAdminNotification(emailData).catch((err) =>
      console.error('Admin notification error:', err)
    );

    return NextResponse.json({ success: true, booking_id: bookingId });
  } catch (err) {
    console.error('Create pending booking error:', err);
    return NextResponse.json(
      { error: 'Fehler beim Erstellen der Buchung.' },
      { status: 500 }
    );
  }
}

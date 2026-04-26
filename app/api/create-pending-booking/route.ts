import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import type { CartItem } from '@/components/CartProvider';
import { calcShipping } from '@/data/shipping';
import type { ShippingMethod } from '@/data/shipping';
import { DEFAULT_SHIPPING, type ShippingPriceConfig } from '@/lib/price-config';
import { sendAdminNotification, type BookingEmailData } from '@/lib/email';
import { getClientIp } from '@/lib/rate-limit';
import { isTestMode } from '@/lib/env-mode';
import { type BookingAccessoryItem, itemsToLegacyIds } from '@/lib/booking-accessories';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';

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
      earlyServiceConsentAt,
      contractSignature,
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
      earlyServiceConsentAt?: string | null;
      contractSignature?: {
        signatureDataUrl: string | null;
        signatureMethod: 'canvas' | 'typed';
        signerName: string;
        agreedToTerms: boolean;
      };
    };
    const ip = getClientIp(req);
    const earlyServiceConsentIp = earlyServiceConsentAt ? ip : null;

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

    // Lieferadresse + komplette Adresse fuer Vertrag aus Profil
    let shippingAddress: string | null = null;
    let custStreet = '';
    let custZip = '';
    let custCity = '';
    {
      const { data: profile } = await supabase
        .from('profiles')
        .select('address_street, address_zip, address_city')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.address_street) {
        custStreet = profile.address_street;
        custZip = profile.address_zip || '';
        custCity = profile.address_city || '';
        if (deliveryMode === 'versand') {
          shippingAddress = [
            profile.address_street,
            [profile.address_zip, profile.address_city].filter(Boolean).join(' '),
          ].filter(Boolean).join(', ');
        }
      }
    }

    // Tax-Settings fuer den Mietvertrag
    let taxMode: 'kleinunternehmer' | 'regelbesteuerung' = 'kleinunternehmer';
    let taxRate = 19;
    {
      const { data: txS } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['tax_mode', 'tax_rate']);
      const txM: Record<string, string> = {};
      for (const s of txS ?? []) txM[s.key] = s.value;
      taxMode = (txM['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer';
      taxRate = parseFloat(txM['tax_rate'] || '19');
    }

    const fmtD = (iso: string) => {
      const [y, m, d] = (iso || '').split('T')[0].split('-');
      return `${d}.${m}.${y}`;
    };

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

      // Zubehoer + Set qty-aware aggregieren (siehe confirm-cart fuer Details).
      const aggMap = new Map<string, number>();
      for (const it of groupItems) {
        if (Array.isArray(it.accessoryItems) && it.accessoryItems.length > 0) {
          for (const ai of it.accessoryItems) {
            if (!ai?.accessory_id) continue;
            const q = typeof ai.qty === 'number' && ai.qty > 0 ? Math.floor(ai.qty) : 1;
            aggMap.set(ai.accessory_id, (aggMap.get(ai.accessory_id) ?? 0) + q);
          }
        } else {
          for (const id of it.accessories ?? []) {
            if (!id) continue;
            aggMap.set(id, (aggMap.get(id) ?? 0) + 1);
          }
        }
      }
      const groupAccessoryItems: BookingAccessoryItem[] = [...aggMap.entries()]
        .map(([accessory_id, qty]) => ({ accessory_id, qty }));
      const allAccessories = itemsToLegacyIds(groupAccessoryItems);

      const testMode = await isTestMode();
      const { error } = await supabase.from('bookings').insert({
        id: bookingId,
        payment_intent_id: gi === 0 ? `PENDING-${bookingId}` : `PENDING-${bookingId}_g${gi + 1}`,
        is_test: testMode,
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
        accessory_items: groupAccessoryItems.length > 0 ? groupAccessoryItems : null,
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
        early_service_consent_at: earlyServiceConsentAt ?? null,
        early_service_consent_ip: earlyServiceConsentIp,
      });

      if (error) {
        console.error('Pending booking error:', error);
        return NextResponse.json(
          { error: 'Buchung konnte nicht gespeichert werden.' },
          { status: 500 }
        );
      }

      // Mietvertrag erzeugen + speichern, falls der Kunde im Buchungs-Flow
      // unterschrieben hat. Ohne diesen Block landet die Buchung in der Admin-UI
      // als "Mietvertrag — Ausstehend", obwohl der Kunde bereits unterschrieben
      // hat. Synchron, damit ein nachfolgendes Auto-Approve nach Verifizierung
      // den Vertrag bereits findet.
      if (contractSignature?.agreedToTerms && contractSignature?.signerName) {
        try {
          const groupPriceRental = groupItems.reduce((s, it) => s + it.priceRental, 0);
          const groupPriceAccessories = groupItems.reduce((s, it) => s + it.priceAccessories, 0);
          const groupPriceHaftung = groupItems.reduce((s, it) => s + it.priceHaftung, 0);
          const groupDeposit = groupItems.reduce((s, it) => s + it.deposit, 0);
          const result = await generateContractPDF({
            bookingId,
            bookingNumber: bookingId,
            customerName: contractSignature.signerName,
            customerEmail,
            customerStreet: custStreet,
            customerZip: custZip,
            customerCity: custCity,
            productName,
            accessories: allAccessories,
            accessoryItems: groupAccessoryItems.length > 0 ? groupAccessoryItems : undefined,
            rentalFrom: fmtD(firstItem.rentalFrom),
            rentalTo: fmtD(firstItem.rentalTo),
            rentalDays: firstItem.days,
            deliveryMode,
            priceRental: groupPriceRental,
            priceAccessories: groupPriceAccessories,
            priceHaftung: groupPriceHaftung,
            priceShipping: groupShipping,
            priceTotal: Math.max(0, priceTotal),
            deposit: groupDeposit,
            taxMode,
            taxRate,
            signatureDataUrl: contractSignature.signatureDataUrl,
            signatureMethod: contractSignature.signatureMethod,
            signerName: contractSignature.signerName,
            ipAddress: ip,
          });
          await storeContract(bookingId, result.pdfBuffer, {
            contractHash: result.contractHash,
            customerName: contractSignature.signerName,
            ipAddress: ip,
            signedAt: new Date().toISOString(),
            signatureMethod: contractSignature.signatureMethod,
          });
        } catch (err) {
          // Vertrag-Erzeugung schlaegt nicht die ganze Buchung kaputt — der
          // Admin kann den Vertrag spaeter unter /admin/buchungen/[id]/vertrag-
          // unterschreiben nachholen.
          console.error('[create-pending-booking] Vertrag-Generierung fehlgeschlagen:', err);
        }
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
        earlyServiceConsentAt: earlyServiceConsentAt ?? null,
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

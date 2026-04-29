import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import { detectSuspicious } from '@/lib/suspicious';
import type { CartItem } from '@/components/CartProvider';
import { calcShipping } from '@/data/shipping';
import type { ShippingMethod } from '@/data/shipping';
import { DEFAULT_SHIPPING, type ShippingPriceConfig, calcPriceFromTable, type AdminProduct } from '@/lib/price-config';
import { assignUnitToBooking } from '@/lib/unit-assignment';
import { assignAccessoryUnitsToBooking } from '@/lib/accessory-unit-assignment';
import { createAdminNotification } from '@/lib/admin-notifications';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  sendBookingConfirmation,
  sendAdminNotification,
  sendReferralReward,
  type BookingEmailData,
} from '@/lib/email';
import { getStripe } from '@/lib/stripe';
import { isTestMode } from '@/lib/env-mode';
import { type BookingAccessoryItem, itemsToLegacyIds } from '@/lib/booking-accessories';

const confirmCartLimiter = rateLimit({ maxAttempts: 5, windowMs: 60_000 });

/**
 * Gruppiert Cart-Items nach Mietzeitraum.
 * Gibt ein Array von Gruppen zurück, jede mit eigenem Zeitraum und Items.
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
 * Bestätigt einen Warenkorb-Checkout nach erfolgreicher Stripe-Zahlung.
 * Erstellt separate Buchungen pro Mietzeitraum.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!confirmCartLimiter.check(`cart:${ip}`).success) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte einen Moment warten.' },
      { status: 429 }
    );
  }
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
      discountAmount: number;
      couponCode?: string;
      durationDiscount?: number;
      loyaltyDiscount?: number;
      referralCode?: string;
      shippingAddress?: string | null;
      contractSignature?: {
        signatureDataUrl: string | null;
        signatureMethod: 'canvas' | 'typed';
        signerName: string;
        agreedToTerms: boolean;
      };
    };

    const contractSignature = body.contractSignature as {
      signatureDataUrl: string | null;
      signatureMethod: 'canvas' | 'typed';
      signerName: string;
      agreedToTerms: boolean;
    } | undefined;

    if (!payment_intent_id) {
      return NextResponse.json(
        { error: 'Fehlende Pflichtfelder.' },
        { status: 400 }
      );
    }

    // 1. Verify payment with Stripe
    const stripe = await getStripe();
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
      // Buchungen existieren bereits — Vertrag und Follow-up-Mail laufen jetzt in
      // after(). Auf Hetzner Coolify (Docker, langlaufender Prozess) garantiert
      // next/after die Ausführung nach der Response. Damit antwortet die Route
      // sofort statt 2-4 s synchron auf PDF + Storage zu warten.
      console.log('[confirm-cart] Idempotent: existingRows=', existingRows.length, 'contractSignature=', contractSignature ? 'vorhanden' : 'FEHLT');
      if (contractSignature?.agreedToTerms && contractSignature?.signerName) {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || req.headers.get('x-real-ip') || 'unknown';
        const ids = existingRows.map((r) => r.id);
        const sig = contractSignature;

        after(async () => {
          try {
            const [{ data: fullBookings }, { data: txS }] = await Promise.all([
              supabase.from('bookings').select('*').in('id', ids),
              supabase.from('admin_settings').select('key, value').in('key', ['tax_mode', 'tax_rate']),
            ]);

            // Falls der Webhook die Buchung zuerst angelegt hat, fehlt moeglicherweise
            // die unit_id — dann wird der Zeitwert aus dem Asset nicht gefunden und
            // landet im Vertrag als 0 €. Hier nachholen, bevor wir den Vertrag erzeugen.
            const needsUnit = (fullBookings ?? []).filter(
              (fb) => !fb.unit_id && fb.product_id && fb.rental_from && fb.rental_to && fb.status !== 'cancelled',
            );
            if (needsUnit.length > 0) {
              await Promise.all(
                needsUnit.map(async (fb) => {
                  try {
                    const unitId = await assignUnitToBooking(
                      fb.id, fb.product_id, fb.rental_from, fb.rental_to,
                    );
                    if (unitId) fb.unit_id = unitId;
                  } catch (e) {
                    console.error('[confirm-cart] unit-assign idem failed', fb.id, e);
                  }
                }),
              );
            }

            // Idempotente Zubehoer-Exemplar-Zuweisung
            const needsAccUnits = (fullBookings ?? []).filter(
              (fb) =>
                fb.status !== 'cancelled' &&
                Array.isArray(fb.accessory_items) &&
                fb.accessory_items.length > 0 &&
                (!Array.isArray(fb.accessory_unit_ids) || fb.accessory_unit_ids.length === 0)
            );
            if (needsAccUnits.length > 0) {
              await Promise.all(
                needsAccUnits.map(async (fb) => {
                  try {
                    await assignAccessoryUnitsToBooking(
                      fb.id,
                      fb.accessory_items as { accessory_id: string; qty: number }[],
                      fb.rental_from,
                      fb.rental_to,
                    );
                  } catch (e) {
                    console.error('[confirm-cart] accessory-unit-assign idem failed', fb.id, e);
                  }
                }),
              );
            }

            const txM: Record<string, string> = {};
            for (const s of txS ?? []) txM[s.key] = s.value;
            const taxModeIdem = (txM['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer';
            const taxRateIdem = parseFloat(txM['tax_rate'] || '19');
            const fmtD = (iso: string) => { const [y, m, d] = (iso || '').split('T')[0].split('-'); return `${d}.${m}.${y}`; };

            // Alle Vertraege parallel generieren + speichern
            await Promise.all(
              (fullBookings ?? [])
                .filter((fb) => !fb.contract_signed)
                .map(async (fullBooking) => {
                  try {
                    const result = await generateContractPDF({
                      bookingId: fullBooking.id, bookingNumber: fullBooking.id,
                      customerName: sig.signerName, customerEmail: fullBooking.customer_email || '',
                      productName: fullBooking.product_name || '',
                      accessories: Array.isArray(fullBooking.accessories) ? fullBooking.accessories : [],
                      accessoryItems: Array.isArray(fullBooking.accessory_items) && fullBooking.accessory_items.length > 0
                        ? fullBooking.accessory_items as { accessory_id: string; qty: number }[]
                        : undefined,
                      rentalFrom: fmtD(fullBooking.rental_from), rentalTo: fmtD(fullBooking.rental_to),
                      rentalDays: fullBooking.days || 1,
                      priceRental: fullBooking.price_rental || 0, priceAccessories: fullBooking.price_accessories || 0,
                      priceHaftung: fullBooking.price_haftung || 0, priceShipping: fullBooking.shipping_price || 0,
                      priceTotal: fullBooking.price_total || 0, deposit: fullBooking.deposit || 0,
                      taxMode: taxModeIdem,
                      taxRate: taxRateIdem,
                      signatureDataUrl: sig.signatureDataUrl,
                      signatureMethod: sig.signatureMethod,
                      signerName: sig.signerName, ipAddress: ip,
                      unitId: fullBooking.unit_id ?? null,
                    });
                    await storeContract(fullBooking.id, result.pdfBuffer, {
                      contractHash: result.contractHash, customerName: sig.signerName,
                      ipAddress: ip, signedAt: new Date().toISOString(), signatureMethod: sig.signatureMethod,
                    });
                    console.log('[confirm-cart] Vertrag gespeichert für', fullBooking.id);
                  } catch (err) { console.error('[confirm-cart] Contract generation (idempotent) error:', err); }
                }),
            );

            // Follow-up-Mail mit Vertrag-Anhang an Kunden, deren Mail vom Webhook
            // bereits ohne Vertrag rausging.
            try {
              const { sendAndLog } = await import('@/lib/email');
              for (const fb of fullBookings ?? []) {
                if (fb.contract_signed) continue;
                if (!fb.customer_email) continue;
                const year = new Date().getUTCFullYear();
                const storagePath = `${year}/${fb.id}.pdf`;
                const { data: file } = await supabase.storage.from('contracts').download(storagePath);
                if (!file) continue;
                const arrayBuffer = await file.arrayBuffer();
                const pdfBuffer = Buffer.from(arrayBuffer);
                await sendAndLog({
                  to: fb.customer_email,
                  subject: `Dein unterschriebener Mietvertrag ${fb.id}`,
                  html: `<p>Hallo ${fb.customer_name ?? ''},</p><p>im Anhang findest du deinen digital unterschriebenen Mietvertrag f&uuml;r die Buchung <strong>${fb.id}</strong>.</p><p>Bei Fragen melde dich gerne.</p>`,
                  emailType: 'contract_signed' as const,
                  attachments: [{ filename: `Mietvertrag-${fb.id}.pdf`, content: pdfBuffer }],
                  bookingId: fb.id,
                });
              }
            } catch (err) {
              console.error('[confirm-cart] contract follow-up mail error:', err);
            }
          } catch (err) {
            console.error('[confirm-cart] Idempotent (after) error:', err);
          }
        });
      }
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
    let r_discountAmount = discountAmount;
    let r_couponCode = couponCode;
    let r_durationDiscount = durationDiscount;
    let r_loyaltyDiscount = loyaltyDiscount;
    let r_referralCode = referralCode;
    let r_shippingAddress = shippingAddress;
    let r_earlyServiceConsentAt: string | null = null;
    let r_earlyServiceConsentIp: string | null = null;
    let r_verificationRequired = false;

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
          r_discountAmount = ctx.discountAmount ?? r_discountAmount;
          r_couponCode = ctx.couponCode ?? r_couponCode;
          r_durationDiscount = ctx.durationDiscount ?? r_durationDiscount;
          r_loyaltyDiscount = ctx.loyaltyDiscount ?? r_loyaltyDiscount;
          r_referralCode = ctx.referralCode ?? r_referralCode;
          if (ctx.street) {
            r_shippingAddress = [ctx.street, [ctx.zip, ctx.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          }
          if (ctx.earlyServiceConsentAt) r_earlyServiceConsentAt = ctx.earlyServiceConsentAt;
          if (ctx.earlyServiceConsentIp) r_earlyServiceConsentIp = ctx.earlyServiceConsentIp;
          if (ctx.verificationRequired === true) r_verificationRequired = true;
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

    // ── Vier voneinander unabhaengige Lookups parallel: Produkt-Plausibility,
    // Profil-Adresse, Versand-Config, Steuer-Settings. Spart 3 sequentielle
    // Roundtrips zu Supabase (~200-400 ms).
    const needsProfileAddress = Boolean(r_userId && r_deliveryMode === 'versand');
    const [prodResult, profileResultCart, shippingResult, taxResultCart] = await Promise.all([
      supabase.from('admin_config').select('value').eq('key', 'products').maybeSingle(),
      needsProfileAddress
        ? supabase.from('profiles').select('address_street, address_zip, address_city').eq('id', r_userId!).maybeSingle()
        : Promise.resolve({ data: null as null | { address_street?: string; address_zip?: string; address_city?: string } }),
      supabase.from('admin_config').select('value').eq('key', 'shipping').maybeSingle(),
      supabase.from('admin_settings').select('key, value').in('key', ['tax_mode', 'tax_rate', 'ust_id']),
    ]);

    // Second-Line-Defense: intent.amount (echter Stripe-Betrag) vs Server-Preis
    try {
      const prodRow = prodResult?.data;
      if (prodRow?.value && typeof prodRow.value === 'object') {
        const productMap = prodRow.value as Record<string, AdminProduct>;
        let expectedMinCents = 0;
        let checked = false;
        for (const it of r_items) {
          const p = productMap[it.productId];
          if (!p || !Array.isArray(p.priceTable)) continue;
          expectedMinCents += Math.round(calcPriceFromTable(p, it.days) * 100);
          checked = true;
        }
        if (checked) {
          const floorCents = Math.floor(expectedMinCents * 0.3); // 70 % Rabatt-Puffer
          if (intent.amount < floorCents) {
            console.error('[confirm-cart] Preis-Plausibilität verletzt:', {
              paymentIntent: payment_intent_id,
              paidAmount: intent.amount,
              expectedMinCents,
              floorCents,
            });
            return NextResponse.json(
              { error: 'Preis-Plausibilitätsprüfung fehlgeschlagen. Buchung wurde nicht bestätigt.' },
              { status: 400 },
            );
          }
        }
      }
    } catch (plausErr) {
      console.error('Preis-Plausibilitätsprüfung fehlgeschlagen:', plausErr);
    }

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

    // Lieferadresse aus parallel geladenem Profil
    let profileAddress: string | null = null;
    const profileCart = profileResultCart?.data;
    if (profileCart?.address_street) {
      profileAddress = [
        profileCart.address_street,
        [profileCart.address_zip, profileCart.address_city].filter(Boolean).join(' '),
      ].filter(Boolean).join(', ');
    }

    // Versand-Config aus parallel geladenem Result
    let shippingCfg: ShippingPriceConfig = DEFAULT_SHIPPING;
    if (shippingResult?.data?.value) {
      shippingCfg = shippingResult.data.value as ShippingPriceConfig;
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
      // Versand pro Gruppe neu berechnen (jede Gruppe prüft Gratis-Schwelle)
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

      // Zubehoer + Set qty-aware aggregieren. Vorrang: accessoryItems
      // (neuer Cart-Stand). Fallback: accessories[]-Array (alter Cart aus
      // localStorage) -> qty=1 pro Eintrag. Mehrere Items mit gleicher
      // accessory_id werden zu einem Eintrag mit summierter qty gemerged.
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

      // payment_intent_id: erste Gruppe bekommt die originale ID, weitere bekommen Suffix
      const piId = gi === 0 ? payment_intent_id : `${payment_intent_id}_g${gi + 1}`;

      const testMode = await isTestMode();
      const { error } = await supabase.from('bookings').insert({
        id: bookingId,
        payment_intent_id: piId,
        is_test: testMode,
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
        accessory_items: groupAccessoryItems.length > 0 ? groupAccessoryItems : null,
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
        early_service_consent_at: r_earlyServiceConsentAt,
        early_service_consent_ip: r_earlyServiceConsentIp,
        // Signatur direkt persistieren (s. confirm-booking) — Recovery-Pfad
        // funktioniert nur, wenn Signatur in der DB liegt, nicht im JS-Closure.
        ...(contractSignature?.signerName ? { contract_signer_name: contractSignature.signerName } : {}),
        ...(contractSignature?.signatureDataUrl ? { contract_signature_url: contractSignature.signatureDataUrl } : {}),
        // Nur wenn explizit gesetzt — so bleibt das Insert auch ohne
        // Migration `supabase-verification-deferred.sql` unveraendert.
        ...(r_verificationRequired ? { verification_required: true } : {}),
      });

      if (error) {
        console.error(`Error saving booking ${bookingId}:`, error);
        return NextResponse.json(
          { error: 'Buchung konnte nicht gespeichert werden.' },
          { status: 500 }
        );
      }

      // Unit automatisch zuordnen (non-blocking)
      assignUnitToBooking(bookingId, firstItem.productId, firstItem.rentalFrom, firstItem.rentalTo)
        .catch((err) => console.error(`Unit assignment error for ${bookingId}:`, err));

      // Zubehoer-Exemplare automatisch zuordnen (non-blocking)
      if (groupAccessoryItems.length > 0) {
        assignAccessoryUnitsToBooking(
          bookingId,
          groupAccessoryItems,
          firstItem.rentalFrom,
          firstItem.rentalTo,
        ).catch((err) => console.error(`Accessory-unit assignment error for ${bookingId}:`, err));
      }
    }

    // 5. Coupon used_count atomar erhöhen.
    // Die RPC `increment_coupon_if_available` nutzt SELECT ... FOR UPDATE
    // und prüft max_uses/Gültigkeit unter Lock → race-sicher.
    // Fallback auf das alte Muster falls die Migration
    // `supabase-coupon-atomic-increment.sql` noch nicht ausgeführt wurde.
    if (r_couponCode) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          'increment_coupon_if_available',
          { p_code: r_couponCode },
        );
        if (rpcErr) throw rpcErr;
        const applied = Array.isArray(rpcData) ? rpcData[0]?.applied : rpcData?.applied;
        if (!applied) {
          // Gutschein war nicht (mehr) einlösbar — Zahlung ist aber schon durch.
          // Keinen Fehler an den Kunden zurückgeben (Buchung normal weiter),
          // sondern Admin informieren.
          console.warn('[confirm-cart] Coupon-Einlösung fehlgeschlagen (Race oder aufgebraucht):', r_couponCode);
          createAdminNotification(supabase, {
            type: 'coupon_race',
            title: 'Gutschein konnte nicht eingelöst werden',
            message: `Gutschein "${r_couponCode}" war beim Einlösen nicht mehr verfügbar. Bitte manuell prüfen (Booking ${payment_intent_id}).`,
          });
        }
      } catch (rpcErr) {
        // Fallback: alte Logik (unsafer, aber rückwärtskompatibel)
        console.error('[confirm-cart] RPC fehlgeschlagen, nutze Fallback-Increment:', rpcErr);
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
    }

    // 6. User booking_count erhöhen (um Anzahl der Buchungen)
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

    // 9. Suspicious Detection (für erste Buchung)
    const firstGroupItems = periodGroups[0];
    detectSuspicious(supabase, {
      userId: r_userId || null,
      priceTotal: intent.amount / 100,
      rentalFrom: firstGroupItems[0].rentalFrom,
      days: firstGroupItems[0].days,
    }).then(async (result) => {
      if (result.suspicious) {
        // Alle Buchungen als verdächtig markieren
        for (const bid of bookingIds) {
          await supabase
            .from('bookings')
            .update({ suspicious: true, suspicious_reasons: result.reasons })
            .eq('id', bid);
        }
      }
    }).catch((err) => console.error('Suspicious detection error:', err));

    // 10. Steuer-Config aus parallel geladenem Result
    const txMap: Record<string, string> = {};
    for (const s of taxResultCart?.data ?? []) txMap[s.key] = s.value;

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';

    const fmtDateForContract = (iso: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return `${d}.${m}.${y}`;
    };

    // ── Response SOFORT senden — Warenkorb wird geleert ──
    // Vertrag + E-Mails laufen im Hintergrund weiter.

    // 11. Checkout-Kontext aufräumen
    Promise.resolve(
      supabase
        .from('admin_settings')
        .delete()
        .eq('key', `checkout_${payment_intent_id}`)
    ).catch(() => {});

    // 12. Vertrag generieren + E-Mails senden — ASYNC nach Response.
    // Wir laufen auf Hetzner Coolify (Docker), nicht auf Vercel-Serverless,
    // d.h. der Node-Prozess wird nach dem Response NICHT gekillt. `after()`
    // von Next.js 15 garantiert die Ausfuehrung. Damit antwortet die Route
    // sofort (~150 ms) statt nach 2-4 Sek; Vertrag + Mails kommen kurz danach.
    // Falls eines davon scheitert, sieht es der Admin im E-Mail-Protokoll
    // bzw. an der Buchung (contract_signed=false). Idempotenz-Block oben
    // faengt Re-Versuche bei Re-Aufruf des /confirm-cart Endpoints.
    if (r_email) {
      after(async () => {
        try {
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

            // Seriennummer laden falls Unit zugeordnet
            let serialNumber = '';
            let bookingUnitId: string | null = null;
            try {
              const { data: bkRow } = await supabase.from('bookings').select('unit_id').eq('id', bookingIds[gi]).maybeSingle();
              if (bkRow?.unit_id) {
                bookingUnitId = bkRow.unit_id;
                const { data: unitRow } = await supabase.from('product_units').select('serial_number').eq('id', bkRow.unit_id).maybeSingle();
                serialNumber = unitRow?.serial_number ?? '';
              }
            } catch { /* ignore */ }

            // Vertrag generieren wenn Signatur vorhanden
            let contractPdfBuffer: Buffer | undefined;
            if (contractSignature?.agreedToTerms && contractSignature?.signerName) {
              try {
                const result = await generateContractPDF({
                  bookingId: bookingIds[gi],
                  bookingNumber: bookingIds[gi],
                  customerName: contractSignature.signerName,
                  customerEmail: r_email,
                  productName,
                  accessories: allAccessories,
                  serialNumber,
                  rentalFrom: fmtDateForContract(firstItem.rentalFrom),
                  rentalTo: fmtDateForContract(firstItem.rentalTo),
                  rentalDays: firstItem.days,
                  priceRental: groupItems.reduce((s, it) => s + it.priceRental, 0),
                  priceAccessories: groupItems.reduce((s, it) => s + it.priceAccessories, 0),
                  priceHaftung: groupItems.reduce((s, it) => s + it.priceHaftung, 0),
                  priceShipping: emailShipping,
                  priceTotal: Math.max(0, groupTotal),
                  deposit: groupItems.reduce((s, it) => s + it.deposit, 0),
                  taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
                  taxRate: parseFloat(txMap['tax_rate'] || '19'),
                  signatureDataUrl: contractSignature.signatureDataUrl,
                  signatureMethod: contractSignature.signatureMethod,
                  signerName: contractSignature.signerName,
                  ipAddress: ip,
                  unitId: bookingUnitId,
                });
                contractPdfBuffer = result.pdfBuffer;
                await storeContract(bookingIds[gi], result.pdfBuffer, {
                  contractHash: result.contractHash,
                  customerName: contractSignature.signerName,
                  ipAddress: ip,
                  signedAt: new Date().toISOString(),
                  signatureMethod: contractSignature.signatureMethod,
                });
              } catch (err) {
                console.error('Contract generation error:', err);
              }
            }

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
              earlyServiceConsentAt: r_earlyServiceConsentAt,
              verificationRequired: r_verificationRequired,
            };

            await Promise.all([
              sendBookingConfirmation(emailData, contractPdfBuffer),
              sendAdminNotification(emailData),
            ]);
          }
        } catch (err) {
          console.error('Background email/contract error:', err);
        }
      });
    }

    // Admin-Benachrichtigung (fire-and-forget)
    createAdminNotification(supabase, {
      type: 'new_booking',
      title: r_verificationRequired
        ? `Neue Buchung (Ausweis prüfen!): ${bookingIds[0]}`
        : `Neue Buchung: ${bookingIds[0]}`,
      message: r_verificationRequired
        ? `${r_name} — ${bookingIds.length} Buchung(en) · Ausweis-Check steht aus`
        : `${r_name} — ${bookingIds.length} Buchung(en)`,
      link: `/admin/buchungen/${bookingIds[0]}`,
    });

    return NextResponse.json({ success: true, booking_ids: bookingIds });
  } catch (err) {
    console.error('Confirm cart error:', err);
    return NextResponse.json(
      { error: 'Buchung konnte nicht gespeichert werden.' },
      { status: 500 }
    );
  }
}

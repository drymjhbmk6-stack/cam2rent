import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { detectSuspicious } from '@/lib/suspicious';
import { ensureBusinessConfig } from '@/lib/load-business-config';
import { generateBookingId } from '@/lib/booking-id';
import { assignCamerasToBooking } from '@/lib/camera-unit-assignment';
import { assignAccessoryUnitsToBooking } from '@/lib/accessory-unit-assignment';
import { releaseUserCartHolds } from '@/lib/cart-holds';
import { createAdminNotification } from '@/lib/admin-notifications';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { calcPriceFromTable, type AdminProduct } from '@/lib/price-config';
import { parseMetadataAccessoryItems, itemsToLegacyIds } from '@/lib/booking-accessories';
import {
  loadProfileAddressRow,
  resolveShippingAddress,
  resolveInvoiceAddress,
  type ProfileAddressRow,
} from '@/lib/booking/resolve-addresses';
import {
  sendBookingConfirmation,
  sendAdminNotification,
  type BookingEmailData,
} from '@/lib/email';
import { generateContractPDF } from '@/lib/contracts/generate-contract';
import { storeContract } from '@/lib/contracts/store-contract';
import { confirmBookingBodySchema, firstZodError } from '@/lib/api-schemas';
import { getStripe } from '@/lib/stripe';
import { isTestMode } from '@/lib/env-mode';
import { getTesterStripe } from '@/lib/tester-mode';

// Confirm ist eine teure Operation (Stripe-Verify + DB + PDF + E-Mails).
// 5/Minute pro IP — erlaubt Retry, blockt Spam.
const confirmLimiter = rateLimit({ maxAttempts: 5, windowMs: 60_000 });

/**
 * POST /api/confirm-booking
 * Body: { payment_intent_id: string }
 *
 * 1. Verifies the PaymentIntent with Stripe (server-side, tamper-proof)
 * 2. Saves the booking to Supabase with status "confirmed"
 * 3. Idempotent: returns existing booking if already saved
 *
 * Returns { success: true, booking_id: "BK-2026-00042" }
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!confirmLimiter.check(`confirm:${ip}`).success) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte einen Moment warten.' },
      { status: 429 }
    );
  }
  await ensureBusinessConfig();
  try {
    // Zod-Validierung statt Type-Assertion: Schützt vor manipulierten
    // Request-Bodies (z.B. Signatur-URL mit 10 MB, falsche Payment-Intent-IDs).
    const parsed = confirmBookingBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: firstZodError(parsed.error) }, { status: 400 });
    }
    const { payment_intent_id, deposit_intent_id, contractSignature } = parsed.data;

    // 1. Verify payment with Stripe — 'processing' (PayPal/Klarna/SEPA async)
    // mit 202 zurueckgeben, der Webhook traegt die Buchung gleich nach.
    // Tester-Intents liegen in einem anderen Stripe-Account → bei 404 nochmal
    // mit dem jeweils anderen Stripe-Client probieren.
    let stripe = await getStripe();
    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    } catch (retrieveErr) {
      const msg = retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr);
      if (/No such payment_intent/i.test(msg)) {
        stripe = getTesterStripe();
        intent = await stripe.paymentIntents.retrieve(payment_intent_id);
      } else {
        throw retrieveErr;
      }
    }
    if (intent.status === 'processing') {
      return NextResponse.json(
        { processing: true, message: 'Zahlung wird von der Bank verarbeitet. Du erhaeltst gleich eine Bestaetigung per E-Mail.' },
        { status: 202 }
      );
    }

    const supabase = createServiceClient();

    // Idempotency-Check VOR Status-Check. Wenn der Stripe-Webhook die Buchung
    // bereits angelegt hat (Webhook bestaetigt seinerseits succeeded), antworten
    // wir idempotent — auch wenn der Stripe-Redirect dem Client einen anderen
    // Status meldet. Bekannter Edge-Case bei 3DS-Kreditkarten: der Webhook ist
    // schneller als der Browser-Redirect, und manche Karten liefern beim Return
    // einen failed-Status, obwohl die Zahlung tatsaechlich erfolgreich war.
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_intent_id', payment_intent_id)
      .maybeSingle();

    if (intent.status !== 'succeeded' && !existing) {
      return NextResponse.json(
        { error: 'Zahlung nicht abgeschlossen.' },
        { status: 400 }
      );
    }

    if (existing) {
      // Buchung existiert bereits (Webhook oder Reload) — Vertrag noch signieren falls nötig.
      // Auf Hetzner Coolify (Docker, langlaufender Prozess) garantiert next/after die
      // Ausführung nach der Response. Damit antwortet die Route sofort (~50 ms) statt
      // 2-4 s synchron auf PDF + Storage zu warten.
      console.log('[confirm-booking] Idempotent: existing=', existing.id, 'contractSignature=', contractSignature ? 'vorhanden' : 'FEHLT');

      // Webhook-Race-Patch: wenn der Webhook die Buchung schneller angelegt
      // hat, fehlt evtl. discount_amount/coupon_code (alte Webhook-Version
      // hat die nicht aus den Metadata gelesen, oder Webhook lief vor dem
      // Deploy unseres Discount-Fix). Hier patchen wir nach, sonst sieht
      // der Kunde in der Rechnung / im Buchungsdetail keinen Rabatt.
      const intentMeta = intent.metadata ?? {};
      const productDiscountFromMeta = Math.max(0, parseFloat(intentMeta.product_discount ?? '0') || 0);
      const productDiscountLabel = (intentMeta.product_discount_label ?? '').toString().trim();
      if (productDiscountFromMeta > 0) {
        try {
          const { data: existingFull } = await supabase
            .from('bookings')
            .select('discount_amount, coupon_code')
            .eq('id', existing.id)
            .maybeSingle();
          const needsPatch =
            !existingFull?.discount_amount ||
            Number(existingFull.discount_amount) === 0 ||
            (productDiscountLabel && !existingFull.coupon_code);
          if (needsPatch) {
            await supabase
              .from('bookings')
              .update({
                discount_amount: productDiscountFromMeta,
                ...(productDiscountLabel ? { coupon_code: productDiscountLabel } : {}),
              })
              .eq('id', existing.id);
            console.log(`[confirm-booking] Rabatt nachgetragen: ${existing.id} -${productDiscountFromMeta} € (${productDiscountLabel})`);
          }
        } catch (patchErr) {
          console.error('[confirm-booking] Discount-Patch fehlgeschlagen (nicht kritisch):', patchErr);
        }
      }

      if (contractSignature?.agreedToTerms && contractSignature?.signerName) {
        const ipFromHelperEarly = getClientIp(req);
        const ip = ipFromHelperEarly === '127.0.0.1' ? 'unknown' : ipFromHelperEarly;
        const sig = contractSignature;
        after(async () => {
          try {
            const { data: bk } = await supabase.from('bookings').select('contract_signed').eq('id', existing.id).single();
            if (!bk || bk.contract_signed) return;
            const { data: fullBooking } = await supabase.from('bookings').select('*').eq('id', existing.id).single();
            if (!fullBooking) return;
            const fmtD = (iso: string) => { const [y, m, d] = (iso || '').split('T')[0].split('-'); return `${d}.${m}.${y}`; };
            const { data: txS } = await supabase.from('admin_settings').select('key, value').in('key', ['tax_mode', 'tax_rate']);
            const txM: Record<string, string> = {}; for (const s of txS ?? []) txM[s.key] = s.value;
            const result = await generateContractPDF({
              bookingId: existing.id, bookingNumber: existing.id,
              customerName: sig.signerName,
              customerEmail: fullBooking.customer_email || '',
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
              taxMode: (txM['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
              taxRate: parseFloat(txM['tax_rate'] || '19'),
              signatureDataUrl: sig.signatureDataUrl,
              signatureMethod: sig.signatureMethod,
              signerName: sig.signerName, ipAddress: ip,
              unitId: fullBooking.unit_id ?? null,
              productId: fullBooking.product_id ?? undefined,
            });
            await storeContract(existing.id, result.pdfBuffer, {
              contractHash: result.contractHash, customerName: sig.signerName,
              ipAddress: ip, signedAt: new Date().toISOString(), signatureMethod: sig.signatureMethod,
            });
            console.log('[confirm-booking] Vertrag gespeichert für', existing.id);
          } catch (err) {
            console.error('[confirm-booking] Contract generation error (after):', err);
          }
        });
      }
      return NextResponse.json({ success: true, booking_id: existing.id });
    }

    // 3. Buchungsnummer generieren — Tester-User-Pool getrennt zaehlen
    // (sonst Kollision zwischen Live- und Tester-Buchungen in derselben Woche).
    const meta = intent.metadata;
    const isTesterBookingNum = meta.tester === '1';
    const bookingTestModeForId = isTesterBookingNum || (await isTestMode());
    const bookingId = await generateBookingId({ isTest: bookingTestModeForId });

    // 4. Parse Stripe metadata
    let accessoryItems = parseMetadataAccessoryItems(meta.accessory_items, meta.accessories);
    // Wenn ein Set gewaehlt wurde, kommt die Set-ID als eigene meta.set_id.
    // Damit Rechnung, Mietvertrag und Packliste das Set aufloesen koennen,
    // prependen wir es als pseudo-Zubehoer mit qty=1.
    if (typeof meta.set_id === 'string' && meta.set_id.trim()) {
      accessoryItems.unshift({ accessory_id: meta.set_id.trim(), qty: 1 });
    }

    // ── Angebots-Modus ──────────────────────────────────────────────────────
    // Bei einer Angebots-Buchung kommt das enthaltene Zubehoer autoritativ aus
    // dem Angebot (nicht aus den Metadata vertrauen). Preis-Plausibilitaet wird
    // gegen den hinterlegten Angebotspreis geprueft.
    let offerIdToStore: string | null = null;
    if (typeof meta.offer_id === 'string' && meta.offer_id.trim()) {
      try {
        const { data: offerRow } = await supabase
          .from('angebote').select('*').eq('id', meta.offer_id.trim()).maybeSingle();
        if (offerRow) {
          offerIdToStore = String(offerRow.id);
          // Zubehoer wird PRO Kamera gepflegt — die Kamera-Option dieser
          // Buchung liefert das autoritative Zubehoer.
          const cams = Array.isArray(offerRow.camera_options)
            ? (offerRow.camera_options as { product_id: string; price: number; accessory_items?: { accessory_id: string; qty: number }[] }[])
            : [];
          const opt = cams.find((c) => c.product_id === meta.product_id);
          const offerItems = Array.isArray(opt?.accessory_items) ? opt!.accessory_items : [];
          accessoryItems = offerItems
            .filter((i) => i && i.accessory_id)
            .map((i) => ({ accessory_id: i.accessory_id, qty: Math.max(1, Number(i.qty) || 1) }));
          const days = parseInt(meta.days, 10) || 1;
          const reportedRental = parseFloat(meta.price_rental ?? '0') || 0;
          const expectedRental = opt
            ? (offerRow.pricing_mode === 'perDay' ? opt.price * Math.max(1, days) : opt.price)
            : null;
          if (expectedRental === null || Math.abs(expectedRental - reportedRental) > 0.5) {
            await createAdminNotification(supabase, {
              type: 'payment_failed',
              title: `Angebots-Buchung prüfen (${bookingId})`,
              message: expectedRental === null
                ? `Buchung ${bookingId} trägt offer_id ${offerRow.id}, aber die Kamera ${meta.product_id} ist nicht Teil des Angebots. Bitte Preis prüfen.`
                : `Buchung ${bookingId}: Angebotspreis laut Angebot ${expectedRental.toFixed(2)} €, gezahlt wurde ${reportedRental.toFixed(2)} €. Bitte prüfen.`,
              link: `/admin/buchungen/${bookingId}`,
            }).catch(() => {});
          }
        }
      } catch (offerErr) {
        console.error('[confirm-booking] Angebot laden fehlgeschlagen:', offerErr);
      }
    }
    const accessories = accessoryItems.length > 0
      ? itemsToLegacyIds(accessoryItems)
      : (meta.accessories ? meta.accessories.split(',').filter(Boolean) : []);

    // 4a + 4b + 7: Plausibility-Produktdaten, Lieferadresse und Steuer-Settings
    // parallel laden — sie sind voneinander unabhängig. Spart 2-3 sequentielle
    // Roundtrips zu Supabase (~150-300 ms).
    // Profil immer laden wenn user_id vorhanden — die abweichende
    // Rechnungsadresse (billing_*) gilt auch bei Abholung, nicht nur Versand.
    const [prodResult, profileRow, taxResult] = await Promise.all([
      supabase.from('admin_config').select('value').eq('key', 'products').maybeSingle(),
      meta.user_id
        ? loadProfileAddressRow(supabase, meta.user_id)
        : Promise.resolve(null as ProfileAddressRow | null),
      supabase.from('admin_settings').select('key, value').in('key', ['tax_mode', 'tax_rate', 'ust_id']),
    ]);

    // 4a. Preis-Plausibilitätsprüfung (Defense-in-Depth).
    // Im Angebots-Modus uebersprungen — der Angebotspreis weicht bewusst von
    // der Preistabelle ab und wird im Angebots-Block oben separat geprueft.
    try {
      if (!offerIdToStore && meta.product_id && meta.days) {
        const days = parseInt(meta.days, 10);
        const prodRow = prodResult?.data;
        if (days > 0 && prodRow?.value && typeof prodRow.value === 'object') {
          const productMap = prodRow.value as Record<string, AdminProduct>;
          const product = productMap[meta.product_id];
          if (product && Array.isArray(product.priceTable)) {
            const expectedCents = Math.round(calcPriceFromTable(product, days) * 100);
            // Sweep 8 H1: Floor auf 50% (war 30%) — konsistent mit
            // create-payment-intent (Sweep 7 #10) + checkout-intent.
            // Single-Buchungen kennen keinen Coupon; 50% reicht als Buffer
            // fuer Versand/Haftung-Staffeln, ohne Cart-Manipulation zu erlauben.
            const floorCents = Math.floor(expectedCents * 0.5);
            if (intent.amount < floorCents) {
              // Nach erfolgreicher Stripe-Zahlung NICHT mehr ablehnen.
              // Geld ist eingegangen — Reject wuerde Kunden ohne Buchung
              // dastehen lassen. Stattdessen Admin-Notification, Flow geht
              // weiter, Buchung wird angelegt. Praeventiver Schutz bleibt
              // in checkout-intent (50%-Floor vor Payment) bzw. in der
              // create-payment-intent-Route.
              const diffEur = ((floorCents - intent.amount) / 100).toFixed(2);
              console.error('[confirm-booking] Preis-Plausibilität verletzt — Buchung wird trotzdem angelegt:', {
                paymentIntent: payment_intent_id,
                paidAmount: intent.amount,
                expectedCents,
                floorCents,
                shortfallEur: diffEur,
              });
              try {
                await createAdminNotification(supabase, {
                  type: 'payment_failed',
                  title: `Preis-Plausibilität verletzt (${payment_intent_id})`,
                  message: `Stripe hat ${(intent.amount / 100).toFixed(2)} € abgebucht, erwartet wurden mindestens ${(floorCents / 100).toFixed(2)} € (Listenpreis ${(expectedCents / 100).toFixed(2)} €). Differenz: ${diffEur} €. Bitte Buchung pruefen und ggf. Differenz nachfordern oder erstatten.`,
                  link: '/admin/buchungen',
                });
              } catch (notifErr) {
                console.error('[confirm-booking] Konnte Plausibilitaets-Notification nicht anlegen:', notifErr);
              }
            }
          }
        }
      }
    } catch (plausErr) {
      console.error('[confirm-booking] Plausibilitätsprüfung fehlgeschlagen:', plausErr);
    }

    // 4b. Liefer- + Rechnungsadresse aufloesen.
    // Lieferadresse: abweichende Standard-Lieferadresse (delivery_*) > Hauptadresse.
    // Der Einzel-Buchungs-Wizard kennt keine Per-Order-Eingabe -> Profil-Defaults.
    // Rechnungsadresse: abweichende Standard-Rechnungsadresse (billing_*) > Default.
    const shippingAddress =
      meta.delivery_mode === 'versand' ? resolveShippingAddress(profileRow) : null;
    const invoiceOverride = resolveInvoiceAddress(profileRow);

    // 5. Deposit-Vorautorisierung bestätigen (falls vorhanden)
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
        // Buchung trotzdem speichern — Kaution konnte nicht gehalten werden
      }
    }

    // 6. Save booking
    // is_test = global Test-Mode ODER Tester-User-Buchung (metadata.tester='1'
    // wird in create-payment-intent gesetzt).
    const isTesterBooking = meta.tester === '1';
    const testMode = isTesterBooking || (await isTestMode());
    // Verifizierungsflag aus Stripe-Metadata (von checkout-intent gesetzt).
    const verificationRequired = meta.verification_required === '1';
    // Produkt-Rabatt aus Metadata uebernehmen (Aktion wie "Release50").
    // Frontend zieht ihn bereits vom Stripe-Betrag ab; hier landet er in
    // bookings.discount_amount + bookings.coupon_code (= Aktionsname), damit
    // Rechnung + Buchungsdetail die Aufschluesselung zeigen.
    const productDiscountFromMeta = Math.max(0, parseFloat(meta.product_discount ?? '0') || 0);
    const productDiscountLabel = (meta.product_discount_label ?? '').toString().trim();
    // Frühbucherrabatt aus Metadata — Frontend zieht ihn bereits vom Stripe-
    // Betrag ab; hier landet er in der eigenen Spalte bookings.early_bird_discount
    // (analog duration_discount/loyalty_discount im Cart-Flow).
    const earlyBirdFromMeta = Math.max(0, parseFloat(meta.early_bird_discount ?? '0') || 0);

    // Server-seitige Plausibilitaets-Pruefung der Zubehoer-Preise.
    // Wenn das Frontend ein Item in accessory_items mitgegeben hat, dessen
    // Preis aber nicht in price_accessories summiert wurde (z.B. weil der
    // dbAccessories-Cache stale war), korrigieren wir hier. Stripe-Charge
    // ist dann zwar zu niedrig — Admin-Notification meldet die Differenz,
    // damit manuell nachgeladen oder erstattet werden kann.
    const reportedAccPrice = Math.max(0, parseFloat(meta.price_accessories ?? '0') || 0);
    const daysParsed = parseInt(meta.days, 10) || 1;
    // Im Angebots-Modus ist das Zubehoer im Komplettpreis enthalten
    // (price_accessories = 0) — die Recompute-Pruefung wuerde faelschlich
    // einen Mismatch melden und wird daher uebersprungen.
    let finalPriceAccessories = reportedAccPrice;
    if (!offerIdToStore) {
      const { verifyAccessoryPrice } = await import('@/lib/booking/verify-accessory-price');
      const accCheck = await verifyAccessoryPrice(supabase, {
        items: accessoryItems,
        days: daysParsed,
        reportedTotal: reportedAccPrice,
      });
      finalPriceAccessories = accCheck.mismatch ? accCheck.computed : reportedAccPrice;
      if (accCheck.mismatch) {
        console.error('[confirm-booking] Zubehoer-Preis-Mismatch:', {
          bookingId, reported: reportedAccPrice, computed: accCheck.computed, details: accCheck.details,
        });
        try {
          await createAdminNotification(supabase, {
            type: 'payment_failed',
            title: `Zubehoer-Preis-Mismatch (${bookingId})`,
            message: `Frontend meldete ${reportedAccPrice.toFixed(2)} EUR fuer Zubehoer, Server-Recompute ergab ${accCheck.computed.toFixed(2)} EUR. Differenz: ${(accCheck.computed - reportedAccPrice).toFixed(2)} EUR. Stripe-Charge basiert auf dem Frontend-Wert — ggf. via Payment Link nachladen oder die Buchung manuell korrigieren.`,
            link: `/admin/buchungen/${bookingId}`,
          });
        } catch (notifErr) {
          console.error('[confirm-booking] Admin-Notification fehlgeschlagen:', notifErr);
        }
      }
    }

    const bookingInsert: Record<string, unknown> = {
      id: bookingId,
      payment_intent_id,
      is_test: testMode,
      product_id: meta.product_id,
      product_name: meta.product_name,
      rental_from: meta.rental_from,
      rental_to: meta.rental_to,
      days: daysParsed,
      delivery_mode: meta.delivery_mode,
      shipping_method: meta.shipping_method ?? null,
      shipping_price: parseFloat(meta.shipping_price ?? '0'),
      haftung: meta.haftung,
      accessories,
      accessory_items: accessoryItems.length > 0 ? accessoryItems : null,
      price_rental: parseFloat(meta.price_rental ?? '0'),
      price_accessories: finalPriceAccessories,
      price_haftung: parseFloat(meta.price_haftung ?? '0'),
      price_total: intent.amount / 100,
      deposit: parseFloat(meta.deposit ?? '0'),
      deposit_intent_id: confirmedDepositIntentId,
      deposit_status: depositStatus,
      status: 'confirmed',
      user_id: meta.user_id || null,
      customer_email: meta.customer_email || null,
      customer_name: meta.customer_name || null,
      shipping_address: shippingAddress,
      ...(invoiceOverride
        ? { invoice_name: invoiceOverride.invoice_name, invoice_address: invoiceOverride.invoice_address }
        : {}),
      ...(productDiscountFromMeta > 0
        ? {
            discount_amount: productDiscountFromMeta,
            ...(productDiscountLabel ? { coupon_code: productDiscountLabel } : {}),
          }
        : {}),
      // Eigene Spalte (Migration supabase-bookings-early-bird-discount.sql) —
      // defensiver Insert-Retry unten entfernt sie bei fehlender Migration.
      ...(earlyBirdFromMeta > 0 ? { early_bird_discount: earlyBirdFromMeta } : {}),
      // Signatur direkt persistieren — ohne das geht sie bei Container-Restart
      // verloren und der after()-Block kann den Vertrag nicht mehr erzeugen.
      // Mit Persistenz kann der Admin den Vertrag jederzeit ueber den Recovery-
      // Endpoint nachgenerieren, wenn after() scheitert.
      ...(contractSignature?.signerName ? { contract_signer_name: contractSignature.signerName } : {}),
      ...(contractSignature?.signatureDataUrl ? { contract_signature_url: contractSignature.signatureDataUrl } : {}),
      // Nur setzen wenn true — so bleibt Insert ohne Migration ruckwaerts-kompatibel
      ...(verificationRequired ? { verification_required: true } : {}),
      // Angebots-Verknuepfung (nur bei Angebots-Buchungen).
      ...(offerIdToStore ? { offer_id: offerIdToStore } : {}),
    };

    let insertRes = await supabase.from('bookings').insert(bookingInsert);
    // Defensiv: fehlt die offer_id-Spalte (Migration ausstehend), Insert ohne sie wiederholen.
    if (insertRes.error && offerIdToStore && /offer_id|column|schema cache|PGRST/i.test(insertRes.error.message)) {
      delete bookingInsert.offer_id;
      insertRes = await supabase.from('bookings').insert(bookingInsert);
    }
    // Defensiv: fehlt die early_bird_discount-Spalte (Migration ausstehend),
    // Insert ohne sie wiederholen — Buchung bleibt erhalten, Wert nur nicht separat.
    if (insertRes.error && earlyBirdFromMeta > 0 && /early_bird_discount|column|schema cache|PGRST/i.test(insertRes.error.message)) {
      delete bookingInsert.early_bird_discount;
      insertRes = await supabase.from('bookings').insert(bookingInsert);
    }
    if (insertRes.error) {
      console.error('Supabase insert error:', insertRes.error);
      return NextResponse.json(
        { error: 'Buchung konnte nicht gespeichert werden.' },
        { status: 500 }
      );
    }

    // 6a. invoices-Row anlegen (non-blocking) — damit die Rechnung in
    // "Alle Rechnungen" (/admin/buchhaltung → Einnahmen) auftaucht.
    (async () => {
      try {
        const { storeInvoiceForBooking } = await import('@/lib/buchhaltung/store-invoice');
        // Steuer-Settings inline laden (txMap weiter unten ist erst spaeter
        // initialisiert; hier holen wir die zwei Werte direkt, damit der
        // IIFE-Block self-contained ist).
        const { data: txRows } = await supabase
          .from('admin_settings').select('key, value').in('key', ['tax_mode', 'tax_rate']);
        const tx: Record<string, string> = {};
        for (const r of txRows ?? []) tx[r.key] = r.value as string;
        await storeInvoiceForBooking(supabase, {
          id: bookingId,
          customer_email: meta.customer_email || null,
          customer_name: meta.customer_name || null,
          price_total: intent.amount / 100,
          price_rental: parseFloat(meta.price_rental ?? '0'),
          price_accessories: parseFloat(meta.price_accessories ?? '0'),
          price_haftung: parseFloat(meta.price_haftung ?? '0'),
          shipping_price: parseFloat(meta.shipping_price ?? '0'),
          discount_amount: productDiscountFromMeta,
          coupon_code: productDiscountLabel || null,
          payment_intent_id,
          status: 'confirmed',
          is_test: testMode,
          created_at: new Date().toISOString(),
        }, {
          taxMode: (tx['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
          taxRate: parseFloat(tx['tax_rate'] || '19'),
        });
      } catch (err) {
        console.error('[confirm-booking] Rechnung-Anlage fehlgeschlagen:', err);
      }
    })();

    // 6b. Kamera-Exemplar automatisch zuordnen (Multi-Kamera-fähig, non-blocking)
    assignCamerasToBooking(
      bookingId,
      [{ product_id: meta.product_id, product_name: meta.product_name, qty: 1 }],
      meta.rental_from,
      meta.rental_to,
    ).catch((err) => console.error(`Camera-unit assignment error for ${bookingId}:`, err));

    // 6a.2. Zubehoer-Exemplare automatisch zuordnen (non-blocking)
    if (accessoryItems.length > 0) {
      assignAccessoryUnitsToBooking(bookingId, accessoryItems, meta.rental_from, meta.rental_to)
        .catch((err) => console.error(`Accessory-unit assignment error for ${bookingId}:`, err));
    }

    // 6b. Abandoned Cart als recovered markieren + Warenkorb-Holds freigeben
    if (meta.user_id) {
      Promise.resolve(
        supabase
          .from('abandoned_carts')
          .update({ recovered: true })
          .eq('user_id', meta.user_id)
          .eq('recovered', false)
      ).catch((err: unknown) => console.error('Abandoned cart recovery error:', err));
      releaseUserCartHolds(supabase, meta.user_id)
        .catch((err: unknown) => console.error('Cart-Hold release error:', err));
    }

    // 6c. Suspicious Detection (non-blocking)
    detectSuspicious(supabase, {
      userId: meta.user_id || null,
      priceTotal: intent.amount / 100,
      rentalFrom: meta.rental_from,
      days: parseInt(meta.days, 10),
    }).then(async (result) => {
      if (result.suspicious) {
        await supabase
          .from('bookings')
          .update({ suspicious: true, suspicious_reasons: result.reasons })
          .eq('id', bookingId);
      }
    }).catch((err) => console.error('Suspicious detection error:', err));

    // 6. Look up customer info — from metadata or Supabase profile
    const customerEmail = meta.customer_email ?? '';
    let customerName = meta.customer_name ?? '';

    if (!customerName && meta.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', meta.user_id)
        .maybeSingle();
      if (profile?.full_name) customerName = profile.full_name;
    }

    // 7. Tax config aus parallel geladenem Result
    const txMap: Record<string, string> = {};
    for (const s of taxResult?.data ?? []) txMap[s.key] = s.value;

    // 8. + 9. Vertrag-PDF + Storage + Bestaetigungs-Mails — alles ASYNC nach
    // Response. Wir laufen auf Hetzner Coolify (Docker), nicht Vercel-
    // Serverless: `after()` von Next.js 15 garantiert die Ausfuehrung. Die
    // Route antwortet sofort (Buchungsnummer sichtbar), Vertrag + Mails
    // laufen kurz danach.
    const ipFromHelperLate = getClientIp(req);
    const ip = ipFromHelperLate === '127.0.0.1' ? 'unknown' : ipFromHelperLate;

    // Stripe-PaymentIntent mit der finalen Buchungsnummer bestempeln, damit
    // sie in der Stripe-Quittung + Stripe-Dashboard erscheint. Non-blocking,
    // Fehler werden geschluckt.
    after(async () => {
      try {
        const { buildPaymentDescription } = await import('@/lib/stripe');
        const desc = buildPaymentDescription({
          bookingId,
          productName: meta.product_name ?? null,
          rentalFrom: meta.rental_from ?? null,
          rentalTo: meta.rental_to ?? null,
        });
        await stripe.paymentIntents.update(intent.id, { description: desc });
      } catch (err) {
        console.warn('[confirm-booking] PaymentIntent description update failed:', err);
      }
    });

    after(async () => {
      const fmtDate = (iso: string) => {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}.${m}.${y}`;
      };

      // Seriennummer laden falls Unit zugeordnet
      let serialNumber = '';
      let bookingUnitId: string | null = null;
      try {
        const { data: bkRow } = await supabase.from('bookings').select('unit_id').eq('id', bookingId).maybeSingle();
        if (bkRow?.unit_id) {
          bookingUnitId = bkRow.unit_id;
          const { data: unitRow } = await supabase.from('product_units').select('serial_number').eq('id', bkRow.unit_id).maybeSingle();
          serialNumber = unitRow?.serial_number ?? '';
        }
      } catch { /* ignore */ }

      let contractPdfBuffer: Buffer | undefined;
      if (contractSignature?.agreedToTerms && contractSignature?.signerName) {
        try {
          // Kundenprofil für Adresse laden
          let custStreet = '';
          let custZip = '';
          let custCity = '';
          if (meta.user_id) {
            const { data: addrProfile } = await supabase
              .from('profiles')
              .select('address_street, address_zip, address_city')
              .eq('id', meta.user_id)
              .maybeSingle();
            if (addrProfile?.address_street) {
              custStreet = addrProfile.address_street;
              custZip = addrProfile.address_zip || '';
              custCity = addrProfile.address_city || '';
            }
          }

          const result = await generateContractPDF({
            bookingId,
            bookingNumber: bookingId,
            customerName: contractSignature.signerName,
            customerEmail,
            customerStreet: custStreet,
            customerZip: custZip,
            customerCity: custCity,
            productName: meta.product_name || '',
            accessories,
            accessoryItems: accessoryItems.length > 0 ? accessoryItems : undefined,
            serialNumber,
            rentalFrom: fmtDate(meta.rental_from),
            rentalTo: fmtDate(meta.rental_to),
            rentalDays: parseInt(meta.days, 10),
            priceRental: parseFloat(meta.price_rental ?? '0'),
            priceAccessories: parseFloat(meta.price_accessories ?? '0'),
            priceHaftung: parseFloat(meta.price_haftung ?? '0'),
            priceShipping: parseFloat(meta.shipping_price ?? '0'),
            priceTotal: intent.amount / 100,
            deposit: parseFloat(meta.deposit ?? '0'),
            taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
            taxRate: parseFloat(txMap['tax_rate'] || '19'),
            signatureDataUrl: contractSignature.signatureDataUrl,
            signatureMethod: contractSignature.signatureMethod,
            signerName: contractSignature.signerName,
            ipAddress: ip,
            unitId: bookingUnitId,
            productId: meta.product_id ?? undefined,
          });

          contractPdfBuffer = result.pdfBuffer;

          // Vertrag in Supabase speichern
          await storeContract(bookingId, result.pdfBuffer, {
            contractHash: result.contractHash,
            customerName: contractSignature.signerName,
            ipAddress: ip,
            signedAt: new Date().toISOString(),
            signatureMethod: contractSignature.signatureMethod,
          });
        } catch (err) {
          console.error('Contract generation error (after):', err);
        }
      }

      // Bestaetigungs- + Admin-Mail mit Vertrag-Anhang
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
          taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
          taxRate: parseFloat(txMap['tax_rate'] || '19'),
          ustId: txMap['ust_id'] || '',
          verificationRequired,
          // Produkt-Rabatt aus Metadata in die Kunden-Mail durchreichen, damit
          // die Kostenuebersicht den Aktionsrabatt (z.B. "Release50 -7,50 €")
          // zeigt — analog Buchungsdetail + Rechnung.
          ...(productDiscountFromMeta > 0
            ? {
                discountAmount: productDiscountFromMeta,
                ...(productDiscountLabel ? { couponCode: productDiscountLabel } : {}),
              }
            : {}),
        };

        try {
          await Promise.all([
            sendBookingConfirmation(emailData, contractPdfBuffer),
            sendAdminNotification(emailData),
          ]);
        } catch (err) {
          console.error('Email send error (after):', err);
        }
      }
    });

    // Admin-Benachrichtigung (fire-and-forget)
    createAdminNotification(supabase, {
      type: 'new_booking',
      title: verificationRequired
        ? `Neue Buchung (Ausweis prüfen!): ${bookingId}`
        : `Neue Buchung: ${bookingId}`,
      message: verificationRequired
        ? `${meta.customer_name} — ${meta.product_name} (${meta.days} Tage) · Ausweis-Check steht aus`
        : `${meta.customer_name} — ${meta.product_name} (${meta.days} Tage)`,
      link: `/admin/buchungen/${bookingId}`,
    });

    return NextResponse.json({ success: true, booking_id: bookingId });
  } catch (err) {
    console.error('Confirm booking error:', err);
    return NextResponse.json(
      { error: 'Fehler beim Bestätigen der Buchung.' },
      { status: 500 }
    );
  }
}

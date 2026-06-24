import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import type { CartItem } from '@/components/CartProvider';
import {
  sendBookingConfirmation,
  sendAdminNotification,
  type BookingEmailData,
} from '@/lib/email';
import { getStripe, getStripeWebhookSecretOrThrow } from '@/lib/stripe';
import { isTestMode } from '@/lib/env-mode';
import { createAdminNotification } from '@/lib/admin-notifications';
import { parseMetadataAccessoryItems, itemsToLegacyIds } from '@/lib/booking-accessories';
import { getActiveSpecialDiscountPercent } from '@/lib/price-config';
import {
  loadProfileAddressRow,
  resolveShippingAddress,
  resolveInvoiceAddress,
} from '@/lib/booking/resolve-addresses';
import { assignCamerasToBooking } from '@/lib/camera-unit-assignment';
import { assignAccessoryUnitsToBooking } from '@/lib/accessory-unit-assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Vergleicht die Summe einzelner Preiskomponenten gegen den von Stripe
 * signierten Gesamtbetrag. Eine Abweichung > 5 Cent deutet auf manipulierte
 * PaymentIntent-Metadata hin (Theorie: Angreifer setzt einzelne price_*-Felder
 * im Metadata, intent.amount selbst ist Stripe-signiert). Wir blockieren NICHT
 * den Webhook (Stripe wuerde dauerhaft retry), sondern legen eine
 * Admin-Notification an, damit der Vorfall manuell geprueft werden kann.
 */
async function verifyAmountConsistency(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string,
  intentId: string,
  expectedSumCents: number,
  actualAmountCents: number,
) {
  const diffCents = Math.abs(expectedSumCents - actualAmountCents);
  if (diffCents <= 5) return; // 5 Cent Toleranz fuer Float-Rundung
  const msg = `PaymentIntent ${intentId}: Komponenten-Summe ${(expectedSumCents / 100).toFixed(2)} € weicht vom Stripe-Gesamtbetrag ${(actualAmountCents / 100).toFixed(2)} € ab (Differenz ${(diffCents / 100).toFixed(2)} €).`;
  console.error(`[Webhook] PRICE-MISMATCH ${bookingId}: ${msg}`);
  try {
    await createAdminNotification(supabase, {
      type: 'payment_failed',
      title: `Preis-Plausibilitaet verletzt (${bookingId})`,
      message: msg,
      link: `/admin/buchungen/${bookingId}`,
    });
  } catch (e) {
    console.error('[Webhook] Konnte Notification nicht anlegen:', e);
  }
}

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
    const stripe = await getStripe();
    const webhookSecret = await getStripeWebhookSecretOrThrow();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook-Signatur ungueltig:', err);
    return NextResponse.json({ error: 'Ungueltige Signatur.' }, { status: 400 });
  }

  // event.id-basierter Replay-Schutz: Stripe garantiert at-least-once Delivery.
  // Bei Retry/Replay wuerde unsere Verarbeitung zweimal laufen (Doppel-Mails,
  // Doppel-Buchung wenn payment_intent_id-Lookup zwischen den beiden Events
  // racet). admin_settings nutzen wir hier als simpler Idempotency-Store —
  // Eintrag wird beim ersten Verarbeiten angelegt, beim zweiten sofort 200.
  try {
    const sbDedupe = createServiceClient();
    const { error: dupErr } = await sbDedupe
      .from('admin_settings')
      .insert({ key: `stripe_event_${event.id}`, value: { processed_at: new Date().toISOString(), type: event.type } });
    if (dupErr) {
      // 23505 = unique violation → Event wurde schon verarbeitet
      if (dupErr.code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      // Andere Fehler nicht fatal: weiter machen, Idempotenz haengt dann
      // an den restlichen Prufungen (z.B. payment_intent_id-Lookup).
      console.warn('[Webhook] Dedupe-Insert Fehler (nicht-fatal):', dupErr.message);
    }
  } catch (e) {
    console.warn('[Webhook] Dedupe-Check fehlgeschlagen (nicht-fatal):', e);
  }

  // Fehlgeschlagene Zahlungen — Admin sofort benachrichtigen.
  // Stripe feuert dieses Event bei Karten-Ablehnung, 3DS-Abbruch,
  // unzureichender Deckung, Fraud-Block etc. Ohne diesen Handler haetten
  // wir keine zentrale Sicht auf abgelehnte Zahlungen — der Kunde haut
  // einfach ab, Admin merkt's nicht.
  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    // Deposit-Holds ignorieren — bei Pre-Auth-Versagen kommt eh kein Geld,
    // und die Buchung ist meist trotzdem gluecklich (Stripe versucht es
    // automatisch erneut beim Capture).
    if (intent.metadata?.type === 'deposit_hold') {
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceClient();
    const meta = intent.metadata ?? {};
    const lastErr = intent.last_payment_error;
    const declineCode = lastErr?.decline_code ?? null;
    const errorCode = lastErr?.code ?? null;
    const errorMsg = lastErr?.message ?? 'Kein Fehlertext';
    const amountEur = (intent.amount / 100).toFixed(2);
    const customerName = meta.customer_name || meta.customerName || '';
    const customerEmail = meta.customer_email || meta.customerEmail || '';
    const preBookingId = meta.pre_booking_id || meta.preBookingId || '';

    const titleSuffix = preBookingId ? ` (${preBookingId})` : '';
    const senderInfo = customerEmail
      ? `${customerName ? `${customerName} (${customerEmail})` : customerEmail}`
      : 'Unbekannter Kunde';
    const codeInfo = declineCode || errorCode
      ? ` · Code: ${declineCode || errorCode}`
      : '';

    try {
      await createAdminNotification(supabase, {
        type: 'payment_failed',
        title: `Zahlung fehlgeschlagen${titleSuffix}`,
        message: `${senderInfo} · ${amountEur} € · ${errorMsg}${codeInfo}`,
        link: `/admin/buchungen`,
      });
    } catch (notifErr) {
      console.error('[Webhook] payment_failed-Notification fehlgeschlagen:', notifErr);
    }
    console.log(`[Webhook] payment_failed: ${intent.id} · ${amountEur} € · ${errorMsg} · ${declineCode || errorCode || 'n/a'}`);
    return NextResponse.json({ received: true });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const meta = intent.metadata;

    // Deposit-Holds ignorieren
    if (meta.type === 'deposit_hold') {
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceClient();

    // Idempotenz: Prüfen ob Buchung bereits existiert.
    // payment_intent_id wird in handleSingleBooking/handleCartBooking exakt
    // als intent.id gespeichert — daher reicht ein Equality-Check.
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_intent_id', intent.id)
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

  // Zahlungslink-Flow: Kunde bezahlt über genehmigten Link.
  // - 'checkout.session.completed': Sofort-Zahlungen (Karte, Apple Pay) sind
  //   sofort bezahlt; bei async (PayPal, Klarna, SEPA) hat session
  //   `payment_status: 'unpaid'` ODER 'no_payment_required'.
  // - 'checkout.session.async_payment_succeeded': WICHTIG fuer PayPal & Co —
  //   Stripe schickt diesen Event SPAETER, sobald das Geld tatsaechlich da
  //   ist. Ohne diesen Branch wuerde die Buchung ewig auf 'awaiting_payment'
  //   stehen, obwohl PayPal abgebucht hat.
  // Beide Events haben dieselbe Session-Form und Metadata.
  // Async-Zahlungs-Fehler (PayPal/Klarna/SEPA bestaetigen erst Stunden
  // spaeter, falls die Abbuchung tatsaechlich fehlschlaegt). Hier
  // benachrichtigen wir den Admin, damit er den Kunden kontaktieren oder
  // die Payment-Link-Buchung stornieren kann.
  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata ?? {};
    const supabase = createServiceClient();
    const amountEur = ((session.amount_total ?? 0) / 100).toFixed(2);
    const customerName = meta.customer_name || meta.customerName || '';
    const customerEmail = (session.customer_details?.email || meta.customer_email || meta.customerEmail || '') as string;
    const bookingId = (meta.booking_id || meta.bookingId || '') as string;
    const senderInfo = customerEmail
      ? `${customerName ? `${customerName} (${customerEmail})` : customerEmail}`
      : 'Unbekannter Kunde';
    try {
      await createAdminNotification(supabase, {
        type: 'payment_failed',
        title: `Async-Zahlung fehlgeschlagen${bookingId ? ` (${bookingId})` : ''}`,
        message: `${senderInfo} · ${amountEur} € · Zahlungsart (PayPal/Klarna/SEPA) hat die Belastung abgelehnt. Buchung pruefen + ggf. Kunde kontaktieren.`,
        link: bookingId ? `/admin/buchungen/${bookingId}` : '/admin/buchungen',
      });
    } catch (notifErr) {
      console.error('[Webhook] async_payment_failed-Notification fehlgeschlagen:', notifErr);
    }
    console.log(`[Webhook] async_payment_failed: ${session.id} · ${amountEur} €`);
    return NextResponse.json({ received: true });
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata ?? {};

    // Bei 'completed' nur weiter, wenn payment_status === 'paid'. Sonst
    // schickt Stripe noch den async_payment_succeeded-Event hinterher und
    // wir verarbeiten erst dann. Verhindert verfruehte Bestaetigung.
    const isPaid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    if (event.type === 'checkout.session.completed' && !isPaid) {
      console.log(`[Webhook] checkout.session.completed mit payment_status='${session.payment_status}' — warte auf async_payment_succeeded.`);
      return NextResponse.json({ received: true, async_pending: true });
    }

    if (meta.booking_type === 'pending_approval' && meta.booking_id) {
      const supabase = createServiceClient();

      // Buchung auf "confirmed" setzen
      const { data: booking } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', meta.booking_id)
        .single();

      if (booking && (booking.status === 'awaiting_payment' || booking.status === 'pending_verification')) {
        // Atomarer Status-Flip mit Guard — Schutz vor Doppel-Verarbeitung
        // wenn checkout.session.completed + async_payment_succeeded
        // schnell hintereinander ankommen.
        const { data: updated } = await supabase
          .from('bookings')
          .update({
            status: 'confirmed',
            payment_intent_id: session.payment_intent as string ?? session.id,
          })
          .eq('id', meta.booking_id)
          .in('status', ['awaiting_payment', 'pending_verification'])
          .select('id')
          .maybeSingle();
        if (!updated) {
          // Race verloren — Buchung wurde schon vom Schwester-Event auf 'confirmed' gesetzt
          return NextResponse.json({ received: true, already_confirmed: true });
        }

        console.log(`[Webhook] Pending-Buchung ${meta.booking_id} nach Zahlung bestätigt.`);

        // Bestätigungs-Email senden
        if (booking.customer_email) {
          const { data: taxSettings } = await supabase
            .from('admin_settings')
            .select('key, value')
            .in('key', ['tax_mode', 'tax_rate', 'ust_id']);
          const txMap: Record<string, string> = {};
          for (const s of taxSettings ?? []) txMap[s.key] = s.value;

          const emailData: BookingEmailData = {
            bookingId: meta.booking_id,
            customerName: booking.customer_name ?? '',
            customerEmail: booking.customer_email,
            productName: booking.product_name,
            rentalFrom: booking.rental_from,
            rentalTo: booking.rental_to,
            days: booking.days,
            deliveryMode: booking.delivery_mode ?? 'versand',
            shippingMethod: booking.shipping_method ?? 'standard',
            haftung: booking.haftung,
            accessories: booking.accessories ?? [],
            priceRental: booking.price_rental,
            priceAccessories: booking.price_accessories,
            priceHaftung: booking.price_haftung,
            priceTotal: booking.price_total,
            deposit: booking.deposit ?? 0,
            shippingPrice: booking.shipping_price ?? 0,
            taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
            taxRate: parseFloat(txMap['tax_rate'] || '19'),
            ustId: txMap['ust_id'] || '',
            earlyServiceConsentAt: booking.early_service_consent_at ?? null,
          };
          // allSettled: Webhook MUSS 200 zurueckgeben (sonst Stripe-Retry → Doppelbuchung).
          // Aber Fehler einzeln loggen, damit nicht ein Fehler den anderen Versand maskiert.
          Promise.allSettled([
            sendBookingConfirmation(emailData),
            sendAdminNotification(emailData),
          ]).then((results) => {
            results.forEach((r, i) => {
              if (r.status === 'rejected') {
                const which = i === 0 ? 'sendBookingConfirmation' : 'sendAdminNotification';
                console.error(`[Webhook] Email-Fehler (${which}):`, r.reason);
              }
            });
          });
        }
      }
    }

    // Nachzahlung aus einer Bestellbearbeitung (booking_edit). Die Buchung
    // wurde bereits geaendert (sofort wirksam) — hier nur den Zahlungsstatus
    // nachfuehren, damit der Admin sieht, dass die Differenz beglichen ist.
    if (meta.booking_type === 'price_adjustment' && meta.booking_id) {
      const supabase = createServiceClient();
      const r = await supabase
        .from('bookings')
        .update({ adjustment_status: 'paid' })
        .eq('id', meta.booking_id)
        .eq('adjustment_status', 'pending_payment');
      if (r.error && /adjustment_status/i.test(r.error.message || '')) {
        console.warn('[Webhook] adjustment_status-Spalte fehlt (Migration ausstehend).');
      } else {
        console.log(`[Webhook] Nachzahlung fuer ${meta.booking_id} als bezahlt markiert.`);
      }
    }

    // Verkauf (booking_type='kauf'): Kunde hat den Zahlungslink bezahlt.
    // Buchung auf 'confirmed' flippen + Rechnung als bezahlt markieren.
    if (meta.booking_type === 'kauf' && meta.booking_id) {
      const supabase = createServiceClient();
      const { data: updated } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_intent_id: (session.payment_intent as string) ?? session.id,
        })
        .eq('id', meta.booking_id)
        .eq('status', 'awaiting_payment')
        .select('id, customer_name, price_total')
        .maybeSingle();
      if (updated) {
        await supabase
          .from('invoices')
          .update({
            status: 'paid',
            payment_status: 'paid',
            paid_at: new Date().toISOString(),
            payment_method: 'Kreditkarte via Stripe',
          })
          .eq('booking_id', meta.booking_id);
        try {
          await createAdminNotification(supabase, {
            type: 'new_booking',
            title: `Verkauf bezahlt (${meta.booking_id})`,
            message: `${updated.customer_name ?? 'Kunde'} · ${Number(updated.price_total ?? 0).toFixed(2)} €`,
            link: '/admin/verkauf',
          });
        } catch (e) {
          console.error('[Webhook] Verkauf-Notification fehlgeschlagen:', e);
        }
        console.log(`[Webhook] Verkauf ${meta.booking_id} nach Zahlung bestätigt.`);
      }
    }
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
  // Tester-User → eigener Counter-Pool, damit Live- und Tester-Nummern in
  // derselben Woche nicht kollidieren.
  const isTesterSingle = meta.tester === '1';
  const testModeForIdSingle = isTesterSingle || (await isTestMode());
  const bookingId = await generateBookingId({ isTest: testModeForIdSingle });

  // Neue qty-aware Darstellung aus metadata.accessory_items (id:qty,...).
  // Fallback auf meta.accessories (reine IDs) wenn Metadata alt ist.
  const accessoryItems = parseMetadataAccessoryItems(meta.accessory_items, meta.accessories);
  // Wenn ein Set gewaehlt wurde, kommt die Set-ID als eigene meta.set_id —
  // sie ist NICHT in meta.accessory_items enthalten. Damit Rechnung,
  // Mietvertrag und Packliste das Set spaeter aufloesen koennen, prependen
  // wir es als pseudo-Zubehoer mit qty=1.
  if (typeof meta.set_id === 'string' && meta.set_id.trim()) {
    accessoryItems.unshift({ accessory_id: meta.set_id.trim(), qty: 1 });
  }
  const accessories = accessoryItems.length > 0
    ? itemsToLegacyIds(accessoryItems)
    : (meta.accessories ? meta.accessories.split(',').filter(Boolean) : []);

  // Liefer- + Rechnungsadresse aus Profil (inkl. abweichende Standard-Adressen).
  let shippingAddress: string | null = null;
  let invoiceOverride: { invoice_name: string | null; invoice_address: string | null } | null = null;
  if (meta.user_id) {
    const profileRow = await loadProfileAddressRow(supabase, meta.user_id);
    if (meta.delivery_mode === 'versand') shippingAddress = resolveShippingAddress(profileRow);
    invoiceOverride = resolveInvoiceAddress(profileRow);
  }

  // is_test muss den Tester-User respektieren (metadata.tester='1'), nicht nur
  // den globalen Modus — sonst landet eine Tester-Buchung, die der Webhook
  // (Race vor confirm-booking) anlegt, mit is_test=false und blockiert den
  // Live-Kalender. testModeForIdSingle = isTesterSingle || isTestMode().
  const singleEarlyBird = Math.max(0, parseFloat(meta.early_bird_discount ?? '0') || 0);
  // Sonderkondition (Kunden-Rabatt) serverseitig aus profiles auflösen
  // (maßgeblich). Sie ersetzt Produktaktion + Frühbucher. Basis = Miete + Zubehör.
  let singleSpecial = 0;
  if (meta.user_id) {
    try {
      const { data: spRow } = await supabase
        .from('profiles')
        .select('special_discount_percent, special_discount_valid_until')
        .eq('id', meta.user_id)
        .maybeSingle();
      const spPct = getActiveSpecialDiscountPercent({
        percent: (spRow as { special_discount_percent?: number | null } | null)?.special_discount_percent ?? null,
        validUntil: (spRow as { special_discount_valid_until?: string | null } | null)?.special_discount_valid_until ?? null,
      });
      if (spPct > 0) {
        const base = Math.max(0, parseFloat(meta.price_rental ?? '0')) + Math.max(0, parseFloat(meta.price_accessories ?? '0'));
        singleSpecial = Math.round(base * spPct) / 100;
      }
    } catch { /* defensiv: Migration evtl. nicht durch */ }
  }
  const singleSpecialActive = singleSpecial > 0;
  const singleInsert: Record<string, unknown> = {
    id: bookingId,
    payment_intent_id: intent.id,
    is_test: testModeForIdSingle,
    product_id: meta.product_id,
    product_name: meta.product_name,
    rental_from: meta.rental_from,
    rental_to: meta.rental_to,
    days: parseInt(meta.days, 10),
    delivery_mode: meta.delivery_mode,
    shipping_method: meta.shipping_method ?? null,
    // Sweep 9 MED-2: Math.max(0,...) gegen negative Preis-Komponenten in metadata.
    // Verhindert Buchhaltungs-Verzerrung durch manipulierte Client-Werte.
    shipping_price: Math.max(0, parseFloat(meta.shipping_price ?? '0')),
    haftung: meta.haftung,
    accessories,
    accessory_items: accessoryItems.length > 0 ? accessoryItems : null,
    price_rental: Math.max(0, parseFloat(meta.price_rental ?? '0')),
    price_accessories: Math.max(0, parseFloat(meta.price_accessories ?? '0')),
    price_haftung: Math.max(0, parseFloat(meta.price_haftung ?? '0')),
    price_total: intent.amount / 100,
    deposit: parseFloat(meta.deposit ?? '0'),
    status: 'confirmed',
    user_id: meta.user_id || null,
    customer_email: meta.customer_email || null,
    customer_name: meta.customer_name || null,
    shipping_address: shippingAddress,
    ...(invoiceOverride
      ? { invoice_name: invoiceOverride.invoice_name, invoice_address: invoiceOverride.invoice_address }
      : {}),
    // Produkt-Rabatt aus Metadata (Aktion wie "Release50"). Sonst gehen die
    // Felder verloren, wenn der Webhook die Buchung schneller anlegt als
    // confirm-booking nach dem Stripe-Redirect — Rechnung + Buchungsdetail
    // wuerden den Rabatt nicht zeigen, obwohl Stripe ihn abgezogen hat.
    ...(Math.max(0, parseFloat(meta.product_discount ?? '0') || 0) > 0 && !singleSpecialActive
      ? {
          discount_amount: Math.max(0, parseFloat(meta.product_discount ?? '0') || 0),
          ...(meta.product_discount_label
            ? { coupon_code: String(meta.product_discount_label).trim() }
            : {}),
        }
      : {}),
    // Frühbucherrabatt — eigene Spalte (Migration ausstehend → Retry ohne sie).
    ...(singleEarlyBird > 0 && !singleSpecialActive ? { early_bird_discount: singleEarlyBird } : {}),
    // Sonderkondition — eigene Spalte (Migration ausstehend → Retry ohne sie).
    ...(singleSpecialActive ? { special_discount: singleSpecial } : {}),
  };

  let { error } = await supabase.from('bookings').insert(singleInsert);
  if (error && singleEarlyBird > 0 && /early_bird_discount|column|schema cache|PGRST/i.test(error.message)) {
    delete singleInsert.early_bird_discount;
    ({ error } = await supabase.from('bookings').insert(singleInsert));
  }
  if (error && singleSpecialActive && /special_discount|column|schema cache|PGRST/i.test(error.message)) {
    delete singleInsert.special_discount;
    ({ error } = await supabase.from('bookings').insert(singleInsert));
  }

  if (error) {
    console.error(`[Webhook] Einzelbuchung ${bookingId} Fehler:`, error);
    // KRITISCH: Geld ist bei Stripe eingegangen, aber DB-Insert ist gescheitert
    // (z.B. duplicate-key, NULL-Constraint). Wenn wir das nur loggen, gibts keine
    // Buchung, kein Vertrag, keine Mail — aber der Kunde hat bezahlt. Stripe macht
    // keinen Retry, weil wir 200 zurueckgeben. Daher: Admin sofort benachrichtigen,
    // damit manuell rekonstruiert werden kann.
    try {
      await createAdminNotification(supabase, {
        type: 'payment_failed',
        title: `Zahlung eingegangen, Buchungs-Insert fehlgeschlagen: ${bookingId}`,
        message: `PaymentIntent ${intent.id} (${(intent.amount / 100).toFixed(2)} €) — DB-Fehler: ${error.message}. Buchung manuell anlegen oder Refund pruefen.`,
        link: `/admin/buchungen`,
      });
    } catch (notifErr) {
      console.error('[Webhook] Admin-Notification fuer Insert-Fehler fehlgeschlagen:', notifErr);
    }
    return;
  }

  // Plausibilitaet: Komponenten-Summe gegen Stripe-Gesamtbetrag pruefen
  const expectedSumCents = Math.round(
    (parseFloat(meta.price_rental ?? '0') +
      parseFloat(meta.price_accessories ?? '0') +
      parseFloat(meta.price_haftung ?? '0') +
      parseFloat(meta.shipping_price ?? '0')) * 100,
  );
  await verifyAmountConsistency(supabase, bookingId, intent.id, expectedSumCents, intent.amount);

  // Unit zuweisen, damit Asset-Zeitwert im Mietvertrag aufgeloest werden kann
  // (siehe lib/contracts/generate-contract.ts → loadAssetCurrentValue via unit_id).
  // Fehler ignorieren — non-blocking.
  if (meta.product_id && meta.rental_from && meta.rental_to) {
    try {
      await assignCamerasToBooking(
        bookingId,
        [{ product_id: meta.product_id, product_name: meta.product_name, qty: 1 }],
        meta.rental_from,
        meta.rental_to,
      );
    } catch (e) {
      console.error('[Webhook] camera-assign single failed', bookingId, e);
    }
  }

  // Zubehoer-Exemplare zuweisen (non-blocking)
  if (accessoryItems.length > 0 && meta.rental_from && meta.rental_to) {
    try {
      await assignAccessoryUnitsToBooking(bookingId, accessoryItems, meta.rental_from, meta.rental_to);
    } catch (e) {
      console.error('[Webhook] accessory-unit-assign single failed', bookingId, e);
    }
  }

  console.log(`[Webhook] Einzelbuchung ${bookingId} nachgeholt.`);

  // invoices-Row anlegen (non-blocking)
  try {
    const { storeInvoiceForBooking } = await import('@/lib/buchhaltung/store-invoice');
    await storeInvoiceForBooking(supabase, {
      id: bookingId,
      customer_email: meta.customer_email || null,
      customer_name: meta.customer_name || null,
      price_total: intent.amount / 100,
      price_rental: parseFloat(meta.price_rental ?? '0'),
      price_accessories: parseFloat(meta.price_accessories ?? '0'),
      price_haftung: parseFloat(meta.price_haftung ?? '0'),
      shipping_price: parseFloat(meta.shipping_price ?? '0'),
      discount_amount: Math.max(0, parseFloat(meta.product_discount ?? '0') || 0),
      coupon_code: meta.product_discount_label ? String(meta.product_discount_label).trim() : null,
      payment_intent_id: intent.id,
      status: 'confirmed',
      is_test: testModeForIdSingle,
      created_at: new Date().toISOString(),
    }, { taxMode: tax.taxMode as 'kleinunternehmer' | 'regelbesteuerung', taxRate: tax.taxRate });
  } catch (err) {
    console.error('[Webhook] Rechnung-Anlage fehlgeschlagen:', err);
  }

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
      accessoryItems: accessoryItems.length > 0 ? accessoryItems : undefined,
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
    // Sweep 8: Promise.allSettled statt Promise.all, damit ein Fehler in der
    // Customer-Mail nicht die Admin-Notification mit-killt (oder umgekehrt).
    Promise.allSettled([
      sendBookingConfirmation(emailData),
      sendAdminNotification(emailData),
    ]).then((results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const which = i === 0 ? 'BookingConfirmation' : 'AdminNotification';
          console.error(`[Webhook] ${which} fehlgeschlagen:`, r.reason);
        }
      });
    });
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
    console.error(`[Webhook] Kein Checkout-Kontext für ${intent.id} gefunden.`);
    return;
  }

  let ctx: Record<string, unknown>;
  try {
    ctx = typeof ctxRow.value === 'string' ? JSON.parse(ctxRow.value) : ctxRow.value;
  } catch {
    console.error(`[Webhook] Checkout-Kontext für ${intent.id} ungültig.`);
    return;
  }

  const items = (ctx.items ?? []) as CartItem[];
  if (!items.length) {
    console.error(`[Webhook] Keine Items im Kontext für ${intent.id}.`);
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
  const durationDiscount = (ctx.durationDiscount as number) ?? 0;
  const earlyBirdDiscount = (ctx.earlyBirdDiscount as number) ?? 0;
  const loyaltyDiscount = (ctx.loyaltyDiscount as number) ?? 0;

  // Liefer- + Rechnungsadresse: Per-Order-Eingabe aus dem Checkout-Kontext (ctx)
  // hat Vorrang, sonst die abweichenden Profil-Standards bzw. Hauptadresse.
  const ctxShipping = ctx.street
    ? [ctx.street, [ctx.zip, ctx.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : null;
  const ctxBillingAddress = ctx.billingStreet
    ? [ctx.billingStreet, [ctx.billingZip, ctx.billingCity].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : null;
  let shippingAddress: string | null = null;
  let invoiceOverride: { invoice_name: string | null; invoice_address: string | null } | null = null;
  {
    const profileRow = userId ? await loadProfileAddressRow(supabase, userId) : null;
    if (deliveryMode === 'versand') shippingAddress = resolveShippingAddress(profileRow, ctxShipping);
    invoiceOverride = resolveInvoiceAddress(profileRow, ctxBillingAddress ? { name: (ctx.billingName as string) ?? null, address: ctxBillingAddress } : null);
  }

  // EINE Buchung für den gesamten Warenkorb. Tester-User → separater
  // Counter-Pool (siehe handleSingleBooking).
  const isTesterCart = intent.metadata?.tester === '1';
  const testModeForIdCart = isTesterCart || (await isTestMode());
  const bookingId = await generateBookingId({ isTest: testModeForIdCart });
  const firstItem = items[0];
  const productName = items.length === 1
    ? firstItem.productName
    : items.map((it) => it.productName).join(', ');

  // Zubehoer + Set qty-aware aggregieren (siehe confirm-cart fuer Details).
  type AccItem = { accessory_id: string; qty: number };
  const aggMap = new Map<string, number>();
  for (const it of items) {
    if (Array.isArray(it.accessoryItems) && it.accessoryItems.length > 0) {
      for (const ai of it.accessoryItems as AccItem[]) {
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
  const cartAccessoryItems: AccItem[] = [...aggMap.entries()]
    .map(([accessory_id, qty]) => ({ accessory_id, qty }));
  const allAccessories = itemsToLegacyIds(cartAccessoryItems);

  // is_test tester-bewusst setzen (siehe handleSingleBooking) — sonst blockiert
  // eine vom Webhook-Race angelegte Tester-Cart-Buchung den Live-Kalender.
  // testModeForIdCart = isTesterCart || isTestMode().
  // Sonderkondition (Kunden-Rabatt) serverseitig aus profiles auflösen
  // (maßgeblich). Sie ersetzt Mengen-/Frühbucher-/Treuerabatt. Basis = Miete +
  // Zubehör + Haftung (= Warenwert, konsistent zur Checkout-Anzeige).
  let cartSpecial = 0;
  if (userId) {
    try {
      const { data: spRow } = await supabase
        .from('profiles')
        .select('special_discount_percent, special_discount_valid_until')
        .eq('id', userId)
        .maybeSingle();
      const spPct = getActiveSpecialDiscountPercent({
        percent: (spRow as { special_discount_percent?: number | null } | null)?.special_discount_percent ?? null,
        validUntil: (spRow as { special_discount_valid_until?: string | null } | null)?.special_discount_valid_until ?? null,
      });
      if (spPct > 0) {
        const base = items.reduce((s, it) => s + it.priceRental + it.priceAccessories + it.priceHaftung, 0);
        cartSpecial = Math.round(base * spPct) / 100;
      }
    } catch { /* defensiv: Migration evtl. nicht durch */ }
  }
  const cartSpecialActive = cartSpecial > 0;
  const cartInsert: Record<string, unknown> = {
    id: bookingId,
    payment_intent_id: intent.id,
    is_test: testModeForIdCart,
    product_id: firstItem.productId,
    product_name: productName,
    rental_from: firstItem.rentalFrom,
    rental_to: firstItem.rentalTo,
    days: firstItem.days,
    delivery_mode: deliveryMode,
    shipping_method: deliveryMode === 'versand' ? shippingMethod : null,
    shipping_price: shippingPrice,
    haftung: firstItem.haftung,
    accessories: allAccessories,
    accessory_items: cartAccessoryItems.length > 0 ? cartAccessoryItems : null,
    price_rental: items.reduce((s, it) => s + it.priceRental, 0),
    price_accessories: items.reduce((s, it) => s + it.priceAccessories, 0),
    price_haftung: items.reduce((s, it) => s + it.priceHaftung, 0),
    price_total: intent.amount / 100,
    deposit: items.reduce((s, it) => s + it.deposit, 0),
    status: 'confirmed',
    user_id: userId,
    customer_email: customerEmail,
    customer_name: customerName,
    shipping_address: shippingAddress,
    ...(invoiceOverride
      ? { invoice_name: invoiceOverride.invoice_name, invoice_address: invoiceOverride.invoice_address }
      : {}),
    coupon_code: couponCode || null,
    discount_amount: discountAmount,
    duration_discount: cartSpecialActive ? 0 : durationDiscount,
    loyalty_discount: cartSpecialActive ? 0 : loyaltyDiscount,
    // Frühbucherrabatt — eigene Spalte (Migration ausstehend → Retry ohne sie).
    ...(earlyBirdDiscount > 0 && !cartSpecialActive ? { early_bird_discount: earlyBirdDiscount } : {}),
    // Sonderkondition — eigene Spalte (Migration ausstehend → Retry ohne sie).
    ...(cartSpecialActive ? { special_discount: cartSpecial } : {}),
  };

  let { error } = await supabase.from('bookings').insert(cartInsert);
  if (error && earlyBirdDiscount > 0 && /early_bird_discount|column|schema cache|PGRST/i.test(error.message)) {
    delete cartInsert.early_bird_discount;
    ({ error } = await supabase.from('bookings').insert(cartInsert));
  }
  if (error && cartSpecialActive && /special_discount|column|schema cache|PGRST/i.test(error.message)) {
    delete cartInsert.special_discount;
    ({ error } = await supabase.from('bookings').insert(cartInsert));
  }

  if (error) {
    console.error(`[Webhook] Cart-Buchung ${bookingId} Fehler:`, error);
    return;
  }

  // Plausibilitaet: Items-Summe + Versand - Rabatte gegen Stripe-Gesamtbetrag
  const expectedSumCents = Math.round(
    (items.reduce((s, it) => s + it.priceRental + it.priceAccessories + it.priceHaftung, 0) +
      shippingPrice -
      discountAmount -
      (cartSpecialActive ? cartSpecial : durationDiscount + earlyBirdDiscount + loyaltyDiscount)) * 100,
  );
  await verifyAmountConsistency(supabase, bookingId, intent.id, expectedSumCents, intent.amount);

  // Unit zuweisen (fuer Asset-Zeitwert im Vertrag)
  if (firstItem.productId && firstItem.rentalFrom && firstItem.rentalTo) {
    try {
      await assignCamerasToBooking(
        bookingId,
        items.map((it) => ({
          product_id: it.productId,
          product_name: it.productName,
          qty: 1,
        })),
        firstItem.rentalFrom,
        firstItem.rentalTo,
      );
    } catch (e) {
      console.error('[Webhook] camera-assign cart failed', bookingId, e);
    }
  }

  // Zubehoer-Exemplare zuweisen (non-blocking)
  if (cartAccessoryItems.length > 0 && firstItem.rentalFrom && firstItem.rentalTo) {
    try {
      await assignAccessoryUnitsToBooking(bookingId, cartAccessoryItems, firstItem.rentalFrom, firstItem.rentalTo);
    } catch (e) {
      console.error('[Webhook] accessory-unit-assign cart failed', bookingId, e);
    }
  }

  console.log(`[Webhook] Cart-Buchung ${bookingId} nachgeholt.`);

  // invoices-Row anlegen (non-blocking)
  try {
    const { storeInvoiceForBooking } = await import('@/lib/buchhaltung/store-invoice');
    await storeInvoiceForBooking(supabase, {
      id: bookingId,
      customer_email: customerEmail,
      customer_name: customerName,
      price_total: intent.amount / 100,
      price_rental: items.reduce((s, it) => s + it.priceRental, 0),
      price_accessories: items.reduce((s, it) => s + it.priceAccessories, 0),
      price_haftung: items.reduce((s, it) => s + it.priceHaftung, 0),
      shipping_price: shippingPrice,
      discount_amount: discountAmount,
      coupon_code: couponCode || null,
      payment_intent_id: intent.id,
      status: 'confirmed',
      is_test: testModeForIdCart,
      created_at: new Date().toISOString(),
    }, { taxMode: txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung', taxRate: parseFloat(txMap['tax_rate'] || '19') });
  } catch (err) {
    console.error('[Webhook] Cart-Rechnung-Anlage fehlgeschlagen:', err);
  }

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
        .update({ booking_count: (profile.booking_count ?? 0) + 1 })
        .eq('id', userId);
    }
  }

  // Admin-Notification schicken — so weiss der Admin sofort dass eine
  // Buchung reingekommen ist, auch wenn der Client-Redirect scheiterte.
  // Kunden-Bestaetigungs-E-Mail SCHICKT DER WEBHOOK NICHT — das macht
  // confirm-cart, weil nur dort die contractSignature verfuegbar ist und
  // der Mietvertrag mit in die E-Mail gepackt werden muss. Sonst bekaeme
  // der Kunde eine Bestaetigungs-E-Mail ohne Vertrag (Webhook war
  // schneller als confirm-cart), und der PDF-Anhang fehlt dauerhaft.
  if (customerEmail) {
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
      priceTotal: intent.amount / 100,
      deposit: items.reduce((s, it) => s + it.deposit, 0),
      shippingPrice,
      taxMode: (txMap['tax_mode'] as 'kleinunternehmer' | 'regelbesteuerung') || 'kleinunternehmer',
      taxRate: parseFloat(txMap['tax_rate'] || '19'),
      ustId: txMap['ust_id'] || '',
    };
    sendAdminNotification(emailData).catch((err) => console.error('[Webhook] Admin-Email-Fehler:', err));
  }

  // Checkout-Kontext aufraeumen
  Promise.resolve(
    supabase
      .from('admin_settings')
      .delete()
      .eq('key', `checkout_${intent.id}`)
  ).catch(() => {});
}

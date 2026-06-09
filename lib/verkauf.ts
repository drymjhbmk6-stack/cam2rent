/**
 * Verkauf-Modul: ein Zubehoer (typisch Speicherkarte) an einen Kunden
 * verkaufen statt vermieten.
 *
 * Ein Verkauf ist eine `bookings`-Row mit `booking_type='kauf'` und den
 * verkauften Artikeln in `sale_items`. Dadurch fliesst er automatisch in
 * Buchhaltung (EUeR/DATEV), invoices-Anlage und den awaiting_payment+
 * Webhook-Flow ein — ohne dass die Miet-Ansichten (Verfuegbarkeit, Gantt,
 * Versand) ihn faelschlich anzeigen.
 *
 * Ablauf createSale():
 *  1) Stripe Product + Price + Payment Link anlegen
 *  2) bookings-Row (status awaiting_payment) einfuegen
 *  3) invoices-Row anlegen (offen)
 *  4) Rechnung-PDF erzeugen + per E-Mail mit Zahlungslink verschicken
 *
 * Bezahlt der Kunde ueber den Link, flippt der Stripe-Webhook
 * (booking_type='kauf') die Buchung auf `confirmed` + markiert die
 * Rechnung als bezahlt.
 */

import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase';
import { generateBookingId } from '@/lib/booking-id';
import { getStripe, buildPaymentDescription } from '@/lib/stripe';
import { isTestMode } from '@/lib/env-mode';
import { getBerlinDateString } from '@/lib/timezone';
import { buildInvoiceData } from '@/lib/build-invoice-data';
import { InvoicePDF } from '@/lib/invoice-pdf';
import { storeInvoiceForBooking } from '@/lib/buchhaltung/store-invoice';
import { sendAndLog, escapeHtml, stripSubject } from '@/lib/email';
import { BUSINESS } from '@/lib/business-config';

export interface SaleLine {
  name: string;
  qty: number;
  unit_price: number;
}

export interface CreateSaleResult {
  success: boolean;
  bookingId?: string;
  paymentUrl?: string;
  emailSent?: boolean;
  error?: string;
  status?: number;
}

/** Normalisiert + validiert die Verkaufspositionen. */
function sanitizeLines(raw: unknown): SaleLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        name: String(o.name ?? '').trim().slice(0, 200),
        qty: Math.max(1, Math.min(999, Math.floor(Number(o.qty) || 1))),
        unit_price: Math.round((Number(o.unit_price) || 0) * 100) / 100,
      };
    })
    .filter((it) => it.name.length > 0);
}

/**
 * Legt einen Verkauf an und verschickt Rechnung + Zahlungslink.
 */
export async function createSale(opts: {
  customerName: string;
  customerEmail: string;
  userId: string | null;
  items: SaleLine[];
  sourceBookingId?: string | null;
}): Promise<CreateSaleResult> {
  const supabase = createServiceClient();

  const items = sanitizeLines(opts.items);
  if (items.length === 0) {
    return { success: false, error: 'Keine Verkaufsartikel angegeben.', status: 400 };
  }
  if (items.some((it) => it.unit_price <= 0)) {
    return { success: false, error: 'Jeder Artikel braucht einen Preis größer 0.', status: 400 };
  }
  const email = String(opts.customerEmail ?? '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { success: false, error: 'Gültige Kunden-E-Mail fehlt.', status: 400 };
  }
  const customerName = String(opts.customerName ?? '').trim().slice(0, 200);

  const total = Math.round(items.reduce((s, it) => s + it.unit_price * it.qty, 0) * 100) / 100;
  if (total <= 0) {
    return { success: false, error: 'Gesamtbetrag muss größer 0 sein.', status: 400 };
  }

  const testMode = await isTestMode();
  const bookingId = await generateBookingId({ isTest: testMode });
  const today = getBerlinDateString();
  const productName = ('Verkauf: ' + (
    items.length === 1 ? items[0].name : items.map((i) => i.name).join(', ')
  )).slice(0, 240);

  // ── Stripe Payment Link ───────────────────────────────────────────────
  let paymentLink: { id: string; url: string };
  try {
    const stripe = await getStripe();
    const amountCents = Math.round(total * 100);
    const stripeProduct = await stripe.products.create({
      name: `Verkauf ${bookingId}`.slice(0, 250),
      metadata: { booking_id: bookingId, booking_type: 'kauf' },
    });
    const stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: amountCents,
      currency: 'eur',
    });
    const description = buildPaymentDescription({ bookingId, productName });
    const pl = await stripe.paymentLinks.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      metadata: { booking_id: bookingId, booking_type: 'kauf' },
      payment_intent_data: {
        description,
        metadata: { booking_id: bookingId, booking_type: 'kauf' },
      },
      allow_promotion_codes: false,
      payment_method_types: ['card', 'paypal'],
      // Nur EINE Zahlung pro Link — verhindert Doppelbelastung, wenn der
      // Kunde den Link mehrfach oeffnet/bezahlt.
      restrictions: { completed_sessions: { limit: 1 } },
    });
    paymentLink = { id: pl.id, url: pl.url };
  } catch (stripeErr) {
    const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
    console.error('[verkauf] Stripe-Fehler:', msg);
    return { success: false, error: `Stripe-Fehler: ${msg}`, status: 502 };
  }

  // ── bookings-Row ──────────────────────────────────────────────────────
  const { error: insErr } = await supabase.from('bookings').insert({
    id: bookingId,
    payment_intent_id: `PENDING-${bookingId}`,
    is_test: testMode,
    booking_type: 'kauf',
    sale_items: items,
    product_id: '',
    product_name: productName,
    rental_from: today,
    rental_to: today,
    days: 1,
    delivery_mode: null,
    shipping_method: null,
    shipping_price: 0,
    haftung: 'none',
    accessories: [],
    accessory_items: null,
    price_rental: 0,
    price_accessories: total,
    price_haftung: 0,
    price_total: total,
    deposit: 0,
    status: 'awaiting_payment',
    user_id: opts.userId || null,
    customer_email: email,
    customer_name: customerName || null,
    stripe_payment_link_id: paymentLink.id,
    notes: `Verkauf${opts.sourceBookingId ? ` (Artikel aus Buchung ${opts.sourceBookingId})` : ''} — Zahlungslink: ${paymentLink.url}`,
  });

  if (insErr) {
    // Stripe-Link wieder deaktivieren, damit kein verwaister Link bleibt.
    try {
      const stripe = await getStripe();
      await stripe.paymentLinks.update(paymentLink.id, { active: false });
    } catch { /* best-effort */ }
    if (/booking_type|sale_items/i.test(insErr.message)) {
      return {
        success: false,
        error: 'Migration supabase-bookings-verkauf.sql ist noch nicht ausgeführt.',
        status: 503,
      };
    }
    console.error('[verkauf] Insert-Fehler:', insErr.message);
    return { success: false, error: `DB-Fehler: ${insErr.message}`, status: 500 };
  }

  // ── invoices-Row (offen) ──────────────────────────────────────────────
  try {
    await storeInvoiceForBooking(supabase, {
      id: bookingId,
      customer_email: email,
      customer_name: customerName || null,
      price_total: total,
      payment_intent_id: `PENDING-${bookingId}`,
      status: 'awaiting_payment',
      is_test: testMode,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[verkauf] storeInvoiceForBooking fehlgeschlagen:', err);
  }

  // ── Rechnung-PDF + E-Mail mit Zahlungslink ────────────────────────────
  let emailSent = false;
  let emailError: string | undefined;
  try {
    await dispatchSaleInvoice(supabase, bookingId);
    emailSent = true;
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error('[verkauf] dispatchSaleInvoice fehlgeschlagen:', emailError);
  }

  return { success: true, bookingId, paymentUrl: paymentLink.url, emailSent, error: emailError };
}

/**
 * Erzeugt die Verkaufs-Rechnung als PDF und verschickt sie mit dem
 * Stripe-Zahlungslink an den Kunden. Wird von createSale() sowie vom
 * "Erneut senden"-Pfad genutzt.
 */
export async function dispatchSaleInvoice(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) throw new Error('Verkauf nicht gefunden.');
  if (!booking.customer_email) throw new Error('Keine Kunden-E-Mail hinterlegt.');

  // Aktuelle Zahlungslink-URL frisch von Stripe holen.
  let paymentUrl = '';
  if (booking.stripe_payment_link_id) {
    try {
      const stripe = await getStripe();
      const pl = await stripe.paymentLinks.retrieve(booking.stripe_payment_link_id);
      paymentUrl = pl.url ?? '';
    } catch (err) {
      console.warn('[verkauf] Zahlungslink konnte nicht geladen werden:', err);
    }
  }

  const invoiceData = await buildInvoiceData(supabase, booking);
  const pdfBuffer = await renderToBuffer(
    createElement(InvoicePDF, { data: invoiceData }) as ReactElement<DocumentProps>,
  );

  const total = Number(booking.price_total ?? 0);
  const items = Array.isArray(booking.sale_items)
    ? (booking.sale_items as SaleLine[])
    : [];
  const safeName = escapeHtml(booking.customer_name || 'dort');
  const safeInvoiceNr = escapeHtml(invoiceData.invoiceNumber ?? bookingId);
  const safeTotal = escapeHtml(total.toFixed(2).replace('.', ','));
  const safePaymentUrl = escapeHtml(paymentUrl);

  const itemRows = items
    .map((it) => {
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      const line = (Number(it.unit_price) || 0) * qty;
      return `<tr>
        <td style="padding:6px 0;color:#1a1a1a;">${escapeHtml(it.name)}${qty > 1 ? ` &times; ${qty}` : ''}</td>
        <td style="padding:6px 0;text-align:right;color:#1a1a1a;">${escapeHtml(line.toFixed(2).replace('.', ','))}&nbsp;€</td>
      </tr>`;
    })
    .join('');

  const payButton = paymentUrl
    ? `<div style="text-align:center;margin:24px 0;">
        <a href="${safePaymentUrl}" style="display:inline-block;background:#3b82f6;color:#fff;font-weight:700;font-size:16px;padding:14px 36px;border-radius:10px;text-decoration:none;">
          Jetzt bezahlen
        </a>
      </div>`
    : '';

  const html = `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-weight:900;font-size:20px;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
      </div>
      <h1 style="font-size:22px;font-weight:700;margin-bottom:8px;">Deine Rechnung ${safeInvoiceNr}</h1>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin-bottom:20px;">
        Hallo ${safeName},<br/>
        anbei findest du deine Rechnung über deinen Kauf bei cam2rent. Die
        Rechnung ist auch als PDF angehängt.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">${itemRows}</table>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;margin-bottom:8px;">
        <tr>
          <td style="padding:10px 0;font-weight:700;font-size:16px;">Gesamtbetrag</td>
          <td style="padding:10px 0;text-align:right;font-weight:700;font-size:16px;">${safeTotal}&nbsp;€</td>
        </tr>
      </table>
      ${payButton}
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0 0 24px;">
        ${paymentUrl
          ? 'Bitte begleiche den Betrag bequem über den Button oben (Kreditkarte oder PayPal).'
          : 'Den Zahlungslink senden wir dir in einer separaten Nachricht zu.'}
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
      <p style="color:#94a3b8;font-size:11px;line-height:1.5;margin:0;text-align:center;">
        ${escapeHtml(BUSINESS.owner)} &middot; ${escapeHtml(BUSINESS.street)} &middot; ${escapeHtml(BUSINESS.zip)} ${escapeHtml(BUSINESS.city)}<br/>
        ${escapeHtml(BUSINESS.emailKontakt)} &middot; ${escapeHtml(BUSINESS.phone)}
      </p>
    </div>
  `;

  const text = [
    `Hallo ${booking.customer_name || 'dort'},`,
    '',
    `anbei deine Rechnung ${invoiceData.invoiceNumber ?? bookingId} über deinen Kauf bei cam2rent.`,
    `Gesamtbetrag: ${total.toFixed(2).replace('.', ',')} EUR`,
    '',
    ...(paymentUrl ? ['Jetzt bezahlen:', paymentUrl, ''] : []),
    '--',
    `${BUSINESS.owner}`,
    `${BUSINESS.street}, ${BUSINESS.zip} ${BUSINESS.city}`,
    `${BUSINESS.emailKontakt} · ${BUSINESS.phone}`,
  ].join('\n');

  await sendAndLog({
    to: booking.customer_email,
    subject: stripSubject(`Deine Rechnung ${invoiceData.invoiceNumber ?? bookingId} — cam2rent`),
    html,
    text,
    attachments: [{ filename: `Rechnung-${bookingId}.pdf`, content: Buffer.from(pdfBuffer) }],
    bookingId,
    emailType: 'kauf_rechnung',
  });
}

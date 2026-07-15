/**
 * Schaden-Rechnung: dem Kunden eine echte Rechnung (mit Rechnungsnummer →
 * Buchhaltung/EÜR/DATEV) über einen Schadensbetrag stellen + Stripe-Zahlungslink.
 *
 * Technisch nutzt eine Schaden-Rechnung dieselbe Pipeline wie ein Verkauf
 * (`bookings`-Row mit `booking_type='kauf'` + `sale_items`). Dadurch greifen
 * Rechnungsnummer, invoices-Anlage, EÜR/DATEV und der Stripe-Webhook
 * automatisch — und die Miet-Ansichten (Verfügbarkeit, Gantt, Versand,
 * awaiting-payment-cancel) blenden sie ohnehin aus (booking_type='kauf').
 *
 * Damit die Rechnung nicht wie ein "Kauf" aussieht, trägt der product_name
 * den Marker "Schadensrechnung: …" — build-invoice-data setzt daraufhin die
 * sauberen Labels ("Schadensposition" / "Rechnungsdatum").
 *
 * Die Kunden-E-Mail geht NUR raus, wenn notifyCustomer=true.
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

export interface CreateDamageInvoiceResult {
  success: boolean;
  bookingId?: string;
  paymentUrl?: string;
  emailSent?: boolean;
  emailError?: string;
  error?: string;
  status?: number;
}

/** Kurzform der Schadensbeschreibung für Position + Betreff. */
function shortDesc(raw: string): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export async function createDamageInvoice(opts: {
  sourceBookingId: string;
  customerName: string;
  customerEmail: string;
  userId: string | null;
  amount: number;
  description: string;
  notifyCustomer: boolean;
}): Promise<CreateDamageInvoiceResult> {
  const supabase = createServiceClient();

  const amount = Math.round((Number(opts.amount) || 0) * 100) / 100;
  if (amount <= 0) {
    return { success: false, error: 'Betrag muss größer 0 sein.', status: 400 };
  }
  const email = String(opts.customerEmail ?? '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { success: false, error: 'Gültige Kunden-E-Mail fehlt.', status: 400 };
  }
  const customerName = String(opts.customerName ?? '').trim().slice(0, 200);
  const desc = shortDesc(opts.description);

  const lineName = desc
    ? `Schadensersatz — ${desc}`.slice(0, 200)
    : `Schadensersatz zu Buchung ${opts.sourceBookingId}`.slice(0, 200);
  const items = [{ name: lineName, qty: 1, unit_price: amount }];

  const testMode = await isTestMode();
  const bookingId = await generateBookingId({ isTest: testMode });
  const today = getBerlinDateString();
  // Marker "Schadensrechnung:" steuert die Beschriftung in build-invoice-data.
  const productName = `Schadensrechnung: ${desc || `Buchung ${opts.sourceBookingId}`}`.slice(0, 240);

  // ── Stripe Payment Link ────────────────────────────────────────────────
  let paymentLink: { id: string; url: string };
  try {
    const stripe = await getStripe();
    const amountCents = Math.round(amount * 100);
    const stripeProduct = await stripe.products.create({
      name: `Schadensrechnung ${bookingId}`.slice(0, 250),
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
      restrictions: { completed_sessions: { limit: 1 } },
    });
    paymentLink = { id: pl.id, url: pl.url };
  } catch (stripeErr) {
    const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
    console.error('[schaden-rechnung] Stripe-Fehler:', msg);
    return { success: false, error: `Stripe-Fehler: ${msg}`, status: 502 };
  }

  // ── bookings-Row (booking_type='kauf') ─────────────────────────────────
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
    price_accessories: amount,
    price_haftung: 0,
    price_total: amount,
    deposit: 0,
    status: 'awaiting_payment',
    user_id: opts.userId || null,
    customer_email: email,
    customer_name: customerName || null,
    stripe_payment_link_id: paymentLink.id,
    notes: `Schaden-Rechnung zu Buchung ${opts.sourceBookingId} — Zahlungslink: ${paymentLink.url}`,
  });

  if (insErr) {
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
    console.error('[schaden-rechnung] Insert-Fehler:', insErr.message);
    return { success: false, error: `DB-Fehler: ${insErr.message}`, status: 500 };
  }

  // ── invoices-Row (offen) ───────────────────────────────────────────────
  try {
    await storeInvoiceForBooking(supabase, {
      id: bookingId,
      customer_email: email,
      customer_name: customerName || null,
      price_total: amount,
      payment_intent_id: `PENDING-${bookingId}`,
      status: 'awaiting_payment',
      is_test: testMode,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[schaden-rechnung] storeInvoiceForBooking fehlgeschlagen:', err);
  }

  // ── Optional: Rechnung-PDF + E-Mail mit Zahlungslink ───────────────────
  let emailSent = false;
  let emailError: string | undefined;
  if (opts.notifyCustomer) {
    try {
      await dispatchDamageInvoice(supabase, bookingId, opts.sourceBookingId);
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error('[schaden-rechnung] dispatchDamageInvoice fehlgeschlagen:', emailError);
    }
  }

  return { success: true, bookingId, paymentUrl: paymentLink.url, emailSent, emailError };
}

/**
 * Erzeugt die Schaden-Rechnung als PDF und verschickt sie mit dem
 * Stripe-Zahlungslink an den Kunden (Schaden-Wortlaut). Wird von
 * createDamageInvoice() (bei notifyCustomer) sowie dem "Erneut senden"-Pfad
 * genutzt.
 */
export async function dispatchDamageInvoice(
  supabase: SupabaseClient,
  bookingId: string,
  sourceBookingId?: string,
): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) throw new Error('Schaden-Rechnung nicht gefunden.');
  if (!booking.customer_email) throw new Error('Keine Kunden-E-Mail hinterlegt.');

  let paymentUrl = '';
  if (booking.stripe_payment_link_id) {
    try {
      const stripe = await getStripe();
      const pl = await stripe.paymentLinks.retrieve(booking.stripe_payment_link_id);
      paymentUrl = pl.url ?? '';
    } catch (err) {
      console.warn('[schaden-rechnung] Zahlungslink konnte nicht geladen werden:', err);
    }
  }

  const invoiceData = await buildInvoiceData(supabase, booking);
  const pdfBuffer = await renderToBuffer(
    createElement(InvoicePDF, { data: invoiceData }) as ReactElement<DocumentProps>,
  );

  const total = Number(booking.price_total ?? 0);
  const items = Array.isArray(booking.sale_items)
    ? (booking.sale_items as Array<{ name: string; qty: number; unit_price: number }>)
    : [];
  const safeName = escapeHtml(booking.customer_name || 'dort');
  const safeInvoiceNr = escapeHtml(invoiceData.invoiceNumber ?? bookingId);
  const safeTotal = escapeHtml(total.toFixed(2).replace('.', ','));
  const safePaymentUrl = escapeHtml(paymentUrl);
  const bezug = sourceBookingId
    ? ` zu deiner Buchung <strong>${escapeHtml(sourceBookingId)}</strong>`
    : '';

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
      <h1 style="font-size:22px;font-weight:700;margin-bottom:8px;">Rechnung ${safeInvoiceNr} — Schadensabwicklung</h1>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin-bottom:20px;">
        Hallo ${safeName},<br/>
        anbei erhältst du die Rechnung über den festgestellten Schaden${bezug}.
        Die Rechnung ist auch als PDF angehängt.
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
          ? 'Bitte begleiche den Betrag bequem über den Button oben (Kreditkarte oder PayPal). Bei Fragen zum Schaden antworte einfach auf diese E-Mail.'
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
    `anbei die Rechnung ${invoiceData.invoiceNumber ?? bookingId} über den festgestellten Schaden${sourceBookingId ? ` zu deiner Buchung ${sourceBookingId}` : ''}.`,
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
    subject: stripSubject(`Rechnung ${invoiceData.invoiceNumber ?? bookingId} — Schadensabwicklung cam2rent`),
    html,
    text,
    attachments: [{ filename: `Schaden-Rechnung-${bookingId}.pdf`, content: Buffer.from(pdfBuffer) }],
    bookingId,
    emailType: 'schaden_rechnung',
  });
}

/**
 * Schadensersatz-Forderung: dem Kunden die von ihm verursachten
 * Reparaturkosten (brutto) als ECHTEN Schadensersatz in Rechnung stellen —
 * über eine Zahlungsaufforderung/Kostenaufstellung, NICHT über eine
 * Ausgangsrechnung.
 *
 * Fachlicher Hintergrund (Kleinunternehmer § 19 UStG, EÜR):
 *  - Echter Schadensersatz ist KEIN Leistungsaustausch → kein steuerbarer
 *    Umsatz, keine Rechnung mit fortlaufender Rechnungsnummer, kein
 *    USt-Ausweis. Das Kundendokument ist eine Zahlungsaufforderung.
 *  - Die Erstattung ist trotzdem eine Betriebseinnahme (die Kamera ist
 *    Betriebsvermögen, die Reparatur war Betriebsausgabe). Sie fließt über
 *    die `bookings`-Zeile in die EÜR — daher legen wir eine Zeile an, aber
 *    KEINE `invoices`-Row (kein Rechnungs-Ledger-Eintrag).
 *  - Die vom Betrieb bezahlte Reparaturrechnung bucht der Unternehmer separat
 *    als Betriebsausgabe (Belege/Einkauf-Modul, brutto, bei Zahlung).
 *
 * Technisch nutzen wir die `booking_type='kauf'`-Mechanik nur als
 * Einnahme-/Zahlungslink-Träger (EÜR/DATEV zählen die bookings-Zeile; die
 * Miet-Ansichten blenden kauf ohnehin aus). Das Kundendokument ist aber eine
 * eigene Zahlungsaufforderung (SchadensersatzPDF), keine Rechnung.
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
import { SchadensersatzPDF } from '@/lib/schadensersatz-pdf';
import { sendAndLog, escapeHtml, stripSubject } from '@/lib/email';
import { BUSINESS } from '@/lib/business-config';

export interface RepairInvoiceAttachment {
  filename: string;
  content: Buffer;
}

export interface CreateDamageChargeResult {
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
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function isoToDe(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

/**
 * Legt eine Schadensersatz-Forderung an (Betriebseinnahme + Stripe-Zahlungslink)
 * und verschickt optional die Zahlungsaufforderung an den Kunden.
 */
export async function createDamageCharge(opts: {
  sourceBookingId: string;
  customerName: string;
  customerEmail: string;
  customerAddress?: string;
  userId: string | null;
  amount: number;
  description: string;
  notifyCustomer: boolean;
  repairInvoice?: RepairInvoiceAttachment | null;
}): Promise<CreateDamageChargeResult> {
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
  const positionText = desc
    ? `Schadensersatz für Reparatur: ${desc}`.slice(0, 240)
    : `Schadensersatz für Reparatur (Buchung ${opts.sourceBookingId})`;

  const testMode = await isTestMode();
  const bookingId = await generateBookingId({ isTest: testMode });
  const today = getBerlinDateString();
  // Marker "Schadensersatz:" → build-invoice-data/interne Ansichten wissen,
  // dass dies KEIN normaler Verkauf ist.
  const productName = `Schadensersatz: ${desc || `Buchung ${opts.sourceBookingId}`}`.slice(0, 240);

  // ── Stripe Payment Link ────────────────────────────────────────────────
  let paymentLink: { id: string; url: string };
  try {
    const stripe = await getStripe();
    const amountCents = Math.round(amount * 100);
    const stripeProduct = await stripe.products.create({
      name: `Schadensersatz ${bookingId}`.slice(0, 250),
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
    console.error('[schadensersatz] Stripe-Fehler:', msg);
    return { success: false, error: `Stripe-Fehler: ${msg}`, status: 502 };
  }

  // ── bookings-Row (booking_type='kauf' als Einnahme-Träger, KEINE invoices) ─
  const { error: insErr } = await supabase.from('bookings').insert({
    id: bookingId,
    payment_intent_id: `PENDING-${bookingId}`,
    is_test: testMode,
    booking_type: 'kauf',
    sale_items: [{ name: positionText, qty: 1, unit_price: amount }],
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
    notes: `Schadensersatz-Forderung zu Buchung ${opts.sourceBookingId} — Zahlungslink: ${paymentLink.url}`,
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
    console.error('[schadensersatz] Insert-Fehler:', insErr.message);
    return { success: false, error: `DB-Fehler: ${insErr.message}`, status: 500 };
  }

  // Bewusst KEIN storeInvoiceForBooking: echter Schadensersatz bekommt keine
  // Ausgangsrechnung / Rechnungsnummer. Die Betriebseinnahme kommt über die
  // bookings-Zeile in die EÜR.

  // ── Optional: Zahlungsaufforderung-PDF + E-Mail mit Zahlungslink ────────
  let emailSent = false;
  let emailError: string | undefined;
  if (opts.notifyCustomer) {
    try {
      await dispatchDamageCharge(supabase, bookingId, {
        sourceBookingId: opts.sourceBookingId,
        customerAddress: opts.customerAddress,
        positionText,
        repairInvoice: opts.repairInvoice ?? null,
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error('[schadensersatz] dispatchDamageCharge fehlgeschlagen:', emailError);
    }
  }

  return { success: true, bookingId, paymentUrl: paymentLink.url, emailSent, emailError };
}

/**
 * Erzeugt die Zahlungsaufforderung (Schadensersatz) als PDF und verschickt sie
 * mit dem Stripe-Zahlungslink an den Kunden. Optional wird die Kopie der
 * Reparaturrechnung mit angehängt (Punkt 3: Beleg-Verknüpfung).
 */
export async function dispatchDamageCharge(
  supabase: SupabaseClient,
  bookingId: string,
  opts: {
    sourceBookingId: string;
    customerAddress?: string;
    positionText: string;
    repairInvoice?: RepairInvoiceAttachment | null;
  },
): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_name, customer_email, price_total, created_at, stripe_payment_link_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) throw new Error('Schadensersatz-Vorgang nicht gefunden.');
  if (!booking.customer_email) throw new Error('Keine Kunden-E-Mail hinterlegt.');

  let paymentUrl = '';
  if (booking.stripe_payment_link_id) {
    try {
      const stripe = await getStripe();
      const pl = await stripe.paymentLinks.retrieve(booking.stripe_payment_link_id);
      paymentUrl = pl.url ?? '';
    } catch (err) {
      console.warn('[schadensersatz] Zahlungslink konnte nicht geladen werden:', err);
    }
  }

  const amount = Number(booking.price_total ?? 0);
  const datum = isoToDe(getBerlinDateString(booking.created_at ? new Date(booking.created_at) : undefined));

  const pdfBuffer = await renderToBuffer(
    createElement(SchadensersatzPDF, {
      data: {
        vorgangsNr: bookingId,
        datum,
        customerName: booking.customer_name || '',
        customerAddress: opts.customerAddress,
        sourceBookingId: opts.sourceBookingId,
        positionText: opts.positionText,
        amount,
        hasRepairInvoiceCopy: !!opts.repairInvoice,
      },
    }) as ReactElement<DocumentProps>,
  );

  const safeName = escapeHtml(booking.customer_name || 'dort');
  const safeVorgang = escapeHtml(bookingId);
  const safeSource = escapeHtml(opts.sourceBookingId);
  const safeTotal = escapeHtml(amount.toFixed(2).replace('.', ','));
  const safePaymentUrl = escapeHtml(paymentUrl);

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
      <h1 style="font-size:22px;font-weight:700;margin-bottom:8px;">Zahlungsaufforderung – Schadensersatz</h1>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin-bottom:20px;">
        Hallo ${safeName},<br/>
        an der Ausrüstung deiner Buchung <strong>${safeSource}</strong> ist ein Schaden entstanden.
        Die dadurch angefallenen Reparaturkosten machen wir hiermit als Schadensersatz geltend.
        Die Zahlungsaufforderung${opts.repairInvoice ? ' und eine Kopie der Reparaturrechnung liegen' : ' liegt'} als PDF bei.
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;margin-bottom:8px;">
        <tr>
          <td style="padding:10px 0;font-weight:700;font-size:16px;">Zu zahlen (Schadensersatz)</td>
          <td style="padding:10px 0;text-align:right;font-weight:700;font-size:16px;">${safeTotal}&nbsp;€</td>
        </tr>
      </table>
      ${payButton}
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0 0 8px;">
        ${paymentUrl
          ? 'Bitte begleiche den Betrag über den Button oben (Karte/PayPal) oder per Überweisung (Details im PDF).'
          : 'Die Bankverbindung findest du im angehängten PDF.'}
      </p>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0 0 24px;">
        Vorgangsnummer: ${safeVorgang}
      </p>
      <p style="color:#94a3b8;font-size:11px;line-height:1.5;margin:0 0 16px;text-align:center;">
        Es handelt sich um echten Schadensersatz (kein Leistungsaustausch), daher ohne Umsatzsteuerausweis
        (§ 19 UStG). Bei Fragen zum Schaden antworte einfach auf diese E-Mail.
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
    `an der Ausrüstung deiner Buchung ${opts.sourceBookingId} ist ein Schaden entstanden.`,
    `Wir machen die Reparaturkosten als Schadensersatz geltend.`,
    `Zu zahlen: ${amount.toFixed(2).replace('.', ',')} EUR`,
    `Vorgangsnummer: ${bookingId}`,
    '',
    ...(paymentUrl ? ['Jetzt bezahlen:', paymentUrl, ''] : []),
    'Echter Schadensersatz, kein Leistungsaustausch, ohne Umsatzsteuerausweis (§ 19 UStG).',
    '--',
    `${BUSINESS.owner}`,
    `${BUSINESS.street}, ${BUSINESS.zip} ${BUSINESS.city}`,
    `${BUSINESS.emailKontakt} · ${BUSINESS.phone}`,
  ].join('\n');

  const attachments: { filename: string; content: Buffer }[] = [
    { filename: `Zahlungsaufforderung-Schadensersatz-${bookingId}.pdf`, content: Buffer.from(pdfBuffer) },
  ];
  if (opts.repairInvoice) {
    attachments.push({
      filename: opts.repairInvoice.filename || `Reparaturrechnung-${bookingId}.pdf`,
      content: opts.repairInvoice.content,
    });
  }

  await sendAndLog({
    to: booking.customer_email,
    subject: stripSubject(`Zahlungsaufforderung Schadensersatz ${bookingId} — cam2rent`),
    html,
    text,
    attachments,
    bookingId,
    emailType: 'schadensersatz_forderung',
  });
}

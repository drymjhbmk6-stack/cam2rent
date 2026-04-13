import { Resend } from 'resend';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { InvoicePDF, type InvoiceData } from '@/lib/invoice-pdf';
import { BUSINESS } from '@/lib/business-config';
import { createServiceClient } from '@/lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_EMAIL =
  process.env.FROM_EMAIL ?? BUSINESS.email;

export const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ?? BUSINESS.emailKontakt;

// ─── Email Log Helper ────────────────────────────────────────────────────────

async function logEmail(params: {
  bookingId?: string | null;
  customerEmail: string;
  emailType: string;
  subject: string;
  status: 'sent' | 'failed';
  resendMessageId?: string | null;
  errorMessage?: string | null;
}) {
  try {
    const supabase = createServiceClient();
    await supabase.from('email_log').insert({
      booking_id: params.bookingId || null,
      customer_email: params.customerEmail,
      email_type: params.emailType,
      subject: params.subject,
      status: params.status,
      resend_message_id: params.resendMessageId || null,
      error_message: params.errorMessage || null,
    });
  } catch {
    // Fire-and-forget — kein Fehler soll die Email blockieren
  }
}

/** Sendet eine Email via Resend und loggt das Ergebnis */
export async function sendAndLog(opts: {
  to: string;
  subject: string;
  html: string;
  bookingId?: string | null;
  emailType: string;
  attachments?: { filename: string; content: Buffer }[];
}) {
  try {
    const result = await resend.emails.send({
      from: `${BUSINESS.name} <${FROM_EMAIL}>`,
      replyTo: ADMIN_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });
    await logEmail({
      bookingId: opts.bookingId,
      customerEmail: opts.to,
      emailType: opts.emailType,
      subject: opts.subject,
      status: 'sent',
      resendMessageId: result.data?.id,
    });
  } catch (err) {
    await logEmail({
      bookingId: opts.bookingId,
      customerEmail: opts.to,
      emailType: opts.emailType,
      subject: opts.subject,
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Unbekannt',
    });
    throw err;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BookingEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  rentalFrom: string;       // 'YYYY-MM-DD'
  rentalTo: string;         // 'YYYY-MM-DD'
  days: number;
  deliveryMode: 'versand' | 'abholung';
  shippingMethod?: string;
  haftung: string;          // 'none' | 'standard' | 'premium'
  accessories: string[];
  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  priceTotal: number;
  deposit: number;
  shippingPrice: number;
  taxMode?: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  ustId?: string;
}

// ─── Send functions ───────────────────────────────────────────────────────────

export async function sendBookingConfirmation(data: BookingEmailData, contractPdfBuffer?: Buffer) {
  const { html, subject } = buildCustomerEmail(data);

  // Generate PDF invoice as attachment
  const invoiceDate = new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const invoiceData: InvoiceData = {
    bookingId: data.bookingId,
    invoiceDate,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    productName: data.productName,
    rentalFrom: data.rentalFrom,
    rentalTo: data.rentalTo,
    days: data.days,
    deliveryMode: data.deliveryMode,
    shippingMethod: data.shippingMethod,
    haftung: data.haftung,
    accessories: data.accessories,
    priceRental: data.priceRental,
    priceAccessories: data.priceAccessories,
    priceHaftung: data.priceHaftung,
    shippingPrice: data.shippingPrice,
    priceTotal: data.priceTotal,
    deposit: data.deposit,
    taxMode: data.taxMode,
    taxRate: data.taxRate,
    ustId: data.ustId,
  };
  const pdfBuffer = await renderToBuffer(
    createElement(InvoicePDF, { data: invoiceData }) as ReactElement<DocumentProps>
  );
  const invoiceNumber = data.bookingId.replace('BK-', 'RE-');
  const contractNumber = data.bookingId.replace('BK-', 'MV-');

  const attachments: { filename: string; content: Buffer }[] = [
    { filename: `Rechnung-${invoiceNumber}.pdf`, content: pdfBuffer },
  ];

  if (contractPdfBuffer) {
    attachments.push({ filename: `Mietvertrag-${contractNumber}.pdf`, content: contractPdfBuffer });
  }

  await sendAndLog({
    to: data.customerEmail, subject, html, bookingId: data.bookingId, emailType: 'booking_confirmation',
    attachments,
  });
}

// ─── Cancellation types ───────────────────────────────────────────────────────

export interface CancellationEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  productId: string;
  rentalFrom: string;   // 'YYYY-MM-DD'
  rentalTo: string;
  days: number;
  priceTotal: number;
  refundAmount: number;
  refundPercentage: number; // 0 | 0.5 | 1
}

export async function sendCancellationConfirmation(data: CancellationEmailData) {
  const { html, subject } = buildCancellationCustomerEmail(data);
  await sendAndLog({ to: data.customerEmail, subject, html, bookingId: data.bookingId, emailType: 'cancellation_customer' });
}

export async function sendAdminCancellationNotification(data: CancellationEmailData) {
  const { html, subject } = buildCancellationAdminEmail(data);
  await sendAndLog({ to: ADMIN_EMAIL, subject, html, bookingId: data.bookingId, emailType: 'cancellation_admin' });
}

export async function sendAdminNotification(data: BookingEmailData) {
  const { html, subject } = buildAdminEmail(data);
  await sendAndLog({ to: ADMIN_EMAIL, subject, html, bookingId: data.bookingId, emailType: 'booking_admin' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function haftungLabel(h: string) {
  if (h === 'standard') return 'Standard-Haftungsoption';
  if (h === 'premium') return 'Premium-Haftungsoption';
  return 'Keine Haftungsbegrenzung';
}

function shippingLabel(method: string | undefined, mode: string) {
  if (mode === 'abholung') return 'Selbst abholen';
  if (method === 'express') return 'Express-Versand (1–2 Werktage)';
  return 'Standard-Versand (3–5 Werktage)';
}

// ─── Customer email template ───────────────────────────────────────────────────

function buildCustomerEmail(d: BookingEmailData): { html: string; subject: string } {
  const subject = `Buchungsbestätigung ${d.bookingId} – ${BUSINESS.name}`;

  const accessoriesRow = d.accessories.length > 0
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Zubehör</td><td style="padding:6px 0;text-align:right;font-size:14px;">${fmt(d.priceAccessories)}</td></tr>`
    : '';

  const haftungRow = d.priceHaftung > 0
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">${haftungLabel(d.haftung)}</td><td style="padding:6px 0;text-align:right;font-size:14px;">${fmt(d.priceHaftung)}</td></tr>`
    : '';

  const shippingRow = d.shippingPrice > 0
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Versandkosten</td><td style="padding:6px 0;text-align:right;font-size:14px;">${fmt(d.shippingPrice)}</td></tr>`
    : '';

  const depositNote = d.deposit > 0
    ? `<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">* Kaution ${fmt(d.deposit)} wird nach Rückgabe erstattet.</p>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:28px 32px;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${BUSINESS.name}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">Action-Cam Verleih</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Deine Buchung ist bestätigt!</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">Hallo ${d.customerName || 'Kunde'},<br>vielen Dank für deine Buchung bei ${BUSINESS.name}. Hier sind alle Details:</p>

          <!-- Booking ID -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Buchungsnummer</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#0a0a0a;">${d.bookingId}</p>
            </td></tr>
          </table>

          <!-- Product & Dates -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Kamera</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${d.productName}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Zeitraum</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${fmtDate(d.rentalFrom)} – ${fmtDate(d.rentalTo)} (${d.days} ${d.days === 1 ? 'Tag' : 'Tage'})</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Lieferung</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${shippingLabel(d.shippingMethod, d.deliveryMode)}</p>
              </td>
            </tr>
          </table>

          <!-- Price breakdown -->
          <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0a0a0a;">Kostenübersicht</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Kamera-Miete (${d.days} ${d.days === 1 ? 'Tag' : 'Tage'})</td><td style="padding:6px 0;text-align:right;font-size:14px;">${fmt(d.priceRental)}</td></tr>
            ${accessoriesRow}
            ${haftungRow}
            ${shippingRow}
            <tr><td colspan="2" style="padding:4px 0;border-top:1px solid #e5e7eb;"></td></tr>
            <tr>
              <td style="padding:8px 0;font-weight:700;color:#0a0a0a;font-size:15px;">Gesamtbetrag</td>
              <td style="padding:8px 0;text-align:right;font-weight:700;color:#0a0a0a;font-size:15px;">${fmt(d.priceTotal)}</td>
            </tr>
            ${d.deposit > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">inkl. Kaution*</td><td style="padding:4px 0;text-align:right;color:#6b7280;font-size:13px;">${fmt(d.deposit)}</td></tr>` : ''}
          </table>
          ${depositNote}

          <!-- Next steps -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:10px;margin-top:24px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:0.8px;">Wie geht es weiter?</p>
              <p style="margin:0 0 6px;font-size:14px;color:#374151;">1. Wir bereiten deine Kamera sorgfältig vor</p>
              <p style="margin:0 0 6px;font-size:14px;color:#374151;">2. Du wirst über Versand oder Abholtermin informiert</p>
              <p style="margin:0;font-size:14px;color:#374151;">3. Viel Spaß mit deiner Action-Cam!</p>
            </td></tr>
          </table>

          <!-- Cancellation policy -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Stornierungsbedingungen</p>
              <p style="margin:0 0 4px;font-size:13px;color:#374151;">≥ 7 Tage vor Mietstart: kostenlose Stornierung (100 % Rückerstattung)</p>
              <p style="margin:0 0 4px;font-size:13px;color:#374151;">3–6 Tage vor Mietstart: 50 % Stornogebühren, Stornierung nur per E-Mail</p>
              <p style="margin:0 0 8px;font-size:13px;color:#374151;">≤ 2 Tage vor Mietstart: keine Rückerstattung möglich</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">Gemäß § 312g Abs. 2 Nr. 9 BGB besteht für zeitgebundene Mietverträge kein gesetzliches Widerrufsrecht.</p>
            </td></tr>
          </table>

          <p style="margin:0;font-size:14px;color:#6b7280;">Bei Fragen stehen wir dir gerne zur Verfügung:<br><a href="mailto:${ADMIN_EMAIL}" style="color:#3b82f6;">${ADMIN_EMAIL}</a></p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${BUSINESS.name} · ${BUSINESS.slogan} · <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, subject };
}

// ─── Admin notification email ──────────────────────────────────────────────────

function buildAdminEmail(d: BookingEmailData): { html: string; subject: string } {
  const subject = `Neue Buchung: ${d.bookingId} – ${d.productName}`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">Neue Buchung eingegangen</p>
          <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">${d.bookingId}</p>
        </td></tr>

        <tr><td style="background:#ffffff;padding:32px;">

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;width:40%;">Buchungsnummer</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#0a0a0a;">${d.bookingId}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kunde</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${d.customerName || '–'}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">E-Mail</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;"><a href="mailto:${d.customerEmail}" style="color:#3b82f6;">${d.customerEmail}</a></td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kamera</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${d.productName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Zeitraum</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${fmtDate(d.rentalFrom)} – ${fmtDate(d.rentalTo)} (${d.days} Tage)</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Lieferung</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${shippingLabel(d.shippingMethod, d.deliveryMode)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Haftung</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${haftungLabel(d.haftung)}</td>
            </tr>
            ${d.accessories.length > 0 ? `<tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Zubehör</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${d.accessories.join(', ')}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#6b7280;">Gesamtbetrag</td>
              <td style="padding:8px 0;font-size:15px;font-weight:700;color:#0a0a0a;">${fmt(d.priceTotal)}</td>
            </tr>
          </table>

        </td></tr>

        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${BUSINESS.name} Admin-Benachrichtigung</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, subject };
}

// ─── Cancellation customer email ───────────────────────────────────────────────

function buildCancellationCustomerEmail(d: CancellationEmailData): { html: string; subject: string } {
  const subject = `Stornierungsbestätigung ${d.bookingId} – ${BUSINESS.name}`;

  const refundRow = d.refundAmount > 0
    ? `<tr>
        <td style="padding:8px 0;font-size:15px;font-weight:700;color:#16a34a;">Rückerstattung</td>
        <td style="padding:8px 0;text-align:right;font-size:15px;font-weight:700;color:#16a34a;">${fmt(d.refundAmount)}</td>
       </tr>`
    : `<tr>
        <td colspan="2" style="padding:8px 0;font-size:14px;color:#dc2626;">Keine Rückerstattung (Stornierung < 7 Tage vor Mietstart)</td>
       </tr>`;

  const rebookUrl = `${BUSINESS.url}/kameras/${d.productId}`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${BUSINESS.name}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">Action-Cam Verleih</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Deine Buchung wurde storniert</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">Hallo ${d.customerName || 'Kunde'},<br>wir haben deine Stornierungsanfrage erhalten und deine Buchung wurde erfolgreich storniert.</p>

          <!-- Booking ID -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Buchungsnummer</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#0a0a0a;">${d.bookingId}</p>
            </td></tr>
          </table>

          <!-- Booking details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Kamera</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${d.productName}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Ursprünglicher Zeitraum</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${fmtDate(d.rentalFrom)} – ${fmtDate(d.rentalTo)} (${d.days} ${d.days === 1 ? 'Tag' : 'Tage'})</p>
              </td>
            </tr>
          </table>

          <!-- Refund info -->
          <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0a0a0a;">Rückerstattung</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:14px;">Gebuchter Betrag</td>
              <td style="padding:6px 0;text-align:right;font-size:14px;">${fmt(d.priceTotal)}</td>
            </tr>
            <tr><td colspan="2" style="padding:2px 0;border-top:1px solid #e5e7eb;"></td></tr>
            ${refundRow}
          </table>
          ${d.refundAmount > 0 ? `<p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Die Rückerstattung erscheint innerhalb von 7 Werktagen auf deinem Konto.</p>` : ''}

          <!-- Rebook CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0a0a0a;">Möchtest du neu buchen?</p>
              <p style="margin:0 0 16px;font-size:13px;color:#4b5563;">Du kannst die ${d.productName} für andere Termine erneut buchen.</p>
              <a href="${rebookUrl}" style="display:inline-block;padding:10px 20px;background:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Kamera erneut buchen</a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:14px;color:#6b7280;">Fragen? Wir helfen dir gerne weiter:<br><a href="mailto:${ADMIN_EMAIL}" style="color:#3b82f6;">${ADMIN_EMAIL}</a></p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${BUSINESS.name} · ${BUSINESS.slogan} · <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, subject };
}

// ─── Cancellation admin email ──────────────────────────────────────────────────

function buildCancellationAdminEmail(d: CancellationEmailData): { html: string; subject: string } {
  const subject = `Stornierung: ${d.bookingId} – ${d.productName}`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="background:#dc2626;border-radius:12px 12px 0 0;padding:20px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">Buchung storniert</p>
          <p style="margin:4px 0 0;font-size:13px;color:#fca5a5;">${d.bookingId}</p>
        </td></tr>

        <tr><td style="background:#ffffff;padding:32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;width:40%;">Buchungsnummer</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#0a0a0a;">${d.bookingId}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kunde</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${d.customerName || '–'}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">E-Mail</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;"><a href="mailto:${d.customerEmail}" style="color:#3b82f6;">${d.customerEmail}</a></td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kamera</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${d.productName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Zeitraum</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${fmtDate(d.rentalFrom)} – ${fmtDate(d.rentalTo)} (${d.days} Tage)</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Gebuchter Betrag</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${fmt(d.priceTotal)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#6b7280;">Rückerstattung</td>
              <td style="padding:8px 0;font-size:15px;font-weight:700;color:${d.refundAmount > 0 ? '#16a34a' : '#dc2626'};">${d.refundAmount > 0 ? fmt(d.refundAmount) + ` (${d.refundPercentage * 100} %)` : 'Keine'}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${BUSINESS.name} Admin-Benachrichtigung</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, subject };
}

// ─── Shipping confirmation ─────────────────────────────────────────────────────

export interface ShippingEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  rentalFrom: string;
  rentalTo: string;
  trackingNumber: string;
  trackingUrl: string;
  carrier: string;
}

export async function sendShippingConfirmation(data: ShippingEmailData) {
  const { html, subject } = buildShippingEmail(data);
  await sendAndLog({ to: data.customerEmail, subject, html, bookingId: data.bookingId, emailType: 'shipping_confirmation' });
}

// ─── Damage report types ──────────────────────────────────────────────────────

export interface DamageEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  description: string;
  photoCount: number;
}

export interface DamageResolutionEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  damageAmount: number;
  depositRetained: number;
  adminNotes: string;
}

// ─── Damage report confirmation (to customer) ────────────────────────────────

export async function sendDamageReportConfirmation(data: DamageEmailData) {
  const subject = `Schadensmeldung eingegangen – ${data.bookingId}`;
  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${BUSINESS.name}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">Action-Cam Verleih</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Schadensmeldung eingegangen</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">
            Hallo ${data.customerName || 'Kunde'},<br>
            wir haben deine Schadensmeldung zur Buchung <strong>${data.bookingId}</strong> erhalten.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Kamera</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${data.productName}</p>
            </td></tr>
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Beschreibung</p>
              <p style="margin:0;font-size:14px;color:#374151;">${data.description}</p>
            </td></tr>
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Fotos</p>
              <p style="margin:0;font-size:14px;color:#374151;">${data.photoCount} Foto${data.photoCount !== 1 ? 's' : ''} hochgeladen</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0;font-size:14px;color:#92400e;">
                <strong>Was passiert jetzt?</strong><br>
                Unser Team prüft deine Meldung und die Fotos. Du erhältst eine Rückmeldung innerhalb von 1–2 Werktagen.
              </p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#6b7280;">Fragen? Schreib uns:<br><a href="mailto:${ADMIN_EMAIL}" style="color:#3b82f6;">${ADMIN_EMAIL}</a></p>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${BUSINESS.name} · ${BUSINESS.slogan} · <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  await sendAndLog({ to: data.customerEmail, subject, html, bookingId: data.bookingId, emailType: 'damage_report_customer' });
}

// ─── Damage report notification (to admin) ───────────────────────────────────

export async function sendAdminDamageNotification(data: DamageEmailData) {
  const subject = `Neue Schadensmeldung: ${data.bookingId} – ${data.productName}`;
  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#f59e0b;border-radius:12px 12px 0 0;padding:20px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">Neue Schadensmeldung</p>
          <p style="margin:4px 0 0;font-size:13px;color:#fef3c7;">${data.bookingId}</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;width:40%;">Buchung</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#0a0a0a;">${data.bookingId}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kunde</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${data.customerName || '–'}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">E-Mail</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;"><a href="mailto:${data.customerEmail}" style="color:#3b82f6;">${data.customerEmail}</a></td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kamera</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${data.productName}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Fotos</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${data.photoCount} hochgeladen</td></tr>
            <tr><td style="padding:8px 0;font-size:14px;color:#6b7280;">Beschreibung</td><td style="padding:8px 0;font-size:14px;color:#0a0a0a;">${data.description}</td></tr>
          </table>
          <div style="margin-top:24px;">
            <a href="${BUSINESS.url}/admin/schaeden" style="display:inline-block;padding:10px 24px;background:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Im Dashboard ansehen</a>
          </div>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${BUSINESS.name} Admin-Benachrichtigung</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  await sendAndLog({ to: ADMIN_EMAIL, subject, html, bookingId: data.bookingId, emailType: 'damage_report_admin' });
}

// ─── Damage resolution notification (to customer) ────────────────────────────

export async function sendDamageResolution(data: DamageResolutionEmailData) {
  const subject = `Schadensmeldung bearbeitet – ${data.bookingId}`;
  const retainedInfo = data.depositRetained > 0
    ? `<tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Einbehaltene Kaution</p>
        <p style="margin:0;font-size:15px;font-weight:700;color:#dc2626;">${fmt(data.depositRetained)}</p>
      </td></tr>`
    : `<tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Kaution</p>
        <p style="margin:0;font-size:15px;font-weight:600;color:#16a34a;">Vollständig freigegeben</p>
      </td></tr>`;
  const notesRow = data.adminNotes
    ? `<tr><td style="padding:16px 20px;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Anmerkung</p>
        <p style="margin:0;font-size:14px;color:#374151;">${data.adminNotes}</p>
      </td></tr>`
    : '';
  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${BUSINESS.name}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">Action-Cam Verleih</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Schadensmeldung bearbeitet</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">
            Hallo ${data.customerName || 'Kunde'},<br>
            wir haben deine Schadensmeldung zur Buchung <strong>${data.bookingId}</strong> geprüft.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Kamera</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${data.productName}</p>
            </td></tr>
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Festgestellte Schadenshöhe</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${fmt(data.damageAmount)}</p>
            </td></tr>
            ${retainedInfo}
            ${notesRow}
          </table>
          <p style="margin:0;font-size:14px;color:#6b7280;">Bei Rückfragen kontaktiere uns gerne:<br><a href="mailto:${ADMIN_EMAIL}" style="color:#3b82f6;">${ADMIN_EMAIL}</a></p>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${BUSINESS.name} · ${BUSINESS.slogan} · <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  await sendAndLog({ to: data.customerEmail, subject, html, bookingId: data.bookingId, emailType: 'damage_resolution' });
}

// ─── Shipping confirmation ─────────────────────────────────────────────────────

function buildShippingEmail(d: ShippingEmailData): { html: string; subject: string } {
  const subject = `Deine Kamera ist unterwegs! – ${d.bookingId}`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
          <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;">clever mieten statt kaufen</p>
        </td></tr>

        <tr><td style="background:#f0fdf4;border-left:4px solid #16a34a;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#15803d;">📦 Deine Kamera ist auf dem Weg!</p>
          <p style="margin:6px 0 0;font-size:14px;color:#166534;">Wir haben dein Paket heute versendet.</p>
        </td></tr>

        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Hallo ${d.customerName || 'dort'},<br><br>
            deine <strong>${d.productName}</strong> ist unterwegs zu dir.
            Mit der Tracking-Nummer unten kannst du dein Paket jederzeit verfolgen.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:2px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Tracking-Nummer (${d.carrier})</p>
              <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0a0a0a;letter-spacing:2px;">${d.trackingNumber}</p>
              <a href="${d.trackingUrl}"
                 style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
                Sendung verfolgen →
              </a>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;width:45%;">Buchungsnummer</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#0a0a0a;">${d.bookingId}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kamera</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${d.productName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Mietbeginn</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${fmtDate(d.rentalFrom)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#6b7280;">Mietende</td>
              <td style="padding:8px 0;font-size:14px;color:#0a0a0a;">${fmtDate(d.rentalTo)}</td>
            </tr>
          </table>

          <div style="margin-top:24px;padding:16px;background:#fff7ed;border-radius:8px;">
            <p style="margin:0;font-size:13px;color:#92400e;font-weight:600;">Rücksendung</p>
            <p style="margin:6px 0 0;font-size:13px;color:#78350f;">
              Ein Rücksende-Etikett liegt deinem Paket bei. Bitte verpacke die Kamera sorgfältig und
              gib das Paket spätestens am <strong>${fmtDate(d.rentalTo)}</strong> auf.
              Bei Fragen: <a href="mailto:${BUSINESS.emailKontakt}" style="color:#3b82f6;">${BUSINESS.emailKontakt}</a>
            </p>
          </div>
        </td></tr>

        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
            Fragen? <a href="mailto:${BUSINESS.emailKontakt}" style="color:#3b82f6;">${BUSINESS.emailKontakt}</a>
          </p>
          <p style="margin:0;font-size:11px;color:#9ca3af;">${BUSINESS.addressLine}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, subject };
}

// ─── Referral reward notification ────────────────────────────────────────────

export interface ReferralRewardEmailData {
  referrerName: string;
  referrerEmail: string;
  referredName: string;
  rewardCode: string;
  rewardValue: number;
}

export async function sendReferralReward(data: ReferralRewardEmailData) {
  const subject = `${data.rewardValue} EUR Gutschein - Deine Empfehlung hat sich gelohnt!`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
          <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;">clever mieten statt kaufen</p>
        </td></tr>
        <tr><td style="background:#f0fdf4;border-left:4px solid #16a34a;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#15803d;">Dein Empfehlungsbonus ist da!</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Hallo ${data.referrerName || 'dort'},<br><br>
            deine Empfehlung hat funktioniert! <strong>${data.referredName}</strong> hat gerade eine Buchung abgeschlossen.
            Als Dankeschön erhältst du einen <strong>${data.rewardValue} EUR Gutschein</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border:2px solid #bae6fd;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Dein Gutschein-Code</p>
              <p style="margin:0;font-size:28px;font-weight:700;color:#0a0a0a;letter-spacing:3px;">${data.rewardCode}</p>
              <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Wert: ${data.rewardValue},00 EUR</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#6b7280;">
            Gib den Code einfach beim nächsten Checkout ein. Der Gutschein ist einmalig einlösbar.
          </p>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${BUSINESS.name} &middot; ${BUSINESS.slogan} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendAndLog({ to: data.referrerEmail, subject, html, emailType: 'referral_reward' });
}

// ─── Message notifications ─────────────────────────────────────────────────

interface MessageNotificationData {
  customerName: string;
  customerEmail: string;
  subject: string;
  messagePreview: string;
}

export async function sendNewMessageNotificationToAdmin(data: MessageNotificationData) {
  const subject = `Neue Nachricht von ${data.customerName}: ${data.subject}`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
          <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;">Admin-Benachrichtigung</p>
        </td></tr>
        <tr><td style="background:#eff6ff;border-left:4px solid #3b82f6;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#1d4ed8;">Neue Kundennachricht</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            <strong>${data.customerName}</strong> (${data.customerEmail}) hat eine Nachricht geschrieben:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">Betreff: ${data.subject}</p>
              <p style="margin:0;font-size:14px;color:#6b7280;">${data.messagePreview}</p>
            </td></tr>
          </table>
          <a href="${BUSINESS.url}/admin/nachrichten" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Im Admin antworten</a>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">cam2rent &middot; Action-Cam Verleih</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendAndLog({ to: ADMIN_EMAIL, subject, html, emailType: 'message_admin' });
}

export async function sendNewMessageNotificationToCustomer(data: MessageNotificationData) {
  const subject = `Antwort auf deine Nachricht: ${data.subject}`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
          <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;">clever mieten statt kaufen</p>
        </td></tr>
        <tr><td style="background:#eff6ff;border-left:4px solid #3b82f6;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#1d4ed8;">Neue Antwort auf deine Nachricht</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            Hallo ${data.customerName},<br><br>
            das cam2rent Team hat auf deine Nachricht geantwortet:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">Betreff: ${data.subject}</p>
              <p style="margin:0;font-size:14px;color:#6b7280;">${data.messagePreview}</p>
            </td></tr>
          </table>
          <a href="${BUSINESS.url}/konto/nachrichten" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Zur Nachricht</a>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${BUSINESS.name} &middot; ${BUSINESS.slogan} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendAndLog({ to: data.customerEmail, subject, html, emailType: 'message_customer' });
}

// ─── Extension confirmation ────────────────────────────────────────────────

export interface ExtensionEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  originalRentalTo: string;
  newRentalTo: string;
  additionalDays: number;
  priceDifference: number;
  newTotal: number;
}

export async function sendExtensionConfirmation(data: ExtensionEmailData) {
  const subject = `Buchung ${data.bookingId} verlängert bis ${fmtDate(data.newRentalTo)}`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
          <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;">clever mieten statt kaufen</p>
        </td></tr>
        <tr><td style="background:#f0fdf4;border-left:4px solid #16a34a;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#15803d;">Buchung erfolgreich verlängert!</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Hallo ${data.customerName},<br><br>
            deine Buchung wurde erfolgreich verlängert. Hier die Details:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Buchungs-Nr.</td><td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">${data.bookingId}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Kamera</td><td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">${data.productName}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Neues Rückgabedatum</td><td style="padding:6px 0;font-size:14px;color:#15803d;font-weight:600;text-align:right;">${fmtDate(data.newRentalTo)}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Zusätzliche Tage</td><td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">+${data.additionalDays} Tag${data.additionalDays !== 1 ? 'e' : ''}</td></tr>
                <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:8px 0 0;"></td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Aufpreis</td><td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">${fmt(data.priceDifference)}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;font-weight:600;">Neuer Gesamtpreis</td><td style="padding:6px 0;font-size:16px;color:#0a0a0a;font-weight:700;text-align:right;">${fmt(data.newTotal)}</td></tr>
              </table>
            </td></tr>
          </table>
          <a href="${BUSINESS.url}/konto/buchungen" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Meine Buchungen</a>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${BUSINESS.name} &middot; ${BUSINESS.slogan} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendAndLog({ to: data.customerEmail, subject, html, bookingId: data.bookingId, emailType: 'extension_confirmation' });
}

// ─── Review Request ──────────────────────────────────────────────────────────

export async function sendReviewRequest(data: {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
}) {
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? BUSINESS.url;
  const reviewUrl = `${BASE_URL}/konto/bewertung/${data.bookingId}`;

  const subject = `Wie war deine Erfahrung mit der ${data.productName}?`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">Deine Meinung zählt!</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Hallo ${data.customerName},<br><br>
            du hattest kürzlich die <strong style="color:#0a0a0a;">${data.productName}</strong> bei uns gemietet.
            Wir würden uns riesig über dein Feedback freuen! Deine Bewertung hilft anderen Kunden bei der Entscheidung.
          </p>
          <a href="${reviewUrl}" style="display:inline-block;padding:14px 28px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
            Jetzt bewerten
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
            Die Bewertung dauert nur 1 Minute. Du kannst Sterne vergeben und optional einen kurzen Text schreiben.
          </p>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${BUSINESS.name} &middot; ${BUSINESS.slogan} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendAndLog({ to: data.customerEmail, subject, html, bookingId: data.bookingId, emailType: 'review_request' });
}

// ─── Abandoned Cart Reminder ─────────────────────────────────────────────────

export async function sendAbandonedCartReminder(data: {
  customerName: string;
  customerEmail: string;
  items: Array<{ productName: string; days: number; subtotal: number }>;
  cartTotal: number;
  couponCode?: string;
  discountPercent?: number;
}) {
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? BUSINESS.url;

  const subject = 'Du hast noch etwas im Warenkorb';

  const itemRows = data.items.map((item) =>
    `<tr>
      <td style="padding:8px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${item.productName}</td>
      <td style="padding:8px 0;font-size:14px;color:#6b7280;text-align:center;">${item.days} Tag${item.days !== 1 ? 'e' : ''}</td>
      <td style="padding:8px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">${fmt(item.subtotal)}</td>
    </tr>`
  ).join('');

  const couponSection = data.couponCode ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#fef9c3;border:1px solid #fde047;border-radius:8px;">
      <tr><td style="padding:16px 20px;text-align:center;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#854d0e;">Exklusiv für dich: ${data.discountPercent}% Rabatt!</p>
        <p style="margin:0;font-size:13px;color:#a16207;">Verwende den Code <strong style="font-family:monospace;font-size:15px;color:#854d0e;">${data.couponCode}</strong> im Checkout.</p>
      </td></tr>
    </table>
  ` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">Dein Warenkorb wartet!</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Hallo ${data.customerName},<br><br>
            du hast noch Artikel in deinem Warenkorb. Schließe deine Buchung ab, bevor die Kameras vergriffen sind!
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td style="padding:6px 0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Kamera</td>
              <td style="padding:6px 0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">Dauer</td>
              <td style="padding:6px 0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Preis</td>
            </tr>
            <tr><td colspan="3" style="border-top:1px solid #e2e8f0;"></td></tr>
            ${itemRows}
            <tr><td colspan="3" style="border-top:1px solid #e2e8f0;padding-top:8px;"></td></tr>
            <tr>
              <td colspan="2" style="padding:4px 0;font-size:14px;color:#6b7280;font-weight:600;">Gesamt</td>
              <td style="padding:4px 0;font-size:16px;color:#0a0a0a;font-weight:700;text-align:right;">${fmt(data.cartTotal)}</td>
            </tr>
          </table>
          ${couponSection}
          <a href="${BASE_URL}/warenkorb" style="display:inline-block;padding:14px 28px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
            Jetzt buchen
          </a>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${BUSINESS.name} &middot; ${BUSINESS.slogan} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendAndLog({ to: data.customerEmail, subject, html, emailType: 'abandoned_cart' });
}

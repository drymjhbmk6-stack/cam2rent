import { Resend } from 'resend';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';
import { InvoicePDF, type InvoiceData } from '@/lib/invoice-pdf';
import { computeInvoiceLines } from '@/lib/invoice-lines';
import { LegalDocumentPDF } from '@/lib/legal-pdf';
import { BUSINESS } from '@/lib/business-config';
import { createServiceClient } from '@/lib/supabase';
import { fmtDate, fmtDateTime, fmtEuro } from '@/lib/format-utils';
import { getResendFromEmail, getTestModeEmailRedirect, isTestMode, getSiteUrl } from '@/lib/env-mode';
import { getEmailTemplateOverride, applyEmailOverride } from '@/lib/email-template-overrides';

// Resend wirft im Konstruktor wenn der Key fehlt (ab v6). Zur Build-Zeit
// liegt RESEND_API_KEY in Coolify nicht als ARG an → Platzhalter, damit
// der Modul-Import beim `next build` nicht kippt. Zur Laufzeit setzt
// Coolify den echten Key per ENV, dann funktioniert der Versand.
const resend = new Resend(process.env.RESEND_API_KEY || 're_build_placeholder');

// Legacy-Export fuer Backwards-Compat. Neue Stellen nutzen `getResendFromEmail()`.
export const FROM_EMAIL =
  process.env.FROM_EMAIL ?? BUSINESS.email;

export const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ?? BUSINESS.emailKontakt;

/**
 * HTML-Escaping für Werte, die direkt in E-Mail-Templates interpoliert werden.
 * Verhindert XSS, wenn ein Kundenname (oder Produktname, Notizen, etc.)
 * bösartige HTML-Tags enthält.
 *
 * Wird in den Templates als `h()` aliasiert eingesetzt.
 */
export function escapeHtml(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
const h = escapeHtml;

/**
 * Subject-Sanitizer (Sweep 7 Vuln 16):
 * Entfernt CR/LF/U+2028/U+2029 (verhindert Header-Injection / Subject-Spoofing)
 * und cappt auf 200 Zeichen.
 */
export function stripSubject(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .slice(0, 200)
    .trim();
}

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
    const testMode = await isTestMode();
    await supabase.from('email_log').insert({
      booking_id: params.bookingId || null,
      customer_email: params.customerEmail,
      email_type: params.emailType,
      subject: params.subject,
      status: params.status,
      resend_message_id: params.resendMessageId || null,
      error_message: params.errorMessage || null,
      is_test: testMode,
    });
  } catch {
    // Fire-and-forget — kein Fehler soll die Email blockieren
  }
}

// ─── Preview-Capture ──────────────────────────────────────────────────────────
// Ermöglicht das Rendern eines E-Mail-Templates ohne tatsächlichen Versand.
// Wird für die Admin-Vorlagen-Vorschau unter /admin/emails/vorlagen genutzt.

type PreviewCapture = { subject?: string; html?: string; to?: string; emailType?: string };
const previewContext = new AsyncLocalStorage<PreviewCapture>();

/**
 * Ruft eine send-Funktion im Preview-Modus auf: kein Versand, kein Log —
 * stattdessen werden Subject + HTML captured und zurückgegeben.
 */
export async function renderEmailPreview<T>(
  sendFn: (data: T) => Promise<void>,
  data: T,
): Promise<{ subject: string; html: string }> {
  const store: PreviewCapture = {};
  await previewContext.run(store, async () => {
    try {
      await sendFn(data);
    } catch (err) {
      // Fehler in Attachment-Generierung (PDF etc.) ignorieren —
      // capture kann trotzdem befüllt worden sein.
      if (!store.html) throw err;
    }
  });
  return { subject: store.subject ?? '', html: store.html ?? '' };
}

/**
 * Sendet eine Email via Resend und loggt das Ergebnis.
 * Gibt die Resend-Message-ID zurueck (oder null/undefined im Preview-/Fehlerfall).
 */
export async function sendAndLog(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  bookingId?: string | null;
  emailType: string;
  attachments?: { filename: string; content: Buffer }[];
  replyTo?: string;
  headers?: Record<string, string>;
  /** Abweichende Absenderadresse (muss auf der verifizierten Domain liegen). */
  from?: string;
}): Promise<string | null | undefined> {
  // Admin-Overrides (Subject + Einleitungs-HTML) werden vor allem anderen
  // angewendet — damit auch der Preview-Capture-Pfad und das DB-Log die
  // tatsaechlich versendete Variante sehen.
  const override = await getEmailTemplateOverride(opts.emailType).catch(() => null);
  const applied = applyEmailOverride({ subject: opts.subject, html: opts.html }, override);
  const overriddenSubject = applied.subject;
  const overriddenHtml = applied.html;

  // Preview-Modus: capture statt Versand
  const capture = previewContext.getStore();
  if (capture) {
    capture.subject = overriddenSubject;
    capture.html = overriddenHtml;
    capture.to = opts.to;
    capture.emailType = opts.emailType;
    return;
  }
  try {
    const fromEmail = await getResendFromEmail();
    const redirect = await getTestModeEmailRedirect();
    const finalTo = redirect ?? opts.to;
    const finalSubject = redirect
      ? `[TEST → urspruenglich: ${opts.to}] ${overriddenSubject}`
      : overriddenSubject;
    const result = await resend.emails.send({
      from: `${BUSINESS.name} <${opts.from ?? fromEmail}>`,
      replyTo: opts.replyTo ?? ADMIN_EMAIL,
      to: finalTo,
      subject: finalSubject,
      html: overriddenHtml,
      text: opts.text,
      attachments: opts.attachments,
      headers: opts.headers,
    });
    // Resend liefert bei API-Fehlern (Rate-Limit, ungueltige Adresse, Outage) einen
    // Response-Body { data: null, error: {...} } und wirft NICHT — also explizit pruefen,
    // sonst landen fehlgeschlagene Mails als "sent" im Log.
    if (result.error) {
      throw new Error(result.error.message ?? 'Resend send failed');
    }
    await logEmail({
      bookingId: opts.bookingId,
      customerEmail: opts.to,
      emailType: opts.emailType,
      subject: overriddenSubject,
      status: 'sent',
      resendMessageId: result.data?.id,
    });
    return result.data?.id ?? null;
  } catch (err) {
    await logEmail({
      bookingId: opts.bookingId,
      customerEmail: opts.to,
      emailType: opts.emailType,
      subject: overriddenSubject,
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
  /** Optional: Zubehoer mit Stueckzahl. Wenn gesetzt, werden accessoryNames
   *  fuer die Buchungsbestaetigungs-Mail qty-aware aufgeloest. */
  accessoryItems?: { accessory_id: string; qty: number }[];
  /** Optional: Map accessory_id -> Name (vom Aufrufer resolvt). */
  accessoryNames?: Record<string, string>;  priceRental: number;
  priceAccessories: number;
  priceHaftung: number;
  /** Gesamt-Rabatt (Aktion + Gutschein + Mietdauer + Loyalitaet) — wird in der
   *  Rechnung als eigene Zeile vor dem Gesamt angezeigt. */
  discountAmount?: number;
  /** Optional: Gutschein-Code zur Beschriftung */
  couponCode?: string;
  priceTotal: number;
  deposit: number;
  shippingPrice: number;
  taxMode?: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number;
  ustId?: string;
  earlyServiceConsentAt?: string | null; // ISO-Timestamp § 356 Abs. 4 BGB
  verificationRequired?: boolean; // Ausweis-Check steht noch aus (Express-Signup)
}

// ─── Send functions ───────────────────────────────────────────────────────────

export async function sendBookingConfirmation(data: BookingEmailData, contractPdfBuffer?: Buffer) {
  const { html, subject } = buildCustomerEmail(data);

  // Generate PDF invoice as attachment
  const invoiceDate = new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
  });
  // Echte Katalog-Positionen aus der Buchung laden (Einzelpreis x Menge).
  // Defensiv: schlaegt das fehl, greift im PDF der Fallback-Pfad.
  let cameraLines: InvoiceData['cameraLines'];
  let accessoryLines: InvoiceData['accessoryLines'];
  try {
    const sb = createServiceClient();
    const { data: bk } = await sb
      .from('bookings')
      .select('product_name, price_rental, price_accessories, days, accessory_items, accessories')
      .eq('id', data.bookingId)
      .maybeSingle();
    if (bk) {
      const lines = await computeInvoiceLines(sb, bk);
      cameraLines = lines.cameraLines;
      accessoryLines = lines.accessoryLines;
    }
  } catch (err) {
    console.error('[email] computeInvoiceLines fehlgeschlagen:', err);
  }

  const invoiceData: InvoiceData = {
    bookingId: data.bookingId,
    invoiceDate,
    cameraLines,
    accessoryLines,
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
    discountAmount: data.discountAmount,
    couponCode: data.couponCode,
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

  // Rechtliche Dokumente als PDF anhängen (AGB, Widerruf, Haftung, Datenschutz)
  try {
    const supabaseClient = createServiceClient();
    const legalDocs = [
      { slug: 'agb', filename: 'AGB.pdf' },
      { slug: 'widerruf', filename: 'Widerrufsbelehrung.pdf' },
      { slug: 'haftungsausschluss', filename: 'Haftungsbedingungen.pdf' },
      { slug: 'datenschutz', filename: 'Datenschutzerklaerung.pdf' },
    ];

    for (const doc of legalDocs) {
      try {
        const { data: legalDoc } = await supabaseClient
          .from('legal_documents')
          .select('title, current_version_id')
          .eq('slug', doc.slug)
          .maybeSingle();

        if (!legalDoc?.current_version_id) continue;

        const { data: version } = await supabaseClient
          .from('legal_document_versions')
          .select('content, version_number, published_at')
          .eq('id', legalDoc.current_version_id)
          .maybeSingle();

        if (!version?.content) continue;

        const legalPdfBuffer = await renderToBuffer(
          createElement(LegalDocumentPDF, {
            data: {
              title: legalDoc.title,
              slug: doc.slug,
              content: version.content,
              versionNumber: version.version_number,
              publishedAt: version.published_at,
            },
          }) as ReactElement<DocumentProps>
        );
        attachments.push({ filename: doc.filename, content: Buffer.from(legalPdfBuffer) });
      } catch (err) {
        console.error(`Legal-PDF ${doc.slug} Fehler:`, err);
      }
    }
  } catch (err) {
    console.error('Legal-PDFs Fehler:', err);
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

export function buildCustomerEmail(d: BookingEmailData): { html: string; subject: string } {
  const subject = `Buchungsbestätigung ${d.bookingId} – ${BUSINESS.name}`;

  const accessoriesRow = d.accessories.length > 0
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Zubehör</td><td style="padding:6px 0;text-align:right;font-size:14px;">${fmtEuro(d.priceAccessories)}</td></tr>`
    : '';

  const haftungRow = d.priceHaftung > 0
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">${haftungLabel(d.haftung)}</td><td style="padding:6px 0;text-align:right;font-size:14px;">${fmtEuro(d.priceHaftung)}</td></tr>`
    : '';

  const shippingRow = d.shippingPrice > 0
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Versandkosten</td><td style="padding:6px 0;text-align:right;font-size:14px;">${fmtEuro(d.shippingPrice)}</td></tr>`
    : '';

  // Rabatt-Zeile (Aktionsrabatt / Gutschein) — vor dem Gesamtbetrag.
  // couponCode wird sowohl fuer echte Gutscheine als auch fuer Aktionsnamen
  // (z.B. "Release50") verwendet, damit der Kunde sieht WAS abgezogen wurde.
  const discountRow = (d.discountAmount ?? 0) > 0
    ? `<tr><td style="padding:6px 0;color:#10b981;font-size:14px;">${d.couponCode ? `Rabatt (${escapeHtml(d.couponCode)})` : 'Rabatt'}</td><td style="padding:6px 0;text-align:right;font-size:14px;color:#10b981;">-${fmtEuro(d.discountAmount!)}</td></tr>`
    : '';

  const depositNote = d.deposit > 0
    ? `<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">* Kaution ${fmtEuro(d.deposit)} wird nach Rückgabe erstattet.</p>`
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
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:14px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="44" height="44" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1.1;">${BUSINESS.name}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;line-height:1.2;">Action-Cam Verleih</p>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Deine Buchung ist bestätigt!</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">Hallo ${h(d.customerName || 'Kunde')},<br>vielen Dank für deine Buchung bei ${BUSINESS.name}. Hier sind alle Details:</p>

          ${d.verificationRequired ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fdba74;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.8px;">⚠ Ausweis-Check laeuft</p>
              <p style="margin:0 0 10px;font-size:14px;color:#7c2d12;line-height:1.5;">Sobald wir deinen Personalausweis geprueft haben, schicken wir die Kamera los. Falls du ihn noch nicht hochgeladen hast, geht das hier:</p>
              <p style="margin:0;"><a href="${BUSINESS.url}/konto/verifizierung" style="display:inline-block;padding:10px 20px;background:#ea580c;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Status ansehen / Ausweis hochladen</a></p>
              <p style="margin:10px 0 0;font-size:12px;color:#9a3412;">Ohne gueltigen Ausweis koennen wir die Kamera nicht versenden — bitte vor Mietbeginn erledigen.</p>
            </td></tr>
          </table>` : ''}

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
                <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${h(d.productName)}</p>
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
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Kamera-Miete (${d.days} ${d.days === 1 ? 'Tag' : 'Tage'})</td><td style="padding:6px 0;text-align:right;font-size:14px;">${fmtEuro(d.priceRental)}</td></tr>
            ${accessoriesRow}
            ${haftungRow}
            ${shippingRow}
            ${discountRow}
            <tr><td colspan="2" style="padding:4px 0;border-top:1px solid #e5e7eb;"></td></tr>
            <tr>
              <td style="padding:8px 0;font-weight:700;color:#0a0a0a;font-size:15px;">Gesamtbetrag</td>
              <td style="padding:8px 0;text-align:right;font-weight:700;color:#0a0a0a;font-size:15px;">${fmtEuro(d.priceTotal)}</td>
            </tr>
            ${d.deposit > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">inkl. Kaution*</td><td style="padding:4px 0;text-align:right;color:#6b7280;font-size:13px;">${fmtEuro(d.deposit)}</td></tr>` : ''}
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
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Gemäß § 312g Abs. 2 Nr. 9 BGB besteht für zeitgebundene Mietverträge kein gesetzliches Widerrufsrecht.</p>
              ${d.earlyServiceConsentAt ? `<p style="margin:0;font-size:12px;color:#9ca3af;">Zustimmung zur vorzeitigen Leistungserbringung gemäß § 356 Abs. 4 BGB erteilt am ${new Date(d.earlyServiceConsentAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr. Das Widerrufsrecht erlischt mit vollständiger Vertragserfüllung durch cam2rent.</p>` : ''}
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

export function buildAdminEmail(d: BookingEmailData): { html: string; subject: string } {
  const subject = `Neue Buchung: ${d.bookingId} – ${h(d.productName)}`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:12px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="40" height="40" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;line-height:1.1;">Neue Buchung eingegangen</p>
              <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;line-height:1.2;">${d.bookingId}</p>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="background:#ffffff;padding:32px;">

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;width:40%;">Buchungsnummer</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#0a0a0a;">${d.bookingId}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kunde</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${h(d.customerName || '–')}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">E-Mail</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;"><a href="mailto:${h(d.customerEmail)}" style="color:#3b82f6;">${h(d.customerEmail)}</a></td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kamera</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${h(d.productName)}</td>
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
              <td style="padding:8px 0;font-size:15px;font-weight:700;color:#0a0a0a;">${fmtEuro(d.priceTotal)}</td>
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

export function buildCancellationCustomerEmail(d: CancellationEmailData): { html: string; subject: string } {
  const subject = `Stornierungsbestätigung ${d.bookingId} – ${BUSINESS.name}`;

  const refundRow = d.refundAmount > 0
    ? `<tr>
        <td style="padding:8px 0;font-size:15px;font-weight:700;color:#16a34a;">Rückerstattung</td>
        <td style="padding:8px 0;text-align:right;font-size:15px;font-weight:700;color:#16a34a;">${fmtEuro(d.refundAmount)}</td>
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
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:14px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="44" height="44" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1.1;">${BUSINESS.name}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;line-height:1.2;">Action-Cam Verleih</p>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Deine Buchung wurde storniert</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">Hallo ${h(d.customerName || 'Kunde')},<br>wir haben deine Stornierungsanfrage erhalten und deine Buchung wurde erfolgreich storniert.</p>

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
                <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${h(d.productName)}</p>
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
              <td style="padding:6px 0;text-align:right;font-size:14px;">${fmtEuro(d.priceTotal)}</td>
            </tr>
            <tr><td colspan="2" style="padding:2px 0;border-top:1px solid #e5e7eb;"></td></tr>
            ${refundRow}
          </table>
          ${d.refundAmount > 0 ? `<p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Die Rückerstattung erscheint innerhalb von 7 Werktagen auf deinem Konto.</p>` : ''}

          <!-- Rebook CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0a0a0a;">Möchtest du neu buchen?</p>
              <p style="margin:0 0 16px;font-size:13px;color:#4b5563;">Du kannst die ${h(d.productName)} für andere Termine erneut buchen.</p>
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

export function buildCancellationAdminEmail(d: CancellationEmailData): { html: string; subject: string } {
  const subject = `Stornierung: ${d.bookingId} – ${h(d.productName)}`;

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
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${h(d.customerName || '–')}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">E-Mail</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;"><a href="mailto:${h(d.customerEmail)}" style="color:#3b82f6;">${h(d.customerEmail)}</a></td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kamera</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${h(d.productName)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Zeitraum</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${fmtDate(d.rentalFrom)} – ${fmtDate(d.rentalTo)} (${d.days} Tage)</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Gebuchter Betrag</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${fmtEuro(d.priceTotal)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#6b7280;">Rückerstattung</td>
              <td style="padding:8px 0;font-size:15px;font-weight:700;color:${d.refundAmount > 0 ? '#16a34a' : '#dc2626'};">${d.refundAmount > 0 ? fmtEuro(d.refundAmount) + ` (${d.refundPercentage * 100} %)` : 'Keine'}</td>
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
  // Optional: bei „Als versendet markieren" ohne erfasste Sendung leer.
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
}

export async function sendShippingConfirmation(data: ShippingEmailData) {
  const { html, subject } = buildShippingEmail(data);
  await sendAndLog({ to: data.customerEmail, subject, html, bookingId: data.bookingId, emailType: 'shipping_confirmation' });
}

// ─── WBW-Finalisierung (rechtlich relevantes PDF an den Mieter) ───────────────

export interface WbwConfirmationEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  rentalFrom: string;
  rentalTo: string;
  pdfBuffer: Buffer;
}

export async function sendWbwConfirmation(data: WbwConfirmationEmailData) {
  const subject = stripSubject(`Wiederbeschaffungswerte deiner Mietausrüstung | ${data.bookingId}`);
  const firstName = (data.customerName || '').trim().split(/\s+/)[0] || 'dort';
  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:12px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="40" height="40" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.1;">cam<span style="color:#06b6d4;">2</span>rent</p>
              <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;letter-spacing:1px;line-height:1.2;">clever mieten statt kaufen</p>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.6;">
            Hallo ${h(firstName)},<br><br>
            deine Ausrüstung für den Mietzeitraum <strong>${fmtDate(data.rentalFrom)} – ${fmtDate(data.rentalTo)}</strong>
            wurde soeben versandfertig gemacht. Im Anhang findest du die finalen
            Wiederbeschaffungswerte deiner Mietausrüstung als PDF-Dokument.
          </p>
          <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
            Diese Werte sind gemäß deinem Mietvertrag maßgeblich für etwaige
            Ersatzansprüche im Schadensfall. Bei Fragen stehen wir dir jederzeit
            unter <a href="mailto:${h(BUSINESS.emailKontakt)}" style="color:#06b6d4;">${h(BUSINESS.emailKontakt)}</a> zur Verfügung.
          </p>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
            Viel Spaß mit deiner Ausrüstung!<br><br>
            ${h(BUSINESS.name)} – ${h(BUSINESS.owner)}<br>
            <a href="${h(BUSINESS.url)}" style="color:#06b6d4;">${h(BUSINESS.url)}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendAndLog({
    to: data.customerEmail,
    subject,
    html,
    bookingId: data.bookingId,
    emailType: 'wbw_confirmation',
    attachments: [{ filename: `WBW-${data.bookingId}.pdf`, content: data.pdfBuffer }],
  });
}

// ─── Angepasste Rechnung (Rechnungsanpassung an den Kunden) ──────────────────

export interface InvoiceAdjustmentEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  version: number;
  reason?: string;
  pdfBuffer: Buffer;
}

export async function sendInvoiceAdjustment(data: InvoiceAdjustmentEmailData) {
  const subject = stripSubject(`Angepasste Rechnung zu deiner Buchung ${data.bookingId}`);
  const firstName = (data.customerName || '').trim().split(/\s+/)[0] || 'dort';
  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:12px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="40" height="40" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.1;">cam<span style="color:#06b6d4;">2</span>rent</p>
              <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;letter-spacing:1px;line-height:1.2;">clever mieten statt kaufen</p>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.6;">
            Hallo ${h(firstName)},<br><br>
            zu deiner Buchung <strong>${h(data.bookingId)}</strong> gibt es eine
            angepasste Rechnung. Sie ersetzt die vorherige Fassung — im Anhang
            findest du das aktuelle Rechnungs-PDF (Anpassung Nr. ${h(String(data.version))}).
          </p>
          ${data.reason ? `<p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">Grund der Anpassung: ${h(data.reason)}</p>` : ''}
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
            Bei Fragen erreichst du uns jederzeit unter
            <a href="mailto:${h(BUSINESS.emailKontakt)}" style="color:#06b6d4;">${h(BUSINESS.emailKontakt)}</a>.<br><br>
            ${h(BUSINESS.name)} – ${h(BUSINESS.owner)}<br>
            <a href="${h(BUSINESS.url)}" style="color:#06b6d4;">${h(BUSINESS.url)}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendAndLog({
    to: data.customerEmail,
    subject,
    html,
    bookingId: data.bookingId,
    emailType: 'invoice_adjustment',
    attachments: [{ filename: `Rechnungsanpassung-${data.bookingId}-v${data.version}.pdf`, content: data.pdfBuffer }],
  });
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
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:14px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="44" height="44" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1.1;">${BUSINESS.name}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;line-height:1.2;">Action-Cam Verleih</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Schadensmeldung eingegangen</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">
            Hallo ${h(data.customerName || 'Kunde')},<br>
            wir haben deine Schadensmeldung zur Buchung <strong>${h(data.bookingId)}</strong> erhalten.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Kamera</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${h(data.productName)}</p>
            </td></tr>
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Beschreibung</p>
              <p style="margin:0;font-size:14px;color:#374151;">${h(data.description)}</p>
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
  // Sweep 7 Vuln 16 — Subject-Spoofing/CRLF-Strip + Cap.
  const subject = stripSubject(`Neue Schadensmeldung: ${data.bookingId} – ${data.productName}`);
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
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;width:40%;">Buchung</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#0a0a0a;">${h(data.bookingId)}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kunde</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${h(data.customerName || '–')}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">E-Mail</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;"><a href="mailto:${h(data.customerEmail)}" style="color:#3b82f6;">${h(data.customerEmail)}</a></td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kamera</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${h(data.productName)}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Fotos</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${data.photoCount} hochgeladen</td></tr>
            <tr><td style="padding:8px 0;font-size:14px;color:#6b7280;">Beschreibung</td><td style="padding:8px 0;font-size:14px;color:#0a0a0a;">${h(data.description)}</td></tr>
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
  // Sweep 9 H3: stripSubject gegen CRLF (Sweep 7 #16-Notiz erwaehnt es,
  // aber dieser Subject blieb roh — review_request wurde gefixt, hier
  // vergessen).
  const subject = stripSubject(`Schadensmeldung bearbeitet – ${data.bookingId}`);
  const retainedInfo = data.depositRetained > 0
    ? `<tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Einbehaltene Kaution</p>
        <p style="margin:0;font-size:15px;font-weight:700;color:#dc2626;">${fmtEuro(data.depositRetained)}</p>
      </td></tr>`
    : `<tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Kaution</p>
        <p style="margin:0;font-size:15px;font-weight:600;color:#16a34a;">Vollständig freigegeben</p>
      </td></tr>`;
  const notesRow = data.adminNotes
    ? `<tr><td style="padding:16px 20px;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Anmerkung</p>
        <p style="margin:0;font-size:14px;color:#374151;">${h(data.adminNotes)}</p>
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
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:14px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="44" height="44" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1.1;">${BUSINESS.name}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;line-height:1.2;">Action-Cam Verleih</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Schadensmeldung bearbeitet</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">
            Hallo ${h(data.customerName) || 'Kunde'},<br>
            wir haben deine Schadensmeldung zur Buchung <strong>${data.bookingId}</strong> geprüft.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Kamera</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${h(data.productName)}</p>
            </td></tr>
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Festgestellte Schadenshöhe</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${fmtEuro(data.damageAmount)}</p>
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

export function buildShippingEmail(d: ShippingEmailData): { html: string; subject: string } {
  const hasTracking = !!(d.trackingNumber && d.trackingUrl);
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
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:12px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="40" height="40" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.1;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;line-height:1.2;">clever mieten statt kaufen</p>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="background:#f0fdf4;border-left:4px solid #16a34a;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#15803d;">📦 Deine Kamera ist auf dem Weg!</p>
          <p style="margin:6px 0 0;font-size:14px;color:#166534;">Wir haben dein Paket heute versendet.</p>
        </td></tr>

        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Hallo ${h(d.customerName || 'dort')},<br><br>
            deine <strong>${h(d.productName)}</strong> ist unterwegs zu dir.${hasTracking ? '\n            Mit der Tracking-Nummer unten kannst du dein Paket jederzeit verfolgen.' : ''}
          </p>

          ${hasTracking ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:2px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Tracking-Nummer${d.carrier ? ` (${h(d.carrier)})` : ''}</p>
              <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0a0a0a;letter-spacing:2px;">${h(d.trackingNumber)}</p>
              <a href="${h(d.trackingUrl)}"
                 style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
                Sendung verfolgen →
              </a>
            </td></tr>
          </table>` : ''}

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;width:45%;">Buchungsnummer</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#0a0a0a;">${h(d.bookingId)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">Kamera</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#0a0a0a;">${h(d.productName)}</td>
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
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:12px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="40" height="40" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.1;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;line-height:1.2;">clever mieten statt kaufen</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#f0fdf4;border-left:4px solid #16a34a;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#15803d;">Dein Empfehlungsbonus ist da!</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Hallo ${h(data.referrerName) || 'dort'},<br><br>
            deine Empfehlung hat funktioniert! <strong>${h(data.referredName)}</strong> hat gerade eine Buchung abgeschlossen.
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

export interface MessageNotificationData {
  customerName: string;
  customerEmail: string;
  subject: string;
  messagePreview: string;
  /**
   * true = Admin initiiert die Konversation (Subject "Neue Nachricht von cam2rent: …").
   * false/undefined = Antwort auf eine vom Kunden gestartete Nachricht (Default).
   */
  isInitial?: boolean;
}

export async function sendNewMessageNotificationToAdmin(data: MessageNotificationData) {
  // CRLF-Strip + Cap fuer Subject (verhindert Header-Injection / Subject-Spoofing
  // mit Unicode-Linebreaks).
  const safeSubject = (data.subject ?? '').replace(/[\r\n\u2028\u2029]/g, ' ').slice(0, 200);
  const safeName = (data.customerName ?? '').replace(/[\r\n\u2028\u2029]/g, ' ').slice(0, 100);
  const subject = `Neue Nachricht von ${safeName}: ${safeSubject}`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:12px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="40" height="40" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.1;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;line-height:1.2;">Admin-Benachrichtigung</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#eff6ff;border-left:4px solid #3b82f6;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#1d4ed8;">Neue Kundennachricht</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            <strong>${h(data.customerName)}</strong> (${h(data.customerEmail)}) hat eine Nachricht geschrieben:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">Betreff: ${h(data.subject)}</p>
              <p style="margin:0;font-size:14px;color:#6b7280;">${h(data.messagePreview)}</p>
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
  const safeSubject = (data.subject ?? '').replace(/[\r\n\u2028\u2029]/g, ' ').slice(0, 200);
  const isInitial = !!data.isInitial;
  const subject = isInitial
    ? `Neue Nachricht von cam2rent: ${safeSubject}`
    : `Antwort auf deine Nachricht: ${safeSubject}`;
  const headerLabel = isInitial ? 'Neue Nachricht von cam2rent' : 'Neue Antwort auf deine Nachricht';
  const introLine = isInitial
    ? 'das cam2rent Team hat dir eine Nachricht geschickt:'
    : 'das cam2rent Team hat auf deine Nachricht geantwortet:';

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:12px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="40" height="40" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.1;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;line-height:1.2;">clever mieten statt kaufen</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#eff6ff;border-left:4px solid #3b82f6;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#1d4ed8;">${h(headerLabel)}</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            Hallo ${h(data.customerName)},<br><br>
            ${h(introLine)}
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">Betreff: ${h(data.subject)}</p>
              <p style="margin:0;font-size:14px;color:#6b7280;">${h(data.messagePreview)}</p>
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

/**
 * Antwort des Admins auf eine per E-Mail eingegangene Kundenanfrage.
 * Geht als ECHTE E-Mail raus (im Gegensatz zu sendNewMessageNotificationToCustomer,
 * das nur "du hast eine neue Nachricht, logg dich ein" verschickt).
 *
 * Setzt In-Reply-To/References fuer sauberes Threading im Kundenpostfach.
 * Reply-To bleibt der sendAndLog-Default (ADMIN_EMAIL = Support-Postfach),
 * damit Kundenantworten dort landen und vom IMAP-Cron erfasst werden.
 * Gibt die Resend-Message-ID zurueck.
 */
export async function sendInboundReply(data: {
  customerEmail: string;
  customerName: string;
  subject: string;
  body: string;
  bookingId?: string | null;
  inReplyToMessageId?: string | null;
  /** Postfach-Adresse des zustaendigen Mitarbeiters (Absender der Antwort). */
  fromAddress?: string;
  /** Bei einer ERSTEN (vom Admin initiierten) Mail kein "Re:"-Prefix setzen. Default true. */
  prefixRe?: boolean;
}): Promise<string | null | undefined> {
  const cleanSubject = stripSubject(data.subject) || '(kein Betreff)';
  const prefixRe = data.prefixRe !== false;
  const subject = !prefixRe || /^re:/i.test(cleanSubject) ? cleanSubject : `Re: ${cleanSubject}`;
  const safeBody = h(data.body).replace(/\n/g, '<br>');

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:20px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:12px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="40" height="40" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.1;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;line-height:1.2;">clever mieten statt kaufen</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hallo ${h(data.customerName)},</p>
          <div style="font-size:14px;color:#374151;line-height:1.6;">${safeBody}</div>
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
            Du kannst direkt auf diese E-Mail antworten.<br>
            Viele Grüße<br>dein cam2rent Team
          </p>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${h(BUSINESS.name)} &middot; ${h(BUSINESS.slogan)} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${h(BUSINESS.domain)}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const headers: Record<string, string> = {};
  if (data.inReplyToMessageId) {
    headers['In-Reply-To'] = data.inReplyToMessageId;
    headers['References'] = data.inReplyToMessageId;
  }

  // Absenderadresse nur uebernehmen, wenn sie auf der verifizierten Domain
  // liegt — sonst lehnt Resend den Versand ab. Fallback: sendAndLog-Default.
  const from =
    data.fromAddress && data.fromAddress.toLowerCase().endsWith(`@${BUSINESS.domain}`)
      ? data.fromAddress.toLowerCase()
      : undefined;

  return sendAndLog({
    to: data.customerEmail,
    subject,
    html,
    text: data.body,
    bookingId: data.bookingId ?? null,
    emailType: 'inbound_reply',
    headers,
    from,
  });
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
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
            <td valign="middle" style="padding-right:12px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="40" height="40" alt="" style="display:block;border-radius:8px;border:0;"></td>
            <td valign="middle">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.1;">Cam<span style="color:#3b82f6;">2</span>Rent</p>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;letter-spacing:1px;line-height:1.2;">clever mieten statt kaufen</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#f0fdf4;border-left:4px solid #16a34a;padding:20px 32px;">
          <p style="margin:0;font-size:17px;font-weight:700;color:#15803d;">Buchung erfolgreich verlängert!</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Hallo ${h(data.customerName)},<br><br>
            deine Buchung wurde erfolgreich verlängert. Hier die Details:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Buchungs-Nr.</td><td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">${h(data.bookingId)}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Kamera</td><td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">${h(data.productName)}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Neues Rückgabedatum</td><td style="padding:6px 0;font-size:14px;color:#15803d;font-weight:600;text-align:right;">${fmtDate(data.newRentalTo)}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Zusätzliche Tage</td><td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">+${data.additionalDays} Tag${data.additionalDays !== 1 ? 'e' : ''}</td></tr>
                <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:8px 0 0;"></td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Aufpreis</td><td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">${fmtEuro(data.priceDifference)}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;font-weight:600;">Neuer Gesamtpreis</td><td style="padding:6px 0;font-size:16px;color:#0a0a0a;font-weight:700;text-align:right;">${fmtEuro(data.newTotal)}</td></tr>
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
  const BASE_URL = await getSiteUrl();
  const reviewUrl = `${BASE_URL}/konto/bewertung/${data.bookingId}`;

  const subject = stripSubject(`Wie war deine Erfahrung mit der ${data.productName}?`);
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
            Hallo ${h(data.customerName)},<br><br>
            du hattest kürzlich die <strong style="color:#0a0a0a;">${h(data.productName)}</strong> bei uns gemietet.
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

// ─── Abschluss-Bestätigung ───────────────────────────────────────────────────

export interface CompletionEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  rentalFrom: string;
  rentalTo: string;
  /** Smart-Filter-Bewertungslink (/umfrage/[id]?t=token). Wenn gesetzt → Google-CTA mit 10%-Gutschein. */
  reviewUrl?: string;
  /** Kundenmaterial-Block nur anzeigen, wenn aktiviert (Default: aus). */
  ugcEnabled?: boolean;
  /** Rabatt-Prozent für den Material-Upload (aus admin_settings.customer_ugc_rewards). */
  ugcDiscountPercent?: number;
}

/**
 * Abschluss-Bestätigung an den Kunden, sobald eine Buchung als `completed`
 * markiert wurde — generisch für Abholung UND Versand. Sagt „Rückgabe erhalten,
 * alles in Ordnung" und weist (optional) auf das Kundenmaterial-Programm hin
 * (Foto/Video hochladen → Rabatt-Gutschein). Versand läuft über den zentralen
 * Helper `dispatchCompletionEmail` (lib/booking-completion-email.ts) mit Dedup.
 */
export async function sendCompletionConfirmation(data: CompletionEmailData) {
  const BASE_URL = await getSiteUrl();
  const materialUrl = `${BASE_URL}/konto/buchungen/${data.bookingId}/material`;
  const discount = data.ugcDiscountPercent ?? 0;
  const showUgc = data.ugcEnabled === true && discount > 0;

  const subject = stripSubject(`Deine Miete der ${data.productName} ist abgeschlossen – ${data.bookingId}`);

  const reviewBlock = data.reviewUrl ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1e3a8a;">⭐ Zufrieden? Bewerte uns bei Google – 10% Gutschein</p>
              <p style="margin:0 0 16px;font-size:13px;color:#1e40af;line-height:1.6;">
                Wenn dir die Miete gefallen hat, freuen wir uns riesig über eine kurze <strong>Google-Bewertung</strong>.
                Als Dankeschön schalten wir dir sofort einen <strong>10%-Rabattgutschein</strong> (90 Tage gültig, ab 50&nbsp;€) frei.
              </p>
              <a href="${data.reviewUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
                Bei Google bewerten &amp; Gutschein sichern
              </a>
            </td></tr>
          </table>` : '';

  const ugcBlock = showUgc ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#92400e;">📸 Zeig uns deine Aufnahmen – und spar ${discount}%</p>
              <p style="margin:0 0 16px;font-size:13px;color:#92400e;line-height:1.6;">
                Hast du mit der <strong>${h(data.productName)}</strong> tolle Fotos oder Videos gemacht?
                Lade dein Material hoch – wir schalten dir im Gegenzug einen <strong>${discount}%-Rabattgutschein</strong>
                für deine nächste Miete frei. Wird dein Material auf Social Media oder unserer Website gezeigt, gibt es on-top einen weiteren Gutschein.
              </p>
              <a href="${materialUrl}" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
                Material hochladen &amp; Rabatt sichern
              </a>
            </td></tr>
          </table>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">Miete abgeschlossen – alles in Ordnung ✅</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Hallo ${h(data.customerName)},<br><br>
            deine Rückgabe ist bei uns eingegangen und alles ist in bestem Zustand. Vielen Dank,
            dass du die <strong style="color:#0a0a0a;">${h(data.productName)}</strong> bei uns gemietet hast –
            wir hoffen, du hattest viel Freude damit!
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:8px;">
            <tr><td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Buchungsnummer</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#0a0a0a;">${h(data.bookingId)}</p>
            </td></tr>
            <tr><td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Kamera</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#0a0a0a;">${h(data.productName)}</p>
            </td></tr>
            <tr><td style="padding:14px 20px;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Mietzeitraum</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#0a0a0a;">${fmtDate(data.rentalFrom)} – ${fmtDate(data.rentalTo)}</p>
            </td></tr>
          </table>
          ${reviewBlock}
          ${ugcBlock}
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
            Bei Fragen sind wir jederzeit für dich da: <a href="mailto:${h(ADMIN_EMAIL)}" style="color:#3b82f6;">${h(ADMIN_EMAIL)}</a>.<br>
            Wir freuen uns auf deine nächste Miete!
          </p>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${BUSINESS.name} &middot; ${BUSINESS.slogan} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendAndLog({ to: data.customerEmail, subject, html, bookingId: data.bookingId, emailType: 'completion_confirmation' });
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
  const BASE_URL = await getSiteUrl();

  const subject = 'Du hast noch etwas im Warenkorb';

  const itemRows = data.items.map((item) =>
    `<tr>
      <td style="padding:8px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${h(item.productName)}</td>
      <td style="padding:8px 0;font-size:14px;color:#6b7280;text-align:center;">${item.days} Tag${item.days !== 1 ? 'e' : ''}</td>
      <td style="padding:8px 0;font-size:14px;color:#0a0a0a;font-weight:600;text-align:right;">${fmtEuro(item.subtotal)}</td>
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
            Hallo ${h(data.customerName)},<br><br>
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
              <td style="padding:4px 0;font-size:16px;color:#0a0a0a;font-weight:700;text-align:right;">${fmtEuro(data.cartTotal)}</td>
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


// ─── Ausweis-Verifizierung abgelehnt ────────────────────────────────────────

export async function sendVerificationRejected(data: {
  customerName: string;
  customerEmail: string;
  reason?: string;
}): Promise<void> {
  const BASE_URL = await getSiteUrl();
  const subject = 'Ausweis-Verifizierung — bitte erneut hochladen';

  const reasonBlock = data.reason
    ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:4px;font-size:13px;color:#991b1b;line-height:1.6;">
        <strong>Hinweis vom cam2rent-Team:</strong><br>${h(data.reason).replace(/\n/g, '<br>')}
      </p>`
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">Ausweis-Upload erneut nötig</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
            Hallo ${h(data.customerName)},<br><br>
            wir konnten deinen hochgeladenen Ausweis leider nicht verifizieren. Damit deine Buchungen reibungslos versendet werden können, brauchen wir dich kurz nochmal:
          </p>
          ${reasonBlock}
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Bitte lade Vorder- und Rückseite deines Personalausweises (oder Reisepasses) erneut hoch — gut ausgeleuchtet, alle Ecken sichtbar, keine Überdeckung.
          </p>
          <a href="${BASE_URL}/konto/verifizierung" style="display:inline-block;padding:14px 28px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
            Ausweis hochladen
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
            Falls du Fragen hast, antworte einfach auf diese E-Mail oder schreibe uns über <a href="${BASE_URL}/konto/nachrichten" style="color:#3b82f6;">dein Konto</a>.
          </p>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${BUSINESS.name} &middot; ${BUSINESS.slogan} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendAndLog({ to: data.customerEmail, subject, html, emailType: 'verification_rejected' });
}


// ─── Mietvertrag zurückgesetzt: bitte neu unterschreiben ────────────────────

export async function sendContractResignRequest(data: {
  customerName: string;
  customerEmail: string;
  bookingNumber: string;
  productName?: string;
  rentalFrom?: string; // YYYY-MM-DD
  rentalTo?: string;   // YYYY-MM-DD
}): Promise<void> {
  const BASE_URL = await getSiteUrl();
  const subject = stripSubject(`Bitte Mietvertrag erneut unterschreiben – Buchung ${data.bookingNumber}`);

  const fmt = (iso?: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('T')[0].split('-');
    return d && m && y ? `${d}.${m}.${y}` : '';
  };
  const zeitraum = data.rentalFrom && data.rentalTo
    ? `${fmt(data.rentalFrom)} – ${fmt(data.rentalTo)}`
    : '';

  const detailRows = [
    ['Buchung', h(data.bookingNumber)],
    data.productName ? ['Kamera', h(data.productName)] : null,
    zeitraum ? ['Zeitraum', zeitraum] : null,
  ].filter(Boolean) as [string, string][];

  const detailTable = detailRows.map(([k, v]) =>
    `<tr>
      <td style="padding:4px 0;font-size:13px;color:#9ca3af;">${k}</td>
      <td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:600;text-align:right;">${v}</td>
    </tr>`,
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">Mietvertrag bitte erneut unterschreiben</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
            Hallo ${h(data.customerName)},<br><br>
            für deine Buchung müssen wir dich kurz bitten, den Mietvertrag noch einmal zu unterschreiben.
            Beim ersten Mal hat die digitale Unterschrift leider nicht korrekt gespeichert.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:8px 0;">
            ${detailTable}
          </table>
          <a href="${BASE_URL}/konto/buchungen" style="display:inline-block;padding:14px 28px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
            Jetzt unterschreiben
          </a>
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
            Melde dich dafür in deinem Konto an und öffne <strong>Meine Buchungen</strong> — dort findest du den Button
            „Mietvertrag unterschreiben". Es dauert nur einen Moment.
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
            Fragen? Antworte einfach auf diese E-Mail oder schreibe uns über <a href="${BASE_URL}/konto/nachrichten" style="color:#3b82f6;">dein Konto</a>.
          </p>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${h(BUSINESS.name)} &middot; ${h(BUSINESS.slogan)} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${h(BUSINESS.domain)}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendAndLog({ to: data.customerEmail, subject, html, emailType: 'contract_resign_request', bookingId: data.bookingNumber });
}


// ─── Ausweis-Verifizierung: manuelle Erinnerung (Admin-ausgelöst) ───────────

export async function sendVerificationReminder(data: {
  customerName: string;
  customerEmail: string;
}): Promise<void> {
  const BASE_URL = await getSiteUrl();
  const subject = 'Erinnerung: Bitte verifiziere dein cam2rent-Konto';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">Verifiziere dein Konto</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
            Hallo ${h(data.customerName)},<br><br>
            dein cam2rent-Konto ist noch nicht verifiziert. Damit wir dir eine Kamera versenden können, brauchen wir einmalig einen Identitätsnachweis von dir.
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Bitte lade Vorder- und Rückseite deines Personalausweises (oder Reisepasses) hoch — gut ausgeleuchtet, alle Ecken sichtbar, keine Überdeckung. Das dauert nur eine Minute.
          </p>
          <a href="${BASE_URL}/konto/verifizierung" style="display:inline-block;padding:14px 28px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
            Jetzt verifizieren
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
            Falls du Fragen hast, antworte einfach auf diese E-Mail oder schreibe uns über <a href="${BASE_URL}/konto/nachrichten" style="color:#3b82f6;">dein Konto</a>.
          </p>
        </td></tr>
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${BUSINESS.name} &middot; ${BUSINESS.slogan} &middot; <a href="${BUSINESS.url}" style="color:#9ca3af;">${BUSINESS.domain}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await sendAndLog({ to: data.customerEmail, subject, html, emailType: 'verification_reminder_manual' });
}


// ─── Wochenbericht (PDF + HTML) ─────────────────────────────────────────────

export async function sendWeeklyReport(toEmail?: string): Promise<void> {
  const { collectWeeklyReportData } = await import("@/lib/weekly-report");
  const { WeeklyReportPDF } = await import("@/lib/weekly-report-pdf");
  const { renderToBuffer } = await import("@react-pdf/renderer");

  const recipient = toEmail || ADMIN_EMAIL;
  const data = await collectWeeklyReportData();

  const pdfBuffer = await renderToBuffer(createElement(WeeklyReportPDF, { data }) as ReactElement<DocumentProps>);

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const subject = `cam2rent Wochenbericht KW ${data.weekNumber}/${data.year}`;

  const revClass = data.finance.revenue >= data.finance.prevRevenue ? "color:#10b981" : "color:#ef4444";
  const bookClass = data.bookings.newCount >= data.bookings.prevCount ? "color:#10b981" : "color:#ef4444";
  const warningsBlock = data.warnings.length
    ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:6px;margin:0 0 20px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#78350f;">⚠ Warnungen</p>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:#78350f;">
          ${data.warnings.map((w) => `<li>${h(w)}</li>`).join("")}
        </ul>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:22px 32px;">
    <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
      <td valign="middle" style="padding-right:14px;"><img src="https://cam2rent.de/favicon/icon-dark-64.png" width="44" height="44" alt="" style="display:block;border-radius:8px;border:0;"></td>
      <td valign="middle">
        <p style="margin:0;font-size:22px;font-weight:700;color:#fff;line-height:1.1;">Wochenbericht</p>
        <p style="margin:3px 0 0;font-size:13px;color:#9ca3af;">KW ${data.weekNumber}/${data.year} · ${fmt(data.periodStart)} – ${fmt(data.periodEnd)}</p>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#fff;padding:28px 32px;">
    ${warningsBlock}
    <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
      Hier die Zusammenfassung der letzten 7 Tage. Alle Details im PDF-Anhang.
    </p>

    <h3 style="margin:18px 0 8px;font-size:14px;color:#0a0a0a;">💶 Finanzen</h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Umsatz Woche</td>
          <td style="padding:3px 0;font-size:13px;font-weight:700;text-align:right;${revClass};">${fmtEuro(data.finance.revenue)}</td></tr>
      <tr><td style="padding:3px 0;font-size:12px;color:#6b7280;">Vorwoche</td>
          <td style="padding:3px 0;font-size:12px;color:#6b7280;text-align:right;">${fmtEuro(data.finance.prevRevenue)}</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Bezahlte Rechnungen</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.finance.invoicesPaid}</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Offene Rechnungen</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.finance.invoicesOpen} (überfällig: ${fmtEuro(data.finance.overdueAmount)})</td></tr>
    </table>

    <h3 style="margin:20px 0 8px;font-size:14px;color:#0a0a0a;">📅 Buchungen</h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Neue Buchungen</td>
          <td style="padding:3px 0;font-size:13px;font-weight:700;text-align:right;${bookClass};">${data.bookings.newCount} (Vorwoche: ${data.bookings.prevCount})</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Stornierungen</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.bookings.cancelledCount}</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Nächste 7 Tage</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.bookings.upcomingShipping.length} Versand · ${data.bookings.upcomingReturn.length} Rückgabe</td></tr>
    </table>

    <h3 style="margin:20px 0 8px;font-size:14px;color:#0a0a0a;">👤 Kunden & Operativ</h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Neue Registrierungen</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.customers.newRegistrations}</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Offene Verifizierungen</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.customers.pendingVerifications}</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Neue Waitlist-Einträge</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.customers.newWaitlist}</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Neue Schäden</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.operations.newDamages}</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Kameras in Wartung</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.operations.camerasInMaintenance}</td></tr>
    </table>

    <h3 style="margin:20px 0 8px;font-size:14px;color:#0a0a0a;">📝 Content</h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Blog-Artikel veröffentlicht</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.content.blogPublished.length}</td></tr>
      <tr><td style="padding:3px 0;font-size:13px;color:#374151;">Social-Posts veröffentlicht</td>
          <td style="padding:3px 0;font-size:13px;text-align:right;">${data.content.socialPublishedCount}</td></tr>
    </table>

    <p style="margin:24px 0 4px;font-size:12px;color:#6b7280;">📎 Vollständiger Bericht als PDF im Anhang.</p>
    <p style="margin:0;font-size:12px;color:#6b7280;">
      <a href="https://cam2rent.de/admin" style="color:#3b82f6;">→ Admin-Dashboard öffnen</a>
    </p>
  </td></tr>
  <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">cam2rent · Automatischer Wochenbericht · <a href="https://cam2rent.de/admin/einstellungen" style="color:#9ca3af;">Einstellungen</a></p>
  </td></tr>
</table>
</td></tr></table></body></html>`;

  await sendAndLog({
    to: recipient,
    subject,
    html,
    emailType: "weekly_report",
    attachments: [{ filename: `cam2rent-wochenbericht-KW${data.weekNumber}-${data.year}.pdf`, content: pdfBuffer }],
  });
}

// ─── Persönlicher Termin-Reminder ─────────────────────────────────────────────
export interface AppointmentReminderData {
  to: string;
  employeeName: string;
  appointmentTitle: string;
  startsAt: string;        // ISO
  minutesBefore: number;   // Vorlaufzeit
  location?: string | null;
  description?: string | null;
  isAllDay: boolean;
  isShared: boolean;       // true → Termin wurde von Kollege geteilt
}

export async function sendAppointmentReminder(data: AppointmentReminderData) {
  const minutesLabel =
    data.minutesBefore >= 1440 ? `${Math.round(data.minutesBefore / 1440)} Tag(e) vorher` :
    data.minutesBefore >= 60   ? `${Math.round(data.minutesBefore / 60)} Stunde(n) vorher` :
                                 `${data.minutesBefore} Minuten vorher`;

  const sharedHint = data.isShared
    ? '<p style="margin:0 0 12px;font-size:12px;color:#7c3aed;">📤 Termin von Kollege geteilt</p>'
    : '';

  const whenStr = data.isAllDay ? fmtDate(data.startsAt) : fmtDateTime(data.startsAt);

  const subject = stripSubject(`⏰ Erinnerung: ${data.appointmentTitle} (${minutesLabel})`);
  const html = `<!doctype html><html><body style="margin:0;font-family:-apple-system,system-ui,Segoe UI,Helvetica,Arial,sans-serif;background:#f5f5f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:24px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
  <tr><td style="background:#0a0a0a;padding:16px 32px;">
    <h1 style="margin:0;color:white;font-size:18px;font-weight:700;">cam<span style="color:#06b6d4;">2</span>rent · Erinnerung</h1>
  </td></tr>
  <tr><td style="padding:24px 32px;">
    ${sharedHint}
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Hallo ${h(data.employeeName || 'Kollege')},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">dein Termin steht ${minutesLabel} an:</p>
    <div style="background:#f9fafb;border-left:4px solid #06b6d4;padding:14px 16px;border-radius:6px;">
      <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#0a0a0a;">${h(data.appointmentTitle)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#374151;">🕐 ${h(whenStr)}</p>
      ${data.location ? `<p style="margin:0 0 4px;font-size:13px;color:#374151;">📍 ${h(data.location)}</p>` : ''}
      ${data.description ? `<p style="margin:8px 0 0;font-size:13px;color:#4b5563;white-space:pre-wrap;">${h(data.description)}</p>` : ''}
    </div>
    <p style="margin:20px 0 0;font-size:12px;color:#6b7280;">
      <a href="https://cam2rent.de/admin/mein/kalender" style="color:#06b6d4;font-weight:600;">→ Im Kalender öffnen</a>
    </p>
  </td></tr>
  <tr><td style="background:#f5f5f0;padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">cam2rent · Persönlicher Termin-Reminder</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;

  await sendAndLog({
    to: data.to,
    subject,
    html,
    emailType: 'appointment_reminder',
  });
}


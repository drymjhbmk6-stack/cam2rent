import { Resend } from 'resend';
import { BUSINESS } from '@/lib/business-config';
import { escapeHtml as h } from '@/lib/email';
import { getResendFromEmail, getSiteUrl } from '@/lib/env-mode';
import { generateSurveyToken } from '@/lib/survey-token';

// Platzhalter-Key, damit Modul-Import beim Build ohne RESEND_API_KEY nicht kippt.
const resend = new Resend(process.env.RESEND_API_KEY || 're_build_placeholder');

const REPLY_TO = process.env.ADMIN_EMAIL ?? BUSINESS.emailKontakt;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReminderEmailData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  rentalTo: string; // 'YYYY-MM-DD'
  bookingUrl?: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function buildBookingUrl(bookingId: string, custom: string | undefined, baseUrl: string): string {
  return custom ?? `${baseUrl}/buchung/${bookingId}`;
}

/**
 * Wraps the body content into the standard cam2rent email layout.
 */
function wrapLayout(body: string, baseUrl: string): string {
  const BASE_URL = baseUrl;
  return `<!DOCTYPE html>
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
              <p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;line-height:1.1;">cam2rent</p>
              <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;line-height:1.2;">Action-Cam Verleih</p>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;">
          ${body}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">cam2rent &middot; Action-Cam Verleih &middot; <a href="${BASE_URL}" style="color:#9ca3af;">${BASE_URL.replace('https://', '')}</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background:#0a0a0a;border-radius:8px;padding:12px 28px;">
      <a href="${href}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">${label}</a>
    </td></tr>
  </table>`;
}

// ─── 1. Return Reminder – 2 days before ──────────────────────────────────────

export async function sendReturnReminder(data: ReminderEmailData): Promise<string | null> {
  const baseUrl = await getSiteUrl();
  const fromEmail = await getResendFromEmail();
  const url = buildBookingUrl(data.bookingId, data.bookingUrl, baseUrl);
  const subject = `Erinnerung: Deine Rückgabe steht bevor – ${h(data.productName)}`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Rückgabe in 2 Tagen</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${h(data.customerName)},<br><br>
      nur eine kurze Erinnerung: Dein Mietartikel <strong>${h(data.productName)}</strong>
      muss bis zum <strong>${fmtDate(data.rentalTo)}</strong> zurückgesendet werden.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Bitte denke daran, das Paket rechtzeitig aufzugeben, damit es pünktlich bei uns ankommt.
    </p>
    ${ctaButton(url, 'Buchung ansehen')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${h(data.bookingId)}</p>
  `, baseUrl);

  const result = await resend.emails.send({
    from: `cam2rent <${fromEmail}>`,
    replyTo: REPLY_TO,
    to: data.customerEmail,
    subject,
    html,
  });

  // Resend wirft NICHT bei Rate-Limit/ungueltiger Adresse — sondern liefert
  // {data:null, error}. Ohne diesen Throw wuerde der Cron die Mail als
  // "sent" loggen, der idempotency-Set blockiert kuenftige Retries.
  if (result.error) {
    throw new Error(result.error.message ?? 'resend send failed');
  }

  return result.data?.id ?? null;
}

// ─── 2. Return Due Today ─────────────────────────────────────────────────────

export async function sendReturnDueToday(data: ReminderEmailData): Promise<string | null> {
  const baseUrl = await getSiteUrl();
  const fromEmail = await getResendFromEmail();
  const url = buildBookingUrl(data.bookingId, data.bookingUrl, baseUrl);
  const subject = `Heute bitte zurücksenden: ${h(data.productName)}`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Heute ist Rückgabetag!</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${h(data.customerName)},<br><br>
      heute endet dein Mietzeitraum für <strong>${h(data.productName)}</strong>.
      Bitte sende den Artikel heute noch zurück.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Falls du den Artikel bereits zurückgesendet hast, kannst du diese E-Mail ignorieren.
    </p>
    ${ctaButton(url, 'Buchung ansehen')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${h(data.bookingId)}</p>
  `, baseUrl);

  const result = await resend.emails.send({
    from: `cam2rent <${fromEmail}>`,
    replyTo: REPLY_TO,
    to: data.customerEmail,
    subject,
    html,
  });

  // Resend wirft NICHT bei Rate-Limit/ungueltiger Adresse — sondern liefert
  // {data:null, error}. Ohne diesen Throw wuerde der Cron die Mail als
  // "sent" loggen, der idempotency-Set blockiert kuenftige Retries.
  if (result.error) {
    throw new Error(result.error.message ?? 'resend send failed');
  }

  return result.data?.id ?? null;
}

// ─── 3. Overdue – 1 day after ────────────────────────────────────────────────

export async function sendOverdueNotice(data: ReminderEmailData): Promise<string | null> {
  const baseUrl = await getSiteUrl();
  const fromEmail = await getResendFromEmail();
  const url = buildBookingUrl(data.bookingId, data.bookingUrl, baseUrl);
  const subject = `Rückgabe überfällig – ${h(data.productName)}`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e11d48;">Rückgabe überfällig</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${h(data.customerName)},<br><br>
      der Mietzeitraum für <strong>${h(data.productName)}</strong> ist seit gestern
      (<strong>${fmtDate(data.rentalTo)}</strong>) abgelaufen.
      Bitte sende den Artikel umgehend an uns zurück.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Falls du den Artikel bereits zurückgesendet hast, kannst du diese E-Mail ignorieren.
      Bei Fragen melde dich gerne bei uns.
    </p>
    ${ctaButton(url, 'Buchung ansehen')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${h(data.bookingId)}</p>
  `, baseUrl);

  const result = await resend.emails.send({
    from: `cam2rent <${fromEmail}>`,
    replyTo: REPLY_TO,
    to: data.customerEmail,
    subject,
    html,
  });

  // Resend wirft NICHT bei Rate-Limit/ungueltiger Adresse — sondern liefert
  // {data:null, error}. Ohne diesen Throw wuerde der Cron die Mail als
  // "sent" loggen, der idempotency-Set blockiert kuenftige Retries.
  if (result.error) {
    throw new Error(result.error.message ?? 'resend send failed');
  }

  return result.data?.id ?? null;
}

// ─── 4. Second Overdue – 3 days after ────────────────────────────────────────

export async function sendSecondOverdueNotice(data: ReminderEmailData): Promise<string | null> {
  const baseUrl = await getSiteUrl();
  const fromEmail = await getResendFromEmail();
  const url = buildBookingUrl(data.bookingId, data.bookingUrl, baseUrl);
  const subject = `Dringende Erinnerung: Rückgabe ausstehend – ${h(data.productName)}`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e11d48;">Dringende Erinnerung</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${h(data.customerName)},<br><br>
      dein Mietzeitraum für <strong>${h(data.productName)}</strong> ist seit dem
      <strong>${fmtDate(data.rentalTo)}</strong> abgelaufen – das sind bereits 3 Tage.
      Wir bitten dich dringend, den Artikel sofort zurückzusenden.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Solltest du den Artikel nicht zeitnah zurücksenden, behalten wir uns weitere
      Schritte vor. Bei Problemen kontaktiere uns bitte umgehend.
    </p>
    ${ctaButton(url, 'Jetzt Rückgabe einleiten')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${h(data.bookingId)}</p>
  `, baseUrl);

  const result = await resend.emails.send({
    from: `cam2rent <${fromEmail}>`,
    replyTo: REPLY_TO,
    to: data.customerEmail,
    subject,
    html,
  });

  // Resend wirft NICHT bei Rate-Limit/ungueltiger Adresse — sondern liefert
  // {data:null, error}. Ohne diesen Throw wuerde der Cron die Mail als
  // "sent" loggen, der idempotency-Set blockiert kuenftige Retries.
  if (result.error) {
    throw new Error(result.error.message ?? 'resend send failed');
  }

  return result.data?.id ?? null;
}

// ─── 5. Review Request – 3 days after completed return ───────────────────────

export async function sendReviewRequest(data: ReminderEmailData): Promise<string | null> {
  const baseUrl = await getSiteUrl();
  const fromEmail = await getResendFromEmail();
  // Sweep 7 Vuln 25 — HMAC-Token im Link, damit der Survey-Endpoint
  // nicht durch erratene Booking-IDs ueber Spam-Reviews missbraucht wird.
  const surveyToken = generateSurveyToken(data.bookingId);
  const reviewUrl = `${baseUrl}/umfrage/${h(data.bookingId)}?t=${h(surveyToken)}`;
  const subject = `Wie war dein Erlebnis mit ${h(data.productName)}?`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Wie war dein Erlebnis?</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${h(data.customerName)},<br><br>
      wir hoffen, du hattest eine tolle Zeit mit deiner <strong>${h(data.productName)}</strong>!
      Deine Meinung ist uns wichtig – teile doch deine Erfahrung mit anderen.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Eine Bewertung dauert nur 1 Minute und hilft anderen Abenteurern bei ihrer Entscheidung.
    </p>
    ${ctaButton(reviewUrl, 'Jetzt bewerten')}
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;">
      Vielen Dank und bis zum nächsten Mal!<br>Dein cam2rent-Team
    </p>
  `, baseUrl);

  const result = await resend.emails.send({
    from: `cam2rent <${fromEmail}>`,
    replyTo: REPLY_TO,
    to: data.customerEmail,
    subject,
    html,
  });

  // Resend wirft NICHT bei Rate-Limit/ungueltiger Adresse — sondern liefert
  // {data:null, error}. Ohne diesen Throw wuerde der Cron die Mail als
  // "sent" loggen, der idempotency-Set blockiert kuenftige Retries.
  if (result.error) {
    throw new Error(result.error.message ?? 'resend send failed');
  }

  return result.data?.id ?? null;
}

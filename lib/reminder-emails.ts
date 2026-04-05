import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'buchungen@cam2rent.de';
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cam2rent.de';

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

function buildBookingUrl(bookingId: string, custom?: string): string {
  return custom ?? `${BASE_URL}/buchung/${bookingId}`;
}

/**
 * Wraps the body content into the standard cam2rent email layout.
 */
function wrapLayout(body: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:28px 32px;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">cam2rent</p>
          <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">Action-Cam Verleih</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;">
          ${body}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">cam2rent &middot; Action-Cam Verleih &middot; <a href="https://cam2rent.de" style="color:#9ca3af;">cam2rent.de</a></p>
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
  const url = buildBookingUrl(data.bookingId, data.bookingUrl);
  const subject = `Erinnerung: Deine Rückgabe steht bevor – ${data.productName}`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Rückgabe in 2 Tagen</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${data.customerName},<br><br>
      nur eine kurze Erinnerung: Dein Mietartikel <strong>${data.productName}</strong>
      muss bis zum <strong>${fmtDate(data.rentalTo)}</strong> zurückgesendet werden.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Bitte denke daran, das Paket rechtzeitig aufzugeben, damit es pünktlich bei uns ankommt.
    </p>
    ${ctaButton(url, 'Buchung ansehen')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${data.bookingId}</p>
  `);

  const result = await resend.emails.send({
    from: `cam2rent <${FROM_EMAIL}>`,
    to: data.customerEmail,
    subject,
    html,
  });

  return result.data?.id ?? null;
}

// ─── 2. Return Due Today ─────────────────────────────────────────────────────

export async function sendReturnDueToday(data: ReminderEmailData): Promise<string | null> {
  const url = buildBookingUrl(data.bookingId, data.bookingUrl);
  const subject = `Heute bitte zurücksenden: ${data.productName}`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Heute ist Rückgabetag!</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${data.customerName},<br><br>
      heute endet dein Mietzeitraum für <strong>${data.productName}</strong>.
      Bitte sende den Artikel heute noch zurück.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Falls du den Artikel bereits zurückgesendet hast, kannst du diese E-Mail ignorieren.
    </p>
    ${ctaButton(url, 'Buchung ansehen')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${data.bookingId}</p>
  `);

  const result = await resend.emails.send({
    from: `cam2rent <${FROM_EMAIL}>`,
    to: data.customerEmail,
    subject,
    html,
  });

  return result.data?.id ?? null;
}

// ─── 3. Overdue – 1 day after ────────────────────────────────────────────────

export async function sendOverdueNotice(data: ReminderEmailData): Promise<string | null> {
  const url = buildBookingUrl(data.bookingId, data.bookingUrl);
  const subject = `Rückgabe überfällig – ${data.productName}`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e11d48;">Rückgabe überfällig</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${data.customerName},<br><br>
      der Mietzeitraum für <strong>${data.productName}</strong> ist seit gestern
      (<strong>${fmtDate(data.rentalTo)}</strong>) abgelaufen.
      Bitte sende den Artikel umgehend an uns zurück.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Falls du den Artikel bereits zurückgesendet hast, kannst du diese E-Mail ignorieren.
      Bei Fragen melde dich gerne bei uns.
    </p>
    ${ctaButton(url, 'Buchung ansehen')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${data.bookingId}</p>
  `);

  const result = await resend.emails.send({
    from: `cam2rent <${FROM_EMAIL}>`,
    to: data.customerEmail,
    subject,
    html,
  });

  return result.data?.id ?? null;
}

// ─── 4. Second Overdue – 3 days after ────────────────────────────────────────

export async function sendSecondOverdueNotice(data: ReminderEmailData): Promise<string | null> {
  const url = buildBookingUrl(data.bookingId, data.bookingUrl);
  const subject = `Dringende Erinnerung: Rückgabe ausstehend – ${data.productName}`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#e11d48;">Dringende Erinnerung</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${data.customerName},<br><br>
      dein Mietzeitraum für <strong>${data.productName}</strong> ist seit dem
      <strong>${fmtDate(data.rentalTo)}</strong> abgelaufen – das sind bereits 3 Tage.
      Wir bitten dich dringend, den Artikel sofort zurückzusenden.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Solltest du den Artikel nicht zeitnah zurücksenden, behalten wir uns weitere
      Schritte vor. Bei Problemen kontaktiere uns bitte umgehend.
    </p>
    ${ctaButton(url, 'Jetzt Rückgabe einleiten')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${data.bookingId}</p>
  `);

  const result = await resend.emails.send({
    from: `cam2rent <${FROM_EMAIL}>`,
    to: data.customerEmail,
    subject,
    html,
  });

  return result.data?.id ?? null;
}

// ─── 5. Review Request – 3 days after completed return ───────────────────────

export async function sendReviewRequest(data: ReminderEmailData): Promise<string | null> {
  const reviewUrl = `${BASE_URL}/bewertung/${data.bookingId}`;
  const subject = `Wie war dein Erlebnis mit ${data.productName}?`;

  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Wie war dein Erlebnis?</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">
      Hallo ${data.customerName},<br><br>
      wir hoffen, du hattest eine tolle Zeit mit deiner <strong>${data.productName}</strong>!
      Deine Meinung ist uns wichtig – teile doch deine Erfahrung mit anderen.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">
      Eine Bewertung dauert nur 1 Minute und hilft anderen Abenteurern bei ihrer Entscheidung.
    </p>
    ${ctaButton(reviewUrl, 'Jetzt bewerten')}
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;">
      Vielen Dank und bis zum nächsten Mal!<br>Dein cam2rent-Team
    </p>
  `);

  const result = await resend.emails.send({
    from: `cam2rent <${FROM_EMAIL}>`,
    to: data.customerEmail,
    subject,
    html,
  });

  return result.data?.id ?? null;
}

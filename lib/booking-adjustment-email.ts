import { BUSINESS } from '@/lib/business-config';
import { escapeHtml, stripSubject } from '@/lib/email';

/**
 * E-Mail fuer eine Nachzahlung aus einer Buchungsbearbeitung.
 * Der Kunde bekommt einen Stripe-Zahlungslink ueber die Differenz.
 *
 * Bewusst schlank gehalten (gleicher Stil wie payment-link-email), nutzt
 * sendAndLog → faellt unter emailType 'payment_link' im E-Mail-Protokoll.
 */
export function buildBookingAdjustmentEmail(opts: {
  bookingId: string;
  customerName: string | null;
  productName: string;
  rentalFrom: string;
  rentalTo: string;
  diffAmount: number;
  newTotal: number;
  reason: string;
  paymentUrl: string;
}): { subject: string; html: string; text: string } {
  const name = opts.customerName || 'dort';
  const diffFmt = Number(opts.diffAmount).toFixed(2).replace('.', ',');
  const totalFmt = Number(opts.newTotal).toFixed(2).replace('.', ',');

  const safeName = escapeHtml(name);
  const safeBookingId = escapeHtml(opts.bookingId);
  const safeProduct = escapeHtml(opts.productName);
  const safeFrom = escapeHtml(opts.rentalFrom);
  const safeTo = escapeHtml(opts.rentalTo);
  const safeUrl = escapeHtml(opts.paymentUrl);
  const safeDiff = escapeHtml(diffFmt);
  const safeTotal = escapeHtml(totalFmt);
  const safeReason = escapeHtml(opts.reason);

  const subject = stripSubject(`Anpassung deiner Buchung ${opts.bookingId} — Nachzahlung ${diffFmt} €`);

  const html = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-weight: 900; font-size: 20px; letter-spacing: -0.5px;">
          cam<span style="color: #3b82f6;">2</span>rent
        </span>
      </div>

      <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #1a1a1a;">
        Deine Buchung wurde angepasst
      </h1>
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        Hallo ${safeName},<br/>
        wir haben deine Buchung <strong>${safeBookingId}</strong> auf deinen Wunsch angepasst.
        Dadurch ergibt sich eine Nachzahlung.
      </p>

      <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <p style="margin: 0 0 4px; font-size: 13px; color: #94a3b8;">Buchungsdetails</p>
        <p style="margin: 0; font-weight: 700; font-size: 16px; color: #1a1a1a;">${safeProduct}</p>
        <p style="margin: 4px 0 0; font-size: 14px; color: #64748b;">${safeFrom} bis ${safeTo}</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Grund: ${safeReason}</p>
        <p style="margin: 12px 0 0; font-size: 14px; color: #64748b;">Neuer Gesamtbetrag: <strong>${safeTotal} €</strong></p>
        <p style="margin: 4px 0 0; font-weight: 700; font-size: 20px; color: #1a1a1a;">Nachzuzahlen: ${safeDiff} €</p>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${safeUrl}" style="display: inline-block; background: #3b82f6; color: white; font-weight: 700; font-size: 16px; padding: 14px 36px; border-radius: 10px; text-decoration: none;">
          Jetzt ${safeDiff} € nachzahlen
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

      <p style="color: #94a3b8; font-size: 11px; line-height: 1.5; margin: 0; text-align: center;">
        ${escapeHtml(BUSINESS.owner)} &middot; ${escapeHtml(BUSINESS.street)} &middot; ${escapeHtml(BUSINESS.zip)} ${escapeHtml(BUSINESS.city)}<br/>
        ${escapeHtml(BUSINESS.emailKontakt)} &middot; ${escapeHtml(BUSINESS.phone)}
      </p>
    </div>
  `;

  const text = [
    `Hallo ${name},`,
    '',
    `wir haben deine Buchung ${opts.bookingId} angepasst.`,
    `Produkt: ${opts.productName}`,
    `Zeitraum: ${opts.rentalFrom} bis ${opts.rentalTo}`,
    `Grund: ${opts.reason}`,
    '',
    `Neuer Gesamtbetrag: ${totalFmt} EUR`,
    `Nachzuzahlen: ${diffFmt} EUR`,
    '',
    'Jetzt nachzahlen:',
    opts.paymentUrl,
    '',
    '--',
    `${BUSINESS.owner}`,
    `${BUSINESS.street}, ${BUSINESS.zip} ${BUSINESS.city}`,
    `${BUSINESS.emailKontakt} · ${BUSINESS.phone}`,
  ].join('\n');

  return { subject, html, text };
}

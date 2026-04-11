import { sendAndLog } from '@/lib/email';
import { BUSINESS } from '@/lib/business-config';

interface ContractEmailOpts {
  to: string;
  customerName: string;
  bookingId: string;
  bookingNumber: string;
  productName: string;
  rentalFrom: string;   // 'DD.MM.YYYY'
  rentalTo: string;     // 'DD.MM.YYYY'
  pdfBuffer: Buffer;
}

export async function sendContractEmail(opts: ContractEmailOpts) {
  const subject = `Dein Mietvertrag \u2013 ${BUSINESS.name} Buchung ${opts.bookingNumber}`;

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
        <tr><td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Dein Mietvertrag</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">
            Hallo ${opts.customerName || 'Kunde'},<br>
            im Anhang findest du deinen digital unterzeichneten Mietvertrag fuer die Buchung
            <strong>${opts.bookingNumber}</strong> (${opts.productName}, ${opts.rentalFrom} \u2013 ${opts.rentalTo}).
          </p>

          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">
            Bitte hebe dieses Dokument fuer deine Unterlagen auf.
          </p>

          <!-- Info-Box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:0.8px;">Buchungsdetails</p>
              <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Kamera:</strong> ${opts.productName}</p>
              <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Zeitraum:</strong> ${opts.rentalFrom} \u2013 ${opts.rentalTo}</p>
              <p style="margin:0;font-size:14px;color:#374151;"><strong>Buchungsnummer:</strong> ${opts.bookingNumber}</p>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#6b7280;">
            Bei Fragen erreichst du uns unter
            <a href="mailto:${BUSINESS.emailKontakt}" style="color:#3b82f6;text-decoration:none;">${BUSINESS.emailKontakt}</a>.
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            ${BUSINESS.name} | ${BUSINESS.street} | ${BUSINESS.zip} ${BUSINESS.city}<br>
            <a href="${BUSINESS.url}" style="color:#6b7280;text-decoration:none;">${BUSINESS.domain}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendAndLog({
    to: opts.to,
    subject,
    html,
    bookingId: opts.bookingId,
    emailType: 'contract_signed',
    attachments: [{
      filename: `Mietvertrag-${opts.bookingNumber}.pdf`,
      content: opts.pdfBuffer,
    }],
  });
}

import { createServiceClient } from '@/lib/supabase';
import { BUSINESS } from '@/lib/business-config';

/**
 * Baut den Betreff + HTML-Body + Plain-Text fuer die Zahlungs-Link-E-Mail +
 * berechnet die Deadline anhand `admin_settings.awaiting_payment_cancel_rules`.
 *
 * Wird sowohl von `approve-booking` (initialer Versand) als auch von
 * `resend-payment-link` (manueller Re-Send aus Admin-UI) genutzt.
 *
 * Deliverability-Hardening: Plain-Text-Alternative, Impressum-Footer,
 * ausgewogenes Text-zu-Link-Verhaeltnis — damit Outlook & Gmail die Mail
 * nicht als Phishing einstufen ("Jetzt bezahlen" + grosser Button reicht
 * sonst aus, dass Outlook still dropt).
 */
export async function buildPaymentLinkEmail(opts: {
  bookingId: string;
  customerName: string | null;
  productName: string;
  days: number;
  rentalFrom: string;
  rentalTo: string;
  priceTotal: number;
  deliveryMode: 'versand' | 'abholung';
  paymentUrl: string;
}): Promise<{ subject: string; html: string; text: string }> {
  const supabase = createServiceClient();

  const rules = {
    versand: { days_before_rental: 3, cutoff_hour_berlin: 18 },
    abholung: { days_before_rental: 1, cutoff_hour_berlin: 18 },
  };
  try {
    const { data: ruleSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'awaiting_payment_cancel_rules')
      .maybeSingle();
    if (ruleSetting?.value) {
      const parsed = typeof ruleSetting.value === 'string' ? JSON.parse(ruleSetting.value) : ruleSetting.value;
      if (parsed?.versand) rules.versand = { ...rules.versand, ...parsed.versand };
      if (parsed?.abholung) rules.abholung = { ...rules.abholung, ...parsed.abholung };
    }
  } catch {
    // default rules
  }

  const rule = rules[opts.deliveryMode];

  let deadlineLabel = 'vor Mietbeginn';
  try {
    const [y, m, d] = String(opts.rentalFrom).split('-').map((s) => parseInt(s, 10));
    const pivot = new Date(Date.UTC(y, m - 1, d - rule.days_before_rental));
    const dateStr = `${pivot.getUTCFullYear()}-${String(pivot.getUTCMonth() + 1).padStart(2, '0')}-${String(pivot.getUTCDate()).padStart(2, '0')}`;
    const { getBerlinOffsetString } = await import('@/lib/timezone');
    const offset = getBerlinOffsetString(new Date(`${dateStr}T12:00:00Z`));
    const deadlineDate = new Date(`${dateStr}T${String(rule.cutoff_hour_berlin).padStart(2, '0')}:00:00${offset}`);
    deadlineLabel = deadlineDate.toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' Uhr';
  } catch {
    // fallback label
  }

  const priceFmt = Number(opts.priceTotal).toFixed(2).replace('.', ',');
  const customerName = opts.customerName || 'Kundin / Kunde';
  const deliveryLabel = opts.deliveryMode === 'abholung' ? 'Abholung bei uns' : 'Versand per Paket';

  // Betreff bewusst ohne Reizworte wie „Zahlungs-Link" oder „Jetzt bezahlen" —
  // das sind Outlook-Phishing-Trigger. Stattdessen Buchungsnummer + Kontext.
  const subject = `Deine Buchung ${opts.bookingId} ist freigegeben`;

  const html = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-weight: 900; font-size: 20px; letter-spacing: -0.5px;">
          cam<span style="color: #3b82f6;">2</span>rent
        </span>
      </div>

      <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">
        Hallo ${customerName},
      </h1>
      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        deine Buchung bei cam2rent ist freigegeben. Wir haben alles vorbereitet und
        warten nur noch auf den Zahlungseingang, dann geht deine Kamera in den ${deliveryLabel}.
      </p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
        Du kannst bequem per Kreditkarte oder PayPal bezahlen — beides läuft über
        unseren Zahlungsdienstleister Stripe, alle Daten sind verschlüsselt.
      </p>

      <table role="presentation" width="100%" style="border-collapse: collapse; background: #f8fafc; border-radius: 12px; margin-bottom: 24px;">
        <tr>
          <td style="padding: 16px 20px 4px; font-size: 13px; color: #64748b;">Buchungsnummer</td>
          <td style="padding: 16px 20px 4px; font-size: 13px; color: #1a1a1a; text-align: right; font-weight: 600;">${opts.bookingId}</td>
        </tr>
        <tr>
          <td style="padding: 4px 20px; font-size: 13px; color: #64748b;">Produkt</td>
          <td style="padding: 4px 20px; font-size: 13px; color: #1a1a1a; text-align: right;">${opts.productName}</td>
        </tr>
        <tr>
          <td style="padding: 4px 20px; font-size: 13px; color: #64748b;">Mietdauer</td>
          <td style="padding: 4px 20px; font-size: 13px; color: #1a1a1a; text-align: right;">${opts.days} Tage</td>
        </tr>
        <tr>
          <td style="padding: 4px 20px; font-size: 13px; color: #64748b;">Zeitraum</td>
          <td style="padding: 4px 20px; font-size: 13px; color: #1a1a1a; text-align: right;">${opts.rentalFrom} bis ${opts.rentalTo}</td>
        </tr>
        <tr>
          <td style="padding: 4px 20px 16px; font-size: 13px; color: #64748b;">Gesamtbetrag</td>
          <td style="padding: 4px 20px 16px; font-size: 15px; color: #1a1a1a; text-align: right; font-weight: 700;">${priceFmt} €</td>
        </tr>
      </table>

      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 12px;">
        Über diesen Link kommst du zur sicheren Zahlungsseite bei Stripe:
      </p>
      <p style="margin: 0 0 24px;">
        <a href="${opts.paymentUrl}" style="color: #2563eb; font-size: 15px; text-decoration: underline; word-break: break-all;">
          ${opts.paymentUrl}
        </a>
      </p>

      <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0 0 8px;">
        <strong>Bitte bis spätestens ${deadlineLabel}</strong> bezahlen — andernfalls
        wird die Buchung automatisch storniert, damit die Kamera noch an andere
        Kunden vermietet werden kann.
      </p>
      <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0 0 24px;">
        Falls du Fragen hast, antworte einfach auf diese Mail oder schreib uns an
        <a href="mailto:${BUSINESS.emailKontakt}" style="color: #2563eb;">${BUSINESS.emailKontakt}</a>.
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

      <p style="color: #94a3b8; font-size: 11px; line-height: 1.5; margin: 0; text-align: center;">
        ${BUSINESS.owner} &middot; ${BUSINESS.street} &middot; ${BUSINESS.zip} ${BUSINESS.city}<br/>
        ${BUSINESS.emailKontakt} &middot; ${BUSINESS.phone}<br/>
        Diese Mail wurde an dich gesendet, weil du auf ${BUSINESS.domain} eine Buchung aufgegeben hast.
      </p>
    </div>
  `;

  const text = [
    `Hallo ${customerName},`,
    '',
    'deine Buchung bei cam2rent ist freigegeben. Wir haben alles vorbereitet und',
    `warten nur noch auf den Zahlungseingang, dann geht deine Kamera in den ${deliveryLabel}.`,
    '',
    'Du kannst bequem per Kreditkarte oder PayPal bezahlen — beides laeuft ueber',
    'unseren Zahlungsdienstleister Stripe, alle Daten sind verschluesselt.',
    '',
    'Buchungsdetails:',
    `  Buchungsnummer: ${opts.bookingId}`,
    `  Produkt:        ${opts.productName}`,
    `  Mietdauer:      ${opts.days} Tage`,
    `  Zeitraum:       ${opts.rentalFrom} bis ${opts.rentalTo}`,
    `  Gesamtbetrag:   ${priceFmt} EUR`,
    '',
    'Zur sicheren Zahlungsseite bei Stripe:',
    opts.paymentUrl,
    '',
    `Bitte bis spaetestens ${deadlineLabel} bezahlen — andernfalls wird die`,
    'Buchung automatisch storniert, damit die Kamera noch an andere Kunden',
    'vermietet werden kann.',
    '',
    `Fragen? Antworte auf diese Mail oder schreib an ${BUSINESS.emailKontakt}.`,
    '',
    '--',
    `${BUSINESS.owner}`,
    `${BUSINESS.street}, ${BUSINESS.zip} ${BUSINESS.city}`,
    `${BUSINESS.emailKontakt} · ${BUSINESS.phone}`,
  ].join('\n');

  return { subject, html, text };
}

/**
 * E-Mail-Vorlagen-Katalog für die Admin-Vorschau.
 *
 * Jeder Eintrag beschreibt:
 * - id: eindeutige Kennung (verwendet in der Preview-URL)
 * - name: Anzeigename
 * - description: wann die E-Mail verschickt wird (Trigger)
 * - recipient: 'customer' | 'admin'
 * - render(): liefert { subject, html } mit Dummy-Daten
 *
 * Für die meisten Templates wird die echte send-Funktion im Preview-Modus
 * (AsyncLocalStorage-Capture via `renderEmailPreview`) aufgerufen — dadurch
 * bleibt die Vorschau immer synchron mit den tatsächlich versendeten E-Mails.
 * Templates mit PDF-Anhängen (z.B. Buchungsbestätigung) nutzen direkt die
 * bereits exportierten build*-Funktionen, um den PDF-Overhead zu sparen.
 */

import {
  renderEmailPreview,
  buildCustomerEmail,
  buildAdminEmail,
  buildCancellationCustomerEmail,
  buildCancellationAdminEmail,
  buildShippingEmail,
  sendDamageReportConfirmation,
  sendAdminDamageNotification,
  sendAdminDamageNotice,
  sendDamageResolution,
  sendReferralReward,
  sendNewMessageNotificationToAdmin,
  sendNewMessageNotificationToCustomer,
  sendExtensionConfirmation,
  sendReviewRequest,
  sendReturnChecklist,
  sendCompletionConfirmation,
  sendAbandonedCartReminder,
  sendVerificationRejected,
  sendWbwConfirmation,
  sendInvoiceAdjustment,
  sendContractResignRequest,
  sendContractSignReminder,
  sendVerificationReminder,
  sendAppointmentReminder,
  sendCreditNote,
  sendInboundReply,
  escapeHtml,
  stripSubject,
  type BookingEmailData,
  type CancellationEmailData,
  type ShippingEmailData,
  type DamageEmailData,
  type DamageResolutionEmailData,
  type ReferralRewardEmailData,
  type MessageNotificationData,
  type ExtensionEmailData,
} from '@/lib/email';
import {
  sendUgcApprovedEmail,
  sendUgcFeaturedEmail,
  sendUgcRejectedEmail,
} from '@/lib/customer-ugc';
import {
  applyEmailOverride,
  getEmailTemplateOverride,
} from '@/lib/email-template-overrides';
import { buildPaymentLinkEmail } from '@/lib/payment-link-email';
import { sendContractEmail } from '@/lib/contracts/send-contract-email';
import { sendNewsletterTest, buildNewsletterEmailHtml } from '@/lib/newsletter';
import { BUSINESS } from '@/lib/business-config';

export type EmailRecipient = 'customer' | 'admin';

export interface EmailTemplateMeta {
  id: string;
  name: string;
  description: string;
  recipient: EmailRecipient;
  render: () => Promise<{ subject: string; html: string }>;
}

/**
 * Wrappt eine Render-Funktion und wendet Admin-Overrides nach dem Rendern an.
 * Wichtig fuer den Build-Pfad (buildCustomerEmail etc.) — der renderEmailPreview-
 * Pfad bekommt Overrides bereits ueber sendAndLog().
 */
async function withOverride(
  id: string,
  render: () => Promise<{ subject: string; html: string }>,
): Promise<{ subject: string; html: string }> {
  const rendered = await render();
  const override = await getEmailTemplateOverride(id).catch(() => null);
  return applyEmailOverride(rendered, override);
}

// ─── Dummy-Daten ──────────────────────────────────────────────────────────────

const DUMMY_BOOKING_ID = 'BK-MUSTER-0001';

const dummyBooking: BookingEmailData = {
  bookingId: DUMMY_BOOKING_ID,
  customerName: 'Max Mustermann',
  customerEmail: 'max.mustermann@example.de',
  productName: 'GoPro Hero13 Black',
  rentalFrom: '2026-05-01',
  rentalTo: '2026-05-07',
  days: 7,
  deliveryMode: 'versand',
  shippingMethod: 'standard',
  haftung: 'standard',
  accessories: ['Mount Set Premium', 'Ersatz-Akku'],
  priceRental: 69,
  priceAccessories: 15,
  priceHaftung: 15,
  priceTotal: 104,
  deposit: 0,
  shippingPrice: 5,
  taxMode: 'kleinunternehmer',
  taxRate: 19,
  ustId: '',
  earlyServiceConsentAt: new Date().toISOString(),
};

const dummyCancellation: CancellationEmailData = {
  bookingId: DUMMY_BOOKING_ID,
  customerName: 'Max Mustermann',
  customerEmail: 'max.mustermann@example.de',
  productName: 'GoPro Hero13 Black',
  productId: 'gopro-hero13-black',
  rentalFrom: '2026-05-01',
  rentalTo: '2026-05-07',
  days: 7,
  priceTotal: 104,
  refundAmount: 78,
  refundPercentage: 0.5,
};

const dummyShipping: ShippingEmailData = {
  bookingId: DUMMY_BOOKING_ID,
  customerName: 'Max Mustermann',
  customerEmail: 'max.mustermann@example.de',
  productName: 'GoPro Hero13 Black',
  rentalFrom: '2026-05-01',
  rentalTo: '2026-05-07',
  trackingNumber: 'DPD123456789',
  trackingUrl: 'https://tracking.dpd.de/status/de_DE/parcel/DPD123456789',
  carrier: 'DPD',
};

const dummyDamage: DamageEmailData = {
  bookingId: DUMMY_BOOKING_ID,
  customerName: 'Max Mustermann',
  customerEmail: 'max.mustermann@example.de',
  productName: 'GoPro Hero13 Black',
  description: 'Linse hat einen Kratzer nach Sturz auf Asphalt. Kamera funktioniert noch.',
  photoCount: 3,
};

const dummyDamageResolution: DamageResolutionEmailData = {
  bookingId: DUMMY_BOOKING_ID,
  customerName: 'Max Mustermann',
  customerEmail: 'max.mustermann@example.de',
  productName: 'GoPro Hero13 Black',
  damageAmount: 89,
  depositRetained: 89,
  adminNotes: 'Linsenersatz durchgeführt. Restbetrag wird einbehalten.',
};

const dummyReferral: ReferralRewardEmailData = {
  referrerName: 'Max Mustermann',
  referrerEmail: 'max.mustermann@example.de',
  referredName: 'Anna Beispiel',
  rewardCode: 'FREUND-MUSTER-15',
  rewardValue: 15,
};

const dummyMessage: MessageNotificationData = {
  customerName: 'Max Mustermann',
  customerEmail: 'max.mustermann@example.de',
  subject: 'Frage zur Lieferung',
  messagePreview: 'Hallo, ich hätte eine Frage zur Lieferung am Freitag — ist eine Wunschuhrzeit möglich?',
};

const dummyExtension: ExtensionEmailData = {
  bookingId: DUMMY_BOOKING_ID,
  customerName: 'Max Mustermann',
  customerEmail: 'max.mustermann@example.de',
  productName: 'GoPro Hero13 Black',
  originalRentalTo: '2026-05-07',
  newRentalTo: '2026-05-10',
  additionalDays: 3,
  priceDifference: 27,
  newTotal: 131,
};

// ─── Inline-HTML-Render-Helper ────────────────────────────────────────────────
//
// Folgende Vorlagen haben (Stand 2026-05-20) KEINE separate Builder-Funktion —
// das HTML lebt direkt am Aufruf-Ort (Crons, Survey, Express-Signup, Newsletter
// Subscribe). Hier sind die Vorschau-Renderer als 1:1-Spiegel hinterlegt. Wenn
// die Original-HTML geaendert wird, muss hier nachgezogen werden. Override-
// Mechanismus (Betreff/Einleitungstext) greift trotzdem ueber `withOverride()`.

function previewAutoCancel(): { subject: string; html: string } {
  const safeName = escapeHtml('Max Mustermann');
  const safeId = escapeHtml(DUMMY_BOOKING_ID);
  const safeProduct = escapeHtml('GoPro Hero13 Black');
  return {
    subject: stripSubject(`Buchung ${DUMMY_BOOKING_ID} automatisch storniert`),
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-weight: 900; font-size: 20px;">cam<span style="color: #3b82f6;">2</span>rent</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
          Buchung storniert
        </h1>
        <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
          Hallo ${safeName},<br/>
          deine Buchung <strong>${safeId}</strong> für <strong>${safeProduct}</strong>
          wurde automatisch storniert, da keine Zahlung vor dem Mietbeginn eingegangen ist.
        </p>
        <p style="color: #64748b; font-size: 14px; margin-top: 16px;">
          Du kannst jederzeit eine neue Buchung erstellen.
          Bei Fragen melde dich gerne bei uns.
        </p>
      </div>
    `,
  };
}

function previewAutoCancelPayment(): { subject: string; html: string } {
  const safeId = escapeHtml(DUMMY_BOOKING_ID);
  const safeName = escapeHtml('Max Mustermann');
  const safeProduct = escapeHtml('GoPro Hero13 Black');
  const safeFrom = escapeHtml('2026-05-01');
  return {
    subject: stripSubject(`Deine Buchung ${DUMMY_BOOKING_ID} wurde storniert`),
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
        <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a;">Buchung ${safeId} storniert</h1>
        <p style="color: #64748b; font-size: 15px; line-height: 1.6;">
          Hallo ${safeName},<br/><br/>
          leider konnten wir bis zur Zahlungsfrist keine Zahlung für deine Buchung "<strong>${safeProduct}</strong>" (Start ${safeFrom}) verbuchen. Die Buchung wurde daher automatisch storniert.
        </p>
        <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
          Wenn du dein Gerät trotzdem noch mieten möchtest, leg die Buchung einfach neu an — ab dem Zeitpunkt der Zahlung ist die Kamera wieder für dich reserviert.
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Viele Grüße<br/>cam2rent</p>
      </div>
    `,
  };
}

function previewVerificationReminder(): { subject: string; html: string } {
  const diffDays = 3; // letzte Erinnerung — fuer Preview die kritischste Variante
  const isFinal = diffDays === 3;
  const uploadUrl = `${BUSINESS.url}/konto/verifizierung?booking=${encodeURIComponent(DUMMY_BOOKING_ID)}`;
  const subject = stripSubject(isFinal
    ? `LETZTE ERINNERUNG: Ausweis fuer Buchung ${DUMMY_BOOKING_ID} — Storno in 24h`
    : `Ausweis-Upload fuer deine Buchung ${DUMMY_BOOKING_ID} (in ${diffDays} Tagen)`);
  const safeId = escapeHtml(DUMMY_BOOKING_ID);
  const safeName = escapeHtml('Max Mustermann');
  const safeProduct = escapeHtml('GoPro Hero13 Black');
  const safeUrgency = escapeHtml(`in ${diffDays} Tagen`);
  const safeBusiness = escapeHtml(BUSINESS.name);
  return {
    subject,
    html: `<!DOCTYPE html>
<html lang="de"><body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:24px 32px;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${safeBusiness}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#9a3412;">${isFinal ? 'Letzte Erinnerung — morgen wird storniert' : 'Ausweis fehlt noch'}</h1>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Hallo ${safeName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">deine Buchung <strong>${safeId}</strong> (${safeProduct}) startet <strong>${safeUrgency}</strong>. Damit wir die Kamera rechtzeitig versenden koennen, brauchen wir eine Kopie deines Personalausweises.</p>
    <p style="margin:0 0 24px;"><a href="${uploadUrl}" style="display:inline-block;padding:14px 28px;background:#ea580c;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Ausweis jetzt hochladen</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${isFinal
      ? 'Wenn bis morgen Mittag kein Ausweis vorliegt, stornieren wir die Buchung automatisch und erstatten dir den vollen Betrag. Einfacher fuer alle, wenn du den Upload jetzt erledigst — dauert 30 Sekunden.'
      : 'Ohne verifizierten Ausweis wird die Buchung kurz vor Mietbeginn automatisch storniert, weil wir sonst den Versandtermin nicht halten koennen. Bei rechtzeitigem Upload ist das kein Problem.'}</p>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Fragen? Einfach auf diese Mail antworten.</p>
  </td></tr>
</table></td></tr></table></body></html>`,
  };
}

function previewVerificationAutoCancel(): { subject: string; html: string } {
  const safeBusiness = escapeHtml(BUSINESS.name);
  const safeName = escapeHtml('Max Mustermann');
  const safeId = escapeHtml(DUMMY_BOOKING_ID);
  const safeProduct = escapeHtml('GoPro Hero13 Black');
  return {
    subject: stripSubject(`Buchung ${DUMMY_BOOKING_ID} storniert — Ausweis fehlte`),
    html: `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:24px 32px;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${safeBusiness}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#991b1b;">Deine Buchung wurde storniert</h1>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Hallo ${safeName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">deine Buchung <strong>${safeId}</strong> (${safeProduct}) wurde storniert, weil bis zum Versand-Termin kein verifizierter Ausweis vorlag. Ohne Ausweisprueung koennen wir aus rechtlichen Gruenden keine Kamera versenden.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Die Zahlung haben wir automatisch erstattet — das Geld sollte innerhalb von 5–10 Werktagen wieder auf deinem Konto sein.</p>
    <p style="margin:0;font-size:14px;color:#6b7280;">Gerne kannst du eine neue Buchung anlegen. Lade vorab deinen Ausweis unter <a href="https://cam2rent.de/konto/verifizierung" style="color:#3b82f6;">Mein Konto → Verifizierung</a> hoch, damit wir beim naechsten Mal direkt versenden koennen.</p>
  </td></tr>
</table></td></tr></table></body></html>`,
  };
}

function previewAccountCreatedAlert(): { subject: string; html: string } {
  const fullName = 'Max Mustermann';
  const ip = '203.0.113.42';
  return {
    subject: 'Neues Konto bei cam2rent angelegt',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">
      <h2>Konto erstellt</h2>
      <p>Hallo ${escapeHtml(fullName)},</p>
      <p>fuer diese E-Mail-Adresse wurde gerade ein Konto bei <strong>${escapeHtml(BUSINESS.name)}</strong> angelegt
      (IP: ${escapeHtml(ip)}).</p>
      <p><strong>Warst das du?</strong> Dann kannst du dich ab sofort einloggen — keine weitere Aktion noetig.</p>
      <p><strong>Warst das NICHT du?</strong> Bitte schreibe sofort an
      <a href="mailto:${BUSINESS.emailKontakt}">${BUSINESS.emailKontakt}</a>, damit wir das Konto sperren.
      Bis zur Klaerung kannst du keine Buchungen unter dieser Adresse durchfuehren.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="font-size:12px;color:#6b7280;">${escapeHtml(BUSINESS.name)} · automatische Sicherheits-Benachrichtigung</p>
    </div>`,
  };
}

function previewReviewRewardCoupon(): { subject: string; html: string } {
  const code = 'DANKE-MUSTER-1234';
  const name = 'Max Mustermann';
  const baseUrl = BUSINESS.url;
  const REWARD_DISCOUNT = 10;
  const REWARD_VALIDITY_DAYS = 90;
  const REWARD_MIN_ORDER = 50;
  return {
    subject: `Dein ${REWARD_DISCOUNT}% Gutschein als Dankeschön`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0a0a0a;">Vielen Dank für dein Feedback!</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            Hallo ${escapeHtml(name)},<br><br>
            wir freuen uns sehr, dass dir unser Service gefallen hat!
            Als kleines Dankeschön bekommst du einen <strong>${REWARD_DISCOUNT}% Gutschein</strong> für deine nächste Buchung.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#fef3c7;border:2px dashed #f59e0b;border-radius:10px;">
            <tr><td style="padding:24px;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.8px;">Dein Gutschein-Code</p>
              <p style="margin:0 0 8px;font-family:monospace;font-size:24px;font-weight:700;color:#78350f;letter-spacing:1px;">${escapeHtml(code)}</p>
              <p style="margin:0;font-size:12px;color:#a16207;">${REWARD_DISCOUNT}% Rabatt · gültig ${REWARD_VALIDITY_DAYS} Tage · ab ${REWARD_MIN_ORDER} €</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
            <tr><td align="center">
              <a href="${baseUrl}/kameras" style="display:inline-block;padding:14px 32px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
                Jetzt neue Buchung starten
              </a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;text-align:center;">
            Der Code ist persönlich für dich hinterlegt und kann einmal verwendet werden.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            ${escapeHtml(BUSINESS.name)} · ${escapeHtml(BUSINESS.addressLine)}<br>
            <a href="${baseUrl}" style="color:#9ca3af;">${escapeHtml(BUSINESS.domain)}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}

function previewNewsletterConfirm(): { subject: string; html: string } {
  const confirmUrl = `${BUSINESS.url}/api/newsletter/confirm?token=DUMMY_CONFIRM_TOKEN`;
  return {
    subject: 'Bestätige deine Newsletter-Anmeldung',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0a0a0a;">Newsletter bestätigen</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6;">
            Vielen Dank für deine Anmeldung! Bitte bestätige deine E-Mail-Adresse mit einem Klick:
          </p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${confirmUrl}" style="display:inline-block;padding:14px 28px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
              Anmeldung bestätigen
            </a>
          </p>
          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
            Falls der Button nicht klickt, kopiere diesen Link:<br/>
            <span style="word-break:break-all;color:#64748b;">${confirmUrl}</span>
          </p>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
            Du hast keinen Newsletter angefordert? Dann ignoriere diese Mail einfach — du wirst nicht eingetragen.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            ${escapeHtml(BUSINESS.name)} · ${escapeHtml(BUSINESS.addressLine)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}

function previewNewsletterCampaign(): { subject: string; html: string } {
  const bodyHtml = `<h2 style="margin:0 0 16px;font-size:20px;color:#0a0a0a;">Neuer Monat, neue Action-Cams!</h2>
<p style="margin:0 0 16px;">Hallo,<br><br>
diesen Monat haben wir die <strong>GoPro Hero13 Black</strong> neu im Sortiment — mit verbessertem
HyperSmooth und 5.3K-Video. Direkt buchbar ab 9,90 € pro Tag.</p>
<p style="margin:0 0 16px;">
<a href="${BUSINESS.url}/kameras" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Zum Shop</a>
</p>
<p style="margin:0;font-size:13px;color:#6b7280;">Viele Grüße<br>${escapeHtml(BUSINESS.name)}</p>`;
  return {
    subject: 'Neuer Monat, neue Kameras im Verleih',
    html: buildNewsletterEmailHtml({
      bodyHtml,
      unsubscribeUrl: `${BUSINESS.url}/api/newsletter/unsubscribe?token=DUMMY_TOKEN`,
      baseUrl: BUSINESS.url,
    }),
  };
}

function previewContractAutoCancel(): { subject: string; html: string } {
  const safeBusiness = escapeHtml(BUSINESS.name);
  const safeName = escapeHtml('Max Mustermann');
  const safeId = escapeHtml(DUMMY_BOOKING_ID);
  const safeProduct = escapeHtml('GoPro Hero13 Black');
  return {
    subject: stripSubject(`Buchung ${DUMMY_BOOKING_ID} storniert — Mietvertrag fehlte`),
    html: `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:24px 32px;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${safeBusiness}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#991b1b;">Deine Buchung wurde storniert</h1>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Hallo ${safeName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">deine Buchung <strong>${safeId}</strong> (${safeProduct}) wurde storniert, weil bis zum Versandtermin kein unterschriebener Mietvertrag vorlag. Ohne gültigen Mietvertrag können wir aus rechtlichen Gründen keine Kamera versenden.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Die Zahlung haben wir automatisch erstattet — das Geld sollte innerhalb von 5–10 Werktagen wieder auf deinem Konto sein.</p>
    <p style="margin:0;font-size:14px;color:#6b7280;">Gerne kannst du jederzeit neu buchen — denk dann bitte daran, den Mietvertrag direkt im Buchungsprozess bzw. unter <a href="https://cam2rent.de/konto/buchungen" style="color:#3b82f6;">Mein Konto → Meine Buchungen</a> zu unterschreiben, damit wir rechtzeitig versenden können.</p>
  </td></tr>
</table></td></tr></table></body></html>`,
  };
}

function previewSaleInvoice(): { subject: string; html: string } {
  const safeName = escapeHtml('Max Mustermann');
  const safeInvoiceNr = escapeHtml('RE-2620-014');
  const safeTotal = escapeHtml('49,90');
  const paymentUrl = 'https://buy.stripe.com/test_link_DUMMY';
  const itemRows = `<tr>
      <td style="padding:8px 0;font-size:14px;">1× SanDisk Extreme 128 GB (gebraucht)</td>
      <td style="padding:8px 0;text-align:right;font-size:14px;">49,90&nbsp;€</td>
    </tr>`;
  const payButton = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td align="center">
      <a href="${paymentUrl}" style="display:inline-block;padding:14px 32px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Jetzt bezahlen</a>
    </td></tr></table>`;
  return {
    subject: stripSubject('Deine Rechnung RE-2620-014 — cam2rent'),
    html: `
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
        Bitte begleiche den Betrag bequem über den Button oben (Kreditkarte oder PayPal).
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
      <p style="color:#94a3b8;font-size:11px;line-height:1.5;margin:0;text-align:center;">
        ${escapeHtml(BUSINESS.owner)} &middot; ${escapeHtml(BUSINESS.street)} &middot; ${escapeHtml(BUSINESS.zip)} ${escapeHtml(BUSINESS.city)}<br/>
        ${escapeHtml(BUSINESS.emailKontakt)} &middot; ${escapeHtml(BUSINESS.phone)}
      </p>
    </div>`,
  };
}

// 1:1-Spiegel der Schadensersatz-Forderung (die echte Mail wird tief in
// dispatchDamageCharge gebaut — Booking + PDF + Stripe-Link — und lässt sich
// nicht sauber im Capture-Modus rendern). Bei Änderung der Original-HTML in
// lib/schaden-rechnung.ts hier nachziehen.
function previewSchadensersatzForderung(): { subject: string; html: string } {
  const safeName = escapeHtml('Max Mustermann');
  const safeVorgang = escapeHtml('SE-2620-003');
  const safeSource = escapeHtml(DUMMY_BOOKING_ID);
  const safeTotal = escapeHtml('149,00');
  const safePaymentUrl = 'https://buy.stripe.com/test_link_DUMMY';
  const payButton = `<div style="text-align:center;margin:24px 0;">
        <a href="${safePaymentUrl}" style="display:inline-block;background:#3b82f6;color:#fff;font-weight:700;font-size:16px;padding:14px 36px;border-radius:10px;text-decoration:none;">
          Jetzt bezahlen
        </a>
      </div>`;
  return {
    subject: stripSubject(`Zahlungsaufforderung Schadensersatz ${safeVorgang} — cam2rent`),
    html: `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-weight:900;font-size:20px;letter-spacing:-0.5px;">cam<span style="color:#3b82f6;">2</span>rent</span>
      </div>
      <h1 style="font-size:22px;font-weight:700;margin-bottom:8px;">Zahlungsaufforderung – Schadensersatz</h1>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin-bottom:20px;">
        Hallo ${safeName},<br/>
        an der Ausrüstung deiner Buchung <strong>${safeSource}</strong> ist ein Schaden entstanden.
        Die dadurch angefallenen Reparaturkosten machen wir hiermit als Schadensersatz geltend.
        Die Zahlungsaufforderung und eine Kopie der Reparaturrechnung liegen als PDF bei.
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;margin-bottom:8px;">
        <tr>
          <td style="padding:10px 0;font-weight:700;font-size:16px;">Zu zahlen (Schadensersatz)</td>
          <td style="padding:10px 0;text-align:right;font-weight:700;font-size:16px;">${safeTotal}&nbsp;€</td>
        </tr>
      </table>
      ${payButton}
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0 0 8px;">
        Bitte begleiche den Betrag über den Button oben (Karte/PayPal) oder per Überweisung (Details im PDF).
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
    </div>`,
  };
}

// Spiegel des Layouts aus lib/reminder-emails.ts (wrapLayout/ctaButton). Wird
// für die Vorschau der Rückgabe-/Überfälligkeits-Mails genutzt — diese senden
// direkt über Resend (nicht sendAndLog), daher kein renderEmailPreview-Capture.
function wrapReminderLayout(body: string): string {
  const BASE_URL = BUSINESS.url;
  return `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;background:#f5f5f0;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:28px 32px;">
        <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">cam2rent</p>
        <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">Action-Cam Verleih</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:32px;">${body}</td></tr>
      <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">cam2rent &middot; Action-Cam Verleih &middot; <a href="${BASE_URL}" style="color:#9ca3af;">${BASE_URL.replace('https://', '')}</a></p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function reminderCta(label: string): string {
  const href = `${BUSINESS.url}/buchung/${DUMMY_BOOKING_ID}`;
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#0a0a0a;border-radius:8px;padding:12px 28px;">
    <a href="${href}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">${label}</a>
  </td></tr></table>`;
}

function previewReturnReminder2d(): { subject: string; html: string } {
  const p = escapeHtml('GoPro Hero13 Black');
  const n = escapeHtml('Max Mustermann');
  return {
    subject: `Erinnerung: Deine Rückgabe steht bevor – ${p}`,
    html: wrapReminderLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Rückgabe in 2 Tagen</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">Hallo ${n},<br><br>nur eine kurze Erinnerung: Dein Mietartikel <strong>${p}</strong> muss bis zum <strong>22.05.2026</strong> zurückgesendet werden.</p>
    <p style="margin:0 0 8px;font-size:15px;color:#4b5563;">Bitte denke daran, das Paket rechtzeitig aufzugeben, damit es pünktlich bei uns ankommt.</p>
    ${reminderCta('Buchung ansehen')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${escapeHtml(DUMMY_BOOKING_ID)}</p>`),
  };
}

function previewOverdue1d(): { subject: string; html: string } {
  const p = escapeHtml('GoPro Hero13 Black');
  const n = escapeHtml('Max Mustermann');
  return {
    subject: `Rückgabe überfällig – ${p}`,
    html: wrapReminderLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#b91c1c;">Rückgabe überfällig</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">Hallo ${n},<br><br>der Rückgabetermin für <strong>${p}</strong> war gestern. Bitte sende den Mietartikel schnellstmöglich zurück, um zusätzliche Kosten zu vermeiden.</p>
    ${reminderCta('Buchung ansehen')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${escapeHtml(DUMMY_BOOKING_ID)}</p>`),
  };
}

function previewOverdue3d(): { subject: string; html: string } {
  const p = escapeHtml('GoPro Hero13 Black');
  const n = escapeHtml('Max Mustermann');
  return {
    subject: `Dringende Erinnerung: Rückgabe ausstehend – ${p}`,
    html: wrapReminderLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#b91c1c;">Dringend: Rückgabe seit 3 Tagen ausstehend</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;">Hallo ${n},<br><br>dein Mietartikel <strong>${p}</strong> ist seit 3 Tagen überfällig. Bitte melde dich umgehend bei uns bzw. sende die Ausrüstung sofort zurück — andernfalls stellen wir den Wiederbeschaffungswert in Rechnung.</p>
    ${reminderCta('Buchung ansehen')}
    <p style="margin:0;font-size:13px;color:#9ca3af;">Buchung: ${escapeHtml(DUMMY_BOOKING_ID)}</p>`),
  };
}

function previewWeeklyReport(): { subject: string; html: string } {
  const row = (label: string, value: string, valueStyle = '') =>
    `<tr><td style="padding:3px 0;font-size:13px;color:#374151;">${label}</td>
        <td style="padding:3px 0;font-size:13px;text-align:right;${valueStyle}">${value}</td></tr>`;
  return {
    subject: 'cam2rent Wochenbericht KW 18/2026',
    html: `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:22px 32px;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff;line-height:1.1;">Wochenbericht</p>
    <p style="margin:3px 0 0;font-size:13px;color:#9ca3af;">KW 18/2026 · 27.04.2026 – 03.05.2026</p>
  </td></tr>
  <tr><td style="background:#fff;padding:28px 32px;">
    <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">Hier die Zusammenfassung der letzten 7 Tage. Alle Details im PDF-Anhang.</p>
    <h3 style="margin:18px 0 8px;font-size:14px;color:#0a0a0a;">💶 Finanzen</h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${row('Umsatz Woche', '1.284,00&nbsp;€', 'font-weight:700;color:#10b981;')}
      ${row('Vorwoche', '1.010,00&nbsp;€', 'color:#6b7280;')}
      ${row('Bezahlte Rechnungen', '9')}
      ${row('Offene Rechnungen', '2 (überfällig: 78,00&nbsp;€)')}
    </table>
    <h3 style="margin:20px 0 8px;font-size:14px;color:#0a0a0a;">📅 Buchungen</h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${row('Neue Buchungen', '12 (Vorwoche: 9)', 'font-weight:700;color:#10b981;')}
      ${row('Stornierungen', '1')}
      ${row('Nächste 7 Tage', '5 Versand · 4 Rückgabe')}
    </table>
    <h3 style="margin:20px 0 8px;font-size:14px;color:#0a0a0a;">👤 Kunden & Operativ</h3>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${row('Neue Registrierungen', '7')}
      ${row('Offene Verifizierungen', '1')}
      ${row('Neue Waitlist-Einträge', '3')}
      ${row('Neue Schäden', '0')}
      ${row('Kameras in Wartung', '1')}
    </table>
    <p style="margin:24px 0 4px;font-size:12px;color:#6b7280;">📎 Vollständiger Bericht als PDF im Anhang.</p>
    <p style="margin:0;font-size:12px;color:#6b7280;"><a href="https://cam2rent.de/admin" style="color:#3b82f6;">→ Admin-Dashboard öffnen</a></p>
  </td></tr>
  <tr><td style="background:#f5f5f0;border-radius:0 0 12px 12px;padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">cam2rent · Automatischer Wochenbericht · <a href="https://cam2rent.de/admin/einstellungen" style="color:#9ca3af;">Einstellungen</a></p>
  </td></tr>
</table>
</td></tr></table></body></html>`,
  };
}

// ─── Katalog ──────────────────────────────────────────────────────────────────

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateMeta[] = [
  // Buchungsprozess
  {
    id: 'booking_confirmation',
    name: 'Buchungsbestätigung',
    description: 'Nach erfolgreicher Zahlung über den Checkout — inkl. Rechnung, Vertrag und Rechtstexten als PDF-Anhang.',
    recipient: 'customer',
    render: () => withOverride('booking_confirmation', async () => buildCustomerEmail(dummyBooking)),
  },
  {
    id: 'booking_admin',
    name: 'Neue Buchung — Admin-Benachrichtigung',
    description: 'Parallel zur Buchungsbestätigung: Admin erhält Info über die neue Buchung.',
    recipient: 'admin',
    render: () => withOverride('booking_admin', async () => buildAdminEmail(dummyBooking)),
  },
  // Stornierung
  {
    id: 'cancellation_customer',
    name: 'Stornierungsbestätigung',
    description: 'Wenn Kunde oder Admin eine Buchung storniert — enthält Rückerstattungsbetrag und evtl. Stornogebühr.',
    recipient: 'customer',
    render: () => withOverride('cancellation_customer', async () => buildCancellationCustomerEmail(dummyCancellation)),
  },
  {
    id: 'cancellation_admin',
    name: 'Stornierung — Admin-Benachrichtigung',
    description: 'Parallel zur Stornierungsbestätigung: Admin erhält Info über die stornierte Buchung.',
    recipient: 'admin',
    render: () => withOverride('cancellation_admin', async () => buildCancellationAdminEmail(dummyCancellation)),
  },
  {
    id: 'credit_note',
    name: 'Stornierungsbeleg (Gutschrift)',
    description: 'Beim Stornieren mit Rückerstattung bzw. bei Freigabe einer Gutschrift im Gutschriften-Tab — Kunde bekommt den Stornierungsbeleg (hebt die Originalrechnung auf) als PDF-Anhang.',
    recipient: 'customer',
    render: () => renderEmailPreview(async (d) => { await sendCreditNote(d); }, {
      bookingId: DUMMY_BOOKING_ID,
      creditNoteNumber: 'GS-2026-000014',
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      grossAmount: 104,
      refundedAmount: 78,
      reason: 'Stornierung durch den Kunden',
      refunded: true,
      pdfBuffer: Buffer.alloc(0),
    }),
  },
  // Versand
  {
    id: 'shipping_confirmation',
    name: 'Versandbestätigung',
    description: 'Wenn das Paket durch den Admin im Versand-Workflow als "versandt" markiert wird — inkl. Tracking-Link.',
    recipient: 'customer',
    render: () => withOverride('shipping_confirmation', async () => buildShippingEmail(dummyShipping)),
  },
  // Schaden
  {
    id: 'damage_report_customer',
    name: 'Schadensmeldung — Bestätigung',
    description: 'Wenn der Kunde im Konto einen Schaden meldet — Bestätigung mit Eingang und nächsten Schritten.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendDamageReportConfirmation, dummyDamage),
  },
  {
    id: 'damage_report_admin',
    name: 'Schadensmeldung — Admin-Benachrichtigung',
    description: 'Parallel zur Kunden-Bestätigung: Admin erhält Info über die neue Schadensmeldung.',
    recipient: 'admin',
    render: () => renderEmailPreview(sendAdminDamageNotification, dummyDamage),
  },
  {
    id: 'damage_resolution',
    name: 'Schadensmeldung — Auflösung',
    description: 'Wenn der Admin eine Schadensmeldung auf „Abgeschlossen" setzt — mit klarem Status (erledigt / noch offen), Schadenshöhe und „Das haben wir gemacht". Geht immer an den Kunden.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendDamageResolution, dummyDamageResolution),
  },
  {
    id: 'damage_documented_customer',
    name: 'Schaden dokumentiert — Kunde',
    description: 'Wenn der Admin auf einer Buchung einen Schaden dokumentiert und den Kunden per Haken informiert — mit Beschreibung, Fotoanzahl und nächsten Schritten.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendAdminDamageNotice, dummyDamage),
  },
  {
    id: 'schadensersatz_forderung',
    name: 'Schadensersatz — Zahlungsaufforderung',
    description: 'Wenn der Admin eine Schadensersatz-Forderung erstellt — Zahlungsaufforderung (kein Rechnungsdokument, § 19 UStG) mit Zahllink + PDF-Anhang.',
    recipient: 'customer',
    render: () => withOverride('schadensersatz_forderung', async () => previewSchadensersatzForderung()),
  },
  // Freundschaftswerbung
  {
    id: 'referral_reward',
    name: 'Freundschaftswerbung — Gutschein',
    description: 'Wenn ein Freund über den Referral-Code eine Buchung abgeschlossen hat — Werber erhält Gutschein.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendReferralReward, dummyReferral),
  },
  // Nachrichten
  {
    id: 'message_admin',
    name: 'Neue Nachricht — Admin',
    description: 'Wenn ein Kunde im Messenger (unter Buchungsdetails / Kontaktformular) schreibt.',
    recipient: 'admin',
    render: () => renderEmailPreview(sendNewMessageNotificationToAdmin, dummyMessage),
  },
  {
    id: 'message_customer',
    name: 'Neue Nachricht — Kunde',
    description: 'Wenn der Admin auf eine Kundennachricht antwortet.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendNewMessageNotificationToCustomer, dummyMessage),
  },
  {
    id: 'inbound_reply',
    name: 'Antwort auf Kunden-E-Mail',
    description: 'Wenn der Admin in /admin/nachrichten auf eine echte eingehende Kunden-E-Mail antwortet — die Antwort geht als gestylte cam2rent-Mail raus (mit korrekten Re:-/Threading-Headern).',
    recipient: 'customer',
    render: () => renderEmailPreview(
      async (d: { customerEmail: string; customerName: string; subject: string; body: string }) => { await sendInboundReply(d); },
      {
        customerEmail: 'max.mustermann@example.de',
        customerName: 'Max Mustermann',
        subject: 'Frage zur Lieferung',
        body: 'Hallo Max,\n\ndanke für deine Nachricht! Eine Wunschuhrzeit für die Zustellung am Freitag können wir leider nicht garantieren, das Paket kommt aber in der Regel zwischen 9 und 17 Uhr an.\n\nViele Grüße\nDein cam2rent-Team',
      },
    ),
  },
  // Verlängerung
  {
    id: 'extension_confirmation',
    name: 'Verlängerungsbestätigung',
    description: 'Wenn der Kunde eine bestehende Buchung verlängert und die Zusatzzahlung erfolgreich war.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendExtensionConfirmation, dummyExtension),
  },
  // Bewertung & Warenkorb
  {
    id: 'completion_confirmation',
    name: 'Abschlussbestätigung',
    description: 'Sobald eine Buchung als „abgeschlossen" markiert wird (Rückgabe-Prüfung oder manuell) — für Abholung und Versand. Bestätigt „alles in Ordnung", bittet um eine Google-Bewertung (10 %-Gutschein) und weist auf das Kundenmaterial-Programm (Rabatt) hin.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendCompletionConfirmation, {
      bookingId: DUMMY_BOOKING_ID,
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      productName: 'GoPro Hero13 Black',
      rentalFrom: '2026-05-01',
      rentalTo: '2026-05-07',
      reviewUrl: 'https://cam2rent.de/umfrage/BK-MUSTER-0001?t=preview',
      ugcEnabled: true,
      ugcDiscountPercent: 15,
    }),
  },
  {
    id: 'review_request',
    name: 'Bewertungs-Anfrage (Google + Gutschein)',
    description: 'Cron-basiert: 3 Tage nach abgeschlossener Buchung. Bittet um eine Google-Bewertung und schaltet im Gegenzug einen 10 %-Gutschein frei.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendReviewRequest, {
      bookingId: DUMMY_BOOKING_ID,
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      productName: 'GoPro Hero13 Black',
      rentalTo: '2026-05-22',
    }),
  },
  {
    id: 'return_checklist',
    name: 'Rückgabe-Checkliste (letzter Miettag)',
    description: 'Cron-basiert (~08:00 Berlin) am letzten Miettag — für Versand UND Abholung. Erinnerung mit Rückgabe-Checkliste (Kamera + Seriennr. + Zubehör) als PDF-Anhang.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendReturnChecklist, {
      bookingId: DUMMY_BOOKING_ID,
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      productName: 'GoPro Hero13 Black',
      rentalFrom: '2026-05-15',
      rentalTo: '2026-05-22',
      deliveryMode: 'versand',
      cameras: [{ product_name: 'GoPro Hero13 Black', serial_number: 'C3441234567890' }],
      items: [
        { name: 'Ersatz-Akku', qty: 2 },
        { name: 'Speicherkarte 128 GB', qty: 1 },
        { name: 'Floating Hand Grip', qty: 1 },
      ],
    }),
  },
  {
    id: 'return_reminder_2d',
    name: 'Rückgabe-Erinnerung (2 Tage vorher)',
    description: 'Cron-basiert: 2 Tage vor dem Mietende — Erinnerung an die bevorstehende Rückgabe (Paket rechtzeitig aufgeben).',
    recipient: 'customer',
    render: () => withOverride('return_reminder_2d', async () => previewReturnReminder2d()),
  },
  {
    id: 'overdue_1d',
    name: 'Rückgabe überfällig (1 Tag)',
    description: 'Cron-basiert: 1 Tag nach dem Mietende, wenn noch nicht zurückgegeben — Hinweis auf die überfällige Rückgabe.',
    recipient: 'customer',
    render: () => withOverride('overdue_1d', async () => previewOverdue1d()),
  },
  {
    id: 'overdue_3d',
    name: 'Rückgabe überfällig (3 Tage, dringend)',
    description: 'Cron-basiert: 3 Tage nach dem Mietende — dringende zweite Mahnung; danach droht die Berechnung des Wiederbeschaffungswerts.',
    recipient: 'customer',
    render: () => withOverride('overdue_3d', async () => previewOverdue3d()),
  },
  {
    id: 'abandoned_cart',
    name: 'Warenkorb-Erinnerung',
    description: 'Cron-basiert: wenn der Checkout nicht abgeschlossen wurde — mit optionalem Rabatt-Gutschein.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendAbandonedCartReminder, {
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      items: [
        { productName: 'GoPro Hero13 Black', days: 7, subtotal: 69 },
        { productName: 'Mount Set Premium', days: 7, subtotal: 15 },
      ],
      cartTotal: 84,
      couponCode: 'COMEBACK10',
      discountPercent: 10,
    }),
  },
  // Verifizierung
  {
    id: 'verification_rejected',
    name: 'Ausweis-Verifizierung abgelehnt',
    description: 'Wenn der Admin einen hochgeladenen Ausweis ablehnt — Kunde wird gebeten, den Ausweis erneut hochzuladen (mit optionaler Begründung).',
    recipient: 'customer',
    render: () => renderEmailPreview(sendVerificationRejected, {
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      reason: 'Bild war unscharf — bitte gut ausgeleuchtet und alle Ecken sichtbar erneut hochladen.',
    }),
  },
  // Kundenmaterial / UGC
  {
    id: 'ugc_approved',
    name: 'Kundenmaterial freigegeben + Gutschein',
    description: 'Wenn der Admin eingereichtes Kundenmaterial freigibt — Kunde erhält 15 % Rabatt-Gutschein als Dankeschön.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendUgcApprovedEmail, {
      to: 'max.mustermann@example.de',
      name: 'Max Mustermann',
      code: 'C2R-CONTENT-042',
      discountPercent: 15,
      validityDays: 90,
      minOrderValue: 50,
    }),
  },
  {
    id: 'ugc_featured',
    name: 'Kundenmaterial veröffentlicht (Bonus)',
    description: 'Wenn cam2rent das Material auf Social/Blog/Website veröffentlicht — Kunde bekommt zusätzlich einen Bonus-Gutschein (25 %).',
    recipient: 'customer',
    render: () => renderEmailPreview(sendUgcFeaturedEmail, {
      to: 'max.mustermann@example.de',
      name: 'Max Mustermann',
      code: 'C2R-CONTENT-043',
      discountPercent: 25,
      validityDays: 180,
      minOrderValue: 50,
      channel: 'social',
    }),
  },
  {
    id: 'ugc_rejected',
    name: 'Kundenmaterial abgelehnt',
    description: 'Wenn der Admin eingereichtes Kundenmaterial ablehnt — Kunde wird höflich informiert (mit Begründung).',
    recipient: 'customer',
    render: () => renderEmailPreview(sendUgcRejectedEmail, {
      to: 'max.mustermann@example.de',
      name: 'Max Mustermann',
      reason: 'Material erfüllt leider nicht unsere Qualitätskriterien (Bilder zu klein, schlecht ausgeleuchtet).',
    }),
  },
  // Bezahlung
  {
    id: 'payment_link',
    name: 'Zahlungs-Link',
    description: 'Stripe-Zahlungslink an den Kunden (bei `awaiting_payment`-Buchungen oder manuellem Resend aus den Buchungsdetails).',
    recipient: 'customer',
    render: () => withOverride('payment_link', async () => {
      const { subject, html } = await buildPaymentLinkEmail({
        bookingId: DUMMY_BOOKING_ID,
        customerName: 'Max Mustermann',
        productName: 'GoPro Hero13 Black',
        days: 7,
        rentalFrom: '2026-05-01',
        rentalTo: '2026-05-07',
        priceTotal: 104,
        deliveryMode: 'versand',
        paymentUrl: 'https://buy.stripe.com/test_link_DUMMY',
      });
      return { subject, html };
    }),
  },
  {
    id: 'kauf_rechnung',
    name: 'Verkaufsrechnung (Zubehör-Verkauf)',
    description: 'Beim Verkauf von Zubehör (z.B. gebrauchte Speicherkarte) über /admin/verkauf — Kunde bekommt die Rechnung + Stripe-Zahlungslink, Rechnung zusätzlich als PDF-Anhang.',
    recipient: 'customer',
    render: () => withOverride('kauf_rechnung', async () => previewSaleInvoice()),
  },
  // Mietvertrag
  {
    id: 'contract_signed',
    name: 'Mietvertrag — Bestätigung',
    description: 'Direkt nach digitaler Unterschrift des Mietvertrags — Kunde bekommt das unterschriebene PDF als Anhang.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendContractEmail, {
      to: 'max.mustermann@example.de',
      customerName: 'Max Mustermann',
      bookingId: DUMMY_BOOKING_ID,
      bookingNumber: DUMMY_BOOKING_ID,
      productName: 'GoPro Hero13 Black',
      rentalFrom: '01.05.2026',
      rentalTo: '07.05.2026',
      pdfBuffer: Buffer.alloc(0),
    }),
  },
  {
    id: 'contract_resign_request',
    name: 'Mietvertrag — Bitte neu unterschreiben',
    description: 'Wenn der Admin den Mietvertrag zurücksetzt (z.B. nach einem Signatur-Glitch) — Kunde wird gebeten, erneut zu unterschreiben (CTA auf „Meine Buchungen").',
    recipient: 'customer',
    render: () => renderEmailPreview(async (d) => { await sendContractResignRequest(d); }, {
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      bookingNumber: DUMMY_BOOKING_ID,
      productName: 'GoPro Hero13 Black',
      rentalFrom: '2026-05-01',
      rentalTo: '2026-05-07',
    }),
  },
  {
    id: 'contract_sign_reminder',
    name: 'Mietvertrag — Erinnerung unterschreiben',
    description: 'Cron-basiert (täglich ~08:00 Berlin): Erinnerung ab 5 Tage vor dem Versand-/Übergabetag, solange der Mietvertrag nicht unterschrieben ist. Bei ≤1 Tag Vorlauf eskaliert der Wortlaut.',
    recipient: 'customer',
    render: () => renderEmailPreview(async (d) => { await sendContractSignReminder(d); }, {
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      bookingNumber: DUMMY_BOOKING_ID,
      productName: 'GoPro Hero13 Black',
      rentalFrom: '2026-05-01',
      rentalTo: '2026-05-07',
      deadlineDate: '2026-04-29',
      daysUntilDeadline: 1,
      deliveryMode: 'versand',
    }),
  },
  {
    id: 'contract_auto_cancel',
    name: 'Mietvertrag — Auto-Storno',
    description: 'Cron-basiert (täglich ~09:00 Berlin): Buchung wird am Puffertag (Versand-/Übergabetag) automatisch storniert, wenn kein unterschriebener Mietvertrag vorliegt — inkl. Erstattungshinweis.',
    recipient: 'customer',
    render: () => withOverride('contract_auto_cancel', async () => previewContractAutoCancel()),
  },
  // Wiederbeschaffungswerte
  {
    id: 'wbw_confirmation',
    name: 'Wiederbeschaffungswerte (vor Versand)',
    description: 'Wenn der Admin die finalen Wiederbeschaffungswerte für die Mietausrüstung festschreibt — Kunde bekommt das WBW-PDF als Anhang.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendWbwConfirmation, {
      bookingId: DUMMY_BOOKING_ID,
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      rentalFrom: '2026-05-01',
      rentalTo: '2026-05-07',
      pdfBuffer: Buffer.alloc(0),
    }),
  },
  // Angepasste Rechnung
  {
    id: 'invoice_adjustment',
    name: 'Angepasste Rechnung',
    description: 'Bei nachträglicher Änderung von Zubehör/Zeitraum/Kamera — Kunde bekommt eine neue Rechnungsversion als PDF (gleiche Rechnungsnummer, höhere Anpassungs-Nr).',
    recipient: 'customer',
    render: () => renderEmailPreview(sendInvoiceAdjustment, {
      bookingId: DUMMY_BOOKING_ID,
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      version: 2,
      reason: 'Zubehör hinzugefügt: Ersatz-Akku',
      pdfBuffer: Buffer.alloc(0),
    }),
  },
  // Verifizierungs-Crons
  {
    id: 'verification_reminder',
    name: 'Ausweis-Erinnerung (T-5 / T-4 / T-3)',
    description: 'Cron-basiert: Erinnert den Kunden 5, 4 und 3 Tage vor Mietbeginn an den Ausweis-Upload. T-3 ist die letzte Erinnerung vor Auto-Storno.',
    recipient: 'customer',
    render: () => withOverride('verification_reminder', async () => previewVerificationReminder()),
  },
  {
    id: 'verification_auto_cancel',
    name: 'Auto-Storno wegen fehlender Verifizierung',
    description: 'Cron-basiert: Buchung wurde 2 Tage vor Mietbeginn storniert, weil der Ausweis nicht hochgeladen wurde — inkl. Refund-Hinweis.',
    recipient: 'customer',
    render: () => withOverride('verification_auto_cancel', async () => previewVerificationAutoCancel()),
  },
  {
    id: 'verification_reminder_manual',
    name: 'Verifizierungs-Erinnerung (manuell)',
    description: 'Manuell vom Admin ausgelöst (Button „Verifizierungs-Erinnerung senden" in der Kundenakte) — bittet den Kunden, sein Konto/seinen Ausweis zu verifizieren.',
    recipient: 'customer',
    render: () => renderEmailPreview(async (d) => { await sendVerificationReminder(d); }, {
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
    }),
  },
  // Buchungs-Storno-Crons
  {
    id: 'auto_cancel',
    name: 'Auto-Storno (keine Zahlung vor Mietbeginn)',
    description: 'Cron-basiert: Wenn eine Buchung im Status `pending_verification` oder `awaiting_payment` ohne Zahlung den Mietbeginn erreicht — automatisches Storno.',
    recipient: 'customer',
    render: () => withOverride('auto_cancel', async () => previewAutoCancel()),
  },
  {
    id: 'auto_cancel_payment',
    name: 'Auto-Storno (Zahlungs-Deadline verpasst)',
    description: 'Cron-basiert: Wenn bei `awaiting_payment`-Buchungen die Zahlungs-Deadline (3 Tage vor Versand / 1 Tag vor Abholung) erreicht ist, ohne dass gezahlt wurde — automatisches Storno.',
    recipient: 'customer',
    render: () => withOverride('auto_cancel_payment', async () => previewAutoCancelPayment()),
  },
  // Konto-Sicherheit
  {
    id: 'account_created_alert',
    name: 'Konto-Erstellung — Sicherheits-Hinweis',
    description: 'Beim Express-Signup: Sicherheits-Warnmail an die hinterlegte E-Mail-Adresse, falls jemand ein Konto unter fremder Adresse anlegt.',
    recipient: 'customer',
    render: () => withOverride('account_created_alert', async () => previewAccountCreatedAlert()),
  },
  // Bewertungs-Belohnung
  {
    id: 'review_reward_coupon',
    name: 'Bewertungs-Dankeschön (Gutschein)',
    description: 'Wenn der Kunde nach einer Buchung 4 oder 5 Sterne abgibt + seine E-Mail-Adresse einträgt — bekommt er einen 10%-Gutschein als Dankeschön (DANKE-XXX-XXXX).',
    recipient: 'customer',
    render: () => withOverride('review_reward_coupon', async () => previewReviewRewardCoupon()),
  },
  // Newsletter
  {
    id: 'newsletter_confirm',
    name: 'Newsletter — Bestätigung (Double-Opt-In)',
    description: 'Nach Newsletter-Anmeldung: Bestätigungs-Mail mit Confirm-Link (DSGVO-konform, ohne Bestätigung kein Versand).',
    recipient: 'customer',
    render: () => withOverride('newsletter_confirm', async () => previewNewsletterConfirm()),
  },
  {
    id: 'newsletter_campaign',
    name: 'Newsletter — Kampagne',
    description: 'Manueller Versand an alle bestätigten Abonnenten über `/admin/newsletter`. Hier eine Vorschau mit Beispiel-Inhalt + automatischem Unsubscribe-Link im Footer.',
    recipient: 'customer',
    render: () => withOverride('newsletter_campaign', async () => previewNewsletterCampaign()),
  },
  {
    id: 'newsletter_test',
    name: 'Newsletter — Testversand',
    description: 'Test-Versand einer Newsletter-Kampagne an eine einzelne Adresse (z.B. Admin). Subject wird mit "[TEST]" geprefixt.',
    recipient: 'admin',
    render: () => renderEmailPreview(sendNewsletterTest, {
      to: 'kontakt@cam2rent.de',
      subject: 'Neuer Monat, neue Kameras im Verleih',
      bodyHtml: '<h2 style="margin:0 0 16px;font-size:20px;color:#0a0a0a;">Beispiel-Newsletter</h2><p>Hier kommt der eigentliche Inhalt der Newsletter-Kampagne…</p>',
    }),
  },
  // Interne Termin-Erinnerung (Mitarbeiter)
  {
    id: 'appointment_reminder',
    name: 'Termin-Erinnerung (Mein Kalender)',
    description: 'Cron-basiert (alle 5 Min): persönliche Termin-Erinnerung aus „Mein Kalender" an den Mitarbeiter (+ ggf. Kollegen bei geteiltem Termin), zur eingestellten Vorlaufzeit.',
    recipient: 'admin',
    render: () => renderEmailPreview(sendAppointmentReminder, {
      to: 'mitarbeiter@cam2rent.de',
      employeeName: 'Lisa Schmidt',
      appointmentTitle: 'Kamera-Übergabe an Max Mustermann',
      startsAt: '2026-05-01T14:30:00.000Z',
      minutesBefore: 30,
      location: 'Ladenlokal Berlin',
      description: 'GoPro Hero13 Black + Zubehör bereitlegen.',
      isAllDay: false,
      isShared: false,
    }),
  },
  {
    id: 'weekly_report',
    name: 'Wochenbericht',
    description: 'Cron-basiert (Sonntag ~18:30 Berlin): automatischer Wochenbericht an den Owner/Empfänger aus den Einstellungen — Kennzahlen der letzten 7 Tage inkl. PDF-Anhang. Kann unter /admin/einstellungen deaktiviert werden.',
    recipient: 'admin',
    render: () => withOverride('weekly_report', async () => previewWeeklyReport()),
  },
];

export function getTemplateById(id: string): EmailTemplateMeta | undefined {
  return EMAIL_TEMPLATE_CATALOG.find((t) => t.id === id);
}

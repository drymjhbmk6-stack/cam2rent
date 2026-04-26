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
  sendDamageResolution,
  sendReferralReward,
  sendNewMessageNotificationToAdmin,
  sendNewMessageNotificationToCustomer,
  sendExtensionConfirmation,
  sendReviewRequest,
  sendAbandonedCartReminder,
  sendVerificationRejected,
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

export type EmailRecipient = 'customer' | 'admin';

export interface EmailTemplateMeta {
  id: string;
  name: string;
  description: string;
  recipient: EmailRecipient;
  render: () => Promise<{ subject: string; html: string }>;
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

// ─── Katalog ──────────────────────────────────────────────────────────────────

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateMeta[] = [
  // Buchungsprozess
  {
    id: 'booking_confirmation',
    name: 'Buchungsbestätigung',
    description: 'Nach erfolgreicher Zahlung über den Checkout — inkl. Rechnung, Vertrag und Rechtstexten als PDF-Anhang.',
    recipient: 'customer',
    render: async () => buildCustomerEmail(dummyBooking),
  },
  {
    id: 'booking_admin',
    name: 'Neue Buchung — Admin-Benachrichtigung',
    description: 'Parallel zur Buchungsbestätigung: Admin erhält Info über die neue Buchung.',
    recipient: 'admin',
    render: async () => buildAdminEmail(dummyBooking),
  },
  // Stornierung
  {
    id: 'cancellation_customer',
    name: 'Stornierungsbestätigung',
    description: 'Wenn Kunde oder Admin eine Buchung storniert — enthält Rückerstattungsbetrag und evtl. Stornogebühr.',
    recipient: 'customer',
    render: async () => buildCancellationCustomerEmail(dummyCancellation),
  },
  {
    id: 'cancellation_admin',
    name: 'Stornierung — Admin-Benachrichtigung',
    description: 'Parallel zur Stornierungsbestätigung: Admin erhält Info über die stornierte Buchung.',
    recipient: 'admin',
    render: async () => buildCancellationAdminEmail(dummyCancellation),
  },
  // Versand
  {
    id: 'shipping_confirmation',
    name: 'Versandbestätigung',
    description: 'Wenn das Paket durch den Admin im Versand-Workflow als "versandt" markiert wird — inkl. Tracking-Link.',
    recipient: 'customer',
    render: async () => buildShippingEmail(dummyShipping),
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
    description: 'Wenn der Admin eine Schadensmeldung abschließt — mit Schadenshöhe und Info zur Kaution.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendDamageResolution, dummyDamageResolution),
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
    id: 'review_request',
    name: 'Bewertungs-Anfrage',
    description: 'Cron-basiert: einige Tage nach Rückgabe wird der Kunde per E-Mail um eine Bewertung gebeten.',
    recipient: 'customer',
    render: () => renderEmailPreview(sendReviewRequest, {
      bookingId: DUMMY_BOOKING_ID,
      customerName: 'Max Mustermann',
      customerEmail: 'max.mustermann@example.de',
      productName: 'GoPro Hero13 Black',
    }),
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
      code: 'UGC-MUSTER-1234',
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
      code: 'BONUS-MUSTER-5678',
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
];

export function getTemplateById(id: string): EmailTemplateMeta | undefined {
  return EMAIL_TEMPLATE_CATALOG.find((t) => t.id === id);
}

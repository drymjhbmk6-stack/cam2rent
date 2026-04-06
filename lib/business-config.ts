/**
 * Zentrale Geschaeftsdaten fuer cam2rent.
 * Eine Aenderung hier wirkt sich auf die gesamte Seite aus:
 * Footer, Impressum, AGB, PDFs, E-Mails, Datenschutz etc.
 */

export const BUSINESS = {
  // Firma
  name: 'cam2rent',
  legalName: 'cam2rent',
  slogan: 'Action-Cam Verleih',
  tagline: 'clever mieten statt kaufen',

  // Inhaber
  owner: 'Lennart Schickel',

  // Adresse
  street: 'Heimsbrunner Str. 12',
  zip: '12349',
  city: 'Berlin',
  country: 'Deutschland',
  get fullAddress() {
    return `${this.street}, ${this.zip} ${this.city}`;
  },
  get addressLine() {
    return `${this.name} · ${this.owner} · ${this.street} · ${this.zip} ${this.city}`;
  },

  // Kontakt
  email: 'buchung@cam2rent.de',
  emailKontakt: 'kontakt@cam2rent.de',
  phone: '0162 / 8367477',
  phoneRaw: '491628367477',
  get whatsappUrl() {
    return `https://wa.me/${this.phoneRaw}`;
  },

  // Web
  domain: 'cam2rent.de',
  url: 'https://cam2rent.de',
  testUrl: 'https://test.cam2rent.de',

  // Social
  instagram: 'https://instagram.com/cam2rent',

  // Abholung
  pickupLocation: 'Alt-Buckow, Berlin',

  // Versand-Texte
  shipping: {
    standardLabel: 'Standard-Versand (3\u20135 Werktage)',
    expressLabel: 'Express-Versand (1\u20132 Werktage)',
    pickupLabel: 'Selbstabholung (kostenlos)',
    expressDelivery: '24h an Werktagen',
  },

  // Stornierung
  cancellation: {
    freeDaysBefore: 7,
    freeRefundPercent: 100,
    partialDaysBefore: 3,
    partialRefundPercent: 50,
    lateFee: 'Keine Erstattung',
  },
} as const;

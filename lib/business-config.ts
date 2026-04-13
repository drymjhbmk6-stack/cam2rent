/**
 * Zentrale Geschäftsdaten für cam2rent.
 * Standardwerte (Fallback) — können im Admin unter /admin/einstellungen
 * überschrieben werden (gespeichert in admin_settings.business_config).
 */

export interface BusinessConfig {
  name: string;
  legalName: string;
  slogan: string;
  tagline: string;
  owner: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  email: string;
  emailKontakt: string;
  phone: string;
  phoneRaw: string;
  domain: string;
  url: string;
  instagram: string;
  pickupLocation: string;
}

const DEFAULTS: BusinessConfig = {
  name: 'cam2rent',
  legalName: 'cam2rent',
  slogan: 'Action-Cam Verleih',
  tagline: 'clever mieten statt kaufen',
  owner: 'Lennart Schickel',
  street: 'Heimsbrunner Str. 12',
  zip: '12349',
  city: 'Berlin',
  country: 'Deutschland',
  email: 'buchung@cam2rent.de',
  emailKontakt: 'kontakt@cam2rent.de',
  phone: '0162 / 8367477',
  phoneRaw: '491628367477',
  domain: 'cam2rent.de',
  url: 'https://cam2rent.de',
  instagram: 'https://instagram.com/cam2rent',
  pickupLocation: 'Alt-Buckow, Berlin',
};

// Laufzeit-Cache für DB-Werte (wird beim ersten Aufruf von loadBusinessConfig gefüllt)
let _override: Partial<BusinessConfig> | null = null;

/** Setzt DB-Override (wird von API-Route aufgerufen) */
export function setBusinessOverride(data: Partial<BusinessConfig>) {
  _override = data;
}

/** Gibt die gemergten Geschäftsdaten zurück */
function getConfig(): BusinessConfig {
  return _override ? { ...DEFAULTS, ..._override } : DEFAULTS;
}

/**
 * BUSINESS — Proxy-Objekt das immer aktuelle Werte liefert
 * plus berechnete Properties (fullAddress, addressLine, whatsappUrl, shipping)
 */
export const BUSINESS = new Proxy({} as BusinessConfig & {
  fullAddress: string;
  addressLine: string;
  whatsappUrl: string;
  testUrl: string;
  shipping: {
    standardLabel: string;
    expressLabel: string;
    pickupLabel: string;
    expressDelivery: string;
  };
  cancellation: {
    freeDaysBefore: number;
    freeRefundPercent: number;
    partialDaysBefore: number;
    partialRefundPercent: number;
    lateFee: string;
  };
}, {
  get(_target, prop: string) {
    const c = getConfig();
    switch (prop) {
      case 'fullAddress': return `${c.street}, ${c.zip} ${c.city}`;
      case 'addressLine': return `${c.name} · ${c.owner} · ${c.street} · ${c.zip} ${c.city}`;
      case 'whatsappUrl': return `https://wa.me/${c.phoneRaw}`;
      case 'testUrl': return `https://test.${c.domain}`;
      case 'shipping': return {
        standardLabel: 'Standard-Versand (3\u20135 Werktage)',
        expressLabel: 'Express-Versand (1\u20132 Werktage)',
        pickupLabel: 'Selbstabholung (kostenlos)',
        expressDelivery: '24h an Werktagen',
      };
      case 'cancellation': return {
        freeDaysBefore: 7, freeRefundPercent: 100,
        partialDaysBefore: 3, partialRefundPercent: 50,
        lateFee: 'Keine Erstattung',
      };
      default: return (c as unknown as Record<string, unknown>)[prop];
    }
  },
});

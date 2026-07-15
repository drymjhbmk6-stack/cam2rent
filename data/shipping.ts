// ─── Versandkonfiguration ─────────────────────────────────────────────────────
//
// Hier kannst du alle Versandkosten und den Gratis-Versand-Schwellwert anpassen.
// Die Werte werden automatisch im Buchungsflow und im Admin-Bereich angezeigt.
//
// Nach jeder Änderung: Datei speichern → npm run build
//
// ─────────────────────────────────────────────────────────────────────────────

export interface ShippingConfig {
  /** Bestellwert (Miete + Zubehör + Haftung) ab dem Versand kostenlos ist */
  freeShippingThreshold: number;
  /** Preis für Standardversand (3–5 Werktage) */
  standardPrice: number;
  /** Preis für Expressversand (Versand innerhalb 24h an Werktagen) */
  expressPrice: number;
  /**
   * Optionale Versandzonen für Länder außerhalb Deutschlands. Ein Land, das in
   * einer Zone gelistet ist, bekommt deren Preise; alle anderen (inkl. DE) die
   * Basispreise oben. Wird im Admin (Versand-Tab) gepflegt.
   */
  zones?: ShippingZone[];
}

export interface ShippingZone {
  /** Stabile ID (client-generiert), nur intern. */
  id: string;
  /** Anzeigename, z. B. „Nachbarländer", „EU". */
  label: string;
  /** ISO-3166-1-alpha-2-Codes, für die diese Zone gilt (GROSSBUCHSTABEN). */
  countries: string[];
  freeShippingThreshold: number;
  standardPrice: number;
  expressPrice: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// ↓↓↓  HIER ANPASSEN  ↓↓↓
// ──────────────────────────────────────────────────────────────────────────────

export const shippingConfig: ShippingConfig = {
  freeShippingThreshold: 50,   // Kostenloser Versand ab 50 €
  standardPrice: 5.99,          // Standardversand: 5,99 €
  expressPrice: 12.99,          // Expressversand: 12,99 €
};

// ──────────────────────────────────────────────────────────────────────────────

export type ShippingMethod = 'standard' | 'express';

export interface ShippingResult {
  price: number;
  isFree: boolean; // true = kostenlos wegen Schwellwert-Erreichen
}

/**
 * Ermittelt die effektiven Versandpreise für ein Land: die Zone, die das Land
 * enthält, sonst die Basispreise (DE + alle nicht zugeordneten Länder).
 */
export function resolveZonePrices(
  config: ShippingConfig,
  country?: string | null,
): { freeShippingThreshold: number; standardPrice: number; expressPrice: number } {
  const c = (country ?? '').trim().toUpperCase();
  if (c && c !== 'DE' && Array.isArray(config.zones)) {
    const zone = config.zones.find((z) =>
      Array.isArray(z.countries) && z.countries.some((zc) => String(zc).trim().toUpperCase() === c),
    );
    if (zone) {
      return {
        freeShippingThreshold: zone.freeShippingThreshold,
        standardPrice: zone.standardPrice,
        expressPrice: zone.expressPrice,
      };
    }
  }
  return {
    freeShippingThreshold: config.freeShippingThreshold,
    standardPrice: config.standardPrice,
    expressPrice: config.expressPrice,
  };
}

/**
 * Berechnet den Versandpreis.
 * Bei Abholung immer 0. Bei Versand: kostenlos wenn Zwischensumme >= Schwellwert.
 * `country` wählt die passende Versandzone (Default/leer = Basispreise = DE).
 */
export function calcShipping(
  subtotal: number,
  method: ShippingMethod,
  deliveryMode: 'abholung' | 'versand',
  config: ShippingConfig,
  country?: string | null,
): ShippingResult {
  if (deliveryMode === 'abholung') {
    return { price: 0, isFree: true };
  }
  const prices = resolveZonePrices(config, country);
  // Express ist nie kostenlos
  if (method === 'express') {
    return { price: prices.expressPrice, isFree: false };
  }
  if (subtotal >= prices.freeShippingThreshold) {
    return { price: 0, isFree: true };
  }
  return { price: prices.standardPrice, isFree: false };
}

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
 * Berechnet den Versandpreis.
 * Bei Abholung immer 0. Bei Versand: kostenlos wenn Zwischensumme >= Schwellwert.
 */
export function calcShipping(
  subtotal: number,
  method: ShippingMethod,
  deliveryMode: 'abholung' | 'versand',
  config: ShippingConfig
): ShippingResult {
  if (deliveryMode === 'abholung') {
    return { price: 0, isFree: true };
  }
  // Express ist nie kostenlos
  if (method === 'express') {
    return { price: config.expressPrice, isFree: false };
  }
  if (subtotal >= config.freeShippingThreshold) {
    return { price: 0, isFree: true };
  }
  return { price: config.standardPrice, isFree: false };
}

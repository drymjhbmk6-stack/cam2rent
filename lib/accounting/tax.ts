/**
 * Zentrale Steuerberechnungs-Logik für cam2rent Buchhaltung.
 * ÜBERALL verwenden – keine Inline-Steuerberechnung!
 */

export type TaxMode = 'kleinunternehmer' | 'regelbesteuerung';

export interface TaxCalculation {
  net: number;
  tax: number;
  gross: number;
  taxMode: TaxMode;
  taxRate: number;
}

/**
 * Berechnet Netto/Steuer/Brutto basierend auf Steuermodus.
 *
 * @param amount    - Der Betrag (brutto oder netto, je nach amountIs)
 * @param mode      - 'kleinunternehmer' | 'regelbesteuerung'
 * @param rate      - Steuersatz in Prozent (default 19)
 * @param amountIs  - Ob der Betrag brutto oder netto ist (default 'gross')
 */
export function calculateTax(
  amount: number,
  mode: TaxMode,
  rate: number = 19,
  amountIs: 'gross' | 'net' = 'gross'
): TaxCalculation {
  if (mode === 'kleinunternehmer') {
    return { net: amount, tax: 0, gross: amount, taxMode: mode, taxRate: 0 };
  }

  // Regelbesteuerung
  if (amountIs === 'gross') {
    const net = +(amount / (1 + rate / 100)).toFixed(2);
    const tax = +(amount - net).toFixed(2);
    return { net, tax, gross: amount, taxMode: mode, taxRate: rate };
  } else {
    const tax = +(amount * rate / 100).toFixed(2);
    const gross = +(amount + tax).toFixed(2);
    return { net: amount, tax, gross, taxMode: mode, taxRate: rate };
  }
}

/**
 * Footer-Text für Rechnungen/Gutschriften basierend auf Steuermodus.
 */
export function getTaxFooterText(mode: TaxMode): string {
  if (mode === 'kleinunternehmer') {
    return 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.';
  }
  return '';
}

/**
 * Kurzbezeichnung für den Steuermodus.
 */
export function getTaxModeLabel(mode: TaxMode): string {
  return mode === 'kleinunternehmer'
    ? 'Kleinunternehmer (§ 19 UStG)'
    : 'Regelbesteuerung';
}

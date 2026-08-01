/**
 * Fremdwaehrungs-Erkennung + EUR-Umrechnung fuer Eingangsrechnungen.
 *
 * Buchhaltung/EUeR/DATEV rechnen in EUR. Eine Rechnung in USD (o.ae.) wird beim
 * OCR erkannt, mit dem EZB-Referenzkurs zum Rechnungsdatum in EUR umgerechnet
 * und der Original-Kurs/-Betrag am Beleg dokumentiert. Der Admin kann den Kurs
 * im UI ueberschreiben.
 *
 * Kurs-Quelle: frankfurter (https://frankfurter.dev) — kostenlos, ohne API-Key,
 * basiert auf den EZB-Referenzkursen (offizielle Umrechnungsbasis in DE).
 */

// Von frankfurter unterstuetzte Waehrungen (Basis = EZB-Referenzkurse).
const SUPPORTED = new Set([
  'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD',
  'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD',
  'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]);

// Symbole/Schreibweisen -> ISO-Code. Mehrdeutige Symbole ($, ¥) werden auf die
// fuer deutsche Importe mit Abstand haeufigste Waehrung gemappt (USD bzw. JPY);
// der Admin kann den erkannten Code im UI korrigieren, indem er den Kurs setzt.
const SYMBOL_MAP: Record<string, string> = {
  '€': 'EUR', 'EUR': 'EUR',
  '$': 'USD', 'US$': 'USD', 'USD': 'USD', 'US-$': 'USD', 'USD$': 'USD',
  '£': 'GBP', 'GBP': 'GBP',
  'CHF': 'CHF', 'FR.': 'CHF', 'SFR': 'CHF', 'SFR.': 'CHF',
  '¥': 'JPY', 'JPY': 'JPY', 'YEN': 'JPY',
  'CNY': 'CNY', 'RMB': 'CNY',
  'C$': 'CAD', 'CA$': 'CAD', 'CAD': 'CAD',
  'A$': 'AUD', 'AU$': 'AUD', 'AUD': 'AUD',
  'ZŁ': 'PLN', 'PLN': 'PLN',
  'KČ': 'CZK', 'CZK': 'CZK',
  'KR': 'SEK', 'SEK': 'SEK', 'NOK': 'NOK', 'DKK': 'DKK',
};

/**
 * Normalisiert die von der KI erkannte Waehrungsangabe auf einen ISO-Code.
 * Liefert null, wenn es EUR ist oder nichts Verwertbares (= keine Umrechnung).
 */
export function normalizeCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned) return null;
  const mapped = SYMBOL_MAP[cleaned] ?? (cleaned.length === 3 ? cleaned : null);
  if (!mapped) return null;
  if (mapped === 'EUR') return null;
  return SUPPORTED.has(mapped) ? mapped : null;
}

export interface EurRate {
  /** EUR pro 1 Einheit der Fremdwaehrung (z.B. 0.9180 fuer USD). */
  rate: number;
  /** Stichtag, fuer den der EZB-Kurs tatsaechlich gilt (naechster Handelstag <= Rechnungsdatum). */
  rateDate: string; // YYYY-MM-DD
}

/**
 * Holt den EZB-Referenzkurs (EUR pro 1 Einheit Fremdwaehrung) zum gegebenen
 * Datum. Wochenenden/Feiertage: frankfurter liefert den letzten Handelstag und
 * meldet das tatsaechlich verwendete Datum zurueck.
 *
 * Gibt null zurueck bei Netzfehler / nicht unterstuetzter Waehrung — der
 * Aufrufer legt den Beleg dann ohne Umrechnung an (Banner weist darauf hin).
 */
export async function fetchEurRate(
  currency: string,
  date: string | null | undefined,
): Promise<EurRate | null> {
  const cur = normalizeCurrency(currency);
  if (!cur) return null; // EUR oder nicht unterstuetzt

  // Datum validieren; sonst latest.
  const iso = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const path = iso ?? 'latest';

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    // base=<Fremdwaehrung>, symbols=EUR -> rates.EUR = EUR pro 1 Einheit.
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${path}?base=${cur}&symbols=EUR`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { date?: string; rates?: { EUR?: number } };
    const rate = data.rates?.EUR;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;
    return { rate, rateDate: data.date ?? (iso ?? '') };
  } catch {
    return null;
  }
}

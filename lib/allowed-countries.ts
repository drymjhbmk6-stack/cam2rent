/**
 * Erlaubte Lieferländer — zentrale Wahrheitsquelle.
 *
 * Aktuell: nur Deutschland. cam2rent liefert vorerst ausschließlich innerhalb
 * Deutschlands.
 *
 * ── Option 2 (DE + Nachbarländer / EU) später aktivieren ────────────────────
 * Einfach weitere Einträge zu COUNTRY_OPTIONS hinzufügen — die Reihenfolge
 * bestimmt die Dropdown-Reihenfolge im Checkout/der Registrierung. Sobald mehr
 * als ein Land in der Liste steht, wird aus dem "nur Deutschland"-Hinweis
 * automatisch ein Länder-Dropdown. Zusätzlich sollten dann die Versandkosten
 * (`data/shipping.ts` → `calcShipping`) um länder-/zonenabhängige Preise
 * erweitert werden. Beispiel:
 *
 *   export const COUNTRY_OPTIONS: CountryOption[] = [
 *     { code: 'DE', name: 'Deutschland' },
 *     { code: 'AT', name: 'Österreich' },
 *     { code: 'CH', name: 'Schweiz' },
 *   ];
 */

export interface CountryOption {
  /** ISO-3166-1-alpha-2, immer GROSSBUCHSTABEN (z. B. "DE"). */
  code: string;
  /** Anzeigename im UI. */
  name: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'DE', name: 'Deutschland' },
];

/** Vorbelegung für neue Adressformulare. */
export const DEFAULT_COUNTRY = 'DE';

/** Erlaubte ISO-Codes (aus COUNTRY_OPTIONS abgeleitet). */
export const ALLOWED_COUNTRY_CODES: string[] = COUNTRY_OPTIONS.map((c) => c.code);

/** True, solange nur EIN Land erlaubt ist → UI zeigt Hinweis statt Dropdown. */
export const SINGLE_COUNTRY = COUNTRY_OPTIONS.length === 1;

/** Ist der (getrimmte, case-insensitive) Ländercode erlaubt? */
export function isAllowedCountry(code: string | null | undefined): boolean {
  if (!code) return false;
  return ALLOWED_COUNTRY_CODES.includes(code.trim().toUpperCase());
}

/**
 * Normalisiert eine Eingabe auf einen erlaubten Code. Nicht erlaubte oder leere
 * Werte fallen auf DEFAULT_COUNTRY zurück — für Persistenz gedacht, NICHT als
 * Ersatz für die harte Server-Sperre (dort mit `isAllowedCountry` ablehnen).
 */
export function normalizeCountry(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase();
  return isAllowedCountry(c) ? c : DEFAULT_COUNTRY;
}

/** Anzeigename zu einem Code (Fallback: der Code selbst). */
export function countryName(code: string): string {
  const c = (code ?? '').trim().toUpperCase();
  return COUNTRY_OPTIONS.find((o) => o.code === c)?.name ?? code;
}

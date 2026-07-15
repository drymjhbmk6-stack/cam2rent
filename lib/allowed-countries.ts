/**
 * Erlaubte Lieferländer.
 *
 * cam2rent liefert standardmäßig nur innerhalb Deutschlands. Welche Länder
 * erlaubt sind, wird jetzt im Admin (Einstellungen → Versand → „Lieferländer")
 * gepflegt und in `admin_config` unter dem Key `allowed_countries` gespeichert
 * (`{ codes: string[] }`). Diese Datei enthält nur den auswählbaren KATALOG +
 * reine Helfer — die tatsächlich freigeschalteten Länder kommen aus der DB.
 *
 * ⚠️ Versandkosten: `data/shipping.ts` → `calcShipping` rechnet aktuell für
 * jedes Land denselben Preis. Wird ein Land außer Deutschland freigeschaltet,
 * gilt vorerst der deutsche Versandpreis. Länder-/Zonenpreise müssen dort noch
 * ergänzt werden.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CountryOption {
  /** ISO-3166-1-alpha-2, immer GROSSBUCHSTABEN (z. B. "DE"). */
  code: string;
  /** Anzeigename im UI. */
  name: string;
}

/**
 * Katalog aller im Admin auswählbaren Länder (Deutschland + Nachbarländer + EU).
 * Reihenfolge = Anzeige-/Dropdown-Reihenfolge. Zum Ergänzen einfach Einträge
 * hinzufügen — der Admin schaltet dann pro Land frei.
 */
export const COUNTRY_CATALOG: CountryOption[] = [
  { code: 'DE', name: 'Deutschland' },
  { code: 'AT', name: 'Österreich' },
  { code: 'CH', name: 'Schweiz' },
  { code: 'NL', name: 'Niederlande' },
  { code: 'BE', name: 'Belgien' },
  { code: 'LU', name: 'Luxemburg' },
  { code: 'FR', name: 'Frankreich' },
  { code: 'DK', name: 'Dänemark' },
  { code: 'PL', name: 'Polen' },
  { code: 'CZ', name: 'Tschechien' },
  { code: 'IT', name: 'Italien' },
  { code: 'ES', name: 'Spanien' },
  { code: 'PT', name: 'Portugal' },
  { code: 'SE', name: 'Schweden' },
  { code: 'FI', name: 'Finnland' },
  { code: 'IE', name: 'Irland' },
];

/** Vorbelegung für neue Adressformulare + Default, wenn keine Config existiert. */
export const DEFAULT_COUNTRY = 'DE';

/** Default-Freischaltung, solange keine Admin-Config gesetzt ist. */
export const DEFAULT_ALLOWED_CODES: string[] = ['DE'];

/** Normalisiert eine Code-Liste auf gültige Katalog-Codes (dedupliziert). */
export function sanitizeCountryCodes(input: unknown): string[] {
  const catalog = new Set(COUNTRY_CATALOG.map((c) => c.code));
  const arr = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const raw of arr) {
    const c = String(raw ?? '').trim().toUpperCase();
    if (catalog.has(c) && !out.includes(c)) out.push(c);
  }
  // Mindestens Deutschland ist immer erlaubt (sonst wäre gar keine Bestellung
  // möglich) — leere/ungültige Config fällt auf DE zurück.
  return out.length > 0 ? out : [...DEFAULT_ALLOWED_CODES];
}

/** Ist der Ländercode in der übergebenen Freischalt-Liste? */
export function isAllowedCountry(code: string | null | undefined, allowedCodes: string[]): boolean {
  if (!code) return false;
  return allowedCodes.includes(code.trim().toUpperCase());
}

/**
 * Normalisiert eine Eingabe auf einen erlaubten Code. Nicht erlaubte oder leere
 * Werte fallen auf den ersten erlaubten Code (bzw. DEFAULT_COUNTRY) zurück —
 * für Persistenz gedacht, NICHT als Ersatz für die harte Server-Sperre.
 */
export function normalizeCountry(code: string | null | undefined, allowedCodes: string[]): string {
  const c = (code ?? '').trim().toUpperCase();
  if (isAllowedCountry(c, allowedCodes)) return c;
  return allowedCodes[0] ?? DEFAULT_COUNTRY;
}

/** Anzeigename zu einem Code (Fallback: der Code selbst). */
export function countryName(code: string): string {
  const c = (code ?? '').trim().toUpperCase();
  return COUNTRY_CATALOG.find((o) => o.code === c)?.name ?? code;
}

/** Katalog-Einträge (mit Namen) für eine Code-Liste, in Katalog-Reihenfolge. */
export function optionsForCodes(codes: string[]): CountryOption[] {
  const set = new Set(codes.map((c) => c.trim().toUpperCase()));
  return COUNTRY_CATALOG.filter((o) => set.has(o.code));
}

/**
 * Lädt die im Admin freigeschalteten Ländercodes aus `admin_config`
 * (`allowed_countries`). Fällt bei fehlender Config / Fehler auf DE zurück.
 * Akzeptiert sowohl `{ codes: [...] }` als auch eine reine Array-Form.
 */
export async function loadAllowedCountryCodes(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'allowed_countries')
      .maybeSingle();
    const value = data?.value as unknown;
    const raw = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { codes?: unknown }).codes
      : value;
    return sanitizeCountryCodes(raw);
  } catch {
    return [...DEFAULT_ALLOWED_CODES];
  }
}

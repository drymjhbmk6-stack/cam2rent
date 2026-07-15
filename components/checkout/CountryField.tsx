'use client';

import { COUNTRY_OPTIONS, SINGLE_COUNTRY, countryName, DEFAULT_COUNTRY } from '@/lib/allowed-countries';

/**
 * Länder-Auswahl für Adressformulare (Registrierung + Checkout).
 *
 * Solange nur EIN Land erlaubt ist (SINGLE_COUNTRY), wird kein Dropdown gezeigt,
 * sondern nur ein dezenter Hinweis "Lieferung nur innerhalb Deutschlands". Der
 * `value` bleibt dabei implizit auf DEFAULT_COUNTRY.
 *
 * Sobald in `lib/allowed-countries.ts` weitere Länder ergänzt werden (Option 2),
 * erscheint automatisch ein echtes Dropdown — hier ist nichts weiter zu tun.
 */
export function CountryField({
  value,
  onChange,
  inputClass,
  labelClass,
}: {
  value: string;
  onChange: (code: string) => void;
  inputClass: string;
  labelClass: string;
}) {
  if (SINGLE_COUNTRY) {
    return (
      <div className="rounded-[10px] bg-brand-cream/60 dark:bg-white/5 border border-brand-border dark:border-white/10 px-3 py-2.5">
        <p className="text-sm font-body text-brand-black dark:text-white">
          🇩🇪 Lieferung nur innerhalb {countryName(DEFAULT_COUNTRY)}s
        </p>
        <p className="mt-0.5 text-xs text-brand-muted dark:text-gray-500">
          Wir versenden aktuell ausschließlich innerhalb Deutschlands.
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className={labelClass}>Land *</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        autoComplete="country"
      >
        {COUNTRY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

'use client';

import { countryName, type CountryOption } from '@/lib/allowed-countries';

/**
 * Länder-Auswahl für Adressformulare (Registrierung + Checkout).
 *
 * `options` = die im Admin freigeschalteten Länder (via useAllowedCountries).
 * Ist nur EIN Land freigeschaltet, wird kein Dropdown gezeigt, sondern nur ein
 * dezenter Hinweis (z. B. „Lieferung nur innerhalb Deutschlands"). Bei mehreren
 * Ländern erscheint ein echtes `<select>`.
 */
export function CountryField({
  value,
  onChange,
  options,
  inputClass,
  labelClass,
}: {
  value: string;
  onChange: (code: string) => void;
  options: CountryOption[];
  inputClass: string;
  labelClass: string;
}) {
  if (options.length <= 1) {
    const only = options[0]?.name ?? countryName('DE');
    return (
      <div className="rounded-[10px] bg-brand-cream/60 dark:bg-white/5 border border-brand-border dark:border-white/10 px-3 py-2.5">
        <p className="text-sm font-body text-brand-black dark:text-white">
          🇩🇪 Lieferung nur innerhalb {only}s
        </p>
        <p className="mt-0.5 text-xs text-brand-muted dark:text-gray-500">
          Wir versenden aktuell ausschließlich innerhalb {only}s.
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
        {options.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

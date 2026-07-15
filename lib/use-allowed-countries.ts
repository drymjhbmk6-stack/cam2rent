'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_ALLOWED_CODES,
  optionsForCodes,
  type CountryOption,
} from '@/lib/allowed-countries';

type AllowedState = { codes: string[]; options: CountryOption[] };

// Modul-weiter Cache, damit mehrere Formulare (Checkout + Registrierung) den
// Endpoint nur EINMAL abfragen.
let cache: AllowedState | null = null;
let inflight: Promise<AllowedState> | null = null;

function fallback(): AllowedState {
  return { codes: [...DEFAULT_ALLOWED_CODES], options: optionsForCodes(DEFAULT_ALLOWED_CODES) };
}

async function fetchAllowed(): Promise<AllowedState> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch('/api/allowed-countries')
      .then((r) => r.json())
      .then((d): AllowedState => {
        const codes: string[] = Array.isArray(d?.codes) && d.codes.length ? d.codes : [...DEFAULT_ALLOWED_CODES];
        const options: CountryOption[] = Array.isArray(d?.options) && d.options.length ? d.options : optionsForCodes(codes);
        cache = { codes, options };
        return cache;
      })
      .catch((): AllowedState => {
        cache = fallback();
        return cache;
      });
  }
  return inflight;
}

/**
 * Lädt die freigeschalteten Lieferländer (gecacht). Während des Ladens gilt der
 * Default (nur Deutschland) — die harte Sperre läuft ohnehin serverseitig.
 */
export function useAllowedCountries(): AllowedState & { loading: boolean } {
  const [state, setState] = useState<AllowedState & { loading: boolean }>(() =>
    cache ? { ...cache, loading: false } : { ...fallback(), loading: true },
  );

  useEffect(() => {
    if (cache) {
      setState({ ...cache, loading: false });
      return;
    }
    let active = true;
    fetchAllowed().then((c) => {
      if (active) setState({ ...c, loading: false });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

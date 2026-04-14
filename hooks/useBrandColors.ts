'use client';

import { useState, useEffect } from 'react';
import { DEFAULT_BRAND_COLORS } from '@/lib/brand-colors';

let cachedColors: Record<string, string> | null = null;
let fetchPromise: Promise<Record<string, string>> | null = null;

function fetchBrandColors(): Promise<Record<string, string>> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch('/api/admin/settings?key=brand_colors')
    .then((r) => r.json())
    .then((data) => {
      let colors = DEFAULT_BRAND_COLORS;
      if (data?.value) {
        const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          colors = { ...DEFAULT_BRAND_COLORS, ...val };
        }
      }
      cachedColors = colors;
      return colors;
    })
    .catch(() => {
      cachedColors = DEFAULT_BRAND_COLORS;
      return DEFAULT_BRAND_COLORS;
    });
  return fetchPromise;
}

/**
 * Lädt Brand-Farben aus admin_settings (key: 'brand_colors').
 * Cached nach dem ersten Fetch für die gesamte Session.
 */
export function useBrandColors(): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>(cachedColors ?? DEFAULT_BRAND_COLORS);

  useEffect(() => {
    if (cachedColors) {
      setColors(cachedColors);
      return;
    }
    fetchBrandColors().then(setColors);
  }, []);

  return colors;
}

/** Cache invalidieren (nach Farb-Änderung im Admin) */
export function invalidateBrandColorCache() {
  cachedColors = null;
  fetchPromise = null;
}

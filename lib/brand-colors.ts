/**
 * Zentrales Brand-Farben-System.
 *
 * Farben werden in admin_settings (key: 'brand_colors') als JSON gespeichert:
 *   { "GoPro": "#3b82f6", "DJI": "#0d9488", "Insta360": "#f59e0b" }
 *
 * Fallback auf DEFAULT_BRAND_COLORS wenn kein DB-Eintrag vorhanden.
 */

export const DEFAULT_BRAND_COLORS: Record<string, string> = {
  GoPro: '#3b82f6',
  DJI: '#0d9488',
  Insta360: '#f59e0b',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  const match = clean.match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

export interface BrandStyle {
  /** Hex-Farbe der Marke */
  color: string;
  /** Badge-Hintergrund (rgba mit niedriger Opazität) */
  bg: string;
  /** Badge-Border (rgba) */
  border: string;
}

/**
 * Gibt Inline-Styles für ein Brand-Badge zurück.
 * Funktioniert automatisch in Light- und Dark-Mode (rgba passt sich an).
 */
export function getBrandStyle(brand: string, brandColors?: Record<string, string>): BrandStyle {
  const colors = { ...DEFAULT_BRAND_COLORS, ...brandColors };
  const hex = colors[brand] ?? '#64748b';
  const rgb = hexToRgb(hex);

  if (!rgb) {
    return { color: '#64748b', bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.25)' };
  }

  return {
    color: hex,
    bg: `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`,
    border: `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`,
  };
}

/** Vordefinierte Farboptionen für den Color-Picker im Admin */
export const COLOR_PRESETS = [
  { label: 'Blau', value: '#3b82f6' },
  { label: 'Türkis', value: '#0d9488' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Grün', value: '#22c55e' },
  { label: 'Rot', value: '#ef4444' },
  { label: 'Violett', value: '#8b5cf6' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Lime', value: '#84cc16' },
];

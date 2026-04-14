'use client';

import { useState, useEffect } from 'react';
import { DEFAULT_BRAND_COLORS, COLOR_PRESETS, getBrandStyle } from '@/lib/brand-colors';
import { invalidateBrandColorCache } from '@/hooks/useBrandColors';

/**
 * Admin-Komponente zum Verwalten der Markenfarben.
 * Zeigt alle Marken mit Farbauswahl (Presets + Custom Hex).
 */
export default function BrandColorManager() {
  const [brands, setBrands] = useState<string[]>([]);
  const [colors, setColors] = useState<Record<string, string>>(DEFAULT_BRAND_COLORS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings?key=camera_brands').then((r) => r.json()).catch(() => null),
      fetch('/api/admin/settings?key=brand_colors').then((r) => r.json()).catch(() => null),
    ]).then(([brandsData, colorsData]) => {
      // Marken laden
      let brandList = Object.keys(DEFAULT_BRAND_COLORS);
      if (brandsData?.value) {
        const val = typeof brandsData.value === 'string' ? JSON.parse(brandsData.value) : brandsData.value;
        if (Array.isArray(val)) brandList = val.filter((b: string) => b !== 'Sonstige');
      }
      setBrands(brandList);

      // Farben laden
      if (colorsData?.value) {
        const val = typeof colorsData.value === 'string' ? JSON.parse(colorsData.value) : colorsData.value;
        if (val && typeof val === 'object') setColors({ ...DEFAULT_BRAND_COLORS, ...val });
      }
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'brand_colors', value: colors }),
      });
      invalidateBrandColorCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  }

  function updateColor(brand: string, hex: string) {
    setColors((prev) => ({ ...prev, [brand]: hex }));
  }

  return (
    <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-brand-border dark:border-slate-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-white">Markenfarben</h3>
          <p className="text-xs text-brand-muted mt-0.5">Farben für Brand-Badges überall im Shop & Admin</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-heading font-semibold rounded-btn bg-brand-black dark:bg-accent-blue text-white hover:bg-brand-dark dark:hover:bg-accent-blue/80 transition-colors disabled:opacity-50"
        >
          {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Speichern'}
        </button>
      </div>

      <div className="space-y-3">
        {brands.map((brand) => {
          const hex = colors[brand] ?? '#64748b';
          const style = getBrandStyle(brand, colors);
          return (
            <div key={brand} className="flex items-center gap-3">
              {/* Vorschau-Badge */}
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-heading font-semibold border min-w-[80px] justify-center"
                style={{ color: style.color, backgroundColor: style.bg, borderColor: style.border }}
              >
                {brand}
              </span>

              {/* Farb-Presets */}
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => updateColor(brand, preset.value)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${hex === preset.value ? 'border-white dark:border-slate-200 ring-2 ring-offset-1 ring-offset-transparent scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: preset.value, '--tw-ring-color': preset.value } as React.CSSProperties}
                    title={preset.label}
                  />
                ))}

                {/* Custom Hex Input */}
                <div className="flex items-center gap-1 ml-1">
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) => updateColor(brand, e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                    title="Eigene Farbe"
                  />
                  <input
                    type="text"
                    value={hex}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) updateColor(brand, v);
                    }}
                    className="w-20 px-2 py-1 text-xs font-mono border border-brand-border dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent-blue"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

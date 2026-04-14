'use client';

import { useState, useEffect, useRef } from 'react';
import { DEFAULT_BRAND_COLORS, COLOR_PRESETS, getBrandStyle } from '@/lib/brand-colors';
import { invalidateBrandColorCache } from '@/hooks/useBrandColors';

/**
 * Kombinierte Markenverwaltung: Marken + Farben in einer ausklappbaren Karte.
 * Marken hinzufügen, löschen und Farben zuweisen — alles an einem Ort.
 */
export default function BrandColorManager() {
  const [expanded, setExpanded] = useState(false);
  const [brands, setBrands] = useState<string[]>([]);
  const [colors, setColors] = useState<Record<string, string>>(DEFAULT_BRAND_COLORS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings?key=camera_brands').then((r) => r.json()).catch(() => null),
      fetch('/api/admin/settings?key=brand_colors').then((r) => r.json()).catch(() => null),
    ]).then(([brandsData, colorsData]) => {
      let brandList = Object.keys(DEFAULT_BRAND_COLORS);
      if (brandsData?.value) {
        const val = typeof brandsData.value === 'string' ? JSON.parse(brandsData.value) : brandsData.value;
        if (Array.isArray(val)) brandList = val.filter((b: string) => b !== 'Sonstige');
      }
      setBrands(brandList);

      if (colorsData?.value) {
        const val = typeof colorsData.value === 'string' ? JSON.parse(colorsData.value) : colorsData.value;
        if (val && typeof val === 'object') setColors({ ...DEFAULT_BRAND_COLORS, ...val });
      }
    });
  }, []);

  useEffect(() => {
    if (showAdd) inputRef.current?.focus();
  }, [showAdd]);

  async function handleSave() {
    setSaving(true);
    try {
      // Marken + Farben parallel speichern
      const brandsToSave = [...brands, 'Sonstige'];
      await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'camera_brands', value: brandsToSave }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'brand_colors', value: colors }),
        }),
      ]);
      invalidateBrandColorCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  }

  function addBrand() {
    const name = newBrand.trim();
    if (!name || brands.includes(name)) { setNewBrand(''); setShowAdd(false); return; }
    setBrands((prev) => [...prev, name]);
    setColors((prev) => ({ ...prev, [name]: '#64748b' }));
    setNewBrand('');
    setShowAdd(false);
  }

  function removeBrand(brand: string) {
    setBrands((prev) => prev.filter((b) => b !== brand));
    setColors((prev) => {
      const next = { ...prev };
      delete next[brand];
      return next;
    });
  }

  function updateColor(brand: string, hex: string) {
    setColors((prev) => ({ ...prev, [brand]: hex }));
  }

  // Badge-Vorschau für zusammengeklappten Zustand
  const previewBadges = brands.slice(0, 6);

  return (
    <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-brand-border dark:border-slate-700 overflow-hidden">
      {/* Header — immer sichtbar, klickbar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-brand-bg/50 dark:hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-white">Marken verwalten</h3>
            <p className="text-xs text-brand-muted mt-0.5">
              {brands.length} {brands.length === 1 ? 'Marke' : 'Marken'} · Farben & Katalog
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mini-Vorschau der Badges wenn zugeklappt */}
          {!expanded && (
            <div className="hidden sm:flex items-center gap-1.5">
              {previewBadges.map((brand) => {
                const style = getBrandStyle(brand, colors);
                return (
                  <span
                    key={brand}
                    className="px-2 py-0.5 rounded-full text-[10px] font-heading font-semibold border"
                    style={{ color: style.color, backgroundColor: style.bg, borderColor: style.border }}
                  >
                    {brand}
                  </span>
                );
              })}
              {brands.length > 6 && <span className="text-xs text-brand-muted">+{brands.length - 6}</span>}
            </div>
          )}
          <span className="text-brand-muted text-sm transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </div>
      </button>

      {/* Inhalt — nur wenn aufgeklappt */}
      {expanded && (
        <div className="border-t border-brand-border dark:border-slate-700 px-5 py-5">
          {/* Marken-Liste */}
          <div className="space-y-3 mb-4">
            {brands.map((brand) => {
              const hex = colors[brand] ?? '#64748b';
              const style = getBrandStyle(brand, colors);
              return (
                <div key={brand} className="rounded-lg border border-brand-border/50 dark:border-slate-600/40 p-3">
                  <div className="flex items-center gap-3">
                    {/* Badge-Vorschau */}
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-heading font-semibold border min-w-[80px] justify-center shrink-0"
                      style={{ color: style.color, backgroundColor: style.bg, borderColor: style.border }}
                    >
                      {brand}
                    </span>

                    {/* Farb-Presets */}
                    <div className="flex items-center gap-1 flex-wrap flex-1">
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => updateColor(brand, preset.value)}
                          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${hex === preset.value ? 'border-white dark:border-slate-200 ring-2 ring-offset-1 ring-offset-transparent scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: preset.value, '--tw-ring-color': preset.value } as React.CSSProperties}
                          title={preset.label}
                        />
                      ))}
                      <input
                        type="color"
                        value={hex}
                        onChange={(e) => updateColor(brand, e.target.value)}
                        className="w-5 h-5 rounded cursor-pointer border-0 p-0 ml-0.5"
                        title="Eigene Farbe"
                      />
                      <input
                        type="text"
                        value={hex}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) updateColor(brand, v);
                        }}
                        className="w-[72px] px-1.5 py-0.5 text-[11px] font-mono border border-brand-border dark:border-slate-600 rounded bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent-blue"
                        maxLength={7}
                      />
                    </div>

                    {/* Löschen */}
                    <button
                      type="button"
                      onClick={() => removeBrand(brand)}
                      className="text-red-400 hover:text-red-500 transition-colors shrink-0 p-1"
                      title={`${brand} entfernen`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Neue Marke hinzufügen */}
          {showAdd ? (
            <div className="flex items-center gap-2 mb-4">
              <input
                ref={inputRef}
                type="text"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addBrand();
                  if (e.key === 'Escape') { setShowAdd(false); setNewBrand(''); }
                }}
                placeholder="Markenname eingeben…"
                className="flex-1 px-3 py-2 text-sm border border-brand-border dark:border-slate-600 rounded-[10px] bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
              <button
                type="button"
                onClick={addBrand}
                className="px-4 py-2 text-sm font-heading font-semibold rounded-[10px] bg-brand-black dark:bg-accent-blue text-white hover:bg-brand-dark dark:hover:bg-accent-blue/80 transition-colors"
              >
                Hinzufügen
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewBrand(''); }}
                className="text-brand-muted hover:text-brand-black dark:hover:text-white text-lg px-1"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="text-xs font-heading font-semibold text-accent-blue hover:text-accent-blue/80 transition-colors mb-4"
            >
              + Neue Marke hinzufügen
            </button>
          )}

          {/* Speichern */}
          <div className="flex justify-end pt-2 border-t border-brand-border/50 dark:border-slate-700/50">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-brand-black dark:bg-accent-blue text-white hover:bg-brand-dark dark:hover:bg-accent-blue/80 transition-colors disabled:opacity-50"
            >
              {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Änderungen speichern'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

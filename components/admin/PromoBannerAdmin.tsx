'use client';

import { useEffect, useState } from 'react';

interface PromoBannerConfig {
  enabled: boolean;
  headline: string;
  subline: string;
  bgColor: string;
  ctaLabel: string;
  ctaUrl: string;
  validUntil: string;
}

const DEFAULT: PromoBannerConfig = {
  enabled: false,
  headline: '🔥 50% auf deine erste Buchung — Code: FIRST50',
  subline: 'Nur für kurze Zeit. Jetzt Action-Cam mieten und sparen!',
  bgColor: '#FF5C00',
  ctaLabel: 'Jetzt buchen',
  ctaUrl: '/kameras',
  validUntil: '',
};

const COLOR_PRESETS = [
  { label: 'Orange', hex: '#FF5C00' },
  { label: 'Rot', hex: '#ef4444' },
  { label: 'Pink', hex: '#ec4899' },
  { label: 'Lila', hex: '#a855f7' },
  { label: 'Blau', hex: '#3b82f6' },
  { label: 'Grün', hex: '#22c55e' },
  { label: 'Gelb', hex: '#eab308' },
  { label: 'Schwarz', hex: '#0f172a' },
];

function getTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#000000' : '#ffffff';
}

export default function PromoBannerAdmin() {
  const [cfg, setCfg] = useState<PromoBannerConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [customColor, setCustomColor] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings?key=promo_banner')
      .then((r) => r.json())
      .then((d) => {
        if (d.value) {
          const parsed = typeof d.value === 'string' ? JSON.parse(d.value) : d.value;
          setCfg({ ...DEFAULT, ...parsed });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function update<K extends keyof PromoBannerConfig>(key: K, value: PromoBannerConfig[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSuccess('');
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'promo_banner', value: JSON.stringify(cfg) }),
      });
      setSuccess('Gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
    } finally {
      setSaving(false);
    }
  }

  const textColor = getTextColor(cfg.bgColor);
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(customColor);

  const inputClass =
    'w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500';

  return (
    <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24 }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#FF5C0020',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}
        >
          📣
        </div>
        <div className="flex-1">
          <h2 className="font-heading font-semibold text-base text-slate-200">Promo-Banner</h2>
          <p className="text-xs text-slate-500">
            Fetter Aktions-Banner ganz oben auf der Startseite — volle Breite, frei gestaltbar
          </p>
        </div>

        {!loading && (
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => update('enabled', !cfg.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${cfg.enabled ? 'bg-green-500' : 'bg-slate-700'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.enabled ? 'translate-x-5' : ''}`}
              />
            </div>
            <span className="text-xs font-semibold" style={{ color: cfg.enabled ? '#22c55e' : '#64748b' }}>
              {cfg.enabled ? 'AN' : 'AUS'}
            </span>
          </label>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Lädt…</p>
      ) : (
        <div className="space-y-5">
          {/* Live-Vorschau */}
          <div>
            <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Vorschau</p>
            <div
              style={{ backgroundColor: cfg.bgColor, color: textColor, borderRadius: 8 }}
              className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3"
            >
              <div>
                <p className="font-heading font-extrabold text-base leading-tight">
                  {cfg.headline || 'Dein Headline-Text…'}
                </p>
                {cfg.subline && (
                  <p className="text-sm mt-0.5 opacity-80">{cfg.subline}</p>
                )}
              </div>
              {cfg.ctaLabel && (
                <span
                  style={{ backgroundColor: textColor, color: cfg.bgColor }}
                  className="shrink-0 px-4 py-2 rounded-full font-bold text-sm"
                >
                  {cfg.ctaLabel} →
                </span>
              )}
            </div>
          </div>

          {/* Farbe */}
          <div>
            <label className="block text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">
              Hintergrundfarbe
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  onClick={() => update('bgColor', p.hex)}
                  title={p.label}
                  className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: p.hex,
                    borderColor: cfg.bgColor === p.hex ? '#06b6d4' : 'transparent',
                    boxShadow: cfg.bgColor === p.hex ? '0 0 0 2px #0f172a, 0 0 0 4px #06b6d4' : undefined,
                  }}
                />
              ))}

              {/* Custom Hex */}
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={cfg.bgColor}
                  onChange={(e) => update('bgColor', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  title="Farbe wählen"
                />
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                      update('bgColor', e.target.value);
                    }
                  }}
                  placeholder="#FF5C00"
                  className="w-24 bg-[#0f172a] border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500"
                  style={{ borderColor: customColor && !isValidHex ? '#ef4444' : undefined }}
                />
              </div>
            </div>
          </div>

          {/* Headline */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
              Headline <span className="text-slate-600 font-normal">(max. 120 Zeichen)</span>
            </label>
            <input
              type="text"
              value={cfg.headline}
              onChange={(e) => update('headline', e.target.value.slice(0, 120))}
              placeholder="🔥 50% auf deine erste Buchung — Code: FIRST50"
              className={inputClass}
              maxLength={120}
            />
            <p className="text-right text-xs text-slate-600 mt-1">{cfg.headline.length}/120</p>
          </div>

          {/* Subline */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
              Untertext <span className="text-slate-600 font-normal">(optional, max. 200 Zeichen)</span>
            </label>
            <input
              type="text"
              value={cfg.subline}
              onChange={(e) => update('subline', e.target.value.slice(0, 200))}
              placeholder="Nur für kurze Zeit. Jetzt sparen!"
              className={inputClass}
              maxLength={200}
            />
          </div>

          {/* CTA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
                Button-Text
              </label>
              <input
                type="text"
                value={cfg.ctaLabel}
                onChange={(e) => update('ctaLabel', e.target.value.slice(0, 40))}
                placeholder="Jetzt buchen"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
                Button-Link
              </label>
              <input
                type="text"
                value={cfg.ctaUrl}
                onChange={(e) => update('ctaUrl', e.target.value)}
                placeholder="/kameras"
                className={inputClass}
              />
            </div>
          </div>

          {/* Ablaufdatum */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
              Automatisch deaktivieren ab <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={cfg.validUntil}
              onChange={(e) => update('validUntil', e.target.value)}
              className={inputClass + ' w-auto'}
            />
            {cfg.validUntil && (
              <button
                onClick={() => update('validUntil', '')}
                className="ml-2 text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                × entfernen
              </button>
            )}
          </div>

          {/* Speichern */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-heading font-semibold rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
            {success && <span className="text-green-400 text-sm">{success}</span>}
            {cfg.enabled && (
              <span className="ml-auto text-xs text-green-400 font-semibold">
                ✓ Banner ist aktiv und sichtbar
              </span>
            )}
            {!cfg.enabled && (
              <span className="ml-auto text-xs text-slate-500">Banner ist deaktiviert</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

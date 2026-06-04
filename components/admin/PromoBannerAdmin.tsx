'use client';

import { useEffect, useState } from 'react';

interface PromoBannerEntry {
  id: string;
  enabled: boolean;
  headline: string;
  subline: string;
  bgColor: string;
  ctaLabel: string;
  ctaUrl: string;
  validFrom: string;
  validUntil: string;
}

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

const inputClass =
  'w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500';

function getTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#000000' : '#ffffff';
}

function makeNewBanner(): PromoBannerEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    enabled: false,
    headline: '🔥 50% auf deine erste Buchung — Code: FIRST50',
    subline: 'Nur für kurze Zeit. Jetzt Action-Cam mieten und sparen!',
    bgColor: '#FF5C00',
    ctaLabel: 'Jetzt buchen',
    ctaUrl: '/kameras',
    validFrom: '',
    validUntil: '',
  };
}

// Liest sowohl das neue { banners: [] }-Format als auch das alte Flach-Objekt.
function normalize(parsed: unknown): PromoBannerEntry[] {
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as Record<string, unknown>;

  const fromRaw = (b: Record<string, unknown>, idx: number): PromoBannerEntry => ({
    id: String(b.id ?? `${Date.now()}-${idx}`),
    enabled: !!b.enabled,
    headline: String(b.headline ?? ''),
    subline: String(b.subline ?? ''),
    bgColor: /^#[0-9a-fA-F]{6}$/.test(String(b.bgColor ?? '')) ? String(b.bgColor) : '#FF5C00',
    ctaLabel: String(b.ctaLabel ?? ''),
    ctaUrl: String(b.ctaUrl ?? ''),
    validFrom: String(b.validFrom ?? ''),
    validUntil: String(b.validUntil ?? ''),
  });

  if (Array.isArray(obj.banners)) {
    return (obj.banners as Record<string, unknown>[]).map(fromRaw);
  }
  if (typeof obj.headline === 'string') {
    return [fromRaw(obj, 0)];
  }
  return [];
}

function todayBerlin(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

function fmtDE(iso: string): string {
  const parts = iso.split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : iso;
}

function isActive(b: PromoBannerEntry, today: string): boolean {
  if (!b.enabled) return false;
  if (b.validFrom && b.validFrom > today) return false;
  if (b.validUntil && b.validUntil < today) return false;
  return true;
}

type Status = { label: string; color: string };

function bannerStatus(b: PromoBannerEntry, today: string): Status {
  if (!b.enabled) return { label: 'Deaktiviert', color: '#64748b' };
  if (b.validUntil && b.validUntil < today) return { label: 'Abgelaufen', color: '#64748b' };
  if (b.validFrom && b.validFrom > today) {
    return { label: `Geplant ab ${fmtDE(b.validFrom)}`, color: '#3b82f6' };
  }
  return { label: 'Live', color: '#22c55e' };
}

// Zeitraum-Chip fuer die zugeklappte Ansicht.
function dateRangeLabel(b: PromoBannerEntry): string {
  if (b.validFrom && b.validUntil) return `${fmtDE(b.validFrom)} – ${fmtDE(b.validUntil)}`;
  if (b.validFrom) return `ab ${fmtDE(b.validFrom)}`;
  if (b.validUntil) return `bis ${fmtDE(b.validUntil)}`;
  return 'dauerhaft';
}

// ============================================================
// Einzelne Banner-Karte
// ============================================================

function BannerCard({
  banner,
  status,
  isWinner,
  expanded,
  onToggleExpand,
  onChange,
  onDelete,
}: {
  banner: PromoBannerEntry;
  status: Status;
  isWinner: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (b: PromoBannerEntry) => void;
  onDelete: () => void;
}) {
  const [customColor, setCustomColor] = useState('');
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(customColor);
  const textColor = getTextColor(banner.bgColor);

  function update<K extends keyof PromoBannerEntry>(key: K, value: PromoBannerEntry[K]) {
    onChange({ ...banner, [key]: value });
  }

  return (
    <div
      style={{
        background: '#0f172a',
        borderRadius: 10,
        border: `1px solid ${isWinner ? '#22c55e' : '#1e293b'}`,
        padding: 18,
      }}
      className="space-y-4"
    >
      {/* Karten-Kopf */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-2 flex-wrap text-left"
          title={expanded ? 'Zuklappen' : 'Aufklappen'}
        >
          <span
            className="text-slate-500 text-xs transition-transform"
            style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none' }}
          >
            ▶
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: `${status.color}22`, color: status.color }}
          >
            {status.label}
          </span>
          {isWinner && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ background: '#22c55e22', color: '#22c55e' }}
            >
              ✓ Aktuell sichtbar
            </span>
          )}
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{ background: '#1e293b', color: '#94a3b8' }}
          >
            {dateRangeLabel(banner)}
          </span>
        </button>
        <div className="ml-auto flex items-center gap-3">
          {expanded && (
            <>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => update('enabled', !banner.enabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${banner.enabled ? 'bg-green-500' : 'bg-slate-700'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${banner.enabled ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: banner.enabled ? '#22c55e' : '#64748b' }}
                >
                  {banner.enabled ? 'AN' : 'AUS'}
                </span>
              </label>
              <button
                onClick={() => {
                  if (confirm('Diesen Banner wirklich löschen?')) onDelete();
                }}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                title="Banner löschen"
              >
                Löschen
              </button>
            </>
          )}
        </div>
      </div>

      {/* Live-Vorschau — immer sichtbar */}
      <div>
        {expanded && (
          <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Vorschau</p>
        )}
        <div
          style={{ backgroundColor: banner.bgColor, color: textColor, borderRadius: 8 }}
          className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3"
        >
          <div>
            <p className="font-heading font-extrabold text-base leading-tight">
              {banner.headline || 'Dein Headline-Text…'}
            </p>
            {banner.subline && <p className="text-sm mt-0.5 opacity-80">{banner.subline}</p>}
          </div>
          {banner.ctaLabel && (
            <span
              style={{ backgroundColor: textColor, color: banner.bgColor }}
              className="shrink-0 px-4 py-2 rounded-full font-bold text-sm"
            >
              {banner.ctaLabel} →
            </span>
          )}
        </div>
      </div>

      {!expanded ? null : (
      <>
      {/* Farbe */}
      <div>
        <label className="block text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">
          Hintergrundfarbe
        </label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((p) => (
            <button
              key={p.hex}
              onClick={() => update('bgColor', p.hex)}
              title={p.label}
              className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: p.hex,
                borderColor: banner.bgColor === p.hex ? '#06b6d4' : 'transparent',
                boxShadow: banner.bgColor === p.hex ? '0 0 0 2px #0f172a, 0 0 0 4px #06b6d4' : undefined,
              }}
            />
          ))}
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={banner.bgColor}
              onChange={(e) => update('bgColor', e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
              title="Farbe wählen"
            />
            <input
              type="text"
              value={customColor}
              onChange={(e) => {
                setCustomColor(e.target.value);
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) update('bgColor', e.target.value);
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
          value={banner.headline}
          onChange={(e) => update('headline', e.target.value.slice(0, 120))}
          placeholder="🔥 50% auf deine erste Buchung — Code: FIRST50"
          className={inputClass}
          maxLength={120}
        />
        <p className="text-right text-xs text-slate-600 mt-1">{banner.headline.length}/120</p>
      </div>

      {/* Subline */}
      <div>
        <label className="block text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
          Untertext <span className="text-slate-600 font-normal">(optional, max. 200 Zeichen)</span>
        </label>
        <input
          type="text"
          value={banner.subline}
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
            value={banner.ctaLabel}
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
            value={banner.ctaUrl}
            onChange={(e) => update('ctaUrl', e.target.value)}
            placeholder="/kameras"
            className={inputClass}
          />
        </div>
      </div>

      {/* Zeitraum */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
            Aktiv von <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={banner.validFrom}
              onChange={(e) => update('validFrom', e.target.value)}
              className={inputClass + ' w-auto'}
            />
            {banner.validFrom && (
              <button
                onClick={() => update('validFrom', '')}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                × entfernen
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">
            Aktiv bis <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={banner.validUntil}
              onChange={(e) => update('validUntil', e.target.value)}
              className={inputClass + ' w-auto'}
            />
            {banner.validUntil && (
              <button
                onClick={() => update('validUntil', '')}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                × entfernen
              </button>
            )}
          </div>
        </div>
      </div>
      {banner.validFrom && banner.validUntil && banner.validFrom > banner.validUntil && (
        <p className="text-xs text-red-400">
          „Aktiv von“ liegt nach „Aktiv bis“ — der Banner wird nie angezeigt.
        </p>
      )}
      </>
      )}
    </div>
  );
}

// ============================================================
// Hauptkomponente
// ============================================================

export default function PromoBannerAdmin() {
  const [banners, setBanners] = useState<PromoBannerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  // Zugeklappt per Default — nur die aufgeklappten IDs werden gemerkt.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    fetch('/api/admin/settings?key=promo_banner')
      .then((r) => r.json())
      .then((d) => {
        if (d.value) {
          const parsed = typeof d.value === 'string' ? JSON.parse(d.value) : d.value;
          setBanners(normalize(parsed));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSuccess('');
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'promo_banner', value: JSON.stringify({ banners }) }),
      });
      setSuccess('Gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
    } finally {
      setSaving(false);
    }
  }

  const today = todayBerlin();
  // Nach Startdatum sortiert anzeigen (offene zuerst).
  const sorted = [...banners].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  // Gewinner = aktiver Banner mit spaetestem validFrom.
  const activeOnes = sorted.filter((b) => isActive(b, today));
  const winnerId =
    activeOnes.length > 0
      ? [...activeOnes].sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0].id
      : null;

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
            Aktions-Banner ganz oben auf der Startseite. Plane mehrere Banner mit Zeiträumen
            vor — sie werden automatisch nach Datum live geschaltet.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Lädt…</p>
      ) : (
        <div className="space-y-4">
          {banners.length === 0 && (
            <p className="text-slate-500 text-sm py-4 text-center">
              Noch keine Banner angelegt — füge unten eine Kampagne hinzu.
            </p>
          )}

          {sorted.map((b) => (
            <BannerCard
              key={b.id}
              banner={b}
              status={bannerStatus(b, today)}
              isWinner={b.id === winnerId}
              expanded={expandedIds.has(b.id)}
              onToggleExpand={() => toggleExpand(b.id)}
              onChange={(updated) =>
                setBanners((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
              onDelete={() => setBanners((prev) => prev.filter((x) => x.id !== b.id))}
            />
          ))}

          {/* Hinzufügen */}
          <button
            onClick={() => {
              const nb = makeNewBanner();
              setBanners((prev) => [...prev, nb]);
              setExpandedIds((prev) => new Set(prev).add(nb.id));
            }}
            className="w-full py-2.5 rounded-lg text-sm font-heading font-semibold transition-colors border border-slate-700 text-slate-400 hover:border-cyan-500 hover:text-cyan-400"
          >
            + Banner / Kampagne hinzufügen
          </button>

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
            <span className="ml-auto text-xs font-semibold" style={{ color: winnerId ? '#22c55e' : '#64748b' }}>
              {winnerId ? '✓ Ein Banner ist aktuell sichtbar' : 'Aktuell ist kein Banner sichtbar'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

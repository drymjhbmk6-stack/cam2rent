'use client';

import { useEffect, useState, useMemo } from 'react';

interface HomeSeoTextConfig {
  enabled: boolean;
  title: string;
  markdown: string;
}

const DEFAULT: HomeSeoTextConfig = {
  enabled: false,
  title: 'Action-Cams mieten – das musst du wissen',
  markdown: '',
};

/**
 * Admin-Karte für den SEO-Textblock am Seitenende der Startseite.
 * Speicherung in admin_settings.home_seo_text.
 * Server-Komponente HomeSeoText liest und rendert daraus.
 */
export default function HomeSeoTextAdmin() {
  const [cfg, setCfg] = useState<HomeSeoTextConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings?key=home_seo_text')
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

  function update<K extends keyof HomeSeoTextConfig>(key: K, value: HomeSeoTextConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSuccess('');
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'home_seo_text', value: JSON.stringify(cfg) }),
      });
      setSuccess('Gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      // Fehler
    } finally {
      setSaving(false);
    }
  }

  const wordCount = useMemo(() => {
    return cfg.markdown.trim().split(/\s+/).filter(Boolean).length;
  }, [cfg.markdown]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#e2e8f0',
    fontSize: 14,
  };

  return (
    <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 24 }}>
      <div className="flex items-center gap-3 mb-4">
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#06b6d414', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg className="w-5 h-5" style={{ color: '#06b6d4' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <div>
          <h2 className="font-heading font-semibold text-base" style={{ color: '#e2e8f0' }}>
            SEO-Textblock (Seitenende)
          </h2>
          <p className="text-xs" style={{ color: '#64748b' }}>
            Markdown-Text am Ende der Startseite — füllt Wortanzahl für Suchmaschinen
          </p>
        </div>
        {!loading && (
          <span
            className="ml-auto text-xs font-semibold px-3 py-1 rounded-full"
            style={cfg.enabled
              ? { background: '#10b98114', color: '#10b981' }
              : { background: '#64748b14', color: '#64748b' }
            }
          >
            {cfg.enabled ? 'Aktiv' : 'Inaktiv'}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 14 }}>Laden…</div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => update('enabled', !cfg.enabled)}
              className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
              style={{ background: cfg.enabled ? '#06b6d4' : '#334155' }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                style={{ left: cfg.enabled ? 22 : 2 }}
              />
            </div>
            <span className="text-sm" style={{ color: '#e2e8f0' }}>
              SEO-Textblock auf Startseite anzeigen
            </span>
          </label>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#64748b' }}>Überschrift (H2)</label>
            <input
              style={inputStyle}
              value={cfg.title}
              maxLength={100}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Action-Cams mieten – das musst du wissen"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs" style={{ color: '#64748b' }}>
                Inhalt (Markdown)
              </label>
              <span
                className="text-xs"
                style={{ color: wordCount >= 500 ? '#10b981' : wordCount >= 300 ? '#f59e0b' : '#64748b' }}
              >
                {wordCount} Wörter {wordCount < 500 && `(empfohlen: ≥ 500)`}
              </span>
            </div>
            <textarea
              style={{ ...inputStyle, minHeight: 360, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 13, lineHeight: 1.5 }}
              value={cfg.markdown}
              onChange={(e) => update('markdown', e.target.value)}
              placeholder={`## Worauf kommt es beim Action-Cam-Verleih an?

Wir vermieten **GoPro Hero 12/13**, **DJI Osmo Action 5 Pro** und **Insta360 X4** für Wassersport, MTB, Wintersport und Vlogs ab 9,90 €/Tag.

### Marken im Überblick
- **GoPro Hero 13** — Allrounder mit 5,3K-Video und HyperSmooth-Stabilisierung
- **DJI Osmo Action 5 Pro** — bester Akku, starke Low-Light-Performance
- **Insta360 X4** — 360°-Aufnahmen mit nachträglichem Reframing

### So funktioniert die Miete
1. Online auswählen und Mietzeitraum festlegen
2. Identität bestätigen
3. Paket bekommen, drehen, zurückschicken
…`}
            />
            <p className="text-xs mt-1" style={{ color: '#64748b' }}>
              Unterstützt **bold**, *italic*, Überschriften (## / ###), Listen, Links. Vorschau live auf der Startseite nach Speichern.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: '#06b6d4', color: 'white' }}
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            {success && <span className="text-sm" style={{ color: '#10b981' }}>{success}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

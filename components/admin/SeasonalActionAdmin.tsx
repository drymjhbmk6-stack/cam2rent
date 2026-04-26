'use client';

import { useEffect, useState } from 'react';

interface SeasonalActionConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  badgeText: string;
  ctaLabel: string;
  ctaUrl: string;
  couponCode: string;
  validUntil: string; // YYYY-MM-DD
}

const DEFAULT: SeasonalActionConfig = {
  enabled: false,
  title: 'Skisaison startet jetzt',
  subtitle: 'GoPro Hero 13 + Insta360 X5 mit 15 % Rabatt — bereit für die ersten Pulver-Tage.',
  badgeText: 'Saison-Aktion',
  ctaLabel: 'Jetzt sichern',
  ctaUrl: '/kameras',
  couponCode: 'WINTER15',
  validUntil: '',
};

/**
 * Admin-Karte zur Konfiguration der Saison-Aktion auf der Startseite.
 * Speicherung in admin_settings.seasonal_action.
 */
export default function SeasonalActionAdmin() {
  const [cfg, setCfg] = useState<SeasonalActionConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings?key=seasonal_action')
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

  function update<K extends keyof SeasonalActionConfig>(key: K, value: SeasonalActionConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSuccess('');
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'seasonal_action', value: JSON.stringify(cfg) }),
      });
      setSuccess('Gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      // Fehler
    } finally {
      setSaving(false);
    }
  }

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
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#a855f714', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg className="w-5 h-5" style={{ color: '#a855f7' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <div>
          <h2 className="font-heading font-semibold text-base" style={{ color: '#e2e8f0' }}>
            Saison-Aktion
          </h2>
          <p className="text-xs" style={{ color: '#64748b' }}>
            Bunte Aktions-Karte zwischen Hero und Produkten — schnell saisonal anpassen
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
              style={{ background: cfg.enabled ? '#a855f7' : '#334155' }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                style={{ left: cfg.enabled ? 22 : 2 }}
              />
            </div>
            <span className="text-sm" style={{ color: '#e2e8f0' }}>
              Saison-Aktion auf Startseite anzeigen
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: '#64748b' }}>Badge-Text (klein)</label>
              <input style={inputStyle} value={cfg.badgeText} onChange={(e) => update('badgeText', e.target.value)} placeholder="Saison-Aktion" />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: '#64748b' }}>Gültig bis</label>
              <input
                style={inputStyle}
                type="date"
                value={cfg.validUntil}
                onChange={(e) => update('validUntil', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#64748b' }}>Überschrift</label>
            <input style={inputStyle} value={cfg.title} onChange={(e) => update('title', e.target.value)} />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#64748b' }}>Untertitel</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }}
              value={cfg.subtitle}
              onChange={(e) => update('subtitle', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: '#64748b' }}>CTA-Button Text</label>
              <input style={inputStyle} value={cfg.ctaLabel} onChange={(e) => update('ctaLabel', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: '#64748b' }}>CTA-Ziel-URL</label>
              <input style={inputStyle} value={cfg.ctaUrl} onChange={(e) => update('ctaUrl', e.target.value)} placeholder="/kameras" />
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#64748b' }}>Gutschein-Code (optional)</label>
            <input
              style={inputStyle}
              value={cfg.couponCode}
              onChange={(e) => update('couponCode', e.target.value.toUpperCase())}
              placeholder="WINTER15"
            />
            <p className="text-xs mt-1" style={{ color: '#64748b' }}>
              Wird in der Karte als Code angezeigt — muss separat unter Gutscheine angelegt werden.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: '#a855f7', color: 'white' }}
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

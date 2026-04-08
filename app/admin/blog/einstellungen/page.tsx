'use client';

import { useState, useEffect } from 'react';

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0f172a', border: '1px solid #334155',
  borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14,
};
const selectStyle: React.CSSProperties = { ...inputStyle };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8 };
const sectionStyle: React.CSSProperties = { background: '#111827', borderRadius: 12, border: '1px solid #1e293b', padding: 20, marginBottom: 16 };

const WEEKDAYS = [
  { key: 'mo', label: 'Mo' },
  { key: 'di', label: 'Di' },
  { key: 'mi', label: 'Mi' },
  { key: 'do', label: 'Do' },
  { key: 'fr', label: 'Fr' },
  { key: 'sa', label: 'Sa' },
  { key: 'so', label: 'So' },
];

interface BlogSettings {
  anthropic_api_key: string;
  openai_api_key: string;
  unsplash_access_key: string;
  default_tone: string;
  default_length: string;
  default_author: string;
  auto_generate: boolean;
  auto_generate_mode: string;
  auto_generate_interval: string;
  auto_generate_weekdays: string[];
  auto_generate_time_from: string;
  auto_generate_time_to: string;
  auto_generate_topic: string;
}

const DEFAULTS: BlogSettings = {
  anthropic_api_key: '',
  openai_api_key: '',
  unsplash_access_key: '',
  default_tone: 'informativ',
  default_length: 'mittel',
  default_author: 'cam2rent',
  auto_generate: false,
  auto_generate_mode: 'semi',
  auto_generate_interval: 'weekly',
  auto_generate_weekdays: ['mo', 'do'],
  auto_generate_time_from: '09:00',
  auto_generate_time_to: '18:00',
  auto_generate_topic: '',
};

export default function BlogEinstellungenPage() {
  const [settings, setSettings] = useState<BlogSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings?key=blog_settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.value) {
          const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          setSettings({ ...DEFAULTS, ...parsed });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'blog_settings', value: JSON.stringify(settings) }),
      });
      if (!res.ok) throw new Error('Fehler beim Speichern');
      setSuccess('Einstellungen gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Einstellungen konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof BlogSettings>(key: K, value: BlogSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function toggleWeekday(day: string) {
    const days = settings.auto_generate_weekdays ?? [];
    if (days.includes(day)) {
      update('auto_generate_weekdays', days.filter((d) => d !== day));
    } else {
      update('auto_generate_weekdays', [...days, day]);
    }
  }

  if (loading) {
    return <div className="p-4 sm:p-8"><p style={{ color: '#64748b' }}>Wird geladen...</p></div>;
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <h1 className="font-heading font-bold text-xl sm:text-2xl mb-1" style={{ color: 'white' }}>Blog-Einstellungen</h1>
      <p className="text-sm mb-6" style={{ color: '#64748b' }}>API-Keys, KI-Konfiguration und Zeitplanung</p>

      {success && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140' }}>{success}</div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}>{error}</div>
      )}

      {/* API-Schluessel */}
      <div style={sectionStyle}>
        <h2 className="font-heading font-semibold text-base mb-4" style={{ color: 'white' }}>API-Schluessel</h2>
        <div className="space-y-4">
          <div>
            <label style={labelStyle}>Anthropic API Key (Text)</label>
            <input style={inputStyle} type="password" value={settings.anthropic_api_key} onChange={(e) => update('anthropic_api_key', e.target.value)} placeholder="sk-ant-..." />
          </div>
          <div>
            <label style={labelStyle}>OpenAI API Key (DALL-E 3 Bilder)</label>
            <input style={inputStyle} type="password" value={settings.openai_api_key} onChange={(e) => update('openai_api_key', e.target.value)} placeholder="sk-..." />
          </div>
          <div>
            <label style={labelStyle}>Unsplash Access Key (optional)</label>
            <input style={inputStyle} type="password" value={settings.unsplash_access_key} onChange={(e) => update('unsplash_access_key', e.target.value)} placeholder="Fuer manuelle Bildsuche..." />
          </div>
        </div>
      </div>

      {/* KI-Standardeinstellungen */}
      <div style={sectionStyle}>
        <h2 className="font-heading font-semibold text-base mb-4" style={{ color: 'white' }}>KI-Standardeinstellungen</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Standard-Ton</label>
            <select style={selectStyle} value={settings.default_tone} onChange={(e) => update('default_tone', e.target.value)}>
              <option value="informativ">Informativ</option>
              <option value="locker">Locker</option>
              <option value="professionell">Professionell</option>
              <option value="begeisternd">Begeisternd</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Standard-Laenge</label>
            <select style={selectStyle} value={settings.default_length} onChange={(e) => update('default_length', e.target.value)}>
              <option value="kurz">Kurz (~500 Woerter)</option>
              <option value="mittel">Mittel (~1000 Woerter)</option>
              <option value="lang">Lang (~1500 Woerter)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label style={labelStyle}>Standard-Autor</label>
            <input style={inputStyle} value={settings.default_author} onChange={(e) => update('default_author', e.target.value)} placeholder="cam2rent" />
          </div>
        </div>
      </div>

      {/* Auto-Generierung */}
      <div style={sectionStyle}>
        <h2 className="font-heading font-semibold text-base mb-4" style={{ color: 'white' }}>Auto-Generierung</h2>
        <div className="space-y-4">
          {/* Toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => update('auto_generate', !settings.auto_generate)}
              className="relative w-11 h-6 rounded-full transition-colors shrink-0"
              style={{ background: settings.auto_generate ? '#06b6d4' : '#334155' }}
            >
              <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform" style={{ transform: settings.auto_generate ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
            <span className="text-sm font-semibold" style={{ color: settings.auto_generate ? '#06b6d4' : '#94a3b8' }}>
              Automatische Generierung {settings.auto_generate ? 'aktiv' : 'inaktiv'}
            </span>
          </label>

          {settings.auto_generate && (
            <>
              {/* Modus */}
              <div className="pt-2">
                <label style={labelStyle}>Modus</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { value: 'semi', label: 'Semi-Automatisch', desc: 'KI generiert als Entwurf — du gibst frei', color: '#f59e0b' },
                    { value: 'voll', label: 'Voll-Automatisch', desc: 'KI generiert und veroeffentlicht sofort', color: '#22c55e' },
                  ].map((m) => {
                    const active = (settings.auto_generate_mode || 'semi') === m.value;
                    return (
                      <button key={m.value} type="button" onClick={() => update('auto_generate_mode', m.value)}
                        className="text-left p-3 rounded-lg border transition-colors"
                        style={{ background: active ? m.color + '15' : '#0f172a', borderColor: active ? m.color : '#334155' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: active ? m.color : '#475569' }} />
                          <span className="text-xs font-heading font-semibold" style={{ color: active ? m.color : '#94a3b8' }}>{m.label}</span>
                        </div>
                        <p className="text-[11px]" style={{ color: '#475569' }}>{m.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Intervall */}
              <div>
                <label style={labelStyle}>Intervall</label>
                <select style={selectStyle} value={settings.auto_generate_interval} onChange={(e) => update('auto_generate_interval', e.target.value)}>
                  <option value="daily">Taeglich</option>
                  <option value="weekly">Woechentlich</option>
                  <option value="biweekly">Alle 2 Wochen</option>
                  <option value="monthly">Monatlich</option>
                </select>
              </div>

              {/* Wochentage — bei weekly/biweekly */}
              {(settings.auto_generate_interval === 'weekly' || settings.auto_generate_interval === 'biweekly') && (
                <div>
                  <label style={labelStyle}>An welchen Tagen?</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {WEEKDAYS.map((d) => {
                      const active = (settings.auto_generate_weekdays ?? []).includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => toggleWeekday(d.key)}
                          className="w-10 h-10 rounded-lg text-xs font-heading font-semibold transition-colors"
                          style={active
                            ? { background: '#06b6d4', color: 'white' }
                            : { background: '#0f172a', color: '#64748b', border: '1px solid #334155' }}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: '#475569' }}>
                    Pro ausgewaehltem Tag wird ein Artikel generiert.
                    Aktuell: {(settings.auto_generate_weekdays ?? []).length} Artikel pro Woche
                  </p>
                </div>
              )}

              {/* Zeitraum */}
              <div>
                <label style={labelStyle}>
                  {settings.auto_generate_interval === 'daily'
                    ? 'Veroeffentlichungszeitraum (taeglich zwischen)'
                    : 'Uhrzeit (zwischen)'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    style={{ ...inputStyle, width: 'auto', flex: 1 }}
                    value={settings.auto_generate_time_from}
                    onChange={(e) => update('auto_generate_time_from', e.target.value)}
                  />
                  <span className="text-sm" style={{ color: '#64748b' }}>bis</span>
                  <input
                    type="time"
                    style={{ ...inputStyle, width: 'auto', flex: 1 }}
                    value={settings.auto_generate_time_to}
                    onChange={(e) => update('auto_generate_time_to', e.target.value)}
                  />
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: '#475569' }}>
                  {settings.auto_generate_interval === 'daily'
                    ? 'Der Cron-Job generiert taeglich einen Artikel innerhalb dieses Zeitfensters.'
                    : 'Der Cron-Job sollte innerhalb dieses Zeitfensters laufen.'}
                </p>
              </div>

              {/* Thema / Bereich */}
              <div>
                <label style={labelStyle}>Standard-Themenbereich (optional)</label>
                <input style={inputStyle} value={settings.auto_generate_topic} onChange={(e) => update('auto_generate_topic', e.target.value)} placeholder="z.B. Action-Cam Tipps, Reisen..." />
                <p className="text-[11px] mt-1.5" style={{ color: '#475569' }}>
                  Falls der Themenpool leer ist, wird dieses Thema als Fallback verwendet.
                </p>
              </div>

              {/* Hinweis Semi */}
              {(settings.auto_generate_mode || 'semi') === 'semi' && (
                <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: '#f59e0b10', border: '1px solid #f59e0b30' }}>
                  <span className="text-base mt-0.5">&#9888;</span>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>
                    Artikel werden als <strong style={{ color: '#f59e0b' }}>Entwurf</strong> gespeichert.
                    Du findest sie unter Artikel und kannst sie pruefen, bearbeiten und manuell veroeffentlichen.
                  </p>
                </div>
              )}

              {/* Cron-Info */}
              <div style={{ background: '#0f172a', borderRadius: 8, padding: 16 }}>
                <p style={{ color: '#94a3b8' }} className="text-xs font-heading font-semibold uppercase mb-2">Cron-URL</p>
                <code className="text-xs break-all" style={{ color: '#06b6d4' }}>
                  {baseUrl}/api/cron/blog-generate?secret=DEIN_CRON_SECRET
                </code>
                <p className="text-[11px] mt-2" style={{ color: '#475569' }}>
                  Richte diesen Cron-Job auf deinem Server ein.
                  {settings.auto_generate_interval === 'daily' && ` Empfehlung: Taeglich um ${settings.auto_generate_time_from || '09:00'}.`}
                  {settings.auto_generate_interval === 'weekly' && ` Empfehlung: ${(settings.auto_generate_weekdays ?? []).map((d) => WEEKDAYS.find((w) => w.key === d)?.label).filter(Boolean).join(', ')} um ${settings.auto_generate_time_from || '09:00'}.`}
                  {' '}Env-Variable: CRON_SECRET
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Speichern */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full sm:w-auto px-6 py-3 rounded-lg font-heading font-semibold text-sm transition-colors disabled:opacity-50"
        style={{ background: '#06b6d4', color: 'white' }}
      >
        {saving ? 'Wird gespeichert...' : 'Einstellungen speichern'}
      </button>
    </div>
  );
}

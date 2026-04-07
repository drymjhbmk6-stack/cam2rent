'use client';

import { useEffect, useState } from 'react';

const inputStyle: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  width: '100%',
};
const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 4 };
const sectionStyle: React.CSSProperties = { background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 24 };

type Settings = Record<string, unknown>;

export default function BlogEinstellungenPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    const keys = [
      'blog_anthropic_api_key', 'blog_unsplash_access_key',
      'blog_default_tone', 'blog_default_length', 'blog_default_author',
      'blog_auto_enabled', 'blog_auto_frequency', 'blog_auto_publish',
      'blog_posts_per_page', 'blog_comments_enabled',
    ];
    const result: Settings = {};
    for (const key of keys) {
      try {
        const res = await fetch(`/api/admin/settings?key=${key}`);
        const data = await res.json();
        if (data.value !== undefined && data.value !== null) result[key] = data.value;
      } catch { /* leer */ }
    }
    setSettings(result);
    setLoading(false);
  }

  function update(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      for (const [key, value] of Object.entries(settings)) {
        await fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }
      setMsg('Einstellungen gespeichert!');
      setTimeout(() => setMsg(''), 3000);
    } catch {
      setMsg('Fehler beim Speichern.');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: 'white' }}>Einstellungen</h1>
        <p style={{ color: '#64748b' }} className="text-sm">Laden...</p>
      </div>
    );
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: 'white' }}>Blog-Einstellungen</h1>
      <p className="text-sm mb-8" style={{ color: '#64748b' }}>API-Keys, KI-Konfiguration und Anzeige-Optionen</p>

      {/* API Keys */}
      <div style={sectionStyle}>
        <h2 className="font-heading font-semibold text-lg mb-4" style={{ color: '#e2e8f0' }}>API-Schlüssel</h2>
        <div className="space-y-4">
          <div>
            <label style={labelStyle} className="block">Anthropic API Key</label>
            <input
              type="password"
              style={inputStyle}
              value={(settings.blog_anthropic_api_key as string) ?? ''}
              onChange={(e) => update('blog_anthropic_api_key', e.target.value)}
              placeholder="sk-ant-..."
            />
            <p className="text-xs mt-1" style={{ color: '#475569' }}>Fuer die KI-Generierung von Blog-Artikeln</p>
          </div>
          <div>
            <label style={labelStyle} className="block">Unsplash Access Key</label>
            <input
              type="password"
              style={inputStyle}
              value={(settings.blog_unsplash_access_key as string) ?? ''}
              onChange={(e) => update('blog_unsplash_access_key', e.target.value)}
              placeholder="Unsplash Access Key..."
            />
            <p className="text-xs mt-1" style={{ color: '#475569' }}>Fuer KI-Bildvorschlaege (unsplash.com/developers)</p>
          </div>
        </div>
      </div>

      {/* KI-Standardeinstellungen */}
      <div style={sectionStyle}>
        <h2 className="font-heading font-semibold text-lg mb-4" style={{ color: '#e2e8f0' }}>KI-Standardeinstellungen</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={labelStyle} className="block">Standard-Ton</label>
            <select
              style={inputStyle}
              value={(settings.blog_default_tone as string) ?? 'informativ'}
              onChange={(e) => update('blog_default_tone', e.target.value)}
            >
              <option value="informativ">Informativ</option>
              <option value="locker">Locker</option>
              <option value="professionell">Professionell</option>
            </select>
          </div>
          <div>
            <label style={labelStyle} className="block">Standard-Laenge</label>
            <select
              style={inputStyle}
              value={(settings.blog_default_length as string) ?? 'mittel'}
              onChange={(e) => update('blog_default_length', e.target.value)}
            >
              <option value="kurz">Kurz (~500 Woerter)</option>
              <option value="mittel">Mittel (~1000 Woerter)</option>
              <option value="lang">Lang (~1500 Woerter)</option>
            </select>
          </div>
          <div className="col-span-2">
            <label style={labelStyle} className="block">Standard-Autor</label>
            <input
              style={inputStyle}
              value={(settings.blog_default_author as string) ?? 'cam2rent'}
              onChange={(e) => update('blog_default_author', e.target.value)}
              placeholder="cam2rent"
            />
          </div>
        </div>
      </div>

      {/* Auto-Generierung */}
      <div style={sectionStyle}>
        <h2 className="font-heading font-semibold text-lg mb-4" style={{ color: '#e2e8f0' }}>Auto-Generierung</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => update('blog_auto_enabled', !settings.blog_auto_enabled)}
              className="relative w-11 h-6 rounded-full transition-colors"
              style={{ background: settings.blog_auto_enabled ? '#06b6d4' : '#334155' }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                style={{ transform: settings.blog_auto_enabled ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
            <span style={{ color: '#e2e8f0' }} className="text-sm font-heading font-semibold">
              Automatische Artikel-Generierung {settings.blog_auto_enabled ? 'aktiv' : 'inaktiv'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle} className="block">Artikel pro Woche</label>
              <select
                style={inputStyle}
                value={String(settings.blog_auto_frequency ?? '2')}
                onChange={(e) => update('blog_auto_frequency', parseInt(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n} {n === 1 ? 'Artikel' : 'Artikel'}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle} className="block">Nach Generierung</label>
              <select
                style={inputStyle}
                value={settings.blog_auto_publish ? 'publish' : 'draft'}
                onChange={(e) => update('blog_auto_publish', e.target.value === 'publish')}
              >
                <option value="draft">Als Entwurf speichern</option>
                <option value="publish">Direkt veroeffentlichen</option>
              </select>
            </div>
          </div>

          <div style={{ background: '#0f172a', borderRadius: 8, padding: 16 }}>
            <p style={{ color: '#94a3b8' }} className="text-xs font-heading font-semibold uppercase mb-2">Cron-URL</p>
            <code className="text-xs break-all" style={{ color: '#06b6d4' }}>
              {baseUrl}/api/cron/blog-generate?secret=DEIN_CRON_SECRET
            </code>
            <p className="text-xs mt-2" style={{ color: '#475569' }}>
              Diese URL im Coolify/Server-Cron einrichten (z.B. Mo+Do 09:00).
              Env-Variable CRON_SECRET setzen.
            </p>
          </div>

          <div style={{ background: '#0f172a', borderRadius: 8, padding: 16 }}>
            <p style={{ color: '#94a3b8' }} className="text-xs font-heading font-semibold uppercase mb-2">Publish-Cron-URL</p>
            <code className="text-xs break-all" style={{ color: '#06b6d4' }}>
              {baseUrl}/api/cron/blog-publish?secret=DEIN_CRON_SECRET
            </code>
            <p className="text-xs mt-2" style={{ color: '#475569' }}>
              Taeglich ausfuehren (z.B. 08:00), um geplante Artikel zu veroeffentlichen.
            </p>
          </div>
        </div>
      </div>

      {/* Blog-Anzeige */}
      <div style={sectionStyle}>
        <h2 className="font-heading font-semibold text-lg mb-4" style={{ color: '#e2e8f0' }}>Blog-Anzeige</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={labelStyle} className="block">Artikel pro Seite</label>
            <select
              style={inputStyle}
              value={String(settings.blog_posts_per_page ?? '9')}
              onChange={(e) => update('blog_posts_per_page', parseInt(e.target.value))}
            >
              {[6, 9, 12, 15].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => update('blog_comments_enabled', !settings.blog_comments_enabled)}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{ background: settings.blog_comments_enabled ? '#06b6d4' : '#334155' }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                  style={{ transform: settings.blog_comments_enabled ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
              <span style={{ color: '#e2e8f0' }} className="text-sm font-heading font-semibold">
                Kommentare {settings.blog_comments_enabled ? 'aktiv' : 'deaktiviert'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Speichern */}
      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg font-heading font-semibold text-sm transition-colors"
          style={{ background: '#06b6d4', color: 'white', opacity: saving ? 0.5 : 1 }}
        >
          {saving ? 'Speichern...' : 'Einstellungen speichern'}
        </button>
        {msg && (
          <span className="text-sm font-heading" style={{ color: msg.includes('Fehler') ? '#ef4444' : '#22c55e' }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

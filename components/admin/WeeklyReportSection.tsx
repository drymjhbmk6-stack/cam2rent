'use client';

import { useEffect, useState } from 'react';

/**
 * Admin-Einstellung für den Wochenbericht.
 *
 * Speichert in admin_settings.weekly_report_config:
 *   { enabled: boolean, email: string }
 *
 * Default bei leerem Setting: aktiviert, Empfänger = ADMIN_EMAIL / BUSINESS.emailKontakt
 */
export default function WeeklyReportSection() {
  const [enabled, setEnabled] = useState(true);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/settings?key=weekly_report_config');
        const data = await res.json();
        if (data?.value) {
          const cfg = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          if (typeof cfg.enabled === 'boolean') setEnabled(cfg.enabled);
          if (typeof cfg.email === 'string') setEmail(cfg.email);
        }
      } catch {
        // Keine Config gespeichert → Default
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'weekly_report_config',
          value: { enabled, email: email.trim() },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Speichern fehlgeschlagen');
      }
      setMessage('Einstellungen gespeichert.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSend() {
    setTesting(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/admin/weekly-report/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Versand fehlgeschlagen');
      setMessage('Test-Bericht wurde versendet. Kann 1–2 Minuten dauern.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-brand-border dark:border-slate-700 p-6 mb-8">
        <p className="text-sm text-brand-muted">Lade Einstellungen…</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-brand-border dark:border-slate-700 p-6 mb-8">
      <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2a4 4 0 014-4h6M3 7h12a2 2 0 012 2v8a2 2 0 01-2 2H3V7z" />
        </svg>
        Wöchentlicher Bericht
      </h2>
      <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-4">
        Jeden <strong>Sonntag um 18:30 Uhr</strong> bekommst du automatisch eine Zusammenfassung der Woche per E-Mail inkl. PDF-Anhang (Umsatz, Buchungen, Kunden, Schäden, Content, Warnungen). Der Crontab-Eintrag auf dem Server muss dazu gesetzt sein — siehe CLAUDE.md.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-cyan-500"
          />
          <span className="text-sm font-heading font-semibold text-brand-black dark:text-white">
            Wochenbericht aktiv
          </span>
        </label>
      </div>

      <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-2">
        Empfänger-E-Mail
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="kontakt@cam2rent.de (Default wenn leer)"
        className="w-full px-3 py-2.5 border border-brand-border dark:border-slate-600 rounded-xl text-sm font-body bg-white dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-cyan mb-4"
      />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-accent-cyan text-white text-sm font-heading font-semibold rounded-btn hover:bg-cyan-700 transition-colors disabled:opacity-40"
        >
          {saving ? 'Speichere…' : 'Einstellungen speichern'}
        </button>
        <button
          onClick={handleTestSend}
          disabled={testing}
          className="px-4 py-2 border border-brand-border dark:border-slate-600 text-brand-black dark:text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-bg dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
        >
          {testing ? 'Sende Test…' : 'Test-Bericht jetzt senden'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-3 font-body">{error}</p>}
      {message && <p className="text-xs text-green-600 dark:text-green-400 mt-3 font-body">{message}</p>}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

/**
 * Admin-Einstellung für den Quartals-Firmware-Check (alle 3 Monate).
 *
 * Speichert in admin_settings.firmware_check_config:
 *   { enabled: boolean, last_run_at?: string, last_run_summary?: {...} }
 *
 * Der Cron `/api/cron/firmware-check` läuft am 1. jedes Quartals 07:00 Berlin und
 * prüft pro Kamera-Modell auf neue Hersteller-Firmware. Im Test-Modus
 * wird der Cron komplett übersprungen.
 */

interface FirmwareCheckConfig {
  enabled?: boolean;
  last_run_at?: string;
  last_run_summary?: { checked: number; errors: number; unsupported: number; updates: number };
}

export default function FirmwareCheckSection() {
  const [config, setConfig] = useState<FirmwareCheckConfig>({ enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/settings?key=firmware_check_config');
        const data = await res.json();
        if (data?.value) {
          const cfg = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          setConfig({ enabled: cfg.enabled !== false, ...cfg });
        }
      } catch {
        // leer → Default
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'firmware_check_config',
          value: { ...config, enabled: config.enabled !== false },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Speichern fehlgeschlagen');
      }
      setMessage('Einstellung gespeichert.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestRun() {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/admin/firmware/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Lauf fehlgeschlagen');
      const s = data.summary;
      setMessage(
        `Lauf fertig: ${s.checked} geprüft, ${s.updates.length} mit Update, ` +
          `${s.errors} Fehler, ${s.unsupported} unsupported.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-brand-border dark:border-slate-700 p-6 mb-8">
        <p className="text-sm text-brand-muted">Lade Einstellungen…</p>
      </div>
    );
  }

  const lastRun = config.last_run_at
    ? new Date(config.last_run_at).toLocaleString('de-DE')
    : null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-brand-border dark:border-slate-700 p-6 mb-8">
      <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
        Firmware-Check
      </h2>
      <p className="text-sm font-body text-brand-muted dark:text-gray-400 mb-4">
        Quartalslauf (<strong>1. Januar/April/Juli/Oktober, 07:00</strong>) prüft pro
        Kamera-Modell die Hersteller-Webseite/-API auf neue Firmware. Bei Update bekommst
        du eine Push-Notification + die Übersicht zeigt es unter
        <em> Katalog → Firmware-Updates</em>. Im Test-Modus läuft der Cron nicht.
        Crontab-Eintrag siehe CLAUDE.md. „Jetzt prüfen“ kannst du jederzeit manuell.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled !== false}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="w-4 h-4 accent-cyan-500"
          />
          <span className="text-sm font-heading font-semibold text-brand-black dark:text-white">
            Firmware-Check aktiv
          </span>
        </label>
      </div>

      {lastRun && (
        <div className="text-xs text-brand-muted dark:text-gray-400 mb-4">
          Letzter Lauf: <strong>{lastRun}</strong>
          {config.last_run_summary && (
            <span className="ml-2">
              ({config.last_run_summary.checked} geprüft, {config.last_run_summary.updates} mit Update,
              {' '}{config.last_run_summary.errors} Fehler)
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-accent-cyan text-white text-sm font-heading font-semibold rounded-btn hover:bg-cyan-700 transition-colors disabled:opacity-40"
        >
          {saving ? 'Speichere…' : 'Einstellung speichern'}
        </button>
        <button
          onClick={handleTestRun}
          disabled={running}
          className="px-4 py-2 border border-brand-border dark:border-slate-600 text-brand-black dark:text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-bg dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
        >
          {running ? 'Läuft…' : 'Jetzt prüfen'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-3 font-body">{error}</p>}
      {message && <p className="text-xs text-green-600 dark:text-green-400 mt-3 font-body">{message}</p>}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';

type Mode = 'test' | 'live';

export default function EnvModeSection() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/admin/env-mode', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.mode === 'test' || data?.mode === 'live') setMode(data.mode);
      })
      .finally(() => setLoading(false));
  }, []);

  function requestChange(target: Mode) {
    setError('');
    setSuccess('');
    setPassword('');
    setPendingMode(target);
  }

  async function confirmChange() {
    if (!pendingMode) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/env-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: pendingMode, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Fehler beim Umschalten');
        return;
      }
      setMode(pendingMode);
      setPendingMode(null);
      setPassword('');
      setSuccess(
        pendingMode === 'live'
          ? 'Live-Modus aktiv. Stripe, Resend, Sendcloud nutzen jetzt die Live-Keys.'
          : 'Test-Modus aktiv. Keine echten Buchungen, Zahlungen oder Versand-Labels.',
      );
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  }

  const isLive = mode === 'live';
  const badgeColor = isLive ? 'bg-rose-500' : 'bg-amber-400';
  const badgeLabel = isLive ? 'LIVE' : 'TEST';

  return (
    <section className="rounded-2xl border border-[#1e293b] bg-[#0f172a] p-6 shadow-sm mb-6">
      <header className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-lg bg-[#1e293b] flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-[#06b6d4]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            Test- / Live-Modus
            {mode && (
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold text-[#0a0a0a] rounded-full ${badgeColor}`}>
                {badgeLabel}
              </span>
            )}
          </h2>
          <p className="text-sm text-[#94a3b8] mt-1">
            Steuert Stripe, Resend, Sendcloud, Vertrags-Wasserzeichen, Auto-Publish und Buchhaltungs-Daten.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-[#64748b]">Lade…</div>
      ) : (
        <>
          <div className="rounded-lg border border-[#1e293b] bg-[#020617] p-4 mb-4">
            <p className="text-sm text-[#cbd5e1] leading-relaxed">
              Im <strong className="text-amber-400">Test-Modus</strong> nutzen alle Zahlungen Stripe-Test-Keys,
              Versand-Labels werden im Sandbox-Account erstellt, Vertraege tragen das MUSTER-Wasserzeichen,
              Rechnungs-/Gutschriftsnummern haben `TEST-` Praefix, und Test-Buchungen werden in Reports/DATEV
              ausgeblendet. Social-Auto-Post + Blog-Auto-Publish sind deaktiviert.
            </p>
            <p className="text-sm text-[#cbd5e1] leading-relaxed mt-2">
              Im <strong className="text-rose-400">Live-Modus</strong> greifen die echten Keys — Zahlungen
              werden real abgerechnet, Versand-Labels sind kostenpflichtig, Vertraege sind rechtsguelig.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => requestChange('test')}
              disabled={mode === 'test' || saving}
              className={`rounded-lg border p-4 text-left transition-colors ${
                mode === 'test'
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-[#1e293b] bg-[#0f172a] hover:bg-[#1e293b]'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-white">Test-Modus</span>
                {mode === 'test' && <span className="text-xs text-amber-400 font-semibold">AKTIV</span>}
              </div>
              <p className="text-xs text-[#94a3b8]">Keine echten Kosten, Muster-Vertraege, isolierte Buchhaltung.</p>
            </button>

            <button
              onClick={() => requestChange('live')}
              disabled={mode === 'live' || saving}
              className={`rounded-lg border p-4 text-left transition-colors ${
                mode === 'live'
                  ? 'border-rose-500 bg-rose-500/10'
                  : 'border-[#1e293b] bg-[#0f172a] hover:bg-[#1e293b]'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-white">Live-Modus</span>
                {mode === 'live' && <span className="text-xs text-rose-400 font-semibold">AKTIV</span>}
              </div>
              <p className="text-xs text-[#94a3b8]">Echte Zahlungen, verbindliche Vertraege, oeffentliche Buchhaltung.</p>
            </button>
          </div>

          {success && (
            <p className="mt-4 text-sm text-emerald-400">{success}</p>
          )}

          {pendingMode && (
            <div className="mt-4 rounded-lg border border-[#06b6d4]/40 bg-[#06b6d4]/5 p-4">
              <p className="text-sm text-white mb-3">
                Wechsel zu <strong>{pendingMode === 'live' ? 'LIVE' : 'TEST'}</strong> bestaetigen:
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin-Passwort"
                className="w-full bg-[#020617] border border-[#1e293b] rounded px-3 py-2 text-sm text-white focus:border-[#06b6d4] focus:outline-none mb-3"
                autoFocus
              />
              {error && <p className="text-sm text-rose-400 mb-3">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={confirmChange}
                  disabled={!password || saving}
                  className="px-4 py-2 bg-[#06b6d4] hover:bg-[#0891b2] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0a0a] text-sm font-semibold rounded transition-colors"
                >
                  {saving ? 'Umschalten…' : 'Bestaetigen'}
                </button>
                <button
                  onClick={() => { setPendingMode(null); setPassword(''); setError(''); }}
                  disabled={saving}
                  className="px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-white text-sm font-semibold rounded transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

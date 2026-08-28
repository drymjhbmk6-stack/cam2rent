'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_AI_REPLY_CONFIG,
  normalizeAiReplyConfig,
  KATEGORIE_LABEL,
  NIEMALS_AUTOMATISCH,
  ALLE_KATEGORIEN,
  type AiReplyConfig,
  type AnfrageKategorie,
} from '@/lib/ai/auto-reply-config';

/**
 * Einstellungen der KI-Beantwortung von Kundenanfragen.
 * Speicherung: admin_settings.ai_reply_config (siehe lib/ai/auto-reply-config.ts)
 */

const SETTINGS_KEY = 'ai_reply_config';

/** Kategorien, die ueberhaupt automatisch beantwortet werden duerfen. */
const WAEHLBARE_KATEGORIEN: AnfrageKategorie[] = ALLE_KATEGORIEN.filter(
  (k) => !NIEMALS_AUTOMATISCH.includes(k) && k !== 'sonstiges',
);

export default function AiReplySection() {
  const [cfg, setCfg] = useState<AiReplyConfig>(DEFAULT_AI_REPLY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/settings?key=${SETTINGS_KEY}`)
      .then((r) => r.json())
      .then((d) => {
        const raw = typeof d?.value === 'string' ? JSON.parse(d.value) : d?.value;
        setCfg(raw ? normalizeAiReplyConfig(raw) : DEFAULT_AI_REPLY_CONFIG);
      })
      .catch(() => setCfg(DEFAULT_AI_REPLY_CONFIG))
      .finally(() => setLoaded(true));
  }, []);

  function toggleKategorie(k: AnfrageKategorie) {
    setCfg((prev) => ({
      ...prev,
      auto_categories: prev.auto_categories.includes(k)
        ? prev.auto_categories.filter((x) => x !== k)
        : [...prev.auto_categories, k],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: SETTINGS_KEY, value: normalizeAiReplyConfig(cfg) }),
      });
      if (!res.ok) throw new Error('save failed');
      setMsg('Gespeichert ✓');
    } catch {
      setMsg('Fehler beim Speichern');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  const box = 'bg-slate-800/60 dark:bg-slate-800/60 rounded-2xl border border-slate-700 p-5';

  return (
    <div className={box}>
      <h2 className="font-heading font-semibold text-base mb-1" style={{ color: '#e2e8f0' }}>
        Kundenanfragen automatisch beantworten
      </h2>
      <p className="text-sm font-body text-slate-400 mb-4">
        Die KI liest jede eingehende Kundenanfrage, sucht die Antwort in deinen echten
        Shop-Daten (Preise, Zubehör, Versand, Haftungsschutz, Storno, Buchungsstatus) und
        schreibt eine Antwort. Einfache Standardfragen gehen direkt raus, alles andere
        landet als Entwurf unter <strong className="text-slate-300">Nachrichten</strong>.
      </p>

      {!loaded ? (
        <div className="text-sm text-slate-500">Lädt…</div>
      ) : (
        <div className="space-y-5">
          {/* An/Aus */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
              className="mt-1 w-4 h-4 accent-cyan-500"
            />
            <span className="text-sm text-slate-200">
              KI-Beantwortung aktiv
              <span className="block text-xs text-slate-400">
                Aus = die KI rührt nichts an. Anfragen landen wie bisher unbeantwortet im Posteingang.
              </span>
            </span>
          </label>

          {/* Modus */}
          <div>
            <p className="text-sm font-heading font-semibold text-slate-200 mb-2">Was darf die KI tun?</p>
            <div className="space-y-2">
              {([
                {
                  v: 'hybrid' as const,
                  t: 'Einfache Fragen automatisch beantworten',
                  d: 'Standardfragen gehen direkt raus. Alles Heikle (Geld, Schaden, Storno, Beschwerde, Recht) kommt immer als Entwurf zu dir.',
                },
                {
                  v: 'draft_only' as const,
                  t: 'Nur Entwürfe vorschlagen',
                  d: 'Nichts geht ohne dich raus. Du bekommst zu jeder Anfrage einen fertigen Vorschlag zum Prüfen und Absenden.',
                },
              ]).map((o) => (
                <label
                  key={o.v}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    cfg.mode === o.v
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="ai-reply-mode"
                    checked={cfg.mode === o.v}
                    onChange={() => setCfg({ ...cfg, mode: o.v })}
                    className="mt-1 w-4 h-4 accent-cyan-500"
                  />
                  <span className="text-sm text-slate-200">
                    {o.t}
                    <span className="block text-xs text-slate-400">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Kanäle */}
          <div>
            <p className="text-sm font-heading font-semibold text-slate-200 mb-2">Wo soll die KI mitlesen?</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={cfg.channels.email}
                  onChange={(e) => setCfg({ ...cfg, channels: { ...cfg.channels, email: e.target.checked } })}
                  className="w-4 h-4 accent-cyan-500"
                />
                📧 E-Mails an das Support-Postfach
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={cfg.channels.account}
                  onChange={(e) => setCfg({ ...cfg, channels: { ...cfg.channels, account: e.target.checked } })}
                  className="w-4 h-4 accent-cyan-500"
                />
                💬 Nachrichten aus dem Kundenkonto
              </label>
            </div>
          </div>

          {/* Automatisch-freigegebene Themen */}
          {cfg.mode === 'hybrid' && (
            <div>
              <p className="text-sm font-heading font-semibold text-slate-200 mb-1">
                Diese Themen darf die KI selbst beantworten
              </p>
              <p className="text-xs text-slate-400 mb-2">
                Schaden, Zahlung, Storno, Vertrag, Datenschutz und Beschwerden sind fest
                gesperrt — dazu bekommst du immer nur einen Entwurf.
              </p>
              <div className="flex flex-wrap gap-2">
                {WAEHLBARE_KATEGORIEN.map((k) => {
                  const on = cfg.auto_categories.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleKategorie(k)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-heading font-semibold border transition-colors ${
                        on
                          ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {on ? '✓ ' : ''}
                      {KATEGORIE_LABEL[k]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Schwellwerte */}
          {cfg.mode === 'hybrid' && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="ai-conf" className="block text-xs text-slate-400 mb-1">
                  Mindest-Sicherheit für den automatischen Versand
                </label>
                <select
                  id="ai-conf"
                  value={String(cfg.confidence_min)}
                  onChange={(e) => setCfg({ ...cfg, confidence_min: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-base text-slate-100 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="0.7">70 % — locker</option>
                  <option value="0.8">80 % — empfohlen</option>
                  <option value="0.9">90 % — streng</option>
                  <option value="0.95">95 % — sehr streng</option>
                </select>
              </div>
              <div>
                <label htmlFor="ai-thread" className="block text-xs text-slate-400 mb-1">
                  Max. automatische Antworten je Konversation
                </label>
                <input
                  id="ai-thread"
                  type="number"
                  min={0}
                  max={10}
                  value={cfg.max_auto_replies_per_thread}
                  onChange={(e) => setCfg({ ...cfg, max_auto_replies_per_thread: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-base text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="ai-day" className="block text-xs text-slate-400 mb-1">
                  Max. automatische Antworten pro Tag
                </label>
                <input
                  id="ai-day"
                  type="number"
                  min={0}
                  max={500}
                  value={cfg.max_auto_replies_per_day}
                  onChange={(e) => setCfg({ ...cfg, max_auto_replies_per_day: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-base text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Eigene Hinweise */}
          <div>
            <label htmlFor="ai-extra" className="block text-sm font-heading font-semibold text-slate-200 mb-1">
              Eigene Hinweise für die KI (optional)
            </label>
            <textarea
              id="ai-extra"
              value={cfg.extra_context}
              onChange={(e) => setCfg({ ...cfg, extra_context: e.target.value })}
              rows={4}
              placeholder={'z.B.\n- Abholung nur nach Terminabsprache, meist abends.\n- Bei Fragen zu Drohnen: wir verleihen keine.'}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
            />
            <p className="text-xs text-slate-400 mt-1">
              Diese Hinweise gelten zusätzlich zu den Shop-Daten. Preise und Verfügbarkeiten
              zieht die KI immer live aus der Datenbank — hier nichts doppelt eintragen.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-accent-blue hover:opacity-90 text-white text-sm font-heading font-semibold disabled:opacity-40"
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
            {msg && (
              <span
                className={`text-sm font-heading font-semibold ${
                  msg.startsWith('Fehler') ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

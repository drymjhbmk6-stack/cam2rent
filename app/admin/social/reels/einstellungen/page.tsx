'use client';

import { useEffect, useRef, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface ReelsSettings {
  pexels_api_key?: string;
  pixabay_api_key?: string;
  voice_enabled?: boolean;
  voice_name?: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer';
  voice_model?: 'tts-1' | 'tts-1-hd';
  voice_style?: 'calm' | 'normal' | 'energetic';
  max_duration?: number;
  intro_enabled?: boolean;
  outro_enabled?: boolean;
  intro_duration?: number;
  outro_duration?: number;
}

const VOICE_OPTIONS: Array<{ value: NonNullable<ReelsSettings['voice_name']>; label: string; desc: string }> = [
  { value: 'nova', label: 'Nova', desc: 'weiblich, jung, natürlich' },
  { value: 'shimmer', label: 'Shimmer', desc: 'weiblich, warm' },
  { value: 'alloy', label: 'Alloy', desc: 'neutral, sachlich' },
  { value: 'echo', label: 'Echo', desc: 'männlich, ruhig' },
  { value: 'onyx', label: 'Onyx', desc: 'männlich, tief' },
  { value: 'fable', label: 'Fable', desc: 'britisch, erzählend' },
];

const DEFAULT_SAMPLE_TEXT = 'Hey, schau mal — die GoPro Hero 13 für dein nächstes Abenteuer. Action, Wasser, Outdoor. Mieten auf cam2rent.de.';

export default function ReelsEinstellungenPage() {
  const [settings, setSettings] = useState<ReelsSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Voice-Preview State
  const [previewText, setPreviewText] = useState(DEFAULT_SAMPLE_TEXT);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null); // welche Voice gerade lädt
  const [previewError, setPreviewError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/settings?key=reels_settings');
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        if (body.value) {
          const parsed = typeof body.value === 'string' ? JSON.parse(body.value) : body.value;
          setSettings(parsed ?? {});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true);
    setFeedback('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'reels_settings', value: JSON.stringify(settings) }),
      });
      setFeedback(res.ok ? 'Gespeichert.' : 'Fehler beim Speichern.');
    } catch {
      setFeedback('Netzwerk-Fehler.');
    } finally {
      setSaving(false);
    }
  }

  /** Spielt eine Voice-Sample ab. Vorherige URL wird revoked, damit kein Memory-Leak. */
  async function previewVoice(voice: NonNullable<ReelsSettings['voice_name']>) {
    setPreviewBusy(voice);
    setPreviewError('');
    try {
      const res = await fetch('/api/admin/reels/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice,
          style: settings.voice_style ?? 'normal',
          model: settings.voice_model ?? 'tts-1-hd',
          text: previewText.trim() || DEFAULT_SAMPLE_TEXT,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPreviewError(body.error ?? `Fehler ${res.status}`);
        return;
      }
      const blob = await res.blob();
      // Vorherige URL freigeben
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      await audioRef.current.play();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setPreviewBusy(null);
    }
  }

  // Cleanup Blob-URL beim Unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <AdminBackLink href="/admin/social/reels" />

      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-heading font-bold text-brand-dark dark:text-white">Reel-Einstellungen</h1>
        <p className="text-sm text-brand-steel dark:text-gray-400 mt-1">
          API-Keys, Branding, Voice-Over und Standard-Dauer für alle Reels.
        </p>
      </div>

      {loading ? (
        <p className="text-center text-brand-steel dark:text-gray-400 py-12">Lade…</p>
      ) : (
        <div className="space-y-6">
          {/* API-Keys */}
          <Card title="Stock-Footage Quellen" description="API-Keys für die kostenlosen Video-Datenbanken.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Pexels API-Key" hint="Pflicht für Stock-Reels.">
                <input
                  type="password"
                  placeholder="z.B. 5634abcd…"
                  value={settings.pexels_api_key ?? ''}
                  onChange={(e) => setSettings({ ...settings, pexels_api_key: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Pixabay API-Key" hint="Optional, zweite Quelle gegen Wiederholungen.">
                <input
                  type="password"
                  placeholder="z.B. 12345678-abcdef…"
                  value={settings.pixabay_api_key ?? ''}
                  onChange={(e) => setSettings({ ...settings, pixabay_api_key: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <p className="text-xs text-brand-steel dark:text-gray-500 mt-3">
              Solange Pixabay leer ist, wird ausschließlich Pexels abgefragt. Mit beiden Keys wird pro Reel deterministisch
              zwischen den Quellen gewechselt — verhindert Wiederholung der Clips.
            </p>
          </Card>

          {/* Reel-Dauer */}
          <Card title="Standard-Dauer" description="Maximale Reel-Länge (kann pro Vorlage überschrieben werden).">
            <Field label="Max. Reel-Dauer in Sekunden">
              <input
                type="number"
                min={5}
                max={90}
                value={settings.max_duration ?? 30}
                onChange={(e) => setSettings({ ...settings, max_duration: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
          </Card>

          {/* Branding */}
          <Card title="Branding" description="Intro und Outro mit cam2rent-Logo. Wird auf jeden Reel angewendet.">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-brand-dark dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.intro_enabled !== false}
                  onChange={(e) => setSettings({ ...settings, intro_enabled: e.target.checked })}
                />
                <span>Intro mit cam2rent-Logo (Anfang)</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-brand-dark dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.outro_enabled !== false}
                  onChange={(e) => setSettings({ ...settings, outro_enabled: e.target.checked })}
                />
                <span>Outro mit cam2rent-Logo + „Action-Cam mieten auf cam2rent.de&ldquo; (Ende)</span>
              </label>
              <div className="grid grid-cols-2 gap-3 pl-6">
                <Field label="Intro-Dauer (Sek.)">
                  <input
                    type="number"
                    step="0.5"
                    min={0.5}
                    max={5}
                    value={settings.intro_duration ?? 1.5}
                    onChange={(e) => setSettings({ ...settings, intro_duration: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Outro-Dauer (Sek.)">
                  <input
                    type="number"
                    step="0.5"
                    min={0.5}
                    max={5}
                    value={settings.outro_duration ?? 1.5}
                    onChange={(e) => setSettings({ ...settings, outro_duration: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          </Card>

          {/* Voice-Over */}
          <Card title="Voice-Over (KI-Stimme)" description="OpenAI TTS — sprecht die Skripte für die Reels ein. Optional.">
            <label className="flex items-center gap-2 text-sm font-medium text-brand-dark dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={settings.voice_enabled ?? false}
                onChange={(e) => setSettings({ ...settings, voice_enabled: e.target.checked })}
              />
              <span>Voice-Over aktivieren (~0,003–0,006 € pro Reel)</span>
            </label>

            {settings.voice_enabled && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                <Field label="Stimme">
                  <select
                    value={settings.voice_name ?? 'nova'}
                    onChange={(e) => setSettings({ ...settings, voice_name: e.target.value as ReelsSettings['voice_name'] })}
                    className={inputClass}
                  >
                    <option value="nova">Nova (weiblich, jung, natürlich)</option>
                    <option value="shimmer">Shimmer (weiblich, warm)</option>
                    <option value="alloy">Alloy (neutral, sachlich)</option>
                    <option value="echo">Echo (männlich, ruhig)</option>
                    <option value="onyx">Onyx (männlich, tief)</option>
                    <option value="fable">Fable (britisch, erzählend)</option>
                  </select>
                </Field>
                <Field label="Stil">
                  <select
                    value={settings.voice_style ?? 'normal'}
                    onChange={(e) => setSettings({ ...settings, voice_style: e.target.value as ReelsSettings['voice_style'] })}
                    className={inputClass}
                  >
                    <option value="calm">Ruhig (langsamer, fast meditativ)</option>
                    <option value="normal">Normal (sympathisch-aktiv)</option>
                    <option value="energetic">Energetisch (schnell, enthusiastisch)</option>
                  </select>
                </Field>
                <Field label="Modell">
                  <select
                    value={settings.voice_model ?? 'tts-1-hd'}
                    onChange={(e) => setSettings({ ...settings, voice_model: e.target.value as ReelsSettings['voice_model'] })}
                    className={inputClass}
                  >
                    <option value="tts-1-hd">tts-1-hd (HD, empfohlen)</option>
                    <option value="tts-1">tts-1 (Standard)</option>
                  </select>
                </Field>
              </div>
            )}

            {/* Voice-Preview */}
            {settings.voice_enabled && (
              <div className="mt-6 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-brand-dark dark:text-white">🔊 Stimmen anhören</h3>
                  <p className="text-xs text-brand-steel dark:text-gray-400 mt-1">
                    Aktueller Stil: <strong>{settings.voice_style ?? 'normal'}</strong> · Modell: <strong>{settings.voice_model ?? 'tts-1-hd'}</strong>. Klick auf eine Stimme spielt einen kurzen Test ab (~0,003 € pro Klick).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-brand-dark dark:text-white mb-1">Test-Text (optional, max 200 Zeichen)</label>
                  <textarea
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value.slice(0, 200))}
                    rows={2}
                    placeholder={DEFAULT_SAMPLE_TEXT}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs text-brand-dark dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {VOICE_OPTIONS.map((v) => {
                    const isCurrent = (settings.voice_name ?? 'nova') === v.value;
                    const isBusy = previewBusy === v.value;
                    return (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => previewVoice(v.value)}
                        disabled={previewBusy !== null}
                        className={`text-left rounded-lg border px-3 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${
                          isCurrent
                            ? 'border-brand-orange bg-brand-orange/5'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-brand-orange/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{isBusy ? '⏳' : '▶'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-brand-dark dark:text-white truncate">
                              {v.label}{isCurrent && <span className="ml-1 text-[10px] text-brand-orange">(aktiv)</span>}
                            </div>
                            <div className="text-[10px] text-brand-steel dark:text-gray-500 truncate">{v.desc}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {previewError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{previewError}</p>
                )}
              </div>
            )}
          </Card>

          {/* Save */}
          <div className="flex items-center gap-3 sticky bottom-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-lg">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Speichere…' : 'Einstellungen speichern'}
            </button>
            {feedback && <span className="text-sm text-brand-steel dark:text-gray-400">{feedback}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white';

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-lg font-heading font-bold text-brand-dark dark:text-white">{title}</h2>
      {description && <p className="text-sm text-brand-steel dark:text-gray-400 mt-1 mb-4">{description}</p>}
      {!description && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-brand-steel dark:text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-brand-steel/70 dark:text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface ReelsSettings {
  pexels_api_key?: string;
  pixabay_api_key?: string;
  voice_enabled?: boolean;
  voice_provider?: 'openai' | 'elevenlabs';
  // OpenAI
  voice_name?: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer';
  voice_model?: 'tts-1' | 'tts-1-hd';
  voice_style?: 'calm' | 'normal' | 'energetic';
  // ElevenLabs
  elevenlabs_api_key?: string;
  elevenlabs_voice_id?: string;
  elevenlabs_voice_name?: string; // gespeicherter Name fuer UI-Anzeige
  elevenlabs_model_id?: 'eleven_multilingual_v2' | 'eleven_turbo_v2_5' | 'eleven_flash_v2_5';
  elevenlabs_stability?: number;
  elevenlabs_similarity_boost?: number;
  elevenlabs_style?: number;
  elevenlabs_speaker_boost?: boolean;
  max_duration?: number;
  intro_enabled?: boolean;
  outro_enabled?: boolean;
  intro_duration?: number;
  outro_duration?: number;
  publish_in_test_mode?: boolean;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string | null;
  labels: Record<string, string> | null;
  preview_url: string | null;
  description: string | null;
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

  // ElevenLabs-Voices State
  const [elVoices, setElVoices] = useState<ElevenLabsVoice[]>([]);
  const [elVoicesLoading, setElVoicesLoading] = useState(false);
  const [elVoicesError, setElVoicesError] = useState('');

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

  /** Hilfs-Wrapper: spielt MP3-Blob aus Response ab, mit Memory-Cleanup. */
  async function playPreviewResponse(res: Response) {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setPreviewError(body.error ?? `Fehler ${res.status}`);
      return;
    }
    const blob = await res.blob();
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    await audioRef.current.play();
  }

  /** OpenAI-Voice-Sample abspielen. */
  async function previewOpenAIVoice(voice: NonNullable<ReelsSettings['voice_name']>) {
    setPreviewBusy(`openai:${voice}`);
    setPreviewError('');
    try {
      const res = await fetch('/api/admin/reels/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          voice,
          style: settings.voice_style ?? 'normal',
          model: settings.voice_model ?? 'tts-1-hd',
          text: previewText.trim() || DEFAULT_SAMPLE_TEXT,
        }),
      });
      await playPreviewResponse(res);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setPreviewBusy(null);
    }
  }

  /** ElevenLabs-Voice-Sample abspielen. Optional mit aktuell editiertem (noch nicht gespeichertem) API-Key. */
  async function previewElevenLabsVoice(voiceId: string) {
    setPreviewBusy(`el:${voiceId}`);
    setPreviewError('');
    try {
      const res = await fetch('/api/admin/reels/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'elevenlabs',
          voiceId,
          modelId: settings.elevenlabs_model_id ?? 'eleven_multilingual_v2',
          style: settings.voice_style ?? 'normal',
          stability: settings.elevenlabs_stability,
          similarity_boost: settings.elevenlabs_similarity_boost,
          style_weight: settings.elevenlabs_style,
          speaker_boost: settings.elevenlabs_speaker_boost,
          apiKey: settings.elevenlabs_api_key, // erlaubt Test vor Speichern
          text: previewText.trim() || DEFAULT_SAMPLE_TEXT,
        }),
      });
      await playPreviewResponse(res);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setPreviewBusy(null);
    }
  }

  /** Laedt die ElevenLabs-Voices fuers Dropdown. Nutzt den eingegebenen Key direkt. */
  async function loadElevenLabsVoices() {
    setElVoicesLoading(true);
    setElVoicesError('');
    try {
      const params = new URLSearchParams();
      if (settings.elevenlabs_api_key?.trim()) {
        params.set('api_key', settings.elevenlabs_api_key.trim());
      }
      const res = await fetch(`/api/admin/reels/elevenlabs-voices?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) {
        setElVoicesError(body.error ?? `Fehler ${res.status}`);
        setElVoices([]);
        return;
      }
      setElVoices(body.voices ?? []);
      if ((body.voices ?? []).length === 0) {
        setElVoicesError('Keine Stimmen gefunden — pruefe API-Key oder Account.');
      }
    } catch (err) {
      setElVoicesError(err instanceof Error ? err.message : 'Netzwerk-Fehler');
    } finally {
      setElVoicesLoading(false);
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

          {/* Veröffentlichungs-Verhalten */}
          <Card
            title="Veröffentlichung im Test-Modus"
            description="Standardmäßig werden Reels im Test-Modus nicht wirklich auf Facebook/Instagram hochgeladen — nur DB-Status wird auf 'published' gesetzt. Mit dieser Option umgehst du den Schutz und veröffentlichst echt."
          >
            <label className="flex items-start gap-3 text-sm text-brand-dark dark:text-white cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.publish_in_test_mode ?? false}
                onChange={(e) => setSettings({ ...settings, publish_in_test_mode: e.target.checked })}
              />
              <span>
                <span className="font-medium">Auch im Test-Modus echt auf Meta veröffentlichen</span>
                <span className="block text-xs text-brand-steel dark:text-gray-400 mt-1">
                  Greift sowohl beim manuellen „Jetzt veröffentlichen“-Button als auch beim geplanten Cron
                  (<code className="text-[10px]">/api/cron/reels-publish</code>). Andere Test-Modus-Schutzmechanismen
                  (Stripe-Test-Keys, Mail-Redirect, Versand-Skip) bleiben unberührt.
                </span>
              </span>
            </label>
            {settings.publish_in_test_mode && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>Aktiv:</strong> Generierte Reels gehen wirklich live auf deine FB-Page und IG-Business-Accounts —
                  auch wenn die Umgebung sonst auf Test steht.
                </p>
              </div>
            )}
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
          <Card title="Voice-Over (KI-Stimme)" description="Wähle zwischen OpenAI TTS (billig) und ElevenLabs (deutlich natürlicher für Deutsch).">
            <label className="flex items-center gap-2 text-sm font-medium text-brand-dark dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={settings.voice_enabled ?? false}
                onChange={(e) => setSettings({ ...settings, voice_enabled: e.target.checked })}
              />
              <span>Voice-Over aktivieren</span>
            </label>

            {settings.voice_enabled && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Anbieter</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className={`cursor-pointer rounded-lg border px-3 py-3 transition ${
                    (settings.voice_provider ?? 'openai') === 'openai'
                      ? 'border-brand-orange bg-brand-orange/5'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-brand-orange/50'
                  }`}>
                    <input
                      type="radio"
                      name="voice_provider"
                      value="openai"
                      checked={(settings.voice_provider ?? 'openai') === 'openai'}
                      onChange={() => setSettings({ ...settings, voice_provider: 'openai' })}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-brand-dark dark:text-white">OpenAI TTS</span>
                    <p className="text-xs text-brand-steel dark:text-gray-500 mt-1 ml-5">~0,003–0,006 € pro Reel · 6 fixe Stimmen · solide für Englisch, mittelmäßig für Deutsch</p>
                  </label>
                  <label className={`cursor-pointer rounded-lg border px-3 py-3 transition ${
                    settings.voice_provider === 'elevenlabs'
                      ? 'border-brand-orange bg-brand-orange/5'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-brand-orange/50'
                  }`}>
                    <input
                      type="radio"
                      name="voice_provider"
                      value="elevenlabs"
                      checked={settings.voice_provider === 'elevenlabs'}
                      onChange={() => setSettings({ ...settings, voice_provider: 'elevenlabs' })}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-brand-dark dark:text-white">ElevenLabs</span>
                    <p className="text-xs text-brand-steel dark:text-gray-500 mt-1 ml-5">~0,05–0,15 € pro Reel · beliebige Stimmen · deutlich natürlicher für Deutsch</p>
                  </label>
                </div>
              </div>
            )}

            {settings.voice_enabled && (settings.voice_provider ?? 'openai') === 'openai' && (
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

            {/* OpenAI Voice-Preview */}
            {settings.voice_enabled && (settings.voice_provider ?? 'openai') === 'openai' && (
              <div className="mt-6 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-brand-dark dark:text-white">🔊 OpenAI-Stimmen anhören</h3>
                  <p className="text-xs text-brand-steel dark:text-gray-400 mt-1">
                    Aktueller Stil: <strong>{settings.voice_style ?? 'normal'}</strong> · Modell: <strong>{settings.voice_model ?? 'tts-1-hd'}</strong>. Klick spielt einen kurzen Test ab (~0,003 € pro Klick).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-brand-dark dark:text-white mb-1">Test-Text (optional, max 250 Zeichen)</label>
                  <textarea
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value.slice(0, 250))}
                    rows={2}
                    placeholder={DEFAULT_SAMPLE_TEXT}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs text-brand-dark dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {VOICE_OPTIONS.map((v) => {
                    const isCurrent = (settings.voice_name ?? 'nova') === v.value;
                    const isBusy = previewBusy === `openai:${v.value}`;
                    return (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => previewOpenAIVoice(v.value)}
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

            {/* ElevenLabs Block */}
            {settings.voice_enabled && settings.voice_provider === 'elevenlabs' && (
              <div className="mt-4 space-y-4">
                <div>
                  <Field label="ElevenLabs API-Key">
                    <input
                      type="password"
                      value={settings.elevenlabs_api_key ?? ''}
                      onChange={(e) => setSettings({ ...settings, elevenlabs_api_key: e.target.value })}
                      placeholder="sk_..."
                      className={inputClass}
                    />
                  </Field>
                  <p className="text-xs text-brand-steel dark:text-gray-500 mt-1">
                    Holst du auf <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="underline text-cyan-600 dark:text-cyan-400">elevenlabs.io → Settings → API-Keys</a>. Nach Eingabe &bdquo;Stimmen laden&ldquo; klicken.
                  </p>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Modell">
                    <select
                      value={settings.elevenlabs_model_id ?? 'eleven_multilingual_v2'}
                      onChange={(e) => setSettings({ ...settings, elevenlabs_model_id: e.target.value as ReelsSettings['elevenlabs_model_id'] })}
                      className={inputClass}
                    >
                      <option value="eleven_multilingual_v2">eleven_multilingual_v2 (beste DE-Qualität)</option>
                      <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 (schneller, günstiger)</option>
                      <option value="eleven_flash_v2_5">eleven_flash_v2_5 (sehr schnell, leicht reduziert)</option>
                    </select>
                  </Field>
                  <Field label="Stil">
                    <select
                      value={settings.voice_style ?? 'normal'}
                      onChange={(e) => setSettings({ ...settings, voice_style: e.target.value as ReelsSettings['voice_style'] })}
                      className={inputClass}
                    >
                      <option value="calm">Ruhig (höhere Stability)</option>
                      <option value="normal">Normal</option>
                      <option value="energetic">Energetisch (niedrigere Stability + Style)</option>
                    </select>
                  </Field>
                  <button
                    type="button"
                    onClick={loadElevenLabsVoices}
                    disabled={elVoicesLoading}
                    className="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {elVoicesLoading ? 'Lädt…' : (elVoices.length > 0 ? 'Stimmen neu laden' : 'Stimmen laden')}
                  </button>
                </div>

                {elVoicesError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{elVoicesError}</p>
                )}

                {/* Voice-Settings Sliders */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label={`Stability: ${(settings.elevenlabs_stability ?? 0.5).toFixed(2)}`} hint="0 = expressiv/variabel, 1 = stabil/monoton">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.elevenlabs_stability ?? 0.5}
                      onChange={(e) => setSettings({ ...settings, elevenlabs_stability: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </Field>
                  <Field label={`Similarity: ${(settings.elevenlabs_similarity_boost ?? 0.75).toFixed(2)}`} hint="Wie nah am Voice-Original">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.elevenlabs_similarity_boost ?? 0.75}
                      onChange={(e) => setSettings({ ...settings, elevenlabs_similarity_boost: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </Field>
                  <Field label={`Style: ${(settings.elevenlabs_style ?? 0.15).toFixed(2)}`} hint="Style-Übertreibung (nur v2-Multilingual)">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.elevenlabs_style ?? 0.15}
                      onChange={(e) => setSettings({ ...settings, elevenlabs_style: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </Field>
                </div>

                <label className="flex items-center gap-2 text-sm text-brand-dark dark:text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.elevenlabs_speaker_boost ?? true}
                    onChange={(e) => setSettings({ ...settings, elevenlabs_speaker_boost: e.target.checked })}
                  />
                  <span>Speaker-Boost (verstärkt Voice-Original — empfohlen)</span>
                </label>

                {/* Test-Text */}
                <div>
                  <label className="block text-xs font-medium text-brand-dark dark:text-white mb-1">Test-Text (max 250 Zeichen)</label>
                  <textarea
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value.slice(0, 250))}
                    rows={2}
                    placeholder={DEFAULT_SAMPLE_TEXT}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs text-brand-dark dark:text-white"
                  />
                </div>

                {/* Voices-Grid */}
                {elVoices.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-brand-dark dark:text-white mb-2">🔊 ElevenLabs-Stimmen ({elVoices.length})</h3>
                    <p className="text-xs text-brand-steel dark:text-gray-400 mb-3">Klick spielt einen Test mit deinem Text ab (~0,03–0,08 € pro Klick). &bdquo;Auswählen&ldquo; setzt die Stimme als Reel-Default.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto">
                      {elVoices.map((v) => {
                        const isCurrent = settings.elevenlabs_voice_id === v.voice_id;
                        const isBusy = previewBusy === `el:${v.voice_id}`;
                        const labelStr = v.labels
                          ? Object.entries(v.labels).map(([k, val]) => `${k}: ${val}`).join(' · ')
                          : '';
                        return (
                          <div
                            key={v.voice_id}
                            className={`rounded-lg border p-3 transition ${
                              isCurrent
                                ? 'border-brand-orange bg-brand-orange/5'
                                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-brand-dark dark:text-white truncate">
                                  {v.name}{isCurrent && <span className="ml-1 text-[10px] text-brand-orange">(aktiv)</span>}
                                </div>
                                {v.category && <div className="text-[10px] text-brand-steel dark:text-gray-500">{v.category}</div>}
                                {labelStr && <div className="text-[10px] text-brand-steel dark:text-gray-500 mt-0.5 truncate">{labelStr}</div>}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => previewElevenLabsVoice(v.voice_id)}
                                disabled={previewBusy !== null}
                                className="flex-1 rounded border border-cyan-500 bg-white dark:bg-gray-900 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 px-2 py-1 text-xs disabled:opacity-50"
                              >
                                {isBusy ? '⏳ Lädt…' : '▶ Test'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setSettings({ ...settings, elevenlabs_voice_id: v.voice_id, elevenlabs_voice_name: v.name })}
                                disabled={isCurrent}
                                className="flex-1 rounded bg-brand-orange hover:bg-brand-orange/90 text-white px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isCurrent ? '✓ Gewählt' : 'Auswählen'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {settings.elevenlabs_voice_id && (
                  <p className="text-xs text-brand-steel dark:text-gray-400">
                    Aktive Stimme: <strong>{settings.elevenlabs_voice_name ?? settings.elevenlabs_voice_id}</strong>
                  </p>
                )}

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

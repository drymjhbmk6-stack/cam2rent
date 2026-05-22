'use client';

import { useEffect, useRef, useState } from 'react';

interface ReelsSettings {
  auto_generate?: boolean;
  auto_generate_mode?: 'semi' | 'voll';
  auto_generate_weekdays?: string[];
  auto_generate_time_from?: string;
  auto_generate_time_to?: string;
  auto_generate_schedule_days_before?: number;
  pexels_api_key?: string;
  pixabay_api_key?: string;
  voice_enabled?: boolean;
  voice_provider?: 'openai' | 'elevenlabs';
  voice_name?: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer';
  voice_model?: 'tts-1' | 'tts-1-hd';
  voice_style?: 'calm' | 'normal' | 'energetic';
  elevenlabs_api_key?: string;
  elevenlabs_voice_id?: string;
  elevenlabs_voice_name?: string;
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

export default function ReelsEinstellungenContent() {
  const [settings, setSettings] = useState<ReelsSettings>({});
  const [publishInTestMode, setPublishInTestMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [previewText, setPreviewText] = useState(DEFAULT_SAMPLE_TEXT);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const [elVoices, setElVoices] = useState<ElevenLabsVoice[]>([]);
  const [elVoicesLoading, setElVoicesLoading] = useState(false);
  const [elVoicesError, setElVoicesError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [reelsRes, publishRes] = await Promise.all([
          fetch('/api/admin/settings?key=reels_settings'),
          fetch('/api/admin/settings?key=publish_in_test_mode'),
        ]);
        if (cancelled) return;
        if (reelsRes.ok) {
          const body = await reelsRes.json();
          if (body.value) {
            const parsed = typeof body.value === 'string' ? JSON.parse(body.value) : body.value;
            const reels = parsed ?? {};
            setSettings(reels);
            if (reels.publish_in_test_mode === true) {
              setPublishInTestMode(true);
            }
          }
        }
        if (publishRes.ok) {
          const body = await publishRes.json();
          if (body.value !== null && body.value !== undefined) {
            const parsed = typeof body.value === 'string' ? JSON.parse(body.value) : body.value;
            const enabled =
              typeof parsed === 'boolean'
                ? parsed
                : Boolean((parsed as { enabled?: boolean })?.enabled);
            setPublishInTestMode(enabled);
          }
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
      const cleanedReels: Record<string, unknown> = { ...settings };
      delete cleanedReels.publish_in_test_mode;

      const [reelsRes, publishRes] = await Promise.all([
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'reels_settings', value: JSON.stringify(cleanedReels) }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'publish_in_test_mode',
            value: JSON.stringify({ enabled: publishInTestMode }),
          }),
        }),
      ]);
      const ok = reelsRes.ok && publishRes.ok;
      setFeedback(ok ? 'Gespeichert.' : 'Fehler beim Speichern.');
    } catch {
      setFeedback('Netzwerk-Fehler.');
    } finally {
      setSaving(false);
    }
  }

  async function playPreviewResponse(res: Response) {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setPreviewError((body as { error?: string }).error ?? `Fehler ${res.status}`);
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
          apiKey: settings.elevenlabs_api_key,
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

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  if (loading) {
    return <p className="text-center text-brand-steel dark:text-gray-400 py-12">Lade…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Stock-Footage */}
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

      {/* Test-Modus */}
      <Card
        title="Content-Veröffentlichung im Test-Modus"
        description="Standardmäßig werden im Test-Modus keine Reels, Social-Posts und Blog-Artikel echt auf Facebook/Instagram bzw. den öffentlichen Shop publiziert. Mit dieser Option umgehst du den Schutz für alle drei Kanäle gemeinsam."
      >
        <label className="flex items-start gap-3 text-sm text-brand-dark dark:text-white cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={publishInTestMode}
            onChange={(e) => setPublishInTestMode(e.target.checked)}
          />
          <span>
            <span className="font-medium">
              Reels, Social-Posts und Blog auch im Test-Modus echt veröffentlichen
            </span>
            <span className="block text-xs text-brand-steel dark:text-gray-400 mt-1">
              Greift in allen drei Kanälen — manuelle „Jetzt veröffentlichen“-Buttons und alle Crons
              (<code className="text-[10px]">reels-publish</code>, <code className="text-[10px]">social-publish</code>,{' '}
              <code className="text-[10px]">social-generate</code>, <code className="text-[10px]">blog-publish</code>,{' '}
              <code className="text-[10px]">blog-generate</code>).
            </span>
          </span>
        </label>
        {publishInTestMode && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <strong>Aktiv:</strong> Reels gehen live auf FB+IG, Social-Posts werden veröffentlicht,
              Blog-Artikel gehen auf <code className="text-[10px]">cam2rent.de/blog</code> live.
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
            <span>Outro mit cam2rent-Logo + „Action-Cam mieten auf cam2rent.de“ (Ende)</span>
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
                <p className="text-xs text-brand-steel dark:text-gray-500 mt-1 ml-5">~0,003–0,006 € pro Reel · 6 fixe Stimmen</p>
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
                <p className="text-xs text-brand-steel dark:text-gray-500 mt-1 ml-5">~0,05–0,15 € pro Reel · natürlicher für Deutsch</p>
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
                Holst du auf <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="underline text-cyan-600 dark:text-cyan-400">elevenlabs.io → Settings → API-Keys</a>. Nach Eingabe „Stimmen laden“ klicken.
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
            {elVoices.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-brand-dark dark:text-white mb-2">🔊 ElevenLabs-Stimmen ({elVoices.length})</h3>
                <p className="text-xs text-brand-steel dark:text-gray-400 mb-3">Klick spielt einen Test mit deinem Text ab (~0,03–0,08 € pro Klick). „Auswählen“ setzt die Stimme als Reel-Default.</p>
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

      {/* Automatische Generierung */}
      <Card title="Automatische Generierung" description="Steuert den Cron /api/cron/reels-generate, der Reels aus dem Redaktionsplan automatisch erstellt.">
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => setSettings({ ...settings, auto_generate: !(settings.auto_generate !== false) })}
            style={{
              width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
              background: settings.auto_generate !== false ? '#06b6d4' : '#6b7280',
              transition: 'background 0.2s', position: 'relative', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 3,
              left: settings.auto_generate !== false ? 25 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s',
            }} />
          </button>
          <span className="text-sm text-brand-dark dark:text-white">
            {settings.auto_generate !== false ? 'Automatische Generierung aktiv' : 'Automatische Generierung deaktiviert'}
          </span>
        </div>

        {settings.auto_generate !== false && (
          <>
            <label className="block text-xs font-medium text-brand-steel dark:text-gray-400 mb-2">Modus</label>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {([
                { key: 'semi', title: 'Entwurf (Semi)', desc: 'KI generiert, Admin gibt frei — empfohlen für den Start' },
                { key: 'voll', title: 'Vollautomatisch', desc: 'KI generiert + veröffentlicht direkt — kein Review' },
              ] as const).map((m) => {
                const active = (settings.auto_generate_mode ?? 'semi') === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSettings({ ...settings, auto_generate_mode: m.key })}
                    className={`text-left rounded-lg border px-4 py-3 transition ${active ? 'border-cyan-500 bg-cyan-500/10' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-cyan-500/50'}`}
                  >
                    <div className={`font-semibold text-sm mb-1 ${active ? 'text-cyan-600 dark:text-cyan-400' : 'text-brand-dark dark:text-white'}`}>{m.title}</div>
                    <div className="text-xs text-brand-steel dark:text-gray-500 leading-snug">{m.desc}</div>
                  </button>
                );
              })}
            </div>

            <label className="block text-xs font-medium text-brand-steel dark:text-gray-400 mb-2">Wochentage</label>
            {(() => {
              const wd = settings.auto_generate_weekdays ?? ['mo', 'do'];
              return (
                <>
                  <div className="flex flex-wrap gap-2 mb-1">
                    {[
                      { k: 'mo', l: 'Mo' }, { k: 'di', l: 'Di' }, { k: 'mi', l: 'Mi' },
                      { k: 'do', l: 'Do' }, { k: 'fr', l: 'Fr' }, { k: 'sa', l: 'Sa' }, { k: 'so', l: 'So' },
                    ].map((d) => {
                      const active = wd.includes(d.k);
                      return (
                        <button
                          key={d.k}
                          type="button"
                          onClick={() => {
                            const next = active ? wd.filter((x) => x !== d.k) : [...wd, d.k];
                            setSettings({ ...settings, auto_generate_weekdays: next });
                          }}
                          className={`w-10 h-10 rounded-lg text-xs font-semibold border transition ${active ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500' : 'bg-white dark:bg-gray-900 text-brand-steel dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-cyan-500/50'}`}
                        >
                          {d.l}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-5">
                    {'→'} {wd.length} {wd.length === 1 ? 'Reel' : 'Reels'} pro Woche
                  </p>
                </>
              );
            })()}

            <div className="grid grid-cols-2 gap-3 mb-5">
              <Field label="Zeitfenster von">
                <input
                  type="time"
                  value={settings.auto_generate_time_from ?? '09:00'}
                  onChange={(e) => setSettings({ ...settings, auto_generate_time_from: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Zeitfenster bis">
                <input
                  type="time"
                  value={settings.auto_generate_time_to ?? '18:00'}
                  onChange={(e) => setSettings({ ...settings, auto_generate_time_to: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field
              label={`Vorlaufzeit: ${settings.auto_generate_schedule_days_before ?? 3} ${(settings.auto_generate_schedule_days_before ?? 3) === 1 ? 'Tag' : 'Tage'}`}
              hint="Reels werden N Tage vor dem geplanten Datum generiert — damit du im Semi-Modus Zeit zum Reviewen hast."
            >
              <input
                type="range"
                min={1}
                max={7}
                value={settings.auto_generate_schedule_days_before ?? 3}
                onChange={(e) => setSettings({ ...settings, auto_generate_schedule_days_before: Number(e.target.value) })}
                className="w-full mt-1"
              />
            </Field>

            <div className="mt-5 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-brand-steel dark:text-gray-500 mb-2">Cron-Eintrag auf dem Hetzner-Server:</p>
              <code className="block text-xs text-cyan-600 dark:text-cyan-400 break-all">
                {'0 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://cam2rent.de/api/cron/reels-generate'}
              </code>
            </div>
          </>
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

'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Template {
  id: string;
  name: string;
  description: string | null;
  template_type: 'stock_footage' | 'motion_graphics';
  script_prompt: string;
  default_duration: number;
  default_hashtags: string[];
  bg_color_from: string;
  bg_color_to: string;
  trigger_type: string | null;
  is_active: boolean;
}

interface ReelsSettings {
  pexels_api_key?: string;
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

interface MusicTrack {
  id: string;
  name: string;
  url: string;
  mood: string | null;
  attribution: string | null;
  is_default: boolean;
  source: string | null;
  storage_path: string | null;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [settings, setSettings] = useState<ReelsSettings>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState('');

  const [music, setMusic] = useState<MusicTrack[]>([]);
  const [musicUploading, setMusicUploading] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [newTrackName, setNewTrackName] = useState('');
  const [newTrackMood, setNewTrackMood] = useState('upbeat');
  const [newTrackAttribution, setNewTrackAttribution] = useState('');
  const [newTrackUrl, setNewTrackUrl] = useState('');

  async function load() {
    const res = await fetch('/api/admin/reels/templates');
    const body = await res.json();
    setTemplates(body.templates ?? []);
    setLoading(false);
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/settings?key=reels_settings');
      if (!res.ok) return;
      const body = await res.json();
      if (body.value) {
        const parsed = typeof body.value === 'string' ? JSON.parse(body.value) : body.value;
        setSettings(parsed ?? {});
      }
    } catch { /* ignore */ }
  }

  async function loadMusic() {
    try {
      const res = await fetch('/api/admin/reels/music');
      if (!res.ok) return;
      const body = await res.json();
      setMusic(body.tracks ?? []);
    } catch { /* ignore */ }
  }

  async function handleUploadMusic(file: File) {
    if (!newTrackName.trim()) {
      setMusicError('Bitte Name eingeben bevor du hochlädst.');
      return;
    }
    setMusicUploading(true);
    setMusicError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', newTrackName);
    fd.append('mood', newTrackMood);
    if (newTrackAttribution) fd.append('attribution', newTrackAttribution);

    try {
      const res = await fetch('/api/admin/reels/music', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) {
        setMusicError(body.error ?? 'Upload fehlgeschlagen');
      } else {
        setNewTrackName('');
        setNewTrackAttribution('');
        await loadMusic();
      }
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : 'Netzwerk-Fehler');
    } finally {
      setMusicUploading(false);
    }
  }

  async function handleAddMusicUrl() {
    if (!newTrackName.trim() || !newTrackUrl.trim()) {
      setMusicError('Name und URL sind Pflicht');
      return;
    }
    setMusicError('');
    try {
      const res = await fetch('/api/admin/reels/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTrackName, url: newTrackUrl, mood: newTrackMood, attribution: newTrackAttribution, source: 'url' }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMusicError(body.error ?? 'Hinzufuegen fehlgeschlagen');
      } else {
        setNewTrackName('');
        setNewTrackUrl('');
        setNewTrackAttribution('');
        await loadMusic();
      }
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : 'Netzwerk-Fehler');
    }
  }

  async function handleDeleteMusic(id: string) {
    if (!confirm('Track wirklich löschen?')) return;
    await fetch(`/api/admin/reels/music/${id}`, { method: 'DELETE' });
    await loadMusic();
  }

  async function handleSetDefault(id: string) {
    await fetch(`/api/admin/reels/music/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    });
    await loadMusic();
  }

  async function saveSettings() {
    setSavingSettings(true);
    setSettingsFeedback('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'reels_settings', value: JSON.stringify(settings) }),
      });
      setSettingsFeedback(res.ok ? 'Gespeichert.' : 'Fehler beim Speichern.');
    } catch {
      setSettingsFeedback('Netzwerk-Fehler.');
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    load();
    loadSettings();
    loadMusic();
  }, []);

  async function handleSave(id: string | null, data: Partial<Template>) {
    const isNew = id === null;
    const url = isNew ? '/api/admin/reels/templates' : `/api/admin/reels/templates/${id}`;
    const method = isNew ? 'POST' : 'PATCH';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await load();
      setEditingId(null);
      setCreating(false);
    } else {
      const body = await res.json();
      alert(`Fehler: ${body.error ?? 'unbekannt'}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Vorlage wirklich löschen?')) return;
    const res = await fetch(`/api/admin/reels/templates/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <AdminBackLink href="/admin/social/reels" />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-heading font-bold text-brand-dark dark:text-white">Reel-Vorlagen</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-4 py-2 text-sm font-medium text-white"
        >
          + Neue Vorlage
        </button>
      </div>

      {/* Einstellungen */}
      <div className="mb-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-lg font-heading font-bold text-brand-dark dark:text-white mb-3">Einstellungen</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-brand-steel dark:text-gray-400 mb-1">Pexels API-Key (für Stock-Footage)</span>
            <input
              type="password"
              placeholder="z.B. 5634abcd..."
              value={settings.pexels_api_key ?? ''}
              onChange={(e) => setSettings({ ...settings, pexels_api_key: e.target.value })}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-brand-steel dark:text-gray-400 mb-1">Max. Reel-Dauer (Sekunden)</span>
            <input
              type="number"
              min={5}
              max={90}
              value={settings.max_duration ?? 30}
              onChange={(e) => setSettings({ ...settings, max_duration: Number(e.target.value) })}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white"
            />
          </label>
        </div>
        <p className="text-xs text-brand-steel dark:text-gray-500 mt-2">
          Hintergrund-Musik wird jetzt pro Reel aus der Musik-Bibliothek (siehe unten) ausgewählt. Der als &bdquo;Standard&ldquo; markierte Track wird automatisch vorgewählt.
        </p>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-brand-dark dark:text-white mb-2">Branding</h3>
          <div className="space-y-2">
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
              <span>Outro mit cam2rent-Logo + &bdquo;Action-Cam mieten auf cam2rent.de&ldquo; (Ende)</span>
            </label>
            <div className="grid grid-cols-2 gap-3 pl-6">
              <label className="block">
                <span className="block text-xs text-brand-steel dark:text-gray-400 mb-1">Intro-Dauer (Sek.)</span>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  max={5}
                  value={settings.intro_duration ?? 1.5}
                  onChange={(e) => setSettings({ ...settings, intro_duration: Number(e.target.value) })}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-brand-dark dark:text-white"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-brand-steel dark:text-gray-400 mb-1">Outro-Dauer (Sek.)</span>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  max={5}
                  value={settings.outro_duration ?? 1.5}
                  onChange={(e) => setSettings({ ...settings, outro_duration: Number(e.target.value) })}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-brand-dark dark:text-white"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <label className="flex items-center gap-2 text-sm font-medium text-brand-dark dark:text-white cursor-pointer">
            <input
              type="checkbox"
              checked={settings.voice_enabled ?? false}
              onChange={(e) => setSettings({ ...settings, voice_enabled: e.target.checked })}
            />
            <span>Voice-Over aktivieren (OpenAI TTS, ~0,005 € pro Reel)</span>
          </label>

          {settings.voice_enabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <label className="block">
                <span className="block text-xs font-medium text-brand-steel dark:text-gray-400 mb-1">Stimme</span>
                <select
                  value={settings.voice_name ?? 'nova'}
                  onChange={(e) => setSettings({ ...settings, voice_name: e.target.value as ReelsSettings['voice_name'] })}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white"
                >
                  <option value="nova">Nova (weiblich, jung, natürlich)</option>
                  <option value="shimmer">Shimmer (weiblich, warm)</option>
                  <option value="alloy">Alloy (neutral, sachlich)</option>
                  <option value="echo">Echo (männlich, ruhig)</option>
                  <option value="onyx">Onyx (männlich, tief)</option>
                  <option value="fable">Fable (britisch, erzählend)</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-brand-steel dark:text-gray-400 mb-1">Stil</span>
                <select
                  value={settings.voice_style ?? 'normal'}
                  onChange={(e) => setSettings({ ...settings, voice_style: e.target.value as ReelsSettings['voice_style'] })}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white"
                >
                  <option value="calm">Ruhig (langsamer, fast meditativ)</option>
                  <option value="normal">Normal (sympathisch-aktiv)</option>
                  <option value="energetic">Energetisch (schnell, enthusiastisch)</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-brand-steel dark:text-gray-400 mb-1">Modell</span>
                <select
                  value={settings.voice_model ?? 'tts-1'}
                  onChange={(e) => setSettings({ ...settings, voice_model: e.target.value as ReelsSettings['voice_model'] })}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white"
                >
                  <option value="tts-1">tts-1 (Standard, 0,003 €/Reel)</option>
                  <option value="tts-1-hd">tts-1-hd (HD, 0,006 €/Reel)</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveSettings}
            disabled={savingSettings}
            className="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingSettings ? 'Speichere…' : 'Einstellungen speichern'}
          </button>
          {settingsFeedback && <span className="text-xs text-brand-steel dark:text-gray-400">{settingsFeedback}</span>}
        </div>
      </div>

      {/* Musik-Bibliothek */}
      <div className="mb-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-lg font-heading font-bold text-brand-dark dark:text-white mb-1">Musik-Bibliothek</h2>
        <p className="text-xs text-brand-steel dark:text-gray-500 mb-3">
          MP3-Tracks die beim Generieren pro Reel ausgewählt werden können. Kostenlose Quellen: {' '}
          <a href="https://pixabay.com/music/search/upbeat/" target="_blank" rel="noreferrer" className="underline">Pixabay</a>,{' '}
          <a href="https://freemusicarchive.org/" target="_blank" rel="noreferrer" className="underline">FMA</a>,{' '}
          <a href="https://www.bensound.com/" target="_blank" rel="noreferrer" className="underline">Bensound</a>.
        </p>

        {/* Neue Track anlegen */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 mb-4 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Track-Name (z.B. Upbeat Action)"
              value={newTrackName}
              onChange={(e) => setNewTrackName(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-brand-dark dark:text-white"
            />
            <select
              value={newTrackMood}
              onChange={(e) => setNewTrackMood(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-brand-dark dark:text-white"
            >
              <option value="upbeat">upbeat (treibend, energisch)</option>
              <option value="driving">driving (Sport, Action)</option>
              <option value="cinematic">cinematic (episch, filmisch)</option>
              <option value="calm">calm (ruhig, Lifestyle)</option>
              <option value="neutral">neutral</option>
            </select>
            <input
              type="text"
              placeholder="Attribution (optional, z.B. 'Music: XYZ')"
              value={newTrackAttribution}
              onChange={(e) => setNewTrackAttribution(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-brand-dark dark:text-white"
            />
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            <label className="flex-1">
              <span className="sr-only">Externe URL</span>
              <input
                type="url"
                placeholder="Externe MP3-URL (optional)"
                value={newTrackUrl}
                onChange={(e) => setNewTrackUrl(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-brand-dark dark:text-white"
              />
            </label>
            <button
              onClick={handleAddMusicUrl}
              disabled={!newTrackName || !newTrackUrl}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-brand-dark dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              URL speichern
            </button>
            <label className="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-4 py-2 text-sm font-medium text-white cursor-pointer flex items-center justify-center">
              {musicUploading ? 'Lade…' : 'MP3 hochladen'}
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,.mp3"
                disabled={musicUploading}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadMusic(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {musicError && <p className="text-xs text-red-600 dark:text-red-400">{musicError}</p>}
        </div>

        {/* Track-Liste */}
        {music.length === 0 ? (
          <p className="text-sm text-brand-steel dark:text-gray-400 text-center py-6">
            Noch keine Tracks in der Bibliothek.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {music.map((t) => (
              <li key={t.id} className="py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-brand-dark dark:text-white truncate">{t.name}</span>
                    {t.mood && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-brand-steel dark:text-gray-300 rounded px-2 py-0.5">{t.mood}</span>}
                    {t.is_default && <span className="text-xs bg-emerald-500 text-white rounded px-2 py-0.5">Standard</span>}
                  </div>
                  {t.attribution && <p className="text-xs text-brand-steel dark:text-gray-500">{t.attribution}</p>}
                </div>
                <audio src={t.url} controls preload="none" className="h-8" style={{ maxWidth: 200 }} />
                {!t.is_default && (
                  <button
                    onClick={() => handleSetDefault(t.id)}
                    className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap"
                  >
                    Als Standard
                  </button>
                )}
                <button
                  onClick={() => handleDeleteMusic(t.id)}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading ? (
        <p className="text-center text-brand-steel dark:text-gray-400 py-8">Lade…</p>
      ) : (
        <div className="space-y-4">
          {creating && <TemplateForm onSave={(data) => handleSave(null, data)} onCancel={() => setCreating(false)} />}
          {templates.map((t) =>
            editingId === t.id ? (
              <TemplateForm
                key={t.id}
                initial={t}
                onSave={(data) => handleSave(t.id, data)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-brand-dark dark:text-white">{t.name}</h3>
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-brand-steel dark:text-gray-300 rounded px-2 py-0.5">
                        {t.template_type === 'stock_footage' ? 'Stock' : 'Motion'}
                      </span>
                      {!t.is_active && <span className="text-xs text-red-600 dark:text-red-400">inaktiv</span>}
                    </div>
                    {t.description && <p className="text-sm text-brand-steel dark:text-gray-400 mt-1">{t.description}</p>}
                    <p className="text-xs text-brand-steel dark:text-gray-500 mt-2">
                      {t.default_duration}s · {t.default_hashtags.join(', ') || 'keine Default-Hashtags'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(t.id)} className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline">Bearbeiten</button>
                    <button onClick={() => handleDelete(t.id)} className="text-sm text-red-600 dark:text-red-400 hover:underline">Löschen</button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Template>;
  onSave: (data: Partial<Template>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [templateType, setTemplateType] = useState<'stock_footage' | 'motion_graphics'>(initial?.template_type ?? 'stock_footage');
  const [scriptPrompt, setScriptPrompt] = useState(initial?.script_prompt ?? '');
  const [defaultDuration, setDefaultDuration] = useState(initial?.default_duration ?? 20);
  const [hashtagsText, setHashtagsText] = useState((initial?.default_hashtags ?? []).join(', '));
  const [bgColorFrom, setBgColorFrom] = useState(initial?.bg_color_from ?? '#3B82F6');
  const [bgColorTo, setBgColorTo] = useState(initial?.bg_color_to ?? '#1E40AF');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const inputClass =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-cyan-400 dark:border-cyan-600 p-4 space-y-3 shadow-md">
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <input
        type="text"
        placeholder="Kurzbeschreibung"
        value={description ?? ''}
        onChange={(e) => setDescription(e.target.value)}
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-3">
        <select
          value={templateType}
          onChange={(e) => setTemplateType(e.target.value as 'stock_footage' | 'motion_graphics')}
          className={inputClass}
        >
          <option value="stock_footage">Stock-Footage (Pexels)</option>
          <option value="motion_graphics">Motion-Graphics (Farbe + Text)</option>
        </select>
        <input
          type="number"
          placeholder="Dauer in s"
          value={defaultDuration}
          onChange={(e) => setDefaultDuration(Number(e.target.value))}
          className={inputClass}
        />
      </div>
      <textarea
        placeholder="Skript-Prompt für Claude (mit Platzhaltern wie {topic}, {product_name}, {keywords})"
        value={scriptPrompt}
        onChange={(e) => setScriptPrompt(e.target.value)}
        rows={6}
        className={`${inputClass} font-mono`}
      />
      <input
        type="text"
        placeholder="Standard-Hashtags (komma-getrennt)"
        value={hashtagsText}
        onChange={(e) => setHashtagsText(e.target.value)}
        className={inputClass}
      />
      {templateType === 'motion_graphics' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm flex items-center gap-2 text-brand-dark dark:text-white">
            <span className="w-24">Farbe oben:</span>
            <input type="color" value={bgColorFrom} onChange={(e) => setBgColorFrom(e.target.value)} className="h-9 w-12 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900" />
            <input type="text" value={bgColorFrom} onChange={(e) => setBgColorFrom(e.target.value)} className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-brand-dark dark:text-white px-2 py-1 text-xs flex-1" />
          </label>
          <label className="text-sm flex items-center gap-2 text-brand-dark dark:text-white">
            <span className="w-24">Farbe CTA:</span>
            <input type="color" value={bgColorTo} onChange={(e) => setBgColorTo(e.target.value)} className="h-9 w-12 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900" />
            <input type="text" value={bgColorTo} onChange={(e) => setBgColorTo(e.target.value)} className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-brand-dark dark:text-white px-2 py-1 text-xs flex-1" />
          </label>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-brand-dark dark:text-white cursor-pointer">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Aktiv (kann im Generator ausgewählt werden)</span>
      </label>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onCancel}
          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-brand-dark dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 text-sm"
        >
          Abbrechen
        </button>
        <button
          onClick={() =>
            onSave({
              name,
              description,
              template_type: templateType,
              script_prompt: scriptPrompt,
              default_duration: defaultDuration,
              default_hashtags: hashtagsText.split(',').map((s) => s.trim()).filter(Boolean),
              bg_color_from: bgColorFrom,
              bg_color_to: bgColorTo,
              is_active: isActive,
            })
          }
          className="rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-4 py-2 text-sm font-medium text-white shadow-sm"
        >
          Speichern
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Template {
  id: string;
  name: string;
  description: string | null;
  template_type: 'stock_footage' | 'motion_graphics';
  default_duration: number;
  script_prompt?: string | null;
}

interface Account {
  id: string;
  platform: 'facebook' | 'instagram';
  name: string;
  username: string | null;
  is_active: boolean;
}

interface MusicTrack {
  id: string;
  name: string;
  mood: string | null;
  is_default: boolean;
}

interface StockPreview {
  externalId: string;
  downloadUrl: string;
  width: number;
  height: number;
  durationSec: number;
  attribution?: string;
}

const STEPS = [
  { num: 1, label: 'Idee', desc: 'Vorlage + Topic' },
  { num: 2, label: 'Visuelles', desc: 'Clips + Musik' },
  { num: 3, label: 'Verteilung', desc: 'Kanäle + Timing' },
  { num: 4, label: 'Bestätigen', desc: 'Zusammenfassung' },
] as const;

export default function NewReelPage() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);

  const [topic, setTopic] = useState('');
  const [productName, setProductName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [fbAccountId, setFbAccountId] = useState('');
  const [igAccountId, setIgAccountId] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [musicId, setMusicId] = useState('');
  const [publishMode, setPublishMode] = useState<'now' | 'plan'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  // Stock-Footage Live-Preview
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewSource, setPreviewSource] = useState<'pexels' | 'pixabay'>('pexels');
  const [previewClips, setPreviewClips] = useState<StockPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [tRes, aRes, mRes] = await Promise.all([
        fetch('/api/admin/reels/templates').then((r) => r.json()).catch(() => ({ templates: [] })),
        fetch('/api/admin/social/accounts').then((r) => r.json()).catch(() => ({ accounts: [] })),
        fetch('/api/admin/reels/music').then((r) => r.json()).catch(() => ({ tracks: [] })),
      ]);
      setTemplates(tRes.templates ?? []);
      setAccounts(aRes.accounts ?? []);
      setMusicTracks(mRes.tracks ?? []);
      if (tRes.templates?.[0]) setTemplateId(tRes.templates[0].id);
      const fb = (aRes.accounts ?? []).find((a: Account) => a.platform === 'facebook' && a.is_active);
      const ig = (aRes.accounts ?? []).find((a: Account) => a.platform === 'instagram' && a.is_active);
      if (fb) setFbAccountId(fb.id);
      if (ig) setIgAccountId(ig.id);
      const def = (mRes.tracks ?? []).find((t: MusicTrack) => t.is_default);
      if (def) setMusicId(def.id);
    })();
  }, []);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function loadPreview() {
    const q = previewQuery.trim();
    if (!q) {
      setPreviewError('Bitte einen Suchbegriff eingeben.');
      return;
    }
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const res = await fetch(`/api/admin/reels/preview-stock?query=${encodeURIComponent(q)}&source=${previewSource}`);
      const body = await res.json();
      if (!res.ok) {
        setPreviewError(body.error ?? 'Fehler beim Laden');
        setPreviewClips([]);
        return;
      }
      setPreviewClips(body.clips ?? []);
      if ((body.clips ?? []).length === 0) {
        setPreviewError('Keine Treffer — versuche einen anderen Begriff (englisch funktioniert oft besser).');
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Netzwerk-Fehler');
    } finally {
      setPreviewLoading(false);
    }
  }

  function canGoNext(): boolean {
    if (step === 1) return Boolean(topic.trim() && templateId);
    if (step === 2) return platforms.length > 0;
    if (step === 3) {
      if (publishMode === 'plan' && !scheduledAt) return false;
      return true;
    }
    return true;
  }

  async function handleSubmit() {
    if (!topic.trim()) {
      setError('Topic ist Pflicht');
      setStep(1);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          templateId,
          productName: productName || undefined,
          keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
          platforms,
          fbAccountId: platforms.includes('facebook') ? fbAccountId || null : null,
          igAccountId: platforms.includes('instagram') ? igAccountId || null : null,
          musicId: musicId || null,
        }),
      });
      const body = await res.json();
      if (!res.ok && res.status !== 202) {
        setError(body.error ?? 'Unbekannter Fehler');
        setSubmitting(false);
        return;
      }
      if (body.reelId) {
        router.push(`/admin/social/reels/${body.reelId}`);
      } else {
        router.push('/admin/social/reels');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Netzwerk-Fehler');
      setSubmitting(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === templateId);

  // Prompt-Vorschau für Schritt 1
  function buildPromptPreview(): string {
    if (!selectedTemplate?.script_prompt) return '';
    return selectedTemplate.script_prompt
      .replace(/\{topic\}/g, topic || '<Topic>')
      .replace(/\{product_name\}/g, productName || '<Kamera>')
      .replace(/\{keywords\}/g, keywords || '<Keywords>');
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <AdminBackLink href="/admin/social/reels" />

      <h1 className="text-2xl md:text-3xl font-heading font-bold text-brand-dark dark:text-white mb-2">Neues Reel generieren</h1>
      <p className="text-sm text-brand-steel dark:text-gray-400 mb-6">
        4 Schritte: Idee → Visuelles → Verteilung → Bestätigen. Claude schreibt das Skript, FFmpeg rendert.
      </p>

      {/* Stepper */}
      <ol className="grid grid-cols-4 gap-2 mb-8">
        {STEPS.map((s) => {
          const active = s.num === step;
          const done = s.num < step;
          return (
            <li
              key={s.num}
              className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                active
                  ? 'border-brand-orange bg-brand-orange/5 text-brand-orange'
                  : done
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-brand-steel dark:text-gray-500'
              }`}
            >
              <div className="text-xs font-medium">{done ? '✓ ' : `${s.num}. `}{s.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{s.desc}</div>
            </li>
          );
        })}
      </ol>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        {/* Schritt 1 — Idee */}
        {step === 1 && (
          <>
            <div>
              <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Vorlage *</label>
              {templates.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Keine Vorlagen vorhanden. Lege erst welche an unter{' '}
                  <Link href="/admin/social/reels/vorlagen" className="underline">Vorlagen</Link>.
                </p>
              ) : (
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.template_type === 'stock_footage' ? 'Stock-Footage' : 'Motion-Graphics'}, {t.default_duration}s)
                    </option>
                  ))}
                </select>
              )}
              {selectedTemplate?.description && (
                <p className="text-xs text-brand-steel dark:text-gray-500 mt-2">{selectedTemplate.description}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Topic / Aussage *</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="z.B. GoPro Hero 13 für Mountainbike-Touren im Frühling"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
              />
              <p className="text-xs text-brand-steel dark:text-gray-500 mt-1">Worüber soll das Reel handeln? Konkrete Aussage funktioniert besser als generischer Marketing-Slogan.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Kamera (optional)</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="z.B. GoPro Hero 13 Black"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
              />
              <p className="text-xs text-brand-steel dark:text-gray-500 mt-1">Wenn ein Produkt-Name passt, holt die KI das echte Shop-Bild als Referenz für DALL-E.</p>
            </div>

            {/* Prompt-Vorschau */}
            {selectedTemplate?.script_prompt && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-xs font-medium text-brand-steel dark:text-gray-400 mb-1">Skript-Prompt-Vorschau (geht so an Claude)</div>
                <pre className="text-[11px] text-brand-dark dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{buildPromptPreview()}</pre>
              </div>
            )}
          </>
        )}

        {/* Schritt 2 — Visuelles */}
        {step === 2 && (
          <>
            <div>
              <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Stock-Footage-Keywords (komma-getrennt)</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="mountainbiking, trail, action, adventure"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
              />
              <p className="text-xs text-brand-steel dark:text-gray-500 mt-1">Englische Begriffe funktionieren bei Pexels/Pixabay deutlich besser.</p>
            </div>

            {/* Live-Preview */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/50">
              <div className="text-xs font-medium text-brand-dark dark:text-white mb-2">Live-Vorschau (was Pexels/Pixabay liefert)</div>
              <div className="flex flex-wrap gap-2 mb-3">
                <input
                  type="text"
                  value={previewQuery}
                  onChange={(e) => setPreviewQuery(e.target.value)}
                  placeholder="z.B. surfer in waves"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadPreview(); } }}
                  className="flex-1 min-w-[180px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-brand-dark dark:text-white"
                />
                <select
                  value={previewSource}
                  onChange={(e) => setPreviewSource(e.target.value as 'pexels' | 'pixabay')}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-brand-dark dark:text-white"
                >
                  <option value="pexels">Pexels</option>
                  <option value="pixabay">Pixabay</option>
                </select>
                <button
                  type="button"
                  onClick={loadPreview}
                  disabled={previewLoading}
                  className="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {previewLoading ? 'Lädt…' : 'Suchen'}
                </button>
              </div>
              {previewError && <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">{previewError}</p>}
              {previewClips.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {previewClips.slice(0, 6).map((c) => (
                    <div key={c.externalId} className="aspect-[9/16] bg-black rounded overflow-hidden relative">
                      <video
                        src={c.downloadUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">
                        {previewSource} · {c.width}×{c.height} · {c.durationSec.toFixed(1)}s
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-brand-steel dark:text-gray-500 mt-2 italic">Nur zur Orientierung — der echte Render holt die Clips automatisch beim Generieren.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Hintergrund-Musik</label>
              <select
                value={musicId}
                onChange={(e) => setMusicId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
              >
                <option value="">— keine Musik —</option>
                {musicTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.mood ? ` (${t.mood})` : ''}{t.is_default ? ' · Standard' : ''}
                  </option>
                ))}
              </select>
              {musicTracks.length === 0 && (
                <p className="text-xs text-brand-steel dark:text-gray-500 mt-1">
                  Keine Tracks vorhanden. Füge welche hinzu unter{' '}
                  <Link href="/admin/social/reels/vorlagen" className="underline">Vorlagen → Musik-Bibliothek</Link>.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Plattformen *</label>
              <div className="flex gap-3">
                {(['facebook', 'instagram'] as const).map((p) => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />
                    <span className="text-sm text-brand-dark dark:text-white capitalize">{p}</span>
                  </label>
                ))}
              </div>
              {platforms.length === 0 && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Mindestens eine Plattform auswählen.</p>
              )}
            </div>
          </>
        )}

        {/* Schritt 3 — Verteilung */}
        {step === 3 && (
          <>
            {platforms.includes('facebook') && (
              <div>
                <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Facebook-Seite</label>
                <select
                  value={fbAccountId}
                  onChange={(e) => setFbAccountId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
                >
                  <option value="">— keine —</option>
                  {accounts.filter((a) => a.platform === 'facebook').map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {platforms.includes('instagram') && (
              <div>
                <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Instagram-Account</label>
                <select
                  value={igAccountId}
                  onChange={(e) => setIgAccountId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
                >
                  <option value="">— keiner —</option>
                  {accounts.filter((a) => a.platform === 'instagram').map((a) => (
                    <option key={a.id} value={a.id}>@{a.username ?? a.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label className="block text-sm font-medium text-brand-dark dark:text-white mb-2">Timing</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="publishMode"
                    value="now"
                    checked={publishMode === 'now'}
                    onChange={() => setPublishMode('now')}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-brand-dark dark:text-white">Sofort generieren</div>
                    <div className="text-xs text-brand-steel dark:text-gray-500">Render läuft im Hintergrund. Du landest direkt auf der Detail-Seite.</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-not-allowed opacity-50">
                  <input
                    type="radio"
                    name="publishMode"
                    value="plan"
                    disabled
                    checked={publishMode === 'plan'}
                    onChange={() => setPublishMode('plan')}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-brand-dark dark:text-white">In Redaktionsplan einreihen <span className="text-xs font-normal text-brand-steel">(noch nicht verfügbar)</span></div>
                    <div className="text-xs text-brand-steel dark:text-gray-500">Reel wird zum gewählten Zeitpunkt generiert. Kommt mit Schritt 5 des Refactors.</div>
                  </div>
                </label>
              </div>
              {publishMode === 'plan' && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
                />
              )}
            </div>
          </>
        )}

        {/* Schritt 4 — Bestätigen */}
        {step === 4 && (
          <>
            <h2 className="text-lg font-heading font-semibold text-brand-dark dark:text-white">Zusammenfassung</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-brand-steel dark:text-gray-500">Vorlage</dt>
                <dd className="text-brand-dark dark:text-white font-medium">
                  {selectedTemplate ? `${selectedTemplate.name} (${selectedTemplate.template_type === 'stock_footage' ? 'Stock' : 'Motion'}, ${selectedTemplate.default_duration}s)` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-steel dark:text-gray-500">Topic</dt>
                <dd className="text-brand-dark dark:text-white font-medium">{topic || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-steel dark:text-gray-500">Kamera</dt>
                <dd className="text-brand-dark dark:text-white">{productName || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-steel dark:text-gray-500">Keywords</dt>
                <dd className="text-brand-dark dark:text-white">{keywords || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-steel dark:text-gray-500">Plattformen</dt>
                <dd className="text-brand-dark dark:text-white">{platforms.join(', ').toUpperCase() || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-steel dark:text-gray-500">Musik</dt>
                <dd className="text-brand-dark dark:text-white">{musicTracks.find((t) => t.id === musicId)?.name ?? '— keine —'}</dd>
              </div>
              {platforms.includes('facebook') && (
                <div>
                  <dt className="text-xs text-brand-steel dark:text-gray-500">Facebook-Seite</dt>
                  <dd className="text-brand-dark dark:text-white">{accounts.find((a) => a.id === fbAccountId)?.name ?? '— nicht gewählt —'}</dd>
                </div>
              )}
              {platforms.includes('instagram') && (
                <div>
                  <dt className="text-xs text-brand-steel dark:text-gray-500">Instagram-Account</dt>
                  <dd className="text-brand-dark dark:text-white">@{accounts.find((a) => a.id === igAccountId)?.username ?? accounts.find((a) => a.id === igAccountId)?.name ?? 'nicht gewählt'}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-brand-steel dark:text-gray-500">Timing</dt>
                <dd className="text-brand-dark dark:text-white">{publishMode === 'now' ? 'Sofort generieren' : `Plan: ${scheduledAt}`}</dd>
              </div>
            </dl>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-800 dark:text-amber-200">
              <strong>Kosten-Hinweis:</strong> Claude-Skript ~0,02 €. Voice-Over (TTS) optional ~0,003 €. Pexels/Pixabay + FFmpeg + Meta-Posting kostenlos. Render-Dauer typisch 30–90 Sekunden.
            </div>

            {templates.length === 0 && (
              <p className="text-sm text-red-600 dark:text-red-400">Keine Vorlagen vorhanden — kann nicht generieren.</p>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
            disabled={step === 1 || submitting}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-brand-dark dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Zurück
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => ((s + 1) as 1 | 2 | 3 | 4))}
              disabled={!canGoNext() || templates.length === 0}
              className="rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Weiter →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || templates.length === 0}
              className="rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Starte Render…' : 'Reel generieren'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

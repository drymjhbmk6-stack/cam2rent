'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import SocialPostPreview from '@/components/admin/SocialPostPreview';

interface Template {
  id: string;
  name: string;
  description?: string;
  caption_prompt: string;
  image_prompt?: string | null;
  default_hashtags: string[];
  platforms: string[];
}

interface Account {
  id: string;
  platform: 'facebook' | 'instagram';
  name: string;
  username?: string | null;
}

export default function NewPostPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [platforms, setPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [caption, setCaption] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [schedule, setSchedule] = useState<'now' | 'later' | 'draft'>('draft');
  const [scheduledAt, setScheduledAt] = useState('');

  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [accRes, tplRes] = await Promise.all([
        fetch('/api/admin/social/accounts').then((r) => r.json()),
        fetch('/api/admin/social/templates').then((r) => r.json()),
      ]);
      setAccounts(accRes.accounts ?? []);
      setTemplates(tplRes.templates ?? []);
    })();
  }, []);

  const fbAccount = accounts.find((a) => a.platform === 'facebook');
  const igAccount = accounts.find((a) => a.platform === 'instagram');

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { variables: templateVars };
      if (selectedTemplate) body.template_id = selectedTemplate;
      else {
        setError('Bitte zuerst eine Vorlage wählen oder einen eigenen Prompt eingeben.');
        setBusy(false);
        return;
      }
      const res = await fetch('/api/admin/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Generierung fehlgeschlagen');
      setCaption(data.caption ?? '');
      setHashtagsText((data.hashtags ?? []).join(' '));
      if (data.image_url) setImageUrl(data.image_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const hashtags = hashtagsText
        .split(/[\s,]+/)
        .map((h) => h.trim())
        .filter(Boolean)
        .map((h) => (h.startsWith('#') ? h : `#${h}`));

      const mediaUrls = imageUrl ? [imageUrl] : [];
      const status = schedule === 'now' ? 'scheduled' : schedule === 'later' ? 'scheduled' : 'draft';
      const scheduled_at = schedule === 'now' ? new Date().toISOString() : schedule === 'later' ? scheduledAt : null;

      const body = {
        caption,
        hashtags,
        media_urls: mediaUrls,
        media_type: mediaUrls.length === 0 ? 'text' : 'image',
        link_url: linkUrl || null,
        platforms,
        fb_account_id: platforms.includes('facebook') ? fbAccount?.id ?? null : null,
        ig_account_id: platforms.includes('instagram') ? igAccount?.id ?? null : null,
        status,
        scheduled_at,
        source_type: 'manual',
        template_id: selectedTemplate || null,
        ai_generated: Boolean(selectedTemplate),
      };

      const res = await fetch('/api/admin/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Speichern fehlgeschlagen');

      // Sofort posten: publish endpoint
      if (schedule === 'now' && data.post?.id) {
        const pubRes = await fetch('/api/admin/social/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.post.id }),
        });
        const pubData = await pubRes.json();
        if (pubData.errors?.length > 0) {
          setError('Veröffentlicht mit Fehlern: ' + pubData.errors.map((e: { platform: string; message: string }) => `${e.platform}: ${e.message}`).join(' | '));
          setBusy(false);
          return;
        }
      }

      router.push(schedule === 'draft' ? `/admin/social/posts/${data.post.id}` : '/admin/social/posts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <AdminBackLink />
      <h1 className="text-2xl font-bold text-white mb-1 mt-4">Neuer Post</h1>
      <p className="text-sm text-slate-400 mb-6">
        Manuell erstellen oder von der KI generieren lassen.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* KI-Generierung */}
      <section className="mb-6 rounded-xl bg-slate-900/50 border border-slate-800 p-5">
        <h2 className="font-semibold text-white mb-3">KI-Generierung (optional)</h2>
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Vorlage</label>
        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm mb-3"
        >
          <option value="">— Keine Vorlage (eigener Text) —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {selectedTemplate && (
          <div className="mb-3">
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Variablen (z.B. title=..., product_name=...)</label>
            <input
              type="text"
              placeholder="z.B. product_name=GoPro Hero 13, brand=GoPro"
              onChange={(e) => {
                const pairs = e.target.value.split(',').map((s) => s.trim());
                const obj: Record<string, string> = {};
                for (const p of pairs) {
                  const [k, ...rest] = p.split('=');
                  if (k && rest.length > 0) obj[k.trim()] = rest.join('=').trim();
                }
                setTemplateVars(obj);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy || !selectedTemplate}
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50"
        >
          {busy ? 'Generiere…' : 'KI-Text + Bild generieren'}
        </button>
      </section>

      {/* Caption */}
      <section className="mb-4">
        <label className="block text-sm font-semibold text-slate-200 mb-1">Post-Text</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
          placeholder="Was möchtest du posten?"
        />
        <p className="text-xs text-slate-500 mt-1">{caption.length} Zeichen</p>
      </section>

      {/* Hashtags */}
      <section className="mb-4">
        <label className="block text-sm font-semibold text-slate-200 mb-1">Hashtags</label>
        <input
          type="text"
          value={hashtagsText}
          onChange={(e) => setHashtagsText(e.target.value)}
          placeholder="#actioncam #gopro #cam2rent"
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
        />
      </section>

      {/* Bild */}
      <section className="mb-4">
        <label className="block text-sm font-semibold text-slate-200 mb-1">Bild-URL</label>
        <input
          type="text"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
        />
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="mt-3 max-h-60 rounded-lg border border-slate-800" />
        )}
        <p className="text-xs text-slate-500 mt-1">
          Instagram verlangt ein Bild. Für reine Text-Posts auf Facebook Bild leer lassen + Instagram deaktivieren.
        </p>
      </section>

      {/* Link (FB) */}
      <section className="mb-4">
        <label className="block text-sm font-semibold text-slate-200 mb-1">Link (nur Facebook)</label>
        <input
          type="text"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://cam2rent.de/…"
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
        />
      </section>

      {/* Plattformen */}
      <section className="mb-4">
        <label className="block text-sm font-semibold text-slate-200 mb-2">Plattformen</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={platforms.includes('facebook')}
              onChange={() => togglePlatform('facebook')}
              disabled={!fbAccount}
            />
            <span className="text-sm text-slate-200">Facebook {!fbAccount && <span className="text-slate-500">(nicht verbunden)</span>}</span>
          </label>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={platforms.includes('instagram')}
              onChange={() => togglePlatform('instagram')}
              disabled={!igAccount}
            />
            <span className="text-sm text-slate-200">Instagram {!igAccount && <span className="text-slate-500">(nicht verbunden)</span>}</span>
          </label>
        </div>
      </section>

      {/* Zeitplanung */}
      <section className="mb-6">
        <label className="block text-sm font-semibold text-slate-200 mb-2">Veröffentlichung</label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input type="radio" checked={schedule === 'draft'} onChange={() => setSchedule('draft')} />
            <span className="text-sm text-slate-200">Als Entwurf speichern</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={schedule === 'now'} onChange={() => setSchedule('now')} />
            <span className="text-sm text-slate-200">Sofort veröffentlichen</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={schedule === 'later'} onChange={() => setSchedule('later')} />
            <span className="text-sm text-slate-200">Zeitgesteuert:</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={schedule !== 'later'}
              className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-sm"
            />
          </label>
        </div>
      </section>

      {/* Vorschau */}
      {(caption || imageUrl) && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Vorschau</h2>
          <SocialPostPreview
            caption={caption}
            hashtags={hashtagsText.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`))}
            imageUrl={imageUrl}
            linkUrl={linkUrl}
            fbAccountName={fbAccount?.name}
            igAccountName={igAccount?.name}
            igAccountUsername={igAccount?.username ?? undefined}
            platforms={platforms}
          />
        </section>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSave}
        disabled={busy || platforms.length === 0 || !caption}
        className="px-5 py-2.5 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50"
      >
        {busy ? 'Speichere…' : schedule === 'now' ? 'Jetzt veröffentlichen' : schedule === 'later' ? 'Planen' : 'Entwurf speichern'}
      </button>
    </div>
  );
}

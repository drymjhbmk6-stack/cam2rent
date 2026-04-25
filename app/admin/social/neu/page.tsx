'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import SocialPostPreview from '@/components/admin/SocialPostPreview';
import MediaLibraryPicker from '@/components/admin/MediaLibraryPicker';
import UnsplashPicker from '@/components/admin/UnsplashPicker';
import ImagePositionPicker from '@/components/admin/ImagePositionPicker';
import { berlinLocalInputToUTC } from '@/lib/timezone';

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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [unsplashOpen, setUnsplashOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [imgError, setImgError] = useState('');
  const [fbImagePosition, setFbImagePosition] = useState('50% 50%');
  const [igImagePosition, setIgImagePosition] = useState('50% 50%');

  async function handleGenerateImage() {
    if (aiGenerating) return;
    if (!caption.trim()) {
      setImgError('Bitte zuerst Caption eingeben.');
      return;
    }
    if (!confirm(
      'Neues KI-Bild generieren?\n\n' +
      '• Kosten: ~0,04 € (DALL-E 3) bzw. bis ~0,19 € (gpt-image-1)\n' +
      '• Dauer: 10-30 Sekunden\n' +
      '• Das aktuelle Bild wird ersetzt.'
    )) return;
    setAiGenerating(true);
    setImgError('');
    try {
      const res = await fetch('/api/admin/social/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Generierung fehlgeschlagen');
      setImageUrl(data.url);
    } catch (err) {
      setImgError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setAiGenerating(false);
    }
  }

  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [freePrompt, setFreePrompt] = useState<string>('');
  const [generateImage, setGenerateImage] = useState<boolean>(false);

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
      if (selectedTemplate) {
        body.template_id = selectedTemplate;
      } else if (freePrompt.trim().length > 5) {
        // Freitext-Modus: KI bekommt direkt unsere Beschreibung als Caption-Prompt
        body.caption_prompt = `Schreibe einen Social-Media-Post zu folgendem Thema/Ankündigung:\n\n${freePrompt.trim()}\n\nMax 500 Zeichen. Am Ende ein CTA passend zum Thema (z.B. "Mehr auf cam2rent.de", "Jetzt ausprobieren", "Schreibt uns eure Meinung").`;
        if (generateImage) {
          body.image_prompt = `A real photograph showing: ${freePrompt.trim()}. Outdoor/action sports context, natural daylight, authentic moment. No text, logos, or watermarks visible.`;
        }
      } else {
        setError('Wähle eine Vorlage ODER beschreibe mindestens 5 Zeichen lang worum es geht.');
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
      const scheduled_at = schedule === 'now'
        ? new Date().toISOString()
        : schedule === 'later'
        ? berlinLocalInputToUTC(scheduledAt)
        : null;

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
        fb_image_position: fbImagePosition,
        ig_image_position: igImagePosition,
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

        {!selectedTemplate && (
          <div className="mb-3">
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
              Eigenes Thema / Ankündigung
            </label>
            <textarea
              value={freePrompt}
              onChange={(e) => setFreePrompt(e.target.value)}
              rows={4}
              placeholder={`Beschreib in eigenen Worten worum es geht. Beispiele:

ANKÜNDIGUNGEN:
- Neue Website mit Dark-Mode und schnellerem Checkout ist online
- Ab Mai bieten wir Versand nach Österreich + Schweiz
- Dieses Wochenende 20% Rabatt auf alle Sets

COMMUNITY-POSTS (Follower einbeziehen):
- Teilt euer schönstes Foto mit #cam2rentmoments — die besten 3 gewinnen einen 20€-Gutschein
- Welche Kamera ist euer Favorit für Skiurlaub? 🎿 GoPro | 🚀 DJI | 📸 Insta360
- Zeigt uns eure wildeste Action-Aufnahme — wir re-posten die Top 5 diese Woche

TEAM / BTS:
- Neues Reinigungsverfahren: jede Kamera wird vor Versand 15 Min UV-desinfiziert
- Lernt unser Team kennen: Max kümmert sich um Bestellungen bis 14 Uhr`}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm font-mono text-xs"
            />
            <label className="flex items-center gap-2 mt-2 text-sm text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={generateImage}
                onChange={(e) => setGenerateImage(e.target.checked)}
              />
              Bild mit DALL-E generieren (+ca. 0,04 €, ca. 15 Sek extra)
            </label>
          </div>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy || (!selectedTemplate && freePrompt.trim().length < 5)}
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50"
        >
          {busy ? 'Generiere…' : selectedTemplate ? 'KI-Text + Bild generieren' : 'KI-Post erstellen'}
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
        <label className="block text-sm font-semibold text-slate-200 mb-1">Bild</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Bild-URL oder Datei hochladen →"
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
          />
          <button
            type="button"
            onClick={handleGenerateImage}
            disabled={aiGenerating || !caption.trim()}
            className="px-3 py-2 rounded-lg bg-cyan-600 text-white font-medium text-sm hover:bg-cyan-700 border border-cyan-700 whitespace-nowrap disabled:opacity-40"
            title={!caption.trim() ? 'Bitte zuerst Caption eingeben' : 'Neues Bild via KI generieren (~0,04 € pro Bild)'}
          >
            {aiGenerating ? '⏳ Generiere…' : '🎨 KI neu'}
          </button>
          <button
            type="button"
            onClick={() => setUnsplashOpen(true)}
            className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 font-medium text-sm hover:bg-slate-700 border border-slate-700 whitespace-nowrap"
            title="Stockfoto auf Unsplash suchen"
          >
            📸 Unsplash
          </button>
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 font-medium text-sm hover:bg-slate-700 border border-slate-700 whitespace-nowrap"
            title="Bild aus eigener Bibliothek waehlen"
          >
            📚 Bibliothek
          </button>
          <label className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 font-medium text-sm hover:bg-slate-700 border border-slate-700 cursor-pointer whitespace-nowrap">
            📷 Hochladen
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('file', file);
                const res = await fetch('/api/admin/social/upload-image', { method: 'POST', body: fd });
                const data = await res.json();
                if (res.ok && data.url) setImageUrl(data.url);
                else alert(data.error ?? 'Upload fehlgeschlagen');
                e.target.value = '';
              }}
            />
          </label>
          {imageUrl && (
            <button
              type="button"
              onClick={() => setImageUrl('')}
              className="px-3 py-2 rounded-lg bg-red-900/30 text-red-300 text-sm hover:bg-red-900/50 border border-red-900/60"
              title="Bild entfernen"
            >
              ✕
            </button>
          )}
        </div>
        {imgError && (
          <p className="mt-1 text-xs text-red-300">{imgError}</p>
        )}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="mt-2 max-h-60 rounded-lg border border-slate-800" />
        )}
        <p className="text-xs text-slate-500 mt-1">
          Drei Quellen: 📚 Bibliothek (eigene Produkt-/Set-/Blog-Bilder), 📷 vom PC hochladen, oder KI-generiert (oben).
          Instagram verlangt ein Bild — für reine Text-Posts Instagram deaktivieren.
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
            fbImagePosition={fbImagePosition}
            igImagePosition={igImagePosition}
          />
          {imageUrl && (
            <div className="mt-3 flex flex-wrap gap-4 items-start p-3 rounded-lg bg-slate-900/60 border border-slate-800">
              {platforms.includes('facebook') && (
                <ImagePositionPicker
                  label="Facebook-Ausschnitt"
                  value={fbImagePosition}
                  onChange={setFbImagePosition}
                />
              )}
              {platforms.includes('instagram') && (
                <ImagePositionPicker
                  label="Instagram-Ausschnitt"
                  value={igImagePosition}
                  onChange={setIgImagePosition}
                />
              )}
              {platforms.includes('facebook') && platforms.includes('instagram') && (
                <button
                  type="button"
                  onClick={() => setFbImagePosition(igImagePosition)}
                  className="self-end text-xs text-slate-400 hover:text-cyan-300 underline-offset-2 hover:underline"
                  title="IG-Position auf Facebook übernehmen"
                >
                  ← IG-Position übernehmen
                </button>
              )}
            </div>
          )}
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

      <MediaLibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(url) => setImageUrl(url)}
      />

      <UnsplashPicker
        open={unsplashOpen}
        onClose={() => setUnsplashOpen(false)}
        onSelect={(url) => setImageUrl(url)}
        initialQuery={caption.trim().split(/\s+/).slice(0, 3).join(' ')}
        orientation="squarish"
      />
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownEditor from '@/components/MarkdownEditor';
import LinkManager from './LinkManager';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
};
const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, marginBottom: 4 };
const sectionStyle: React.CSSProperties = { background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 16 };

interface Category {
  id: string; name: string; slug: string; color: string;
}

interface UnsplashImage {
  id: string; thumb: string; regular: string; full: string; alt: string;
  photographer: string; photographerUrl: string; downloadLocation: string;
}

interface PostData {
  id?: string;
  title: string; slug: string; content: string; excerpt: string;
  featured_image: string; featured_image_alt: string;
  category_id: string; tags: string[];
  status: string; scheduled_at: string;
  seo_title: string; seo_description: string; author: string;
  ai_generated: boolean; ai_prompt: string; ai_model: string;
  reading_time_min: number;
}

const emptyPost: PostData = {
  title: '', slug: '', content: '', excerpt: '',
  featured_image: '', featured_image_alt: '',
  category_id: '', tags: [],
  status: 'draft', scheduled_at: '',
  seo_title: '', seo_description: '', author: 'cam2rent',
  ai_generated: false, ai_prompt: '', ai_model: '',
  reading_time_min: 5,
};

function toSlug(text: string): string {
  return text.toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function ArticleEditor({ postId }: { postId?: string }) {
  const router = useRouter();
  const [post, setPost] = useState<PostData>(emptyPost);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!!postId);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // KI-Generierung
  const [showAI, setShowAI] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState('informativ');
  const [aiLength, setAiLength] = useState('mittel');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Mediathek
  const [showMediathek, setShowMediathek] = useState(false);
  const [mediathekImages, setMediathekImages] = useState<{ name: string; url: string }[]>([]);
  const [mediathekLoading, setMediathekLoading] = useState(false);

  // Unsplash
  const [showUnsplash, setShowUnsplash] = useState(false);
  const [unsplashQuery, setUnsplashQuery] = useState('');
  const [unsplashImages, setUnsplashImages] = useState<UnsplashImage[]>([]);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const [regeneratingImage, setRegeneratingImage] = useState(false);

  // Bild-Upload
  const [uploading, setUploading] = useState(false);

  const update = useCallback((key: keyof PostData, value: unknown) => {
    setPost((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    fetch('/api/admin/blog/categories').then((r) => r.json()).then((d) => setCategories(d.categories ?? []));

    if (postId) {
      fetch(`/api/admin/blog/posts/${postId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.post) {
            setPost({
              ...emptyPost,
              ...d.post,
              category_id: d.post.category_id ?? '',
              tags: d.post.tags ?? [],
              scheduled_at: d.post.scheduled_at ? d.post.scheduled_at.slice(0, 16) : '',
            });
            setTagsInput((d.post.tags ?? []).join(', '));
          }
          setLoading(false);
        });
    }
  }, [postId]);

  async function save() {
    if (!post.title || !post.slug) {
      setMsg('Titel und Slug sind erforderlich.');
      return;
    }
    setSaving(true);
    setMsg('');

    const payload = {
      ...post,
      tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      category_id: post.category_id || null,
      scheduled_at: post.status === 'scheduled' ? post.scheduled_at : null,
    };

    const url = postId ? `/api/admin/blog/posts/${postId}` : '/api/admin/blog/posts';
    const method = postId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      setMsg('Gespeichert!');
      if (!postId && data.post?.id) {
        router.push(`/admin/blog/artikel/${data.post.id}`);
      }
    } else {
      setMsg(data.error || 'Fehler beim Speichern.');
    }
  }

  async function generateWithAI() {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    setMsg('');

    const res = await fetch('/api/admin/blog/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: aiTopic,
        tone: aiTone,
        targetLength: aiLength,
      }),
    });

    const data = await res.json();
    setAiGenerating(false);

    if (res.ok) {
      const generatedTitle = data.title ?? '';
      setPost((prev) => ({
        ...prev,
        title: data.title ?? prev.title,
        slug: data.slug ?? prev.slug,
        content: data.content ?? prev.content,
        excerpt: data.excerpt ?? prev.excerpt,
        seo_title: data.seoTitle ?? prev.seo_title,
        seo_description: data.seoDescription ?? prev.seo_description,
        ai_generated: true,
        ai_prompt: aiTopic,
        ai_model: data.ai_model ?? '',
        reading_time_min: data.reading_time_min ?? prev.reading_time_min,
      }));
      setTagsInput((data.suggestedTags ?? []).join(', '));
      setShowAI(false);

      // Automatisch Titelbild generieren wenn Bild-Prompt vorhanden
      if (data.imagePrompt) {
        setMsg('Text generiert! Titelbild wird erstellt...');
        try {
          const imgRes = await fetch('/api/admin/blog/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: data.imagePrompt, title: generatedTitle }),
          });
          const imgData = await imgRes.json();
          if (imgRes.ok && imgData.url) {
            setPost((prev) => ({
              ...prev,
              featured_image: imgData.url,
              featured_image_alt: imgData.alt || generatedTitle,
            }));
            setMsg('Artikel + Titelbild generiert! Bitte pruefen und anpassen.');
          } else {
            setMsg('Artikel generiert! Titelbild konnte nicht erstellt werden: ' + (imgData.error || 'Unbekannter Fehler'));
          }
        } catch {
          setMsg('Artikel generiert! Titelbild-Generierung fehlgeschlagen.');
        }
      } else {
        setMsg('Artikel generiert! Bitte pruefen und anpassen.');
      }
    } else {
      setMsg(data.error || 'KI-Generierung fehlgeschlagen.');
    }
  }

  async function loadMediathek() {
    setMediathekLoading(true);
    const res = await fetch('/api/admin/blog/media');
    const data = await res.json();
    setMediathekImages(data.images ?? []);
    setMediathekLoading(false);
  }

  function selectMediathekImage(img: { name: string; url: string }) {
    update('featured_image', img.url);
    update('featured_image_alt', post.title || img.name);
    setShowMediathek(false);
    setMsg('Bild aus Mediathek uebernommen!');
  }

  async function regenerateImage() {
    if (!post.title) return;
    setRegeneratingImage(true);
    setMsg('Titelbild wird generiert...');
    try {
      // Erst einen Bild-Prompt von Claude generieren lassen
      const promptRes = await fetch('/api/admin/blog/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: post.title, tone: 'informativ', targetLength: 'kurz' }),
      });
      const promptData = await promptRes.json();
      const imagePrompt = promptData.imagePrompt;

      if (!imagePrompt) {
        setMsg('Kein Bild-Prompt erhalten.');
        setRegeneratingImage(false);
        return;
      }

      const imgRes = await fetch('/api/admin/blog/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt, title: post.title }),
      });
      const imgData = await imgRes.json();
      if (imgRes.ok && imgData.url) {
        update('featured_image', imgData.url);
        update('featured_image_alt', post.title);
        setMsg('Neues Titelbild generiert!');
      } else {
        setMsg(imgData.error || 'Bild-Generierung fehlgeschlagen.');
      }
    } catch {
      setMsg('Bild-Generierung fehlgeschlagen.');
    }
    setRegeneratingImage(false);
  }

  async function searchUnsplash() {
    if (!unsplashQuery.trim()) return;
    setUnsplashLoading(true);
    const res = await fetch(`/api/admin/blog/images?query=${encodeURIComponent(unsplashQuery)}`);
    const data = await res.json();
    setUnsplashImages(data.images ?? []);
    setUnsplashLoading(false);
  }

  async function selectUnsplashImage(img: UnsplashImage) {
    setUnsplashLoading(true);
    const res = await fetch('/api/admin/blog/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: img.full, downloadLocation: img.downloadLocation, alt: img.alt }),
    });
    const data = await res.json();
    setUnsplashLoading(false);
    if (data.url) {
      update('featured_image', data.url);
      update('featured_image_alt', img.alt || post.title);
      setShowUnsplash(false);
      setMsg('Bild uebernommen!');
    } else {
      setMsg(data.error || 'Bild-Download fehlgeschlagen.');
    }
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/admin/blog/upload', { method: 'POST', body: formData });
    const data = await res.json();
    setUploading(false);
    if (data.url) {
      update('featured_image', data.url);
      update('featured_image_alt', post.title || file.name);
    } else {
      setMsg(data.error || 'Upload fehlgeschlagen.');
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="font-heading font-bold text-2xl" style={{ color: 'white' }}>Laden...</h1>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading font-bold text-xl sm:text-2xl" style={{ color: 'white' }}>
            {postId ? 'Artikel bearbeiten' : 'Neuer Artikel'}
          </h1>
          {post.ai_generated && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-heading" style={{ background: '#8b5cf620', color: '#a78bfa' }}>
              KI-generiert
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowAI(!showAI)}
            className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-heading font-semibold transition-colors"
            style={{ background: '#8b5cf6', color: 'white' }}
          >
            {showAI ? 'KI schliessen' : 'Mit KI generieren'}
          </button>
          {postId && (
            <a
              href={`/blog/preview/${postId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-heading font-semibold transition-colors flex items-center gap-1.5"
              style={{ background: '#334155', color: '#e2e8f0' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              Vorschau
            </a>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-heading font-semibold"
            style={{ background: '#06b6d4', color: 'white', opacity: saving ? 0.5 : 1 }}
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-2 rounded-lg text-sm font-heading" style={{ background: '#0f172a', color: msg.includes('Fehler') || msg.includes('fehlgeschlagen') ? '#ef4444' : '#22c55e' }}>
          {msg}
        </div>
      )}

      {/* KI-Panel */}
      {showAI && (
        <div style={{ ...sectionStyle, border: '1px solid #8b5cf640' }}>
          <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#a78bfa' }}>KI-Artikel generieren</h3>
          <div className="space-y-3">
            <div>
              <label style={labelStyle} className="block">Thema / Artikelidee</label>
              <input style={inputStyle} value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="z.B. GoPro Hero 13 vs DJI Osmo Action 5 Pro Vergleich" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label style={labelStyle} className="block">Ton</label>
                <select style={inputStyle} value={aiTone} onChange={(e) => setAiTone(e.target.value)}>
                  <option value="informativ">Informativ</option>
                  <option value="locker">Locker</option>
                  <option value="professionell">Professionell</option>
                </select>
              </div>
              <div>
                <label style={labelStyle} className="block">Laenge</label>
                <select style={inputStyle} value={aiLength} onChange={(e) => setAiLength(e.target.value)}>
                  <option value="kurz">Kurz (~500 Woerter)</option>
                  <option value="mittel">Mittel (~1000 Woerter)</option>
                  <option value="lang">Lang (~1500 Woerter)</option>
                </select>
              </div>
            </div>
            <button
              onClick={generateWithAI}
              disabled={aiGenerating || !aiTopic.trim()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-heading font-semibold flex items-center justify-center gap-2"
              style={{ background: '#8b5cf6', color: 'white', opacity: aiGenerating ? 0.6 : 1 }}
            >
              {aiGenerating && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {aiGenerating ? 'Generiere Text + Bild...' : 'Artikel + Bild generieren'}
            </button>
            {aiGenerating && (
              <p className="text-xs" style={{ color: '#94a3b8' }}>Text wird geschrieben, danach wird das Titelbild generiert. Dies kann bis zu 60 Sekunden dauern...</p>
            )}
          </div>
        </div>
      )}

      {/* Hauptbereich */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Linke Spalte - Inhalt */}
        <div className="lg:col-span-2 space-y-4">
          <div style={sectionStyle}>
            <div className="space-y-4">
              <div>
                <label style={labelStyle} className="block">Titel</label>
                <input
                  style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
                  value={post.title}
                  onChange={(e) => {
                    update('title', e.target.value);
                    if (!postId) update('slug', toSlug(e.target.value));
                  }}
                  placeholder="Artikel-Titel..."
                />
              </div>
              <div>
                <label style={labelStyle} className="block">Slug</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#475569' }}>/blog/</span>
                  <input style={inputStyle} value={post.slug} onChange={(e) => update('slug', e.target.value)} placeholder="url-freundlicher-slug" />
                </div>
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle} className="block mb-2">Inhalt (Markdown)</label>
            <div className="[&_.prose]:!bg-[#0f172a] [&_.prose]:!text-[#e2e8f0] [&_textarea]:!bg-[#0f172a] [&_textarea]:!border-[#334155] [&_textarea]:!text-[#e2e8f0]">
              <MarkdownEditor value={post.content} onChange={(v) => update('content', v)} rows={20} placeholder="Artikel-Inhalt in Markdown..." />
            </div>
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle} className="block mb-2">Auszug / Excerpt</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80 }}
              value={post.excerpt}
              onChange={(e) => update('excerpt', e.target.value)}
              placeholder="Kurzbeschreibung fuer die Blog-Uebersicht..."
            />
            <p className="text-xs mt-1" style={{ color: '#475569' }}>{post.excerpt.length}/160 Zeichen</p>
          </div>

          {/* Link-Manager */}
          <LinkManager content={post.content} onUpdateContent={(v) => update('content', v)} />
        </div>

        {/* Rechte Spalte - Seitenleiste */}
        <div className="space-y-4">
          {/* Status */}
          <div style={sectionStyle}>
            <label style={labelStyle} className="block mb-2">Status</label>
            <select style={inputStyle} value={post.status} onChange={(e) => update('status', e.target.value)}>
              <option value="draft">Entwurf</option>
              <option value="published">Veroeffentlicht</option>
              <option value="scheduled">Geplant</option>
            </select>
            {post.status === 'scheduled' && (
              <div className="mt-3">
                <label style={labelStyle} className="block">Veroeffentlichung am</label>
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={post.scheduled_at}
                  onChange={(e) => update('scheduled_at', e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Kategorie */}
          <div style={sectionStyle}>
            <label style={labelStyle} className="block mb-2">Kategorie</label>
            <select style={inputStyle} value={post.category_id} onChange={(e) => update('category_id', e.target.value)}>
              <option value="">Keine Kategorie</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div style={sectionStyle}>
            <label style={labelStyle} className="block mb-2">Tags (kommagetrennt)</label>
            <input style={inputStyle} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="GoPro, Unterwasser, Vergleich" />
          </div>

          {/* Featured Image */}
          <div style={sectionStyle}>
            <label style={labelStyle} className="block mb-2">Titelbild</label>
            {post.featured_image && (
              <div className="mb-3 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.featured_image} alt={post.featured_image_alt} className="w-full rounded-lg" />
                <button
                  onClick={() => { update('featured_image', ''); update('featured_image_alt', ''); }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                  style={{ background: '#ef4444', color: 'white' }}
                >
                  X
                </button>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <label className="flex-1 px-3 py-2 rounded-lg text-xs font-heading font-semibold text-center cursor-pointer transition-colors" style={{ background: '#334155', color: '#e2e8f0' }}>
                  {uploading ? 'Laden...' : 'Hochladen'}
                  <input type="file" accept="image/*" onChange={uploadImage} className="hidden" />
                </label>
                <button
                  onClick={() => setShowUnsplash(!showUnsplash)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-heading font-semibold"
                  style={{ background: '#334155', color: '#e2e8f0' }}
                >
                  Unsplash
                </button>
              </div>
              <button
                onClick={() => { setShowMediathek(!showMediathek); if (!showMediathek && mediathekImages.length === 0) loadMediathek(); }}
                className="w-full px-3 py-2 rounded-lg text-xs font-heading font-semibold flex items-center justify-center gap-1.5"
                style={{ background: '#334155', color: '#e2e8f0' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Aus Mediathek waehlen
              </button>
              <button
                onClick={regenerateImage}
                disabled={regeneratingImage || !post.title}
                className="w-full px-3 py-2 rounded-lg text-xs font-heading font-semibold flex items-center justify-center gap-1.5 transition-colors"
                style={{ background: '#8b5cf620', color: '#a78bfa', opacity: regeneratingImage ? 0.6 : 1 }}
              >
                {regeneratingImage ? (
                  <><span className="w-3 h-3 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" /> Generiere Bild...</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> KI-Bild generieren</>
                )}
              </button>
            </div>
            {post.featured_image && (
              <div className="mt-2">
                <label style={labelStyle} className="block">Alt-Text</label>
                <input style={inputStyle} value={post.featured_image_alt} onChange={(e) => update('featured_image_alt', e.target.value)} />
              </div>
            )}

            {/* Unsplash-Suche */}
            {showUnsplash && (
              <div className="mt-3 p-3 rounded-lg" style={{ background: '#0f172a' }}>
                <div className="flex gap-2 mb-3">
                  <input style={inputStyle} value={unsplashQuery} onChange={(e) => setUnsplashQuery(e.target.value)} placeholder="Suchbegriff..." onKeyDown={(e) => e.key === 'Enter' && searchUnsplash()} />
                  <button onClick={searchUnsplash} className="px-3 py-1 rounded-lg text-xs font-heading font-semibold" style={{ background: '#06b6d4', color: 'white', whiteSpace: 'nowrap' }}>
                    {unsplashLoading ? '...' : 'Suchen'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {unsplashImages.map((img) => (
                    <button key={img.id} onClick={() => selectUnsplashImage(img)} className="relative rounded overflow-hidden hover:opacity-80 transition-opacity">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.thumb} alt={img.alt} className="w-full h-20 object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">{img.photographer}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          {/* Mediathek */}
            {showMediathek && (
              <div className="mt-3 p-3 rounded-lg" style={{ background: '#0f172a' }}>
                <p className="text-xs font-heading font-semibold mb-2" style={{ color: '#94a3b8' }}>Aus Mediathek waehlen</p>
                {mediathekLoading ? (
                  <p className="text-xs py-4 text-center" style={{ color: '#475569' }}>Laden...</p>
                ) : mediathekImages.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: '#475569' }}>Keine Bilder vorhanden.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                    {mediathekImages.map((img) => (
                      <button key={img.name} onClick={() => selectMediathekImage(img)} className="relative rounded overflow-hidden hover:opacity-80 transition-opacity">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.name} className="w-full h-16 object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SEO */}
          <div style={sectionStyle}>
            <h3 className="font-heading font-semibold text-sm mb-3" style={{ color: '#e2e8f0' }}>SEO</h3>
            <div className="space-y-3">
              <div>
                <label style={labelStyle} className="block">SEO-Titel</label>
                <input style={inputStyle} value={post.seo_title} onChange={(e) => update('seo_title', e.target.value)} placeholder={post.title || 'SEO-Titel...'} />
                <p className="text-xs mt-1" style={{ color: '#475569' }}>{(post.seo_title || '').length}/60 Zeichen</p>
              </div>
              <div>
                <label style={labelStyle} className="block">Meta-Beschreibung</label>
                <textarea style={{ ...inputStyle, minHeight: 60 }} value={post.seo_description} onChange={(e) => update('seo_description', e.target.value)} placeholder={post.excerpt || 'Meta-Beschreibung...'} />
                <p className="text-xs mt-1" style={{ color: '#475569' }}>{(post.seo_description || '').length}/155 Zeichen</p>
              </div>
            </div>
          </div>

          {/* Autor */}
          <div style={sectionStyle}>
            <label style={labelStyle} className="block mb-2">Autor</label>
            <input style={inputStyle} value={post.author} onChange={(e) => update('author', e.target.value)} placeholder="cam2rent" />
          </div>
        </div>
      </div>
    </div>
  );
}

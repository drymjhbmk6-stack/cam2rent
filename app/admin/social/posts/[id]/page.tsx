'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import SocialPostPreview from '@/components/admin/SocialPostPreview';
import { fmtDateTime } from '@/lib/format-utils';

interface SocialPost {
  id: string;
  caption: string;
  hashtags: string[];
  media_urls: string[];
  media_type: string;
  link_url?: string | null;
  platforms: string[];
  fb_account_id?: string | null;
  ig_account_id?: string | null;
  fb_post_id?: string | null;
  ig_post_id?: string | null;
  status: string;
  scheduled_at?: string | null;
  published_at?: string | null;
  source_type: string;
  ai_generated: boolean;
  error_message?: string | null;
  created_at: string;
}

interface Account {
  id: string;
  platform: 'facebook' | 'instagram';
  name: string;
  username?: string | null;
  external_id: string;
}

export default function PostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [post, setPost] = useState<SocialPost | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Lokaler Bearbeitungs-State
  const [caption, setCaption] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [postRes, accRes] = await Promise.all([
        fetch(`/api/admin/social/posts/${id}`).then((r) => r.json()),
        fetch('/api/admin/social/accounts').then((r) => r.json()),
      ]);
      if (postRes.error) throw new Error(postRes.error);
      const p: SocialPost = postRes.post;
      setPost(p);
      setAccounts(accRes.accounts ?? []);
      setCaption(p.caption);
      setHashtagsText((p.hashtags ?? []).join(' '));
      setImageUrl(p.media_urls[0] ?? '');
      setLinkUrl(p.link_url ?? '');
      setScheduledAt(p.scheduled_at ? p.scheduled_at.slice(0, 16) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fbAccount = accounts.find((a) => a.id === post?.fb_account_id);
  const igAccount = accounts.find((a) => a.id === post?.ig_account_id);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const hashtags = hashtagsText.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`));
      const media_urls = imageUrl ? [imageUrl] : [];
      const body = {
        caption,
        hashtags,
        media_urls,
        media_type: media_urls.length === 0 ? 'text' : 'image',
        link_url: linkUrl || null,
        scheduled_at: scheduledAt || null,
      };
      const res = await fetch(`/api/admin/social/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Speichern fehlgeschlagen');
      setPost(data.post);
      setNotice('Gespeichert.');
      setTimeout(() => setNotice(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishNow() {
    if (!confirm('Post jetzt sofort auf den ausgewählten Plattformen veröffentlichen?')) return;
    setBusy(true);
    setError(null);
    try {
      // Erst speichern
      await handleSave();
      const res = await fetch('/api/admin/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.errors?.length > 0) {
        setError('Veröffentlicht mit Fehlern: ' + data.errors.map((e: { platform: string; message: string }) => `${e.platform}: ${e.message}`).join(' | '));
      } else {
        setNotice('Erfolgreich veröffentlicht.');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }

  async function handleSchedule() {
    if (!scheduledAt) {
      setError('Bitte zuerst ein Datum/Uhrzeit auswählen');
      return;
    }
    setBusy(true);
    try {
      await handleSave();
      const res = await fetch(`/api/admin/social/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'scheduled', scheduled_at: scheduledAt }),
      });
      if (!res.ok) throw new Error('Planen fehlgeschlagen');
      setNotice('Post geplant.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const remote = post?.fb_post_id || post?.ig_post_id;
    const msg = remote
      ? 'Post löschen — auch von Facebook/Instagram entfernen?'
      : 'Post-Entwurf endgültig löschen?';
    if (!confirm(msg)) return;
    const url = `/api/admin/social/posts/${id}` + (remote ? '?remote=1' : '');
    const res = await fetch(url, { method: 'DELETE' });
    if (res.ok) router.push('/admin/social/posts');
    else alert('Löschen fehlgeschlagen');
  }

  async function handleSyncInsights() {
    setBusy(true);
    try {
      await fetch(`/api/admin/social/insights?post_id=${id}`);
      setNotice('Insights aktualisiert.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 text-slate-400">Lade…</div>;
  if (!post) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-400">Post nicht gefunden.</div>;

  const isPublished = post.status === 'published' || post.status === 'partial';
  const editable = !isPublished;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <AdminBackLink href="/admin/social/posts" />
      <h1 className="text-2xl font-bold text-white mb-1 mt-4">Post-Details</h1>
      <p className="text-sm text-slate-400 mb-4">
        Status: <StatusBadge status={post.status} /> • Erstellt {fmtDateTime(post.created_at)}
        {post.ai_generated && <span className="ml-2 px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 text-[10px]">KI-generiert</span>}
      </p>

      {notice && <div className="mb-4 rounded-lg bg-emerald-900/30 border border-emerald-700 p-3 text-sm text-emerald-300">{notice}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">{error}</div>}
      {post.error_message && (
        <div className="mb-4 rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">
          <strong>Letzter Fehler:</strong> {post.error_message}
        </div>
      )}

      {/* Plattform-Info */}
      <section className="mb-4 rounded-xl bg-slate-900/50 border border-slate-800 p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-2">Plattformen</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          {post.platforms.includes('facebook') && (
            <span className="text-slate-200">
              <strong className="text-blue-400">FB</strong> {fbAccount?.name ?? '—'}
              {post.fb_post_id && (
                <a
                  href={`https://www.facebook.com/${post.fb_post_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-cyan-400 hover:underline"
                >
                  Auf FB ansehen ↗
                </a>
              )}
            </span>
          )}
          {post.platforms.includes('instagram') && (
            <span className="text-slate-200">
              <strong className="text-pink-400">IG</strong> {igAccount?.name ?? '—'}
              {post.ig_post_id && (
                <a
                  href={`https://www.instagram.com/p/${post.ig_post_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-cyan-400 hover:underline"
                >
                  Auf IG ansehen ↗
                </a>
              )}
            </span>
          )}
        </div>
      </section>

      {/* Caption */}
      <section className="mb-4">
        <label className="block text-sm font-semibold text-slate-200 mb-1">Post-Text</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={!editable}
          rows={6}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm disabled:opacity-60"
        />
        <p className="text-xs text-slate-500 mt-1">{caption.length} Zeichen</p>
      </section>

      <section className="mb-4">
        <label className="block text-sm font-semibold text-slate-200 mb-1">Hashtags</label>
        <input
          type="text"
          value={hashtagsText}
          onChange={(e) => setHashtagsText(e.target.value)}
          disabled={!editable}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm disabled:opacity-60"
        />
      </section>

      <section className="mb-4">
        <label className="block text-sm font-semibold text-slate-200 mb-1">Bild-URL</label>
        <input
          type="text"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          disabled={!editable}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm disabled:opacity-60"
        />
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="mt-3 max-h-60 rounded-lg border border-slate-800" />
        )}
      </section>

      <section className="mb-4">
        <label className="block text-sm font-semibold text-slate-200 mb-1">Link (nur Facebook)</label>
        <input
          type="text"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          disabled={!editable}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm disabled:opacity-60"
        />
      </section>

      {editable && (
        <section className="mb-6">
          <label className="block text-sm font-semibold text-slate-200 mb-1">Geplant für</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
          />
        </section>
      )}

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
            platforms={post.platforms}
          />
        </section>
      )}

      {/* Action-Buttons */}
      <div className="flex flex-wrap gap-2">
        {editable && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white font-semibold text-sm hover:bg-slate-600 disabled:opacity-50"
            >
              Entwurf speichern
            </button>
            <button
              type="button"
              onClick={handleSchedule}
              disabled={busy || !scheduledAt}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50"
            >
              Planen
            </button>
            <button
              type="button"
              onClick={handlePublishNow}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500 disabled:opacity-50"
            >
              Jetzt veröffentlichen
            </button>
          </>
        )}
        {isPublished && (
          <button
            type="button"
            onClick={handleSyncInsights}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-700 text-white font-semibold text-sm hover:bg-slate-600 disabled:opacity-50"
          >
            Statistiken aktualisieren
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="ml-auto px-4 py-2 rounded-lg bg-red-700/40 text-red-300 font-semibold text-sm hover:bg-red-700/60 border border-red-700/60"
        >
          Löschen
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Entwurf', className: 'bg-slate-800 text-slate-300' },
    scheduled: { label: 'Geplant', className: 'bg-cyan-900/40 text-cyan-300' },
    publishing: { label: 'Wird veröffentlicht', className: 'bg-amber-900/40 text-amber-300' },
    published: { label: 'Veröffentlicht', className: 'bg-emerald-900/40 text-emerald-300' },
    partial: { label: 'Teilweise', className: 'bg-amber-900/40 text-amber-300' },
    failed: { label: 'Fehler', className: 'bg-red-900/40 text-red-300' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-slate-800 text-slate-300' };
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.className}`}>{cfg.label}</span>;
}

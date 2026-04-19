'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface ScheduledPost {
  id: string;
  caption: string;
  media_urls: string[];
  status: string;
  platforms: string[];
  scheduled_at: string;
  ai_generated: boolean;
}

export default function KiPlanPage() {
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [days, setDays] = useState(30);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [postHour, setPostHour] = useState(10);
  const [platforms, setPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [withImages, setWithImages] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/social/posts?status=scheduled&limit=200');
    const data = await res.json();
    setScheduled((data.posts ?? []).sort((a: ScheduledPost, b: ScheduledPost) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleGenerate() {
    const totalEstimated = Math.ceil((days / 7) * postsPerWeek);
    const imgTime = withImages ? totalEstimated * 20 : 0;
    const captionTime = totalEstimated * 5;
    const estimatedMinutes = Math.ceil((imgTime + captionTime) / 60);
    if (!confirm(
      `Jetzt ${totalEstimated} Posts generieren?\n\n` +
      `Dauer: ca. ${estimatedMinutes} Minuten\n` +
      `Plattformen: ${platforms.join(', ') || 'keine'}\n` +
      `Bilder: ${withImages ? 'ja (DALL-E)' : 'nein, nur Text'}\n\n` +
      `Kosten: ~0,10 € Claude${withImages ? ` + ~${(totalEstimated * 0.04).toFixed(2)} € DALL-E` : ''}`
    )) return;

    setBusy(true);
    setError(null);
    setNotice('Posts werden generiert — bitte Seite nicht schließen…');

    try {
      const res = await fetch('/api/admin/social/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days,
          posts_per_week: postsPerWeek,
          post_hour: postHour,
          platforms,
          with_images: withImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Fehler');
      setNotice(`${data.ok} von ${data.total} Posts erstellt. ${data.failed > 0 ? `${data.failed} fehlgeschlagen.` : ''}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAll() {
    if (!confirm(`Wirklich ALLE ${scheduled.length} geplanten Posts löschen?`)) return;
    for (const p of scheduled) {
      await fetch(`/api/admin/social/posts/${p.id}`, { method: 'DELETE' });
    }
    load();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />
      <h1 className="text-2xl font-bold text-white mb-1 mt-4">KI-Plan</h1>
      <p className="text-sm text-slate-400 mb-6">
        Generiere automatisch einen mehrwöchigen Post-Plan für Facebook + Instagram.
        Claude erstellt Themen-Ideen, Captions und Hashtags. Bilder optional via DALL-E.
      </p>

      {notice && <div className="mb-4 rounded-lg bg-emerald-900/30 border border-emerald-700 p-3 text-sm text-emerald-300">{notice}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">{error}</div>}

      {/* Generator-Form */}
      <section className="rounded-xl bg-slate-900/50 border border-slate-800 p-5 mb-6">
        <h2 className="font-semibold text-white mb-4">Neuen Plan generieren</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Zeitraum (Tage)</label>
            <input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Posts pro Woche</label>
            <input
              type="number"
              min={1}
              max={7}
              value={postsPerWeek}
              onChange={(e) => setPostsPerWeek(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Uhrzeit (0-23)</label>
            <input
              type="number"
              min={6}
              max={22}
              value={postHour}
              onChange={(e) => setPostHour(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Plattformen</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={platforms.includes('facebook')} onChange={() => togglePlatform('facebook')} />
              Facebook
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={platforms.includes('instagram')} onChange={() => togglePlatform('instagram')} />
              Instagram
            </label>
          </div>
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
            Bilder mit DALL-E 3 generieren (langsamer + kostet ~0,04 € pro Bild)
          </label>
          <p className="text-xs text-slate-500 mt-1 ml-6">
            Hinweis: Instagram verlangt Bilder. Ohne Bildgenerierung Posts nur auf Facebook.
          </p>
        </div>

        <div className="rounded-lg bg-slate-950/50 border border-slate-800 p-3 mb-4 text-sm">
          <p className="text-slate-400">
            Ergibt <strong className="text-slate-200">{Math.ceil((days / 7) * postsPerWeek)} Posts</strong> verteilt über {days} Tage,
            jeweils um {String(postHour).padStart(2, '0')}:00 Uhr.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy || platforms.length === 0}
          className="px-5 py-2.5 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50"
        >
          {busy ? 'Generiere… (kann 2-10 Min dauern)' : 'Plan jetzt generieren'}
        </button>
      </section>

      {/* Liste geplanter Posts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Geplante Posts ({scheduled.length})</h2>
          {scheduled.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Alle löschen
            </button>
          )}
        </div>

        {loading && <p className="text-slate-400">Lade…</p>}

        {!loading && scheduled.length === 0 && (
          <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-8 text-center">
            <p className="text-slate-400">Noch keine geplanten Posts. Generiere einen Plan oben.</p>
          </div>
        )}

        <div className="space-y-2">
          {scheduled.map((p) => (
            <Link
              key={p.id}
              href={`/admin/social/posts/${p.id}`}
              className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700"
            >
              {p.media_urls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media_urls[0]} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-slate-600 text-xs flex-shrink-0">
                  Text
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 line-clamp-2">{p.caption || '(leer)'}</p>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                  <span className="px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-300 text-[10px] font-medium">
                    {fmtDateTime(p.scheduled_at)}
                  </span>
                  <span>•</span>
                  <span>{p.platforms.map((pl) => (pl === 'facebook' ? 'FB' : 'IG')).join(' + ')}</span>
                  {p.ai_generated && <span className="px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 text-[10px]">KI</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

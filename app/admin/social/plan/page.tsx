'use client';

import { useEffect, useRef, useState } from 'react';
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

interface JobStatus {
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled';
  step?: 'topics' | 'posts';
  total: number;
  completed: number;
  failed: number;
  started_at?: string;
  finished_at?: string;
  message?: string;
  error?: string;
  recent?: Array<{ ok: boolean; topic: string; error?: string }>;
}

export default function KiPlanPage() {
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<JobStatus>({ status: 'idle', total: 0, completed: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);

  // Form
  const [days, setDays] = useState(30);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [postHour, setPostHour] = useState(10);
  const [platforms, setPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [withImages, setWithImages] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadPosts() {
    const res = await fetch('/api/admin/social/posts?status=scheduled&limit=200');
    const data = await res.json();
    setScheduled((data.posts ?? []).sort((a: ScheduledPost, b: ScheduledPost) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ));
  }

  async function loadJobStatus() {
    const res = await fetch('/api/admin/social/generate-plan');
    const data = await res.json();
    setJob(data.status ?? { status: 'idle', total: 0, completed: 0, failed: 0 });
    return data.status as JobStatus;
  }

  useEffect(() => {
    Promise.all([loadPosts(), loadJobStatus()]).then(() => setLoading(false));
  }, []);

  // Polling starten wenn Job lauft
  useEffect(() => {
    if (job.status === 'running') {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        const s = await loadJobStatus();
        if (s && s.status !== 'running') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          loadPosts();
        }
      }, 3000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job.status]);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleGenerate() {
    const totalEstimated = Math.ceil((days / 7) * postsPerWeek);
    const imgTime = withImages ? totalEstimated * 20 : 0;
    const captionTime = totalEstimated * 5;
    const estimatedMinutes = Math.ceil((imgTime + captionTime) / 60);
    if (!confirm(
      `Jetzt ${totalEstimated} Posts im Hintergrund generieren?\n\n` +
      `Dauer: ca. ${estimatedMinutes} Minuten — du kannst die Seite verlassen.\n` +
      `Plattformen: ${platforms.join(', ') || 'keine'}\n` +
      `Bilder: ${withImages ? 'ja (DALL-E)' : 'nein, nur Text'}\n\n` +
      `Kosten: ~0,10 € Claude${withImages ? ` + ~${(totalEstimated * 0.04).toFixed(2)} € DALL-E` : ''}`
    )) return;

    setError(null);

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
      loadJobStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // Falls der Server einen leeren Error-String liefert, trotzdem
      // eine verständliche Meldung anzeigen (sonst: leere rote Box).
      setError(msg.trim() || 'Unbekannter Fehler.');
    }
  }

  async function handleCancel() {
    if (!confirm('Laufenden Plan-Job abbrechen? Bereits erstellte Posts bleiben erhalten.')) return;
    await fetch('/api/admin/social/generate-plan', { method: 'DELETE' });
    loadJobStatus();
  }

  async function handleReset() {
    if (!confirm('Job-Status zuruecksetzen? Bereits erstellte Posts bleiben erhalten — nur die Statusanzeige wird geloescht, damit du einen neuen Plan starten kannst.')) return;
    await fetch('/api/admin/social/generate-plan?reset=1', { method: 'DELETE' });
    setError(null);
    loadJobStatus();
  }

  async function handleClearAll() {
    if (!confirm(`Wirklich ALLE ${scheduled.length} geplanten Posts löschen?`)) return;
    for (const p of scheduled) {
      await fetch(`/api/admin/social/posts/${p.id}`, { method: 'DELETE' });
    }
    loadPosts();
  }

  const progress = job.total > 0 ? Math.round(((job.completed + job.failed) / job.total) * 100) : 0;
  const isRunning = job.status === 'running';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />
      <h1 className="text-2xl font-bold text-white mb-1 mt-4">KI-Plan</h1>
      <p className="text-sm text-slate-400 mb-6">
        Generiere automatisch einen mehrwöchigen Post-Plan für Facebook + Instagram.
        Claude erstellt Themen-Ideen, Captions und Hashtags. Bilder optional via DALL-E.
      </p>

      {error && error.trim() && <div className="mb-4 rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">{error}</div>}

      {/* Job-Status Panel */}
      {job.status !== 'idle' && (
        <JobStatusPanel job={job} progress={progress} onCancel={handleCancel} onReset={handleReset} />
      )}

      {/* Generator-Form */}
      <section className="rounded-xl bg-slate-900/50 border border-slate-800 p-5 mb-6">
        <h2 className="font-semibold text-white mb-4">Neuen Plan generieren</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Zeitraum (Tage)</label>
            <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={isRunning}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Posts pro Woche</label>
            <input type="number" min={1} max={7} value={postsPerWeek} onChange={(e) => setPostsPerWeek(Number(e.target.value))} disabled={isRunning}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Uhrzeit (0-23)</label>
            <input type="number" min={6} max={22} value={postHour} onChange={(e) => setPostHour(Number(e.target.value))} disabled={isRunning}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm disabled:opacity-50" />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Plattformen</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={platforms.includes('facebook')} onChange={() => togglePlatform('facebook')} disabled={isRunning} />
              Facebook
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={platforms.includes('instagram')} onChange={() => togglePlatform('instagram')} disabled={isRunning} />
              Instagram
            </label>
          </div>
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} disabled={isRunning} />
            Bilder mit DALL-E 3 generieren (langsamer + kostet ~0,04 € pro Bild)
          </label>
          <p className="text-xs text-slate-500 mt-1 ml-6">
            Instagram verlangt Bilder. Ohne Bildgenerierung Posts nur auf Facebook.
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
          disabled={isRunning || platforms.length === 0}
          className="px-5 py-2.5 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500 disabled:opacity-50"
        >
          {isRunning ? 'Läuft im Hintergrund…' : 'Plan jetzt generieren'}
        </button>
      </section>

      {/* Liste geplanter Posts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Geplante Posts ({scheduled.length})</h2>
          {scheduled.length > 0 && (
            <button type="button" onClick={handleClearAll} className="text-xs text-red-400 hover:text-red-300">
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
            <Link key={p.id} href={`/admin/social/posts/${p.id}`}
              className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700">
              {p.media_urls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media_urls[0]} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-slate-600 text-xs flex-shrink-0">Text</div>
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

function JobStatusPanel({ job, progress, onCancel, onReset }: { job: JobStatus; progress: number; onCancel: () => void; onReset: () => void }) {
  const running = job.status === 'running';
  const completed = job.status === 'completed';
  const failed = job.status === 'error' || job.status === 'cancelled';

  // Staleness-Check: lief Job schon > 10 Min ohne Update, ist er
  // wahrscheinlich in einem Serverless-Kill gestorben.
  const stale = (() => {
    if (!running || !job.started_at) return false;
    const ageMs = Date.now() - new Date(job.started_at).getTime();
    return ageMs > 10 * 60 * 1000;
  })();

  const borderColor = stale ? '#f59e0b' : running ? '#0891b2' : completed ? '#16a34a' : '#dc2626';
  const bgColor = stale ? 'rgba(245,158,11,0.08)' : running ? 'rgba(6,182,212,0.08)' : completed ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)';

  return (
    <section className="rounded-xl p-5 mb-6 border" style={{ borderColor, background: bgColor }}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {running && <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
            {completed && <span className="text-emerald-400">✓</span>}
            {failed && <span className="text-red-400">✗</span>}
            <h2 className="font-semibold text-white">
              {running && !stale && 'Plan wird generiert'}
              {running && stale && 'Job scheint haengen geblieben zu sein'}
              {completed && 'Fertig'}
              {job.status === 'error' && 'Fehler'}
              {job.status === 'cancelled' && 'Abgebrochen'}
            </h2>
          </div>
          <p className="text-sm text-slate-300">{job.message || (failed ? 'Keine Details verfuegbar.' : '')}</p>
          {job.error && <p className="text-sm text-red-300 mt-1">⚠ {job.error}</p>}
          {stale && (
            <p className="text-sm text-amber-300 mt-1">
              ⚠ Der Job laeuft seit &gt; 10 Min ohne Fortschritt — wahrscheinlich vom Server abgebrochen. Bitte zuruecksetzen und neu starten.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end">
          {running && !stale && (
            <button type="button" onClick={onCancel} className="text-xs text-red-400 hover:text-red-300">
              Abbrechen
            </button>
          )}
          {(failed || completed || stale) && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
              title="Status zuruecksetzen, damit ein neuer Plan gestartet werden kann"
            >
              Zuruecksetzen
            </button>
          )}
        </div>
      </div>

      {/* Progress-Bar */}
      {(running || completed) && job.total > 0 && (
        <>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden mb-2">
            <div
              className="h-full transition-all"
              style={{
                width: `${progress}%`,
                background: completed ? '#16a34a' : 'linear-gradient(90deg, #06b6d4, #22d3ee)',
              }}
            />
          </div>
          <p className="text-xs text-slate-400">
            {job.completed} / {job.total} Posts {job.failed > 0 && <span className="text-red-400">({job.failed} Fehler)</span>} · {progress}%
          </p>
        </>
      )}

      {/* Recent-Log */}
      {job.recent && job.recent.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-200">
            Letzte {job.recent.length} Schritte anzeigen
          </summary>
          <ul className="mt-2 space-y-1">
            {job.recent.slice(0, 10).map((r, i) => (
              <li key={i} className="text-xs flex items-start gap-2">
                <span className={r.ok ? 'text-emerald-400' : 'text-red-400'}>{r.ok ? '✓' : '✗'}</span>
                <span className="text-slate-300 flex-1">{r.topic}</span>
                {r.error && <span className="text-red-400 text-[10px]">{r.error.slice(0, 40)}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {running && (
        <p className="text-xs text-slate-500 mt-3">
          💡 Du kannst die Seite verlassen — der Job läuft im Hintergrund weiter und ist beim nächsten Besuch hier sichtbar.
        </p>
      )}
    </section>
  );
}

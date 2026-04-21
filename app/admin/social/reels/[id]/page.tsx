'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface ReelScene {
  duration: number;
  search_query: string;
  text_overlay: string;
  kind?: string;
}

interface ReelScript {
  duration: number;
  music_mood?: string;
  scenes: ReelScene[];
  cta_frame: { headline: string; subline?: string; duration: number };
}

interface Reel {
  id: string;
  caption: string;
  hashtags: string[];
  link_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  template_type: 'stock_footage' | 'motion_graphics';
  script_json: ReelScript | null;
  render_log: string | null;
  platforms: string[];
  fb_account_id: string | null;
  ig_account_id: string | null;
  fb_reel_id: string | null;
  ig_reel_id: string | null;
  fb_permalink: string | null;
  ig_permalink: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  error_message: string | null;
  is_test: boolean;
  ai_prompt: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Entwurf', color: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  rendering: { label: 'Rendert…', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  rendered: { label: 'Gerendert', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200' },
  pending_review: { label: 'Zur Freigabe', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  approved: { label: 'Freigegeben', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  scheduled: { label: 'Geplant', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
  publishing: { label: 'Wird gepostet…', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  published: { label: 'Veröffentlicht', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  partial: { label: 'Teilweise', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' },
  failed: { label: 'Fehler', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
};

export default function ReelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [reel, setReel] = useState<Reel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [caption, setCaption] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [showScript, setShowScript] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/admin/reels/${id}`);
    if (!res.ok) return;
    const body = await res.json();
    setReel(body.reel);
    setCaption(body.reel.caption ?? '');
    setHashtagsText((body.reel.hashtags ?? []).join(', '));
    setScheduledAt(body.reel.scheduled_at ? body.reel.scheduled_at.slice(0, 16) : '');
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  // Auto-Refresh während Render oder Publishing läuft
  useEffect(() => {
    if (!reel) return;
    if (reel.status === 'rendering' || reel.status === 'publishing') {
      const t = setTimeout(() => load(), 4000);
      return () => clearTimeout(t);
    }
  }, [reel?.status]);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const hashtags = hashtagsText.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
      const res = await fetch(`/api/admin/reels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption, hashtags }),
      });
      if (!res.ok) {
        const body = await res.json();
        setFeedback(`Fehler: ${body.error ?? 'unbekannt'}`);
      } else {
        setFeedback('Gespeichert.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(schedule: boolean) {
    setSaving(true);
    setFeedback(null);
    try {
      const body: Record<string, unknown> = {};
      if (schedule && scheduledAt) body.scheduled_at = new Date(scheduledAt).toISOString();
      const res = await fetch(`/api/admin/reels/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json();
        setFeedback(`Fehler: ${b.error ?? 'unbekannt'}`);
      } else {
        await load();
        setFeedback(schedule ? 'Für den Zeitpunkt eingeplant.' : 'Freigegeben.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishNow() {
    if (!confirm('Reel jetzt sofort auf Facebook/Instagram veröffentlichen?')) return;
    setPublishing(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/reels/${id}/publish`, { method: 'POST' });
      const body = await res.json();
      if (body.success) {
        setFeedback('Veröffentlicht.');
      } else {
        setFeedback(`Teilweise/Fehler: ${(body.errors ?? []).map((e: { platform: string; message: string }) => `${e.platform}: ${e.message}`).join(' | ')}`);
      }
      await load();
    } finally {
      setPublishing(false);
    }
  }

  async function handleRerender() {
    if (!confirm('Dieses Reel mit demselben Topic neu rendern? Das erzeugt einen neuen Entwurf.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/reels/${id}/rerender`, { method: 'POST' });
      const body = await res.json();
      if (body.reelId) router.push(`/admin/social/reels/${body.reelId}`);
      else setFeedback('Neu-Render läuft im Hintergrund.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/admin/reels/${id}?remote=${reel?.status === 'published' ? '1' : '0'}`, { method: 'DELETE' });
    if (res.ok) router.push('/admin/social/reels');
    else setFeedback('Löschen fehlgeschlagen.');
  }

  if (loading || !reel) {
    return <div className="p-8 text-center text-brand-steel dark:text-gray-400">Lade…</div>;
  }

  const statusBadge = STATUS_LABELS[reel.status] ?? { label: reel.status, color: 'bg-gray-200 text-gray-700' };

  const canPublishNow = reel.status === 'approved' || reel.status === 'scheduled' || reel.status === 'pending_review' || reel.status === 'failed';
  const canApprove = reel.status === 'pending_review' || reel.status === 'rendered' || reel.status === 'draft';
  const isReady = Boolean(reel.video_url);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <AdminBackLink href="/admin/social/reels" />

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-brand-dark dark:text-white mb-2">Reel-Vorschau</h1>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.color}`}>{statusBadge.label}</span>
            {reel.is_test && <span className="inline-flex items-center rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px] font-medium">TEST</span>}
            <span className="text-xs text-brand-steel dark:text-gray-500">erstellt {fmtDateTime(reel.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRerender}
            disabled={saving}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-brand-dark dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Neu rendern
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
          >
            Löschen
          </button>
        </div>
      </div>

      {feedback && (
        <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 px-4 py-2 text-sm text-blue-800 dark:text-blue-200">{feedback}</div>
      )}

      {/* Audio-Hinweis: wenn render_log ein "Voice-Track: AUS" oder "Musik: AUS" hat */}
      {reel.render_log && reel.render_log.includes('[audio]') && (reel.render_log.includes('Voice-Track: AUS') && reel.render_log.includes('Musik: AUS')) && (
        <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong>Dieses Reel ist stumm.</strong> Weder Voice-Over noch Hintergrundmusik sind f&uuml;r die Generierung aktiviert gewesen. Unter{' '}
          <a href="/admin/social/reels/vorlagen" className="underline font-medium">Vorlagen &rarr; Einstellungen</a> kannst du &bdquo;Voice-Over aktivieren&ldquo; anhaken oder eine Musik-URL hinterlegen. Danach &bdquo;Neu rendern&ldquo; klicken.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Video-Preview links */}
        <div>
          <div className="relative aspect-[9/16] max-h-[720px] bg-black rounded-xl overflow-hidden shadow-lg mx-auto">
            {reel.video_url ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={reel.video_url}
                poster={reel.thumbnail_url ?? undefined}
                controls
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            ) : reel.status === 'rendering' ? (
              <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                Wird gerendert… (typisch 30–90s)
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm text-center p-4">
                {reel.error_message ?? 'Kein Video vorhanden'}
              </div>
            )}
          </div>

          {reel.duration_seconds && (
            <p className="text-center text-xs text-brand-steel dark:text-gray-500 mt-2">
              Länge: {reel.duration_seconds}s · {reel.template_type === 'motion_graphics' ? 'Motion-Graphics' : 'Stock-Footage'}
            </p>
          )}
        </div>

        {/* Bearbeiten / Freigabe rechts */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark dark:text-white mb-1">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-dark dark:text-white mb-1">Hashtags (komma-getrennt)</label>
            <input
              type="text"
              value={hashtagsText}
              onChange={(e) => setHashtagsText(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-dark dark:text-white mb-1">Einplanen für (optional)</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white"
            />
            <p className="text-xs text-brand-steel dark:text-gray-500 mt-1">Leer lassen und &bdquo;Freigeben&ldquo; klicken, um manuell via &bdquo;Jetzt ver&ouml;ffentlichen&ldquo; zu posten.</p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-brand-dark dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Speichern
            </button>

            {canApprove && isReady && (
              <>
                <button
                  onClick={() => handleApprove(false)}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Freigeben
                </button>
                {scheduledAt && (
                  <button
                    onClick={() => handleApprove(true)}
                    disabled={saving}
                    className="rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Einplanen
                  </button>
                )}
              </>
            )}

            {canPublishNow && isReady && (
              <button
                onClick={handlePublishNow}
                disabled={publishing}
                className="rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {publishing ? 'Wird gepostet…' : 'Jetzt veröffentlichen'}
              </button>
            )}
          </div>

          {reel.fb_permalink && (
            <p className="text-xs">
              <a href={reel.fb_permalink} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-cyan-400 hover:underline">
                Auf Facebook ansehen →
              </a>
            </p>
          )}
          {reel.ig_permalink && (
            <p className="text-xs">
              <a href={reel.ig_permalink} target="_blank" rel="noopener noreferrer" className="text-pink-600 dark:text-pink-400 hover:underline">
                Auf Instagram ansehen →
              </a>
            </p>
          )}
        </div>
      </div>

      {/* Skript anzeigen */}
      {reel.script_json && (
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <button onClick={() => setShowScript((s) => !s)} className="flex items-center justify-between w-full text-left">
            <span className="text-sm font-medium text-brand-dark dark:text-white">KI-Skript ({reel.script_json.scenes.length} Szenen · Musik: {reel.script_json.music_mood ?? 'neutral'})</span>
            <span className="text-xs text-brand-steel dark:text-gray-500">{showScript ? 'einklappen' : 'aufklappen'}</span>
          </button>
          {showScript && (
            <div className="mt-4 space-y-3 text-sm">
              {reel.script_json.scenes.map((s, i) => (
                <div key={i} className="border-l-2 border-cyan-500 pl-3">
                  <p className="font-medium text-brand-dark dark:text-white">{s.text_overlay || <em className="text-brand-steel">(kein Text)</em>}</p>
                  <p className="text-xs text-brand-steel dark:text-gray-500">
                    Szene {i + 1} · {s.duration}s · Pexels: <code>{s.search_query}</code>
                  </p>
                </div>
              ))}
              <div className="border-l-2 border-brand-orange pl-3">
                <p className="font-medium text-brand-dark dark:text-white">{reel.script_json.cta_frame.headline}</p>
                {reel.script_json.cta_frame.subline && (
                  <p className="text-xs text-brand-steel dark:text-gray-400">{reel.script_json.cta_frame.subline}</p>
                )}
                <p className="text-xs text-brand-steel dark:text-gray-500">CTA · {reel.script_json.cta_frame.duration}s</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Render-Log (nur bei Fehler oder Debug) */}
      {reel.render_log && (
        <div className="mt-4">
          <button onClick={() => setShowLog((s) => !s)} className="text-xs text-brand-steel dark:text-gray-500 hover:underline">
            {showLog ? 'Render-Log einklappen' : 'Render-Log anzeigen'}
          </button>
          {showLog && (
            <pre className="mt-2 text-[10px] bg-gray-100 dark:bg-gray-900 rounded p-3 overflow-x-auto text-brand-steel dark:text-gray-500 max-h-60">{reel.render_log}</pre>
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-brand-dark dark:text-white mb-2">Reel wirklich löschen?</h2>
            <p className="text-sm text-brand-steel dark:text-gray-400 mb-4">
              {reel.status === 'published'
                ? 'Das Reel wird auch auf Facebook/Instagram gelöscht (Best-Effort).'
                : 'Die Datei wird aus dem Storage entfernt.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm">Abbrechen</button>
              <button onClick={handleDelete} className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

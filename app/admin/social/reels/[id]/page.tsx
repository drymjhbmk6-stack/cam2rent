'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import ReelRenderStatus from '@/components/admin/ReelRenderStatus';
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

interface ReelQualityMetrics {
  file_size_bytes?: number;
  duration_seconds?: number;
  avg_bitrate_kbps?: number;
  segment_count?: number;
  source_resolutions?: Array<{ index: number; width: number; height: number; source: string }>;
  stock_sources?: Record<string, number>;
  render_duration_seconds?: number;
  font_used?: string;
  motion_style?: 'static' | 'kenburns' | 'mixed';
}

// Phase 3.2: Persistierte Segmente eines Reels
interface ReelSegment {
  id: string;
  reel_id: string;
  index: number;
  kind: 'intro' | 'body' | 'cta' | 'outro';
  storage_path: string;
  storage_url: string | null;
  duration_seconds: number;
  scene_data: Record<string, unknown> | null;
  source_clip_data: Record<string, unknown> | null;
  has_voice: boolean;
  voice_storage_path: string | null;
  created_at: string;
  updated_at: string;
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
  quality_metrics?: ReelQualityMetrics | null;
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
  const [activeTab, setActiveTab] = useState<'preview' | 'content' | 'scenes' | 'render'>('preview');
  // Phase 3.2: Szenen-Editor
  const [segments, setSegments] = useState<ReelSegment[]>([]);
  const [segmentsMissing, setSegmentsMissing] = useState(false); // Migration nicht durch
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [queryModalSegment, setQueryModalSegment] = useState<ReelSegment | null>(null);
  const [queryModalText, setQueryModalText] = useState('');
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

  // Phase 3.2: Segmente parallel laden
  async function loadSegments() {
    try {
      const res = await fetch(`/api/admin/reels/${id}/segments`);
      if (!res.ok) {
        setSegments([]);
        return;
      }
      const body = await res.json();
      if (body.migrationMissing) {
        setSegmentsMissing(true);
        setSegments([]);
        return;
      }
      setSegments(body.segments ?? []);
      setSegmentsMissing(false);
    } catch {
      setSegments([]);
    }
  }

  useEffect(() => {
    load();
    loadSegments();
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

  // Hotfix: Haengenden Render abbrechen — setzt status='failed'.
  async function handleResetRender() {
    if (!reel) return;
    if (!confirm('Hängenden Render wirklich abbrechen? Reel wird auf "failed" gesetzt — du kannst dann "Neu rendern" klicken.')) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/reels/${id}/reset`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setFeedback(`Reset-Fehler: ${body.error ?? 'unbekannt'}`);
        return;
      }
      setFeedback('Render abgebrochen — Reel ist jetzt auf "failed" und kann neu gestartet werden.');
      await load();
    } finally {
      setSaving(false);
    }
  }

  // Phase 3.2: Body-Segment austauschen
  async function handleRegenerateSegment(segment: ReelSegment, newQuery?: string) {
    if (!segment) return;
    const isScheduled = reel?.status === 'scheduled';
    if (isScheduled && !confirm('Reel ist bereits eingeplant. Wirklich Szene tauschen? Das aktualisiert die Datei am geplanten Veröffentlichungstermin.')) {
      return;
    }
    setRegeneratingId(segment.id);
    setFeedback(null);
    try {
      const body: Record<string, unknown> = {};
      if (newQuery !== undefined) body.newSearchQuery = newQuery;
      if (isScheduled) body.confirm = true;
      const res = await fetch(`/api/admin/reels/${id}/segments/${segment.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        setFeedback(`Fehler: ${result.error ?? 'unbekannt'}`);
        return;
      }
      setFeedback(`Szene ${segment.index} getauscht — neuer Clip von ${result.newClip?.source}.`);
      await load();
      await loadSegments();
    } catch (err) {
      setFeedback(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRegeneratingId(null);
      setQueryModalSegment(null);
      setQueryModalText('');
    }
  }

  function openQueryModal(segment: ReelSegment) {
    setQueryModalSegment(segment);
    const sceneData = (segment.scene_data ?? {}) as Record<string, unknown>;
    setQueryModalText((sceneData.search_query as string) ?? '');
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
          {(reel.status === 'rendering' || reel.status === 'publishing') && (
            <button
              onClick={handleResetRender}
              disabled={saving}
              className="rounded-lg border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
              title="Bricht den Hintergrund-Render ab und setzt den Reel auf 'failed'."
            >
              🛑 Render abbrechen
            </button>
          )}
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

      {/* Live-Status waehrend Render — parst render_log und zeigt aktuelle Phase */}
      <ReelRenderStatus status={reel.status} renderLog={reel.render_log} createdAt={reel.created_at} />

      {/* Audio-Hinweis: wenn render_log ein "Voice-Track: AUS" oder "Musik: AUS" hat */}
      {reel.render_log && reel.render_log.includes('[audio]') && (reel.render_log.includes('Voice-Track: AUS') && reel.render_log.includes('Musik: AUS')) && (
        <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong>Dieses Reel ist stumm.</strong> Weder Voice-Over noch Hintergrundmusik sind f&uuml;r die Generierung aktiviert gewesen. Unter{' '}
          <Link href="/admin/social/reels/vorlagen" className="underline font-medium">Vorlagen &rarr; Einstellungen</Link> kannst du &bdquo;Voice-Over aktivieren&ldquo; anhaken oder eine Musik-URL hinterlegen. Danach &bdquo;Neu rendern&ldquo; klicken.
        </div>
      )}

      {/* Tab-Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Tabs">
          {[
            { key: 'preview', label: 'Vorschau' },
            { key: 'content', label: 'Inhalt' },
            { key: 'scenes', label: `Szenen${segments.length > 0 ? ` (${segments.length})` : ''}` },
            { key: 'render', label: `Render & Skript${reel.error_message ? ' ⚠' : ''}` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as typeof activeTab)}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.key
                  ? 'border-brand-orange text-brand-orange'
                  : 'border-transparent text-brand-steel dark:text-gray-400 hover:text-brand-dark dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Vorschau — Video links, Nächster-Schritt-Block rechts */}
      {activeTab === 'preview' && (
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

        {/* Nächster Schritt rechts — kontextabhängig basierend auf reel.status */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="text-sm font-semibold text-brand-dark dark:text-white mb-3">Nächster Schritt</h3>

            {reel.status === 'failed' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-200">
                  <strong>Render fehlgeschlagen.</strong>
                  {reel.error_message && <p className="mt-1 text-xs">{reel.error_message}</p>}
                </div>
                <button
                  onClick={handleRerender}
                  disabled={saving}
                  className="w-full rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Neu rendern
                </button>
              </div>
            )}

            {(reel.status === 'rendering' || reel.status === 'publishing') && (
              <p className="text-sm text-brand-steel dark:text-gray-400">
                {reel.status === 'rendering' ? 'Render läuft im Hintergrund. Status oben aktualisiert sich automatisch.' : 'Wird gerade gepostet…'}
              </p>
            )}

            {canApprove && isReady && (
              <div className="space-y-3">
                <p className="text-sm text-brand-steel dark:text-gray-400">Reel ist gerendert und bereit zur Freigabe.</p>
                <button
                  onClick={() => handleApprove(false)}
                  disabled={saving}
                  className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Freigeben (manuell veröffentlichen)
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <label className="block text-xs font-medium text-brand-dark dark:text-white mb-1">Stattdessen einplanen für:</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white mb-2"
                  />
                  <button
                    onClick={() => handleApprove(true)}
                    disabled={saving || !scheduledAt}
                    className="w-full rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Einplanen
                  </button>
                </div>
              </div>
            )}

            {(reel.status === 'approved' || reel.status === 'scheduled') && isReady && (
              <div className="space-y-3">
                {reel.status === 'scheduled' && reel.scheduled_at && (
                  <p className="text-sm text-brand-steel dark:text-gray-400">
                    Geplant für <strong className="text-brand-dark dark:text-white">{fmtDateTime(reel.scheduled_at)}</strong>. Cron postet automatisch.
                  </p>
                )}
                {reel.status === 'approved' && (
                  <p className="text-sm text-brand-steel dark:text-gray-400">Freigegeben — bereit zum sofortigen Posten.</p>
                )}
                <button
                  onClick={handlePublishNow}
                  disabled={publishing}
                  className="w-full rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {publishing ? 'Wird gepostet…' : 'Jetzt veröffentlichen'}
                </button>
              </div>
            )}

            {reel.status === 'published' && (
              <div className="space-y-2">
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">✓ Veröffentlicht{reel.published_at && ` am ${fmtDateTime(reel.published_at)}`}.</p>
                {reel.fb_permalink && (
                  <a href={reel.fb_permalink} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-600 dark:text-cyan-400 hover:underline">
                    Auf Facebook ansehen →
                  </a>
                )}
                {reel.ig_permalink && (
                  <a href={reel.ig_permalink} target="_blank" rel="noopener noreferrer" className="block text-sm text-pink-600 dark:text-pink-400 hover:underline">
                    Auf Instagram ansehen →
                  </a>
                )}
                {!reel.fb_permalink && !reel.ig_permalink && (
                  <p className="text-xs text-brand-steel dark:text-gray-500 italic">(Permalinks werden beim nächsten Post erfasst)</p>
                )}
              </div>
            )}

            {reel.status === 'partial' && (
              <div className="space-y-2">
                <p className="text-sm text-orange-700 dark:text-orange-300">Teilweise veröffentlicht — eine Plattform hat einen Fehler zurückgegeben.</p>
                {reel.error_message && <p className="text-xs text-brand-steel dark:text-gray-400">{reel.error_message}</p>}
                <button
                  onClick={handlePublishNow}
                  disabled={publishing}
                  className="w-full rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {publishing ? 'Wird gepostet…' : 'Erneut veröffentlichen'}
                </button>
              </div>
            )}
          </div>

          {/* Plattform-Hinweis */}
          <p className="text-xs text-brand-steel dark:text-gray-500">
            Plattformen: {reel.platforms.join(', ').toUpperCase() || '—'}
          </p>
        </div>
      </div>
      )}

      {/* Tab: Inhalt — Caption, Hashtags, Schedule, Speichern */}
      {activeTab === 'content' && (
        <div className="max-w-2xl space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark dark:text-white mb-1">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
            />
            <p className="text-xs text-brand-steel dark:text-gray-500 mt-1">{caption.length} Zeichen</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-dark dark:text-white mb-1">Hashtags (komma-getrennt)</label>
            <input
              type="text"
              value={hashtagsText}
              onChange={(e) => setHashtagsText(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-dark dark:text-white mb-1">Geplanter Veröffentlichungs-Zeitpunkt</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-brand-dark dark:text-white"
            />
            <p className="text-xs text-brand-steel dark:text-gray-500 mt-1">Wird angewendet, wenn du im Vorschau-Tab &bdquo;Einplanen&ldquo; klickst.</p>
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-brand-orange hover:bg-brand-orange/90 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-brand-steel dark:text-gray-500 space-y-1">
            <p><strong className="text-brand-dark dark:text-white">Plattformen:</strong> {reel.platforms.join(', ').toUpperCase() || '—'}</p>
            {reel.fb_account_id && <p><strong className="text-brand-dark dark:text-white">FB-Account-ID:</strong> {reel.fb_account_id}</p>}
            {reel.ig_account_id && <p><strong className="text-brand-dark dark:text-white">IG-Account-ID:</strong> {reel.ig_account_id}</p>}
          </div>
        </div>
      )}

      {/* Tab: Render & Skript — Skript, Metriken, Log */}
      {activeTab === 'render' && (
      <div className="space-y-4">
      {reel.script_json && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-medium text-brand-dark dark:text-white mb-3">KI-Skript ({reel.script_json.scenes.length} Szenen · Musik: {reel.script_json.music_mood ?? 'neutral'})</h2>
          <div className="space-y-3 text-sm">
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
        </div>
      )}

      {!reel.script_json && (
        <p className="text-sm text-brand-steel dark:text-gray-500 italic">Kein KI-Skript vorhanden.</p>
      )}
      </div>
      )}

      {/* Tab: Szenen — Phase 3.2 Segment-Editor */}
      {activeTab === 'scenes' && (
      <div className="space-y-4">
      {segmentsMissing && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong>Migration ausstehend:</strong> Tabelle <code>social_reel_segments</code> noch nicht angelegt. Szenen-Editor wird nach <code>supabase/supabase-reel-segments.sql</code> verfügbar.
        </div>
      )}
      {/* Phase 3.2: Szenen-Editor — Liste persistierter Segmente mit
          Body-Tausch-Buttons. Nur sichtbar wenn Migration `social_reel_segments`
          durch ist und der Reel mit Phase-3-Pipeline gerendert wurde. */}
      {segments.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-brand-dark dark:text-white">Szenen ({segments.length})</h2>
            <span className="text-xs text-brand-steel dark:text-gray-500">Body-Szenen einzeln austauschbar</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {segments.map((seg) => {
              const sceneData = (seg.scene_data ?? {}) as Record<string, unknown>;
              const sourceClip = (seg.source_clip_data ?? {}) as Record<string, unknown>;
              const isBody = seg.kind === 'body';
              const isRegenerating = regeneratingId === seg.id;
              const kindBadge = {
                intro: { label: 'Intro', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
                body: { label: 'Body', cls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200' },
                cta: { label: 'CTA', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
                outro: { label: 'Outro', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
              }[seg.kind];
              return (
                <div key={seg.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900/50">
                  <div className="aspect-[9/16] bg-black relative">
                    {seg.storage_url ? (
                      <video
                        src={seg.storage_url}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">kein Video</div>
                    )}
                    {isRegenerating && (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                        <span className="text-xs text-white animate-pulse">Tausche…</span>
                      </div>
                    )}
                    <span className={`absolute top-1 left-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${kindBadge?.cls ?? ''}`}>
                      {kindBadge?.label} #{seg.index}
                    </span>
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-[11px] text-brand-dark dark:text-white truncate">
                      {(sceneData.text_overlay as string) || (sceneData.headline as string) || <em className="text-brand-steel">(kein Text)</em>}
                    </p>
                    <p className="text-[10px] text-brand-steel dark:text-gray-500">
                      {seg.duration_seconds.toFixed(1)}s
                      {sourceClip.source ? ` · ${sourceClip.source} ${sourceClip.width}×${sourceClip.height}` : ''}
                      {seg.has_voice ? ' · 🔊' : ''}
                    </p>
                    {isBody && (
                      <div className="flex flex-col gap-1 pt-1">
                        <button
                          onClick={() => handleRegenerateSegment(seg)}
                          disabled={regeneratingId !== null || reel.status === 'published' || reel.status === 'rendering'}
                          className="text-[10px] rounded border border-cyan-400 dark:border-cyan-700 bg-white dark:bg-gray-800 text-cyan-700 dark:text-cyan-200 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1"
                          title="Anderen Stock-Clip mit der gleichen Such-Query holen"
                        >
                          🔄 Neuer Clip
                        </button>
                        <button
                          onClick={() => openQueryModal(seg)}
                          disabled={regeneratingId !== null || reel.status === 'published' || reel.status === 'rendering'}
                          className="text-[10px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-brand-dark dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1"
                          title="Suchbegriff für Stock-Footage anpassen"
                        >
                          ✏️ Query
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {reel.status === 'published' && (
            <p className="text-xs text-brand-steel dark:text-gray-500 mt-3 italic">
              Reel ist veröffentlicht — Tausch ist gesperrt.
            </p>
          )}
        </div>
      )}

      {/* Hinweis falls Reel noch ohne persistierte Segmente */}
      {segments.length === 0 && !segmentsMissing && reel.status !== 'rendering' && reel.status !== 'failed' && (
        <div className="text-xs text-brand-steel dark:text-gray-500 italic">
          Dieses Reel wurde vor Phase 3 gerendert — Szenen-Editor steht erst nach einem Neu-Render zur Verfügung.
        </div>
      )}
      </div>
      )}

      {/* Query-Modal — tab-unabhängig, da Modal */}
      {queryModalSegment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-brand-dark dark:text-white mb-2">Such-Query ändern</h2>
            <p className="text-sm text-brand-steel dark:text-gray-400 mb-4">
              Gib einen anderen Stock-Footage-Suchbegriff ein. System holt den ersten passenden Clip aus Pexels/Pixabay.
            </p>
            <input
              type="text"
              value={queryModalText}
              onChange={(e) => setQueryModalText(e.target.value)}
              placeholder="z.B. surfer in waves"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-brand-dark dark:text-white mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setQueryModalSegment(null); setQueryModalText(''); }}
                className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-brand-dark dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 text-sm"
              >
                Abbrechen
              </button>
              <button
                onClick={() => queryModalSegment && handleRegenerateSegment(queryModalSegment, queryModalText.trim())}
                disabled={!queryModalText.trim() || regeneratingId !== null}
                className="rounded bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 text-sm font-medium"
              >
                Tauschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Render & Skript (Block 2) — Metriken + Log */}
      {activeTab === 'render' && (
      <div className="space-y-4 mt-4">
      {/* Phase 2.5: Render-Metriken. Nur sichtbar, wenn die
          Migration `quality_metrics` durch ist und der Render mit Phase-2-Pipeline lief. */}
      {reel.quality_metrics && Object.keys(reel.quality_metrics).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-medium text-brand-dark dark:text-white mb-3">Render-Metriken</h2>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
              {typeof reel.quality_metrics.file_size_bytes === 'number' && (
                <div>
                  <dt className="text-brand-steel dark:text-gray-500">Datei-Größe</dt>
                  <dd className="text-brand-dark dark:text-white font-medium">
                    {(reel.quality_metrics.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                  </dd>
                </div>
              )}
              {typeof reel.quality_metrics.avg_bitrate_kbps === 'number' && (
                <div>
                  <dt className="text-brand-steel dark:text-gray-500">Ø Bitrate</dt>
                  <dd className="text-brand-dark dark:text-white font-medium">{reel.quality_metrics.avg_bitrate_kbps} kbit/s</dd>
                </div>
              )}
              {typeof reel.quality_metrics.duration_seconds === 'number' && (
                <div>
                  <dt className="text-brand-steel dark:text-gray-500">Dauer</dt>
                  <dd className="text-brand-dark dark:text-white font-medium">{reel.quality_metrics.duration_seconds.toFixed(1)} s</dd>
                </div>
              )}
              {typeof reel.quality_metrics.segment_count === 'number' && (
                <div>
                  <dt className="text-brand-steel dark:text-gray-500">Segmente</dt>
                  <dd className="text-brand-dark dark:text-white font-medium">{reel.quality_metrics.segment_count}</dd>
                </div>
              )}
              {typeof reel.quality_metrics.render_duration_seconds === 'number' && (
                <div>
                  <dt className="text-brand-steel dark:text-gray-500">Render-Zeit</dt>
                  <dd className="text-brand-dark dark:text-white font-medium">{reel.quality_metrics.render_duration_seconds.toFixed(1)} s</dd>
                </div>
              )}
              {reel.quality_metrics.motion_style && (
                <div>
                  <dt className="text-brand-steel dark:text-gray-500">Motion-Style</dt>
                  <dd className="text-brand-dark dark:text-white font-medium">{reel.quality_metrics.motion_style}</dd>
                </div>
              )}
              {reel.quality_metrics.font_used && (
                <div>
                  <dt className="text-brand-steel dark:text-gray-500">Schrift</dt>
                  <dd className="text-brand-dark dark:text-white font-medium">{reel.quality_metrics.font_used}</dd>
                </div>
              )}
              {reel.quality_metrics.stock_sources && Object.keys(reel.quality_metrics.stock_sources).length > 0 && (
                <div className="col-span-2 md:col-span-3">
                  <dt className="text-brand-steel dark:text-gray-500">Stock-Quellen</dt>
                  <dd className="text-brand-dark dark:text-white font-medium">
                    {Object.entries(reel.quality_metrics.stock_sources).map(([k, v]) => `${k}=${v}`).join(' · ')}
                  </dd>
                </div>
              )}
              {reel.quality_metrics.source_resolutions && reel.quality_metrics.source_resolutions.length > 0 && (
                <div className="col-span-2 md:col-span-3">
                  <dt className="text-brand-steel dark:text-gray-500">Quell-Auflösungen</dt>
                  <dd className="text-brand-dark dark:text-white font-mono text-[10px]">
                    {reel.quality_metrics.source_resolutions
                      .map((r) => `Seg-${r.index}: ${r.source} ${r.width}×${r.height}`)
                      .join(' · ')}
                  </dd>
                </div>
              )}
            </dl>
        </div>
      )}

      {/* Render-Log */}
      {reel.render_log && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-medium text-brand-dark dark:text-white mb-2">Render-Log</h2>
          <pre className="text-[10px] bg-gray-100 dark:bg-gray-900 rounded p-3 overflow-x-auto text-brand-steel dark:text-gray-500 max-h-96">{reel.render_log}</pre>
        </div>
      )}

      {!reel.quality_metrics && !reel.render_log && (
        <p className="text-sm text-brand-steel dark:text-gray-500 italic">Keine Render-Daten vorhanden.</p>
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface Reel {
  id: string;
  caption: string;
  thumbnail_url: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  template_type: 'stock_footage' | 'motion_graphics';
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  error_message: string | null;
  ai_generated: boolean;
  is_test: boolean;
  created_at: string;
  fb_permalink: string | null;
  ig_permalink: string | null;
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Alle' },
  { value: 'pending_review', label: 'Zur Freigabe' },
  { value: 'approved', label: 'Freigegeben' },
  { value: 'scheduled', label: 'Geplant' },
  { value: 'published', label: 'Veröffentlicht' },
  { value: 'failed', label: 'Fehler' },
  { value: 'rendering', label: 'Rendert…' },
];

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

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-200 text-gray-700' };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.color}`}>{s.label}</span>;
}

/** "Nächster Schritt"-Hint pro Karte basierend auf Status, Schedule, Fehler */
function nextStepHint(r: Reel): { text: string; cls: string } | null {
  if (r.status === 'failed') return { text: 'Render fehlgeschlagen — neu starten?', cls: 'text-red-600 dark:text-red-400' };
  if (r.status === 'rendering') return { text: 'Rendert im Hintergrund…', cls: 'text-blue-600 dark:text-blue-300' };
  if (r.status === 'pending_review' || r.status === 'rendered') return { text: 'Wartet auf Freigabe', cls: 'text-amber-700 dark:text-amber-300' };
  if (r.status === 'approved') return { text: 'Bereit — manuell veröffentlichen', cls: 'text-emerald-700 dark:text-emerald-300' };
  if (r.status === 'scheduled' && r.scheduled_at) return { text: `Geplant für ${fmtDateTime(r.scheduled_at)}`, cls: 'text-violet-700 dark:text-violet-300' };
  if (r.status === 'partial') return { text: 'Nur teilweise gepostet — erneut versuchen?', cls: 'text-orange-600 dark:text-orange-400' };
  if (r.status === 'publishing') return { text: 'Wird gerade gepostet…', cls: 'text-blue-600 dark:text-blue-300' };
  return null;
}

/** Hybrid-Sort: scheduled aufsteigend zuerst, alles andere created_at absteigend */
function hybridSort(a: Reel, b: Reel): number {
  const aSch = a.status === 'scheduled' && a.scheduled_at;
  const bSch = b.status === 'scheduled' && b.scheduled_at;
  if (aSch && !bSch) return -1;
  if (!aSch && bSch) return 1;
  if (aSch && bSch) return new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime();
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export default function ReelsListPage() {
  const [allReels, setAllReels] = useState<Reel[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const url = new URL('/api/admin/reels', window.location.origin);
    url.searchParams.set('limit', '200');
    try {
      const res = await fetch(url.toString());
      const body = await res.json();
      if (res.ok) setAllReels(body.reels ?? []);
    } catch (err) {
      console.error('[reels-list]', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Auto-Refresh wenn gerade was rendert/postet
  useEffect(() => {
    if (!allReels.some((r) => r.status === 'rendering' || r.status === 'publishing')) return;
    const t = setTimeout(() => load(), 5000);
    return () => clearTimeout(t);
  }, [allReels]);

  // Counts pro Status — client-seitig aus voller Liste
  const counts = useMemo(() => {
    const m: Record<string, number> = { '': allReels.length };
    for (const r of allReels) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [allReels]);

  // Gefilterte + sortierte Liste
  const reels = useMemo(() => {
    const filtered = statusFilter ? allReels.filter((r) => r.status === statusFilter) : allReels.slice();
    return filtered.sort(hybridSort);
  }, [allReels, statusFilter]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(reels.map((r) => r.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleBulk(action: 'approve' | 'delete') {
    if (selected.size === 0) return;
    if (action === 'delete' && !confirm(`${selected.size} Reel(s) endgültig löschen? Storage-Files werden mitgelöscht.`)) return;
    setBulkBusy(true);
    setBulkFeedback(null);
    try {
      const res = await fetch('/api/admin/reels/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: Array.from(selected) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setBulkFeedback(`Fehler: ${body.error ?? 'unbekannt'}`);
      } else if (action === 'approve') {
        setBulkFeedback(`${body.approved} freigegeben${body.skipped ? `, ${body.skipped} übersprungen (falscher Status)` : ''}.`);
      } else {
        setBulkFeedback(`${body.deleted} gelöscht.`);
      }
      clearSelection();
      await load();
    } catch (err) {
      setBulkFeedback(`Fehler: ${err instanceof Error ? err.message : 'unbekannt'}`);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <AdminBackLink href="/admin/social" />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-brand-dark dark:text-white">Reels</h1>
          <p className="text-sm text-brand-steel dark:text-gray-400 mt-1">KI-generierte Kurzvideos für Facebook + Instagram. Jedes Reel wird standardmäßig zur Freigabe vorgelegt, bevor es veröffentlicht wird.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/social/reels/vorlagen"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-brand-dark dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Vorlagen
          </Link>
          <Link
            href="/admin/social/reels/neu"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange/90"
          >
            + Neues Reel
          </Link>
        </div>
      </div>

      {/* Status-Filter mit Counter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((f) => {
          const count = counts[f.value] ?? 0;
          const active = statusFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-1.5 ${
                active
                  ? 'bg-brand-dark text-white dark:bg-cyan-600'
                  : 'bg-white dark:bg-gray-800 text-brand-steel dark:text-gray-300 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <span>{f.label}</span>
              <span className={`text-[11px] px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Bulk-Aktions-Bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-4 rounded-lg bg-brand-dark dark:bg-gray-900 border border-gray-700 px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <span className="text-sm text-white font-medium">{selected.size} ausgewählt</span>
          <button
            onClick={() => handleBulk('approve')}
            disabled={bulkBusy}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Freigeben
          </button>
          <button
            onClick={() => handleBulk('delete')}
            disabled={bulkBusy}
            className="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Löschen
          </button>
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            className="rounded-lg border border-gray-500 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            Auswahl aufheben
          </button>
          <span className="text-xs text-gray-300 ml-auto">Veröffentlichen läuft pro-Reel über die Detail-Seite (Meta-Rate-Limits).</span>
        </div>
      )}

      {bulkFeedback && (
        <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 px-4 py-2 text-sm text-blue-800 dark:text-blue-200">
          {bulkFeedback}
        </div>
      )}

      {/* "Alle auswählen" Hinweis wenn Liste vorhanden */}
      {!loading && reels.length > 0 && selected.size === 0 && (
        <button
          onClick={selectAllVisible}
          className="text-xs text-brand-steel dark:text-gray-400 hover:text-brand-orange mb-3 underline"
        >
          Alle {reels.length} sichtbaren auswählen
        </button>
      )}

      {loading ? (
        <div className="text-center py-12 text-brand-steel dark:text-gray-400">Lade Reels…</div>
      ) : reels.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-brand-steel dark:text-gray-400 mb-4">
            {statusFilter ? `Keine Reels mit Status "${STATUS_LABELS[statusFilter]?.label ?? statusFilter}".` : 'Noch keine Reels vorhanden.'}
          </p>
          <Link
            href="/admin/social/reels/neu"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange/90"
          >
            Neues Reel generieren
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reels.map((r) => {
            const isSelected = selected.has(r.id);
            const hint = nextStepHint(r);
            const isHovered = hoveredId === r.id;
            return (
              <div
                key={r.id}
                onMouseEnter={() => setHoveredId(r.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`group bg-white dark:bg-gray-800 rounded-xl border overflow-hidden transition relative ${
                  isSelected
                    ? 'border-brand-orange ring-2 ring-brand-orange/30 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 hover:shadow-lg'
                }`}
              >
                {/* Auswahl-Checkbox */}
                <label className="absolute top-2 left-2 z-20 cursor-pointer bg-white dark:bg-gray-900 rounded p-1 shadow">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(r.id)}
                    className="cursor-pointer"
                    aria-label="Auswählen"
                  />
                </label>

                <Link href={`/admin/social/reels/${r.id}`} className="block">
                  <div className="relative aspect-[9/16] bg-gray-100 dark:bg-gray-900 max-h-80">
                    {/* Hover-Preview Video, Fallback Thumbnail */}
                    {isHovered && r.video_url ? (
                      <video
                        src={r.video_url}
                        muted
                        autoPlay
                        loop
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : r.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-brand-steel dark:text-gray-500 text-sm">
                        {r.status === 'rendering' ? 'Rendert…' : 'Kein Video'}
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <StatusBadge status={r.status} />
                      {r.is_test && <span className="inline-flex items-center rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px] font-medium">TEST</span>}
                    </div>
                    {r.duration_seconds && (
                      <div className="absolute bottom-2 right-2 rounded-full bg-black/60 text-white px-2 py-0.5 text-xs font-medium">
                        {r.duration_seconds}s
                      </div>
                    )}
                    {r.ai_generated && (
                      <div className="absolute bottom-2 left-2 rounded-full bg-violet-500 text-white px-2 py-0.5 text-[10px] font-medium">KI</div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-brand-dark dark:text-white line-clamp-2">
                      {r.caption || <span className="italic text-brand-steel dark:text-gray-500">Keine Caption</span>}
                    </p>
                    {hint && (
                      <p className={`text-xs mt-2 font-medium ${hint.cls}`}>{hint.text}</p>
                    )}
                    <div className="flex items-center justify-between mt-2 text-xs text-brand-steel dark:text-gray-500">
                      <span>{fmtDateTime(r.published_at ?? r.scheduled_at ?? r.created_at)}</span>
                      <span className="uppercase tracking-wide">{r.template_type === 'motion_graphics' ? 'Motion' : 'Stock'}</span>
                    </div>
                    {r.error_message && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-400 line-clamp-2">{r.error_message}</p>
                    )}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

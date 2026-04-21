'use client';

import { useEffect, useState } from 'react';
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

export default function ReelsListPage() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const url = new URL('/api/admin/reels', window.location.origin);
    if (statusFilter) url.searchParams.set('status', statusFilter);
    url.searchParams.set('limit', '100');
    try {
      const res = await fetch(url.toString());
      const body = await res.json();
      if (res.ok) setReels(body.reels ?? []);
    } catch (err) {
      console.error('[reels-list]', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  // Auto-Refresh wenn gerade was rendert
  useEffect(() => {
    if (!reels.some((r) => r.status === 'rendering' || r.status === 'publishing')) return;
    const t = setTimeout(() => load(), 5000);
    return () => clearTimeout(t);
  }, [reels]);

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

      {/* Status-Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              statusFilter === f.value
                ? 'bg-brand-dark text-white dark:bg-cyan-600'
                : 'bg-white dark:bg-gray-800 text-brand-steel dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-brand-steel dark:text-gray-400">Lade Reels…</div>
      ) : reels.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-brand-steel dark:text-gray-400 mb-4">Noch keine Reels vorhanden.</p>
          <Link
            href="/admin/social/reels/neu"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange/90"
          >
            Erstes Reel generieren
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reels.map((r) => (
            <Link
              key={r.id}
              href={`/admin/social/reels/${r.id}`}
              className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition"
            >
              <div className="relative aspect-[9/16] bg-gray-100 dark:bg-gray-900 max-h-80">
                {r.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-brand-steel dark:text-gray-500 text-sm">
                    {r.status === 'rendering' ? 'Rendert…' : 'Kein Video'}
                  </div>
                )}
                <div className="absolute top-2 left-2 flex gap-1">
                  <StatusBadge status={r.status} />
                  {r.is_test && <span className="inline-flex items-center rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px] font-medium">TEST</span>}
                </div>
                {r.duration_seconds && (
                  <div className="absolute bottom-2 right-2 rounded-full bg-black/60 text-white px-2 py-0.5 text-xs font-medium">
                    {r.duration_seconds}s
                  </div>
                )}
                {r.ai_generated && (
                  <div className="absolute top-2 right-2 rounded-full bg-violet-500 text-white px-2 py-0.5 text-[10px] font-medium">KI</div>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm text-brand-dark dark:text-white line-clamp-2">
                  {r.caption || <span className="italic text-brand-steel dark:text-gray-500">Keine Caption</span>}
                </p>
                <div className="flex items-center justify-between mt-2 text-xs text-brand-steel dark:text-gray-500">
                  <span>{fmtDateTime(r.published_at ?? r.scheduled_at ?? r.created_at)}</span>
                  <span className="uppercase tracking-wide">{r.template_type === 'motion_graphics' ? 'Motion' : 'Stock'}</span>
                </div>
                {r.error_message && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400 line-clamp-2">{r.error_message}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

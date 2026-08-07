'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';
import { usePersistentState } from '@/lib/use-persistent-state';

interface SocialPost {
  id: string;
  caption: string;
  media_urls: string[];
  status: string;
  platforms: string[];
  scheduled_at?: string | null;
  published_at?: string | null;
  created_at: string;
  source_type: string;
  ai_generated: boolean;
  error_message?: string | null;
}

const STATUS_FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'draft', label: 'Entwürfe' },
  { value: 'scheduled', label: 'Geplant' },
  { value: 'published', label: 'Veröffentlicht' },
  { value: 'failed', label: 'Fehler' },
];

export default function SocialPostsList() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [statusFilter, setStatusFilter] = usePersistentState('admin:social-posts:statusFilter', '');
  const [loading, setLoading] = useState(true);
  const postsReqIdRef = useRef(0);

  async function load() {
    const myId = ++postsReqIdRef.current;
    setLoading(true);
    const url = new URL('/api/admin/social/posts', window.location.origin);
    if (statusFilter) url.searchParams.set('status', statusFilter);
    url.searchParams.set('limit', '100');
    const res = await fetch(url.toString());
    if (myId !== postsReqIdRef.current) return;
    const data = await res.json();
    if (myId !== postsReqIdRef.current) return;
    setPosts(data.posts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />
      <div className="flex items-center justify-between mb-4 mt-4">
        <h1 className="text-2xl font-bold text-admin-heading">Posts</h1>
        <Link
          href="/admin/social/neu"
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500"
        >
          + Neuer Post
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border"
            style={
              statusFilter === f.value
                ? { background: 'var(--admin-accent-soft)', color: 'var(--admin-accent)', borderColor: 'var(--admin-accent)' }
                : { background: 'transparent', color: 'var(--admin-muted)', borderColor: 'var(--admin-faint)' }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-admin-muted">Lade…</p>}

      {!loading && posts.length === 0 && (
        <div className="rounded-xl bg-slate-900/50 border border-admin-border p-8 text-center">
          <p className="text-admin-muted">Keine Posts in dieser Kategorie.</p>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="space-y-2">
          {posts.map((p) => (
            <Link
              key={p.id}
              href={`/admin/social/posts/${p.id}`}
              className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-admin-border hover:border-[var(--admin-faint)]"
            >
              {p.media_urls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media_urls[0]} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-admin-surface-2 flex items-center justify-center text-admin-muted-2 text-xs">
                  Text
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-admin-text line-clamp-2">{p.caption || '(leer)'}</p>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-[var(--admin-text-dim)] flex-wrap">
                  <StatusBadge status={p.status} />
                  <span>•</span>
                  <span>{(p.platforms ?? []).map((pl) => (pl === 'facebook' ? 'FB' : 'IG')).join(' + ')}</span>
                  <span>•</span>
                  <span>
                    {p.published_at
                      ? fmtDateTime(p.published_at)
                      : p.scheduled_at
                      ? 'Geplant: ' + fmtDateTime(p.scheduled_at)
                      : fmtDateTime(p.created_at)}
                  </span>
                  {p.ai_generated && <span className="px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 text-[10px]">KI</span>}
                  {p.source_type !== 'manual' && (
                    <span className="px-1.5 py-0.5 rounded bg-admin-surface-2 text-admin-muted text-[10px]">{p.source_type}</span>
                  )}
                </div>
                {p.error_message && (
                  <p className="text-xs text-red-400 mt-1 line-clamp-1">⚠ {p.error_message}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Entwurf', className: 'bg-admin-surface-2 text-admin-text-2' },
    scheduled: { label: 'Geplant', className: 'bg-cyan-900/40 text-cyan-300' },
    publishing: { label: 'Wird veröffentlicht', className: 'bg-amber-900/40 text-amber-300' },
    published: { label: 'Veröffentlicht', className: 'bg-emerald-900/40 text-emerald-300' },
    partial: { label: 'Teilweise', className: 'bg-amber-900/40 text-amber-300' },
    failed: { label: 'Fehler', className: 'bg-red-900/40 text-red-300' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-admin-surface-2 text-admin-text-2' };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.className}`}>{cfg.label}</span>;
}

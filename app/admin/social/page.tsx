'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDateTime } from '@/lib/format-utils';

interface SocialAccount {
  id: string;
  platform: 'facebook' | 'instagram';
  name: string;
  username?: string | null;
}

interface SocialPost {
  id: string;
  caption: string;
  status: string;
  platforms: string[];
  scheduled_at?: string | null;
  published_at?: string | null;
  created_at: string;
}

export default function SocialDashboard() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [accRes, postsRes] = await Promise.all([
          fetch('/api/admin/social/accounts').then((r) => r.json()),
          fetch('/api/admin/social/posts?limit=10').then((r) => r.json()),
        ]);
        setAccounts(accRes.accounts ?? []);
        setPosts(postsRes.posts ?? []);
      } catch {
        // leer
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const hasAccounts = accounts.length > 0;
  const scheduled = posts.filter((p) => p.status === 'scheduled');
  const drafts = posts.filter((p) => p.status === 'draft');
  const published = posts.filter((p) => p.status === 'published');
  const failed = posts.filter((p) => p.status === 'failed');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <AdminBackLink />
      <h1 className="text-2xl font-bold text-white mb-1 mt-4">Social Media</h1>
      <p className="text-sm text-slate-400 mb-6">
        Automatische Posts auf Facebook + Instagram.
      </p>

      {!loading && !hasAccounts && (
        <div className="mb-6 rounded-xl bg-amber-900/20 border border-amber-700/60 p-5">
          <h2 className="font-semibold text-amber-300 mb-1">Noch keine Konten verbunden</h2>
          <p className="text-sm text-amber-200/80 mb-3">
            Verbinde deine Facebook-Seite + Instagram Business Account, um loszulegen.
          </p>
          <Link
            href="/admin/social/einstellungen"
            className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500"
          >
            Jetzt verbinden
          </Link>
        </div>
      )}

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Veröffentlicht" value={published.length} color="emerald" />
        <KpiCard label="Geplant" value={scheduled.length} color="cyan" />
        <KpiCard label="Entwürfe" value={drafts.length} color="slate" />
        <KpiCard label="Fehlgeschlagen" value={failed.length} color="red" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Link href="/admin/social/neu" className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm hover:bg-cyan-500">
          + Neuer Post
        </Link>
        <Link href="/admin/social/posts" className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 font-semibold text-sm hover:bg-slate-700 border border-slate-700">
          Alle Posts
        </Link>
        <Link href="/admin/social/redaktionsplan" className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 font-semibold text-sm hover:bg-slate-700 border border-slate-700">
          Redaktionsplan
        </Link>
      </div>

      {/* Verbundene Konten */}
      {hasAccounts && (
        <section className="mb-6">
          <h2 className="font-semibold text-white mb-3">Verbundene Konten</h2>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800 text-sm text-slate-200">
                <span className="text-xs font-bold" style={{ color: a.platform === 'facebook' ? '#1877f2' : '#e4405f' }}>
                  {a.platform === 'facebook' ? 'FB' : 'IG'}
                </span>
                {a.name} {a.username && <span className="text-slate-500">@{a.username}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Letzte Posts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Letzte Posts</h2>
          <Link href="/admin/social/posts" className="text-sm text-cyan-400 hover:text-cyan-300">
            Alle anzeigen →
          </Link>
        </div>

        {loading && <p className="text-slate-400">Lade…</p>}

        {!loading && posts.length === 0 && (
          <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-8 text-center">
            <p className="text-slate-400">Noch keine Posts erstellt.</p>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div className="space-y-2">
            {posts.slice(0, 5).map((p) => (
              <Link
                key={p.id}
                href={`/admin/social/posts/${p.id}`}
                className="block p-4 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 line-clamp-2">{p.caption || '(leer)'}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                      <StatusBadge status={p.status} />
                      <span>•</span>
                      <span>{(p.platforms ?? []).join(', ')}</span>
                      <span>•</span>
                      <span>
                        {p.published_at
                          ? fmtDateTime(p.published_at)
                          : p.scheduled_at
                          ? 'Geplant: ' + fmtDateTime(p.scheduled_at)
                          : fmtDateTime(p.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: 'emerald' | 'cyan' | 'slate' | 'red' }) {
  const colors = {
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    slate: 'text-slate-300',
    red: 'text-red-400',
  };
  return (
    <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Entwurf', className: 'bg-slate-800 text-slate-300' },
    scheduled: { label: 'Geplant', className: 'bg-cyan-900/40 text-cyan-300' },
    publishing: { label: 'Wird veröffentlicht…', className: 'bg-amber-900/40 text-amber-300' },
    published: { label: 'Veröffentlicht', className: 'bg-emerald-900/40 text-emerald-300' },
    partial: { label: 'Teilweise', className: 'bg-amber-900/40 text-amber-300' },
    failed: { label: 'Fehler', className: 'bg-red-900/40 text-red-300' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-slate-800 text-slate-300' };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.className}`}>{cfg.label}</span>;
}

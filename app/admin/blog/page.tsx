'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  total: number; published: number; draft: number; scheduled: number;
  pendingComments: number; totalViews: number;
}

interface RecentPost {
  id: string; title: string; status: string; created_at: string; view_count: number;
}

export default function BlogDashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, published: 0, draft: 0, scheduled: 0, pendingComments: 0, totalViews: 0 });
  const [recent, setRecent] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [postsRes, commentsRes] = await Promise.all([
        fetch('/api/admin/blog/posts'),
        fetch('/api/admin/blog/comments?status=pending'),
      ]);
      const postsData = await postsRes.json();
      const commentsData = await commentsRes.json();
      const posts = postsData.posts ?? [];
      const comments = commentsData.comments ?? [];

      setStats({
        total: posts.length,
        published: posts.filter((p: RecentPost) => p.status === 'published').length,
        draft: posts.filter((p: RecentPost) => p.status === 'draft').length,
        scheduled: posts.filter((p: RecentPost) => p.status === 'scheduled').length,
        pendingComments: comments.length,
        totalViews: posts.reduce((sum: number, p: RecentPost) => sum + (p.view_count || 0), 0),
      });
      setRecent(posts.slice(0, 5));
      setLoading(false);
    }
    load();
  }, []);

  const statCards = [
    { label: 'Gesamt', value: stats.total, color: '#e2e8f0' },
    { label: 'Live', value: stats.published, color: '#22c55e' },
    { label: 'Entwuerfe', value: stats.draft, color: '#f59e0b' },
    { label: 'Geplant', value: stats.scheduled, color: '#06b6d4' },
    { label: 'Kommentare', value: stats.pendingComments, color: '#ef4444' },
    { label: 'Views', value: stats.totalViews, color: '#a78bfa' },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-bold text-2xl" style={{ color: 'white' }}>Blog-Dashboard</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>Uebersicht ueber alle Blog-Aktivitaeten</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/blog/artikel/neu" className="px-4 py-2 rounded-lg text-sm font-heading font-semibold" style={{ background: '#06b6d4', color: 'white' }}>
            + Neuer Artikel
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#64748b' }} className="text-sm">Laden...</p>
      ) : (
        <>
          {/* Statistik-Karten */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-xl p-4" style={{ background: '#1e293b' }}>
                <p className="text-xs font-heading font-semibold uppercase mb-1" style={{ color: '#94a3b8' }}>{card.label}</p>
                <p className="text-2xl font-heading font-bold" style={{ color: card.color }}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Letzte Artikel */}
          <div className="rounded-xl p-6" style={{ background: '#1e293b' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-semibold" style={{ color: '#e2e8f0' }}>Letzte Artikel</h2>
              <Link href="/admin/blog/artikel" className="text-xs font-heading" style={{ color: '#06b6d4' }}>Alle anzeigen</Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm" style={{ color: '#475569' }}>Noch keine Artikel.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((post) => (
                  <Link key={post.id} href={`/admin/blog/artikel/${post.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                    <span className="font-heading text-sm truncate" style={{ color: '#e2e8f0' }}>{post.title}</span>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="text-xs" style={{ color: '#475569' }}>{post.view_count} Views</span>
                      <span className="text-xs" style={{ color: '#475569' }}>{new Date(post.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

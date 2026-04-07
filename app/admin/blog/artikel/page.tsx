'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

const inputStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
  borderRadius: 8, padding: '8px 12px', fontSize: 14,
};

interface Post {
  id: string; title: string; slug: string; status: string;
  category_id: string | null; ai_generated: boolean;
  view_count: number; created_at: string; published_at: string | null;
  blog_categories?: { id: string; name: string; color: string } | null;
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: 'Entwurf', bg: '#f59e0b20', color: '#f59e0b' },
  published: { label: 'Live', bg: '#22c55e20', color: '#22c55e' },
  scheduled: { label: 'Geplant', bg: '#06b6d420', color: '#06b6d4' },
};

export default function BlogArtikelPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('status', filter);
    if (search) params.set('search', search);
    const res = await fetch(`/api/admin/blog/posts?${params}`);
    const data = await res.json();
    setPosts(data.posts ?? []);
    setLoading(false);
  }, [filter, search]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  async function deletePost(id: string) {
    if (!confirm('Artikel wirklich loeschen?')) return;
    await fetch(`/api/admin/blog/posts/${id}`, { method: 'DELETE' });
    loadPosts();
  }

  async function togglePublish(post: Post) {
    const newStatus = post.status === 'published' ? 'draft' : 'published';
    await fetch(`/api/admin/blog/posts/${post.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    loadPosts();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl" style={{ color: 'white' }}>Artikel</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>{posts.length} Artikel insgesamt</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/blog/artikel/neu"
            className="px-4 py-2 rounded-lg text-sm font-heading font-semibold"
            style={{ background: '#06b6d4', color: 'white' }}
          >
            + Neuer Artikel
          </Link>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-6">
        <input
          style={{ ...inputStyle, width: 280 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Artikel suchen..."
        />
        <div className="flex gap-1">
          {['all', 'draft', 'published', 'scheduled'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="px-3 py-2 rounded-lg text-xs font-heading font-semibold transition-colors"
              style={filter === s ? { background: '#06b6d4', color: 'white' } : { background: '#1e293b', color: '#94a3b8' }}
            >
              {s === 'all' ? 'Alle' : STATUS_LABELS[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <p style={{ color: '#64748b' }} className="text-sm">Laden...</p>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <p style={{ color: '#475569' }} className="text-sm mb-4">Noch keine Artikel vorhanden.</p>
          <Link href="/admin/blog/artikel/neu" className="px-4 py-2 rounded-lg text-sm font-heading font-semibold" style={{ background: '#06b6d4', color: 'white' }}>
            Ersten Artikel erstellen
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const s = STATUS_LABELS[post.status] ?? STATUS_LABELS.draft;
            return (
              <div key={post.id} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: '#1e293b' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/blog/artikel/${post.id}`} className="font-heading font-semibold text-sm truncate hover:underline" style={{ color: '#e2e8f0' }}>
                      {post.title}
                    </Link>
                    <span className="px-2 py-0.5 rounded text-xs font-heading shrink-0" style={{ background: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                    {post.ai_generated && (
                      <span className="px-2 py-0.5 rounded text-xs font-heading shrink-0" style={{ background: '#8b5cf620', color: '#a78bfa' }}>KI</span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1">
                    {post.blog_categories && (
                      <span className="text-xs" style={{ color: post.blog_categories.color }}>{post.blog_categories.name}</span>
                    )}
                    <span className="text-xs" style={{ color: '#475569' }}>
                      {post.published_at
                        ? new Date(post.published_at).toLocaleDateString('de-DE')
                        : new Date(post.created_at).toLocaleDateString('de-DE')}
                    </span>
                    <span className="text-xs" style={{ color: '#475569' }}>{post.view_count} Views</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => togglePublish(post)}
                    className="px-3 py-1 rounded text-xs font-heading font-semibold"
                    style={post.status === 'published'
                      ? { background: '#f59e0b20', color: '#f59e0b' }
                      : { background: '#22c55e20', color: '#22c55e' }}
                  >
                    {post.status === 'published' ? 'Zurueckziehen' : 'Veroeffentlichen'}
                  </button>
                  <Link
                    href={`/admin/blog/artikel/${post.id}`}
                    className="px-3 py-1 rounded text-xs font-heading font-semibold"
                    style={{ background: '#334155', color: '#e2e8f0' }}
                  >
                    Bearbeiten
                  </Link>
                  <button
                    onClick={() => deletePost(post.id)}
                    className="px-3 py-1 rounded text-xs font-heading font-semibold"
                    style={{ background: '#ef444420', color: '#ef4444' }}
                  >
                    Loeschen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

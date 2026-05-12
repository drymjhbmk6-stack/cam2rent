'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface Post {
  id: string; title: string; slug: string; status: string;
  category_id: string | null; ai_generated: boolean;
  view_count: number; created_at: string; published_at: string | null;
  blog_categories?: { id: string; name: string; color: string } | null;
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: 'Entwurf',  bg: '#f59e0b20', color: '#f59e0b' },
  published: { label: 'Live',     bg: '#22c55e20', color: '#22c55e' },
  scheduled: { label: 'Geplant',  bg: '#06b6d420', color: '#06b6d4' },
};

export default function BlogArtikelPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/blog/posts?limit=500');
    const data = await res.json();
    setPosts(data.posts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  async function deletePost(id: string) {
    if (!confirm('Artikel wirklich löschen?')) return;
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

  function togglePost(id: string) {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleCategory(name: string) {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  // Filter
  const filtered = useMemo(() => posts.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.title.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [posts, filter, search]);

  // Counts per status for filter chips
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts.length };
    for (const p of posts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [posts]);

  // Group by category
  const groups = useMemo(() => {
    const map = new Map<string, { color: string; posts: Post[] }>();
    for (const p of filtered) {
      const name = p.blog_categories?.name ?? 'Ohne Kategorie';
      const color = p.blog_categories?.color ?? '#64748b';
      if (!map.has(name)) map.set(name, { color, posts: [] });
      map.get(name)!.posts.push(p);
    }
    // Sort: named categories alphabetically, "Ohne Kategorie" last
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === 'Ohne Kategorie') return 1;
        if (b === 'Ohne Kategorie') return -1;
        return a.localeCompare(b, 'de');
      });
  }, [filtered]);

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <AdminBackLink href="/admin/blog" label="Zurück zum Blog" />

      <div className="flex items-center justify-between mt-4 mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl text-white">Artikel</h1>
          <p className="text-sm text-slate-500">{filtered.length} von {posts.length} Artikeln</p>
        </div>
        <Link
          href="/admin/blog/artikel/neu"
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#06b6d4', color: 'white' }}
        >
          + Neuer Artikel
        </Link>
      </div>

      {/* Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Artikel suchen…"
          className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-sm placeholder-slate-500 outline-none focus:border-cyan-600"
        />
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {(['all', 'draft', 'published', 'scheduled'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
              style={filter === s
                ? { background: '#06b6d4', color: 'white' }
                : { background: '#1e293b', color: '#94a3b8' }}
            >
              {s === 'all' ? 'Alle' : STATUS_LABELS[s]?.label}
              {counts[s] !== undefined && (
                <span className="ml-1 opacity-60">{counts[s]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-slate-500">Laden…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-slate-500 mb-4">Keine Artikel gefunden.</p>
          <Link href="/admin/blog/artikel/neu" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#06b6d4', color: 'white' }}>
            Ersten Artikel erstellen
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(([catName, { color, posts: catPosts }]) => {
            const isCatCollapsed = collapsedCategories.has(catName);
            return (
              <div key={catName} className="rounded-xl overflow-hidden border border-slate-800">
                {/* Kategorie-Header */}
                <button
                  type="button"
                  onClick={() => toggleCategory(catName)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/80 hover:bg-slate-800/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-sm font-semibold text-slate-200">{catName}</span>
                    <span className="text-xs text-slate-500">{catPosts.length}</span>
                  </div>
                  <span className="text-slate-500 text-xs transition-transform duration-200" style={{ display: 'inline-block', transform: isCatCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                    ▾
                  </span>
                </button>

                {/* Artikel in dieser Kategorie */}
                {!isCatCollapsed && (
                  <div className="divide-y divide-slate-800/60">
                    {catPosts.map(post => {
                      const isOpen = expandedPosts.has(post.id);
                      const s = STATUS_LABELS[post.status] ?? STATUS_LABELS.draft;
                      return (
                        <div key={post.id} className="bg-slate-950/40">
                          {/* Zusammengeklappte Zeile */}
                          <button
                            type="button"
                            onClick={() => togglePost(post.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors text-left"
                          >
                            <span
                              className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-0.5"
                              style={{ background: s.color }}
                            />
                            <span className="flex-1 text-sm text-slate-200 truncate leading-snug">
                              {post.title}
                            </span>
                            <span className="flex-shrink-0 text-xs text-slate-500 tabular-nums">
                              {post.view_count} Views
                            </span>
                            <span
                              className="flex-shrink-0 text-slate-600 text-xs transition-transform duration-150"
                              style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            >
                              ▾
                            </span>
                          </button>

                          {/* Aufgeklappter Detail-Bereich */}
                          {isOpen && (
                            <div className="px-4 pb-4 pt-1 border-t border-slate-800/40">
                              {/* Badges */}
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{ background: s.bg, color: s.color }}>
                                  {s.label}
                                </span>
                                {post.ai_generated && (
                                  <span className="px-2 py-0.5 rounded text-[11px]" style={{ background: '#8b5cf620', color: '#a78bfa' }}>KI</span>
                                )}
                                <span className="text-[11px] text-slate-500">
                                  {post.published_at
                                    ? new Date(post.published_at).toLocaleDateString('de-DE')
                                    : new Date(post.created_at).toLocaleDateString('de-DE')}
                                </span>
                              </div>

                              {/* Aktionen */}
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => togglePublish(post)}
                                  className="px-3 py-1.5 rounded text-xs font-semibold"
                                  style={post.status === 'published'
                                    ? { background: '#f59e0b20', color: '#f59e0b' }
                                    : { background: '#22c55e20', color: '#22c55e' }}
                                >
                                  {post.status === 'published' ? 'Zurückziehen' : 'Veröffentlichen'}
                                </button>
                                <Link
                                  href={`/admin/blog/artikel/${post.id}`}
                                  className="px-3 py-1.5 rounded text-xs font-semibold"
                                  style={{ background: '#334155', color: '#e2e8f0' }}
                                >
                                  Bearbeiten
                                </Link>
                                <button
                                  onClick={() => deletePost(post.id)}
                                  className="px-3 py-1.5 rounded text-xs font-semibold"
                                  style={{ background: '#ef444420', color: '#ef4444' }}
                                >
                                  Löschen
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Post {
  id: string; title: string; slug: string; excerpt: string;
  featured_image: string | null; featured_image_alt: string;
  tags: string[]; author: string; reading_time_min: number;
  published_at: string;
  blog_categories?: { id: string; name: string; slug: string; color: string } | null;
}

interface Category {
  id: string; name: string; slug: string; color: string;
}

export default function BlogOverview() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/blog/categories').then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '9' });
    if (activeCat) params.set('category', activeCat);
    fetch(`/api/blog/posts?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setPosts(d.posts ?? []);
        setTotalPages(d.totalPages ?? 1);
        setLoading(false);
      });
  }, [page, activeCat]);

  function selectCategory(slug: string) {
    setActiveCat(slug === activeCat ? '' : slug);
    setPage(1);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="font-heading font-bold text-4xl md:text-5xl text-brand-black dark:text-white mb-4">
          Blog
        </h1>
        <p className="text-brand-steel dark:text-gray-400 text-lg max-w-2xl mx-auto">
          Tipps, Vergleiche und Neuigkeiten rund um Action-Kameras
        </p>
      </div>

      {/* Kategorie-Filter */}
      {categories.length > 0 && (
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          <button
            onClick={() => selectCategory('')}
            className="px-4 py-2 rounded-full text-sm font-heading font-semibold whitespace-nowrap transition-colors"
            style={!activeCat
              ? { background: '#FF5C00', color: 'white' }
              : { background: '#f1f5f9', color: '#64748b' }}
          >
            Alle
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => selectCategory(cat.slug)}
              className="px-4 py-2 rounded-full text-sm font-heading font-semibold whitespace-nowrap transition-colors"
              style={activeCat === cat.slug
                ? { background: cat.color, color: 'white' }
                : { background: '#f1f5f9', color: '#64748b' }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Artikel-Grid */}
      {loading ? (
        <div className="text-center py-16">
          <p className="text-brand-steel">Artikel werden geladen...</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-brand-steel dark:text-gray-400 text-lg">Noch keine Artikel vorhanden.</p>
          <p className="text-brand-muted dark:text-gray-500 mt-2">Schau bald wieder vorbei!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="group">
              <article className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow border border-gray-100 dark:border-gray-800">
                {/* Bild */}
                <div className="relative h-48 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  {post.featured_image ? (
                    <Image
                      src={post.featured_image}
                      alt={post.featured_image_alt || post.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl" style={{ color: '#FF5C00' }}>cam2rent</span>
                    </div>
                  )}
                  {post.blog_categories && (
                    <span
                      className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-heading font-semibold text-white"
                      style={{ background: post.blog_categories.color }}
                    >
                      {post.blog_categories.name}
                    </span>
                  )}
                </div>

                {/* Inhalt */}
                <div className="p-5">
                  <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-2 group-hover:text-[#FF5C00] transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-sm text-brand-steel dark:text-gray-400 mb-4 line-clamp-3">
                      {post.excerpt}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-brand-muted dark:text-gray-500">
                    <span>{new Date(post.published_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <span>{post.reading_time_min} Min. Lesezeit</span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-12">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors disabled:opacity-30"
            style={{ background: '#f1f5f9', color: '#334155' }}
          >
            Zurueck
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className="w-10 h-10 rounded-lg text-sm font-heading font-semibold transition-colors"
              style={p === page
                ? { background: '#FF5C00', color: 'white' }
                : { background: '#f1f5f9', color: '#334155' }}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors disabled:opacity-30"
            style={{ background: '#f1f5f9', color: '#334155' }}
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}

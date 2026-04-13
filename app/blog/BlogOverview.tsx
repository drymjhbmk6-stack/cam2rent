'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { SeasonalImage } from '@/lib/seasonal-themes';

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
  const [seasonalImage, setSeasonalImage] = useState<SeasonalImage | null>(null);

  useEffect(() => {
    fetch('/api/admin/blog/categories').then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
    fetch('/api/seasonal-images?zone=blog')
      .then((r) => r.json())
      .then((d) => { if (d.image) setSeasonalImage(d.image); })
      .catch(() => {});
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

  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <>
      {/* Hero mit optionalem saisonalem Hintergrundbild */}
      <section className="relative bg-brand-black dark:bg-gray-950 text-white py-16 sm:py-20 overflow-hidden">
        {seasonalImage && (
          <>
            <Image
              src={seasonalImage.url}
              alt={seasonalImage.alt || 'Blog Header'}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-black/65" />
          </>
        )}
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading font-bold text-4xl sm:text-5xl mb-4 text-white drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            Blog
          </h1>
          <p className="font-body text-white/90 text-lg max-w-xl mx-auto drop-shadow-md">
            Tipps, Vergleiche und Neuigkeiten rund um Action-Kameras &mdash; von Experten für Abenteurer.
          </p>
          {seasonalImage?.source === 'unsplash' && seasonalImage.photographer && (
            <div className="absolute bottom-3 right-4 px-2 py-1 rounded bg-black/40 backdrop-blur-sm">
              <span className="text-[10px] text-white/50 font-body">
                Foto: {seasonalImage.photographer}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Kategorie-Filter */}
      {categories.length > 0 && (
        <div className="sticky top-[72px] z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-brand-border dark:border-gray-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-1 py-3 overflow-x-auto no-scrollbar">
              <button
                onClick={() => selectCategory('')}
                className={`px-4 py-1.5 rounded-full text-sm font-heading font-semibold whitespace-nowrap transition-colors ${
                  !activeCat
                    ? 'bg-brand-black dark:bg-accent-blue text-white'
                    : 'text-brand-steel dark:text-gray-400 hover:bg-brand-bg dark:hover:bg-white/5'
                }`}
              >
                Alle Artikel
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat.slug)}
                  className="px-4 py-1.5 rounded-full text-sm font-heading font-semibold whitespace-nowrap transition-colors"
                  style={activeCat === cat.slug
                    ? { background: cat.color, color: 'white' }
                    : undefined}
                >
                  <span className={activeCat === cat.slug ? '' : 'text-brand-steel dark:text-gray-400 hover:text-brand-black dark:hover:text-white'}>
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Inhalt */}
      <section className="bg-white dark:bg-gray-900 py-12 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

          {loading ? (
            <div className="text-center py-20">
              <div className="inline-block w-6 h-6 border-2 border-brand-muted border-t-accent-blue rounded-full animate-spin" />
              <p className="text-brand-steel dark:text-gray-400 text-sm mt-4 font-body">Artikel werden geladen...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-bg dark:bg-white/5 flex items-center justify-center">
                <svg className="w-7 h-7 text-brand-muted dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
              <p className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-2">Noch keine Artikel</p>
              <p className="text-brand-steel dark:text-gray-400 text-sm">Schau bald wieder vorbei &mdash; wir arbeiten an spannenden Inhalten!</p>
            </div>
          ) : (
            <>
              {/* Featured-Artikel (erster Post gross) */}
              {featured && page === 1 && !activeCat && (
                <Link href={`/blog/${featured.slug}`} className="group block mb-12">
                  <article className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-brand-bg/50 dark:bg-white/[0.03] rounded-card border border-brand-border/40 dark:border-white/5 overflow-hidden hover:shadow-card-hover transition-shadow">
                    <div className="relative h-56 md:h-full min-h-[280px] bg-brand-bg dark:bg-gray-800 overflow-hidden">
                      {featured.featured_image ? (
                        <Image
                          src={featured.featured_image}
                          alt={featured.featured_image_alt || featured.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          priority
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="font-heading font-black text-3xl text-brand-muted/50 dark:text-gray-700">
                            cam<span className="text-accent-blue/50">2</span>rent
                          </span>
                        </div>
                      )}
                      {featured.blog_categories && (
                        <span className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-heading font-semibold text-white" style={{ background: featured.blog_categories.color }}>
                          {featured.blog_categories.name}
                        </span>
                      )}
                    </div>
                    <div className="p-6 sm:p-8 flex flex-col justify-center">
                      <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-white mb-3 group-hover:text-accent-blue transition-colors leading-tight">
                        {featured.title}
                      </h2>
                      {featured.excerpt && (
                        <p className="font-body text-brand-steel dark:text-gray-400 mb-5 leading-relaxed line-clamp-3">
                          {featured.excerpt}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs font-body text-brand-muted dark:text-gray-500">
                        <span>{new Date(featured.published_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        <span className="w-1 h-1 rounded-full bg-brand-muted dark:bg-gray-600" />
                        <span>{featured.reading_time_min} Min. Lesezeit</span>
                      </div>
                    </div>
                  </article>
                </Link>
              )}

              {/* Artikel-Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {(page === 1 && !activeCat ? rest : posts).map((post) => (
                  <Link key={post.id} href={`/blog/${post.slug}`} className="group">
                    <article className="h-full bg-white dark:bg-gray-800/30 rounded-card overflow-hidden shadow-card dark:shadow-gray-900/50 border border-brand-border/40 dark:border-white/5 hover:shadow-card-hover transition-shadow flex flex-col">
                      <div className="relative h-44 bg-brand-bg dark:bg-gray-800 overflow-hidden flex-shrink-0">
                        {post.featured_image ? (
                          <Image
                            src={post.featured_image}
                            alt={post.featured_image_alt || post.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="font-heading font-black text-xl text-brand-muted/40 dark:text-gray-700">
                              cam<span className="text-accent-blue/40">2</span>rent
                            </span>
                          </div>
                        )}
                        {post.blog_categories && (
                          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-heading font-semibold text-white" style={{ background: post.blog_categories.color }}>
                            {post.blog_categories.name}
                          </span>
                        )}
                      </div>
                      <div className="p-5 flex flex-col flex-1">
                        <h2 className="font-heading font-bold text-base text-brand-black dark:text-white mb-2 group-hover:text-accent-blue transition-colors line-clamp-2">
                          {post.title}
                        </h2>
                        {post.excerpt && (
                          <p className="text-sm font-body text-brand-steel dark:text-gray-400 mb-4 line-clamp-2 flex-1">
                            {post.excerpt}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs font-body text-brand-muted dark:text-gray-500 mt-auto pt-3 border-t border-brand-border/40 dark:border-white/5">
                          <span>{new Date(post.published_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <span>{post.reading_time_min} Min.</span>
                        </div>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-14">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-btn text-sm font-heading font-semibold transition-colors disabled:opacity-30 bg-brand-bg dark:bg-white/5 text-brand-black dark:text-white hover:bg-brand-border dark:hover:bg-white/10"
              >
                Zurück
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 rounded-btn text-sm font-heading font-semibold transition-colors ${
                    p === page
                      ? 'bg-brand-black dark:bg-accent-blue text-white'
                      : 'bg-brand-bg dark:bg-white/5 text-brand-steel dark:text-gray-400 hover:bg-brand-border dark:hover:bg-white/10'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-btn text-sm font-heading font-semibold transition-colors disabled:opacity-30 bg-brand-bg dark:bg-white/5 text-brand-black dark:text-white hover:bg-brand-border dark:hover:bg-white/10"
              >
                Weiter
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

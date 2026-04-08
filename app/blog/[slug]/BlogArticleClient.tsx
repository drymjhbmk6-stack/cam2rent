'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import MarkdownContent from '@/components/MarkdownContent';

interface Post {
  id: string; title: string; slug: string; content: string; excerpt: string;
  featured_image: string | null; featured_image_alt: string;
  tags: string[]; author: string; reading_time_min: number;
  published_at: string;
  blog_categories?: { id: string; name: string; slug: string; color: string } | null;
}

interface RelatedPost {
  id: string; title: string; slug: string; featured_image: string | null; excerpt: string; published_at: string;
}

interface Comment {
  id: string; author_name: string; content: string; created_at: string;
}

export default function BlogArticleClient({ post, related }: { post: Post; related: RelatedPost[] }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentMsg, setCommentMsg] = useState('');

  useEffect(() => {
    fetch(`/api/blog/comments?post_id=${post.id}`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []));
  }, [post.id]);

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !commentText.trim()) return;
    setSubmitting(true);
    setCommentMsg('');

    const res = await fetch('/api/blog/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: post.id, author_name: name, author_email: email, content: commentText }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (res.ok) {
      setCommentMsg(data.message || 'Kommentar eingereicht!');
      setName(''); setEmail(''); setCommentText('');
    } else {
      setCommentMsg(data.error || 'Fehler beim Senden.');
    }
  }

  const formattedDate = new Date(post.published_at).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      {/* Breadcrumb */}
      <div className="bg-white dark:bg-gray-900 border-b border-brand-border dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <nav className="flex items-center gap-2 text-sm font-body text-brand-muted dark:text-gray-500">
            <Link href="/" className="hover:text-accent-blue transition-colors">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-accent-blue transition-colors">Blog</Link>
            {post.blog_categories && (
              <>
                <span>/</span>
                <Link href={`/blog?category=${post.blog_categories.slug}`} className="hover:text-accent-blue transition-colors">
                  {post.blog_categories.name}
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>

      {/* Hero-Header */}
      <header className="bg-white dark:bg-gray-900 pt-10 pb-8 sm:pt-14 sm:pb-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Kategorie-Badge */}
          {post.blog_categories && (
            <Link
              href={`/blog?category=${post.blog_categories.slug}`}
              className="inline-block px-3 py-1 rounded-full text-xs font-heading font-semibold text-white mb-5 hover:opacity-90 transition-opacity"
              style={{ background: post.blog_categories.color }}
            >
              {post.blog_categories.name}
            </Link>
          )}

          {/* Titel */}
          <h1 className="font-heading font-bold text-3xl sm:text-4xl lg:text-[42px] text-brand-black dark:text-white leading-tight mb-6">
            {post.title}
          </h1>

          {/* Author-Zeile */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-black dark:bg-accent-blue flex items-center justify-center flex-shrink-0">
              <span className="text-white font-heading font-bold text-sm">
                {post.author.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-heading font-semibold text-brand-black dark:text-white">{post.author}</p>
              <div className="flex items-center gap-3 text-xs text-brand-muted dark:text-gray-500">
                <span>{formattedDate}</span>
                <span className="w-1 h-1 rounded-full bg-brand-muted dark:bg-gray-600" />
                <span>{post.reading_time_min} Min. Lesezeit</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Featured Image */}
      {post.featured_image && (
        <div className="bg-white dark:bg-gray-900 pb-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative w-full aspect-[2/1] rounded-card overflow-hidden shadow-card dark:shadow-gray-900/50">
              <Image
                src={post.featured_image}
                alt={post.featured_image_alt || post.title}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 896px) 100vw, 896px"
              />
            </div>
          </div>
        </div>
      )}

      {/* Artikel-Inhalt */}
      <article className="bg-white dark:bg-gray-900 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <MarkdownContent>{post.content}</MarkdownContent>
        </div>
      </article>

      {/* Tags + Teilen */}
      {post.tags?.length > 0 && (
        <div className="bg-white dark:bg-gray-900 pb-10">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="border-t border-brand-border dark:border-gray-800 pt-8">
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-3.5 py-1.5 rounded-full text-xs font-heading font-medium bg-brand-bg dark:bg-white/[0.06] text-brand-steel dark:text-gray-400 border border-brand-border/60 dark:border-white/10"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CTA-Bereich */}
      <section className="bg-brand-bg dark:bg-gray-800/40 py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-3">
            Bereit fuer dein Abenteuer?
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-400 mb-6 max-w-lg mx-auto">
            Miete die passende Action-Kamera fuer deinen naechsten Trip &mdash; flexibel, guenstig und ohne Risiko.
          </p>
          <Link
            href="/kameras"
            className="inline-flex items-center gap-2 px-7 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:opacity-90 transition-opacity"
          >
            Kameras entdecken
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Verwandte Artikel */}
      {related.length > 0 && (
        <section className="bg-white dark:bg-gray-900 py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-8">
              Das koennte dich auch interessieren
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {related.map((r) => (
                <Link key={r.id} href={`/blog/${r.slug}`} className="group">
                  <article className="bg-white dark:bg-gray-800/50 rounded-card overflow-hidden shadow-card dark:shadow-gray-900/50 border border-brand-border/40 dark:border-white/5 hover:shadow-card-hover transition-shadow">
                    <div className="relative h-40 bg-brand-bg dark:bg-gray-800 overflow-hidden">
                      {r.featured_image ? (
                        <Image src={r.featured_image} alt={r.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="font-heading font-black text-xl text-brand-muted dark:text-gray-600">
                            cam<span className="text-accent-blue">2</span>rent
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-white group-hover:text-accent-blue transition-colors line-clamp-2 mb-2">
                        {r.title}
                      </h3>
                      {r.excerpt && (
                        <p className="text-xs text-brand-steel dark:text-gray-400 line-clamp-2">{r.excerpt}</p>
                      )}
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Kommentare */}
      <section className="bg-brand-bg dark:bg-gray-950 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-8">
            Kommentare {comments.length > 0 && `(${comments.length})`}
          </h2>

          {/* Kommentar-Liste */}
          {comments.length > 0 && (
            <div className="space-y-4 mb-10">
              {comments.map((c) => (
                <div key={c.id} className="bg-white dark:bg-gray-900 rounded-card p-5 border border-brand-border/40 dark:border-white/5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-accent-blue/10 dark:bg-accent-blue/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-accent-blue text-xs font-heading font-bold">{c.author_name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <span className="font-heading font-semibold text-sm text-brand-black dark:text-white">{c.author_name}</span>
                      <span className="text-xs text-brand-muted dark:text-gray-500 ml-2">{new Date(c.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                  <p className="text-sm font-body text-brand-text dark:text-gray-300 leading-relaxed pl-11">{c.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Kommentar-Formular */}
          <form onSubmit={submitComment} className="bg-white dark:bg-gray-900 rounded-card p-6 sm:p-8 border border-brand-border/40 dark:border-white/5 shadow-card dark:shadow-gray-900/50">
            <h3 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-5">Deine Meinung ist gefragt</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-body font-medium text-brand-steel dark:text-gray-400 mb-1 block">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dein Name"
                  required
                  className="w-full px-4 py-2.5 rounded-btn border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-sm font-body text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                />
              </div>
              <div>
                <label className="text-xs font-body font-medium text-brand-steel dark:text-gray-400 mb-1 block">E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Wird nicht angezeigt"
                  required
                  className="w-full px-4 py-2.5 rounded-btn border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-sm font-body text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-body font-medium text-brand-steel dark:text-gray-400 mb-1 block">Kommentar</label>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Was denkst du dazu?"
                required
                rows={4}
                className="w-full px-4 py-2.5 rounded-btn border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-sm font-body text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue resize-y mb-4"
              />
            </div>
            {commentMsg && (
              <p className="text-sm font-body mb-3" style={{ color: commentMsg.includes('Fehler') ? '#ef4444' : '#22c55e' }}>
                {commentMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? 'Wird gesendet...' : 'Kommentar absenden'}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}

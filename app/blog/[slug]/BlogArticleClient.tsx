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

  return (
    <article className="max-w-4xl mx-auto px-4 py-12">
      {/* Zurueck-Link */}
      <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-brand-muted dark:text-gray-400 hover:text-[#FF5C00] transition-colors mb-8">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Zurueck zum Blog
      </Link>

      {/* Kategorie */}
      {post.blog_categories && (
        <Link
          href={`/blog?category=${post.blog_categories.slug}`}
          className="inline-block px-3 py-1 rounded-full text-xs font-heading font-semibold text-white mb-4"
          style={{ background: post.blog_categories.color }}
        >
          {post.blog_categories.name}
        </Link>
      )}

      {/* Titel */}
      <h1 className="font-heading font-bold text-3xl md:text-4xl text-brand-black dark:text-white mb-4 leading-tight">
        {post.title}
      </h1>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 text-sm text-brand-muted dark:text-gray-400 mb-8">
        <span>Von {post.author}</span>
        <span>{new Date(post.published_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <span>{post.reading_time_min} Min. Lesezeit</span>
      </div>

      {/* Featured Image */}
      {post.featured_image && (
        <div className="relative w-full h-64 md:h-96 rounded-2xl overflow-hidden mb-10">
          <Image
            src={post.featured_image}
            alt={post.featured_image_alt || post.title}
            fill
            className="object-cover"
            priority
          />
        </div>
      )}

      {/* Inhalt */}
      <div className="dark:[&_.prose]:prose-invert">
        <MarkdownContent>{post.content}</MarkdownContent>
      </div>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
          {post.tags.map((tag, i) => (
            <span key={i} className="px-3 py-1 rounded-full text-xs font-heading bg-gray-100 dark:bg-gray-800 text-brand-steel dark:text-gray-400">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Verwandte Artikel */}
      {related.length > 0 && (
        <div className="mt-16">
          <h2 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-6">Verwandte Artikel</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {related.map((r) => (
              <Link key={r.id} href={`/blog/${r.slug}`} className="group">
                <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-800">
                  <div className="relative h-32 bg-gray-100 dark:bg-gray-800">
                    {r.featured_image ? (
                      <Image src={r.featured_image} alt={r.title} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl" style={{ color: '#FF5C00' }}>cam2rent</div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-white group-hover:text-[#FF5C00] line-clamp-2">{r.title}</h3>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Kommentare */}
      <div className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-700">
        <h2 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-6">
          Kommentare ({comments.length})
        </h2>

        {/* Kommentar-Liste */}
        {comments.length > 0 && (
          <div className="space-y-4 mb-8">
            {comments.map((c) => (
              <div key={c.id} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-heading font-semibold text-sm text-brand-black dark:text-white">{c.author_name}</span>
                  <span className="text-xs text-brand-muted dark:text-gray-500">{new Date(c.created_at).toLocaleDateString('de-DE')}</span>
                </div>
                <p className="text-sm text-brand-steel dark:text-gray-400">{c.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Kommentar-Formular */}
        <form onSubmit={submitComment} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6">
          <h3 className="font-heading font-semibold text-lg text-brand-black dark:text-white mb-4">Kommentar schreiben</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dein Name"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5C00] text-brand-black dark:text-white"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Deine E-Mail (wird nicht angezeigt)"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5C00] text-brand-black dark:text-white"
            />
          </div>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Dein Kommentar..."
            required
            rows={4}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5C00] resize-y mb-4 text-brand-black dark:text-white"
          />
          {commentMsg && (
            <p className="text-sm mb-3" style={{ color: commentMsg.includes('Fehler') ? '#ef4444' : '#22c55e' }}>
              {commentMsg}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg font-heading font-semibold text-sm text-white transition-colors"
            style={{ background: '#FF5C00', opacity: submitting ? 0.5 : 1 }}
          >
            {submitting ? 'Wird gesendet...' : 'Kommentar absenden'}
          </button>
        </form>
      </div>
    </article>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import MarkdownContent from '@/components/MarkdownContent';
import { BlogCTA } from '@/components/blog';

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
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const authorInitials = post.author.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div style={{ background: '#0f172a' }}>
      {/* Breadcrumb */}
      <div style={{ background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-3">
          <nav className="flex items-center gap-2 text-xs font-body" style={{ color: '#64748b' }}>
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            {post.blog_categories && (
              <>
                <span>/</span>
                <Link href={`/blog?category=${post.blog_categories.slug}`} className="hover:text-white transition-colors">
                  {post.blog_categories.name}
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>

      {/* Hero */}
      <header style={{ background: '#0f172a' }}>
        <div className="max-w-[760px] mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-8">
          {/* Badge */}
          {post.blog_categories && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-heading font-semibold mb-5" style={{ border: '1px solid rgba(6,182,212,0.3)', color: '#06b6d4' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#06b6d4' }} />
              {post.blog_categories.name}
            </span>
          )}

          {/* Titel */}
          <h1 className="font-heading font-extrabold text-[1.7rem] sm:text-4xl lg:text-[2.6rem] leading-tight mb-5" style={{ color: '#f8fafc' }}>
            {post.title}
          </h1>

          {/* Untertitel / Excerpt */}
          {post.excerpt && (
            <p className="text-base sm:text-lg font-body mb-6" style={{ color: '#94a3b8', fontWeight: 300 }}>
              {post.excerpt}
            </p>
          )}

          {/* Meta-Zeile */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-heading font-bold text-xs" style={{ background: '#1e293b', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.2)' }}>
              {authorInitials}
            </div>
            <div className="flex items-center gap-2 text-xs font-body" style={{ color: '#64748b' }}>
              <span style={{ color: '#94a3b8' }}>{post.author}</span>
              <span>·</span>
              <span>{formattedDate}</span>
              <span>·</span>
              <span>{post.reading_time_min} Min. Lesezeit</span>
            </div>
          </div>
        </div>

        {/* Gradient Divider */}
        <div className="h-1" style={{ background: 'linear-gradient(90deg, #06b6d4 0%, #8b5cf6 50%, #06b6d4 100%)', opacity: 0.6 }} />
      </header>

      {/* Featured Image */}
      {post.featured_image && (
        <div style={{ background: '#0f172a' }} className="pb-8">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
            <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
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
      <article style={{ background: '#0f172a' }} className="pb-12">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6">
          <MarkdownContent>{post.content}</MarkdownContent>
        </div>
      </article>

      {/* CTA */}
      <div style={{ background: '#0f172a' }} className="pb-8">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6">
          <BlogCTA />
        </div>
      </div>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div style={{ background: '#0f172a' }} className="pb-10">
          <div className="max-w-[760px] mx-auto px-4 sm:px-6">
            <div className="flex flex-wrap gap-2 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {post.tags.map((tag, i) => (
                <span key={i} className="px-3 py-1.5 rounded-full text-xs font-heading" style={{ background: '#1e293b', color: '#64748b' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Verwandte Artikel */}
      {related.length > 0 && (
        <section style={{ background: '#111827', borderTop: '1px solid rgba(255,255,255,0.06)' }} className="py-14">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 className="font-heading font-bold text-xl mb-8" style={{ color: '#e2e8f0' }}>Das koennte dich auch interessieren</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {related.map((r) => (
                <Link key={r.id} href={`/blog/${r.slug}`} className="group">
                  <article className="rounded-xl overflow-hidden transition-all hover:translate-y-[-2px]" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="relative h-36 overflow-hidden" style={{ background: '#0f172a' }}>
                      {r.featured_image ? (
                        <Image src={r.featured_image} alt={r.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="font-heading font-black text-lg" style={{ color: '#334155' }}>cam<span style={{ color: '#06b6d4' }}>2</span>rent</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-heading font-semibold text-sm mb-1 group-hover:text-cyan-400 transition-colors line-clamp-2" style={{ color: '#e2e8f0' }}>{r.title}</h3>
                      <span className="text-[11px] font-body" style={{ color: '#64748b' }}>{new Date(r.published_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Kommentare */}
      <section style={{ background: '#0f172a', borderTop: '1px solid rgba(255,255,255,0.06)' }} className="py-14">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6">
          <h2 className="font-heading font-bold text-xl mb-8" style={{ color: '#e2e8f0' }}>
            Kommentare {comments.length > 0 && `(${comments.length})`}
          </h2>

          {comments.length > 0 && (
            <div className="space-y-4 mb-10">
              {comments.map((c) => (
                <div key={c.id} className="rounded-xl p-5" style={{ background: '#1e293b' }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-heading font-bold text-[11px]" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
                      {c.author_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-heading font-semibold text-sm" style={{ color: '#e2e8f0' }}>{c.author_name}</span>
                      <span className="text-xs ml-2" style={{ color: '#64748b' }}>{new Date(c.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                  <p className="text-sm font-body pl-11" style={{ color: '#94a3b8' }}>{c.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Kommentar-Formular */}
          <form onSubmit={submitComment} className="rounded-xl p-6 sm:p-8" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="font-heading font-semibold text-lg mb-5" style={{ color: '#e2e8f0' }}>Deine Meinung</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" required className="w-full px-4 py-2.5 rounded-lg text-sm font-body focus:outline-none focus:ring-1" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', focusRingColor: '#06b6d4' } as React.CSSProperties} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail (nicht sichtbar)" required className="w-full px-4 py-2.5 rounded-lg text-sm font-body focus:outline-none focus:ring-1" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
            </div>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Was denkst du?" required rows={4} className="w-full px-4 py-2.5 rounded-lg text-sm font-body focus:outline-none focus:ring-1 resize-y mb-4" style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
            {commentMsg && <p className="text-sm font-body mb-3" style={{ color: commentMsg.includes('Fehler') ? '#ef4444' : '#22c55e' }}>{commentMsg}</p>}
            <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-lg font-heading font-semibold text-sm transition-colors disabled:opacity-50" style={{ background: '#06b6d4', color: '#0f172a' }}>
              {submitting ? 'Wird gesendet...' : 'Kommentar absenden'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

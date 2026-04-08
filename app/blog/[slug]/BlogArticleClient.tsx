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
    <div className="bg-white dark:bg-[#0f172a]">
      {/* Breadcrumb */}
      <div className="bg-white dark:bg-[#0f172a] border-b border-brand-border dark:border-white/[0.06]">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-3">
          <nav className="flex items-center gap-2 text-xs font-body text-brand-muted dark:text-gray-500">
            <Link href="/" className="hover:text-brand-black dark:hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-brand-black dark:hover:text-white transition-colors">Blog</Link>
            {post.blog_categories && (
              <>
                <span>/</span>
                <Link href={`/blog?category=${post.blog_categories.slug}`} className="hover:text-brand-black dark:hover:text-white transition-colors">
                  {post.blog_categories.name}
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>

      {/* Hero */}
      <header className="bg-white dark:bg-[#0f172a]">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-8">
          {/* Badge */}
          {post.blog_categories && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-heading font-semibold mb-5 border border-accent-teal/30 text-accent-teal dark:border-cyan-400/30 dark:text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-teal dark:bg-cyan-400" />
              {post.blog_categories.name}
            </span>
          )}

          {/* Titel */}
          <h1 className="font-heading font-extrabold text-[1.7rem] sm:text-4xl lg:text-[2.6rem] leading-tight mb-5 text-brand-black dark:text-white">
            {post.title}
          </h1>

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-base sm:text-lg font-body font-light mb-6 text-brand-steel dark:text-gray-400">
              {post.excerpt}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-heading font-bold text-xs bg-brand-bg dark:bg-[#1e293b] text-accent-teal dark:text-cyan-400 border border-brand-border dark:border-cyan-400/20">
              {authorInitials}
            </div>
            <div className="flex items-center gap-2 text-xs font-body text-brand-muted dark:text-gray-500">
              <span className="text-brand-steel dark:text-gray-400">{post.author}</span>
              <span>·</span>
              <span>{formattedDate}</span>
              <span>·</span>
              <span>{post.reading_time_min} Min. Lesezeit</span>
            </div>
          </div>
        </div>

        {/* Gradient Divider */}
        <div className="h-1 opacity-60" style={{ background: 'linear-gradient(90deg, #06b6d4 0%, #8b5cf6 50%, #06b6d4 100%)' }} />
      </header>

      {/* Featured Image */}
      {post.featured_image && (
        <div className="bg-white dark:bg-[#0f172a] pb-8">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
            <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden border border-brand-border/40 dark:border-white/[0.06]">
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
      <article className="bg-white dark:bg-[#0f172a] pb-12">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6">
          <MarkdownContent>{post.content}</MarkdownContent>
        </div>
      </article>

      {/* CTA */}
      <div className="bg-white dark:bg-[#0f172a] pb-8">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6">
          <BlogCTA />
        </div>
      </div>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div className="bg-white dark:bg-[#0f172a] pb-10">
          <div className="max-w-[760px] mx-auto px-4 sm:px-6">
            <div className="flex flex-wrap gap-2 pt-6 border-t border-brand-border dark:border-white/[0.06]">
              {post.tags.map((tag, i) => (
                <span key={i} className="px-3 py-1.5 rounded-full text-xs font-heading bg-brand-bg dark:bg-[#1e293b] text-brand-muted dark:text-gray-500">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Verwandte Artikel */}
      {related.length > 0 && (
        <section className="bg-brand-bg dark:bg-[#111827] border-t border-brand-border dark:border-white/[0.06] py-14">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 className="font-heading font-bold text-xl mb-8 text-brand-black dark:text-white">Das koennte dich auch interessieren</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {related.map((r) => (
                <Link key={r.id} href={`/blog/${r.slug}`} className="group">
                  <article className="rounded-xl overflow-hidden transition-all hover:translate-y-[-2px] bg-white dark:bg-[#1e293b] border border-brand-border/40 dark:border-white/[0.06] shadow-card dark:shadow-none">
                    <div className="relative h-36 overflow-hidden bg-brand-bg dark:bg-[#0f172a]">
                      {r.featured_image ? (
                        <Image src={r.featured_image} alt={r.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="font-heading font-black text-lg text-brand-border dark:text-gray-700">cam<span className="text-accent-teal dark:text-cyan-400">2</span>rent</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-heading font-semibold text-sm mb-1 text-brand-black dark:text-white group-hover:text-accent-teal dark:group-hover:text-cyan-400 transition-colors line-clamp-2">{r.title}</h3>
                      <span className="text-[11px] font-body text-brand-muted dark:text-gray-500">{new Date(r.published_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Kommentare */}
      <section className="bg-white dark:bg-[#0f172a] border-t border-brand-border dark:border-white/[0.06] py-14">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6">
          <h2 className="font-heading font-bold text-xl mb-8 text-brand-black dark:text-white">
            Kommentare {comments.length > 0 && `(${comments.length})`}
          </h2>

          {comments.length > 0 && (
            <div className="space-y-4 mb-10">
              {comments.map((c) => (
                <div key={c.id} className="rounded-xl p-5 bg-brand-bg dark:bg-[#1e293b]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-heading font-bold text-[11px] bg-accent-teal/10 dark:bg-cyan-400/15 text-accent-teal dark:text-cyan-400">
                      {c.author_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-heading font-semibold text-sm text-brand-black dark:text-white">{c.author_name}</span>
                      <span className="text-xs ml-2 text-brand-muted dark:text-gray-500">{new Date(c.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                  <p className="text-sm font-body pl-11 text-brand-steel dark:text-gray-400">{c.content}</p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={submitComment} className="rounded-xl p-6 sm:p-8 bg-brand-bg dark:bg-[#1e293b] border border-brand-border/40 dark:border-white/[0.06]">
            <h3 className="font-heading font-semibold text-lg mb-5 text-brand-black dark:text-white">Deine Meinung</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" required className="w-full px-4 py-2.5 rounded-btn text-sm font-body bg-white dark:bg-[#0f172a] border border-brand-border dark:border-gray-700 text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-teal/30" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail (nicht sichtbar)" required className="w-full px-4 py-2.5 rounded-btn text-sm font-body bg-white dark:bg-[#0f172a] border border-brand-border dark:border-gray-700 text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-teal/30" />
            </div>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Was denkst du?" required rows={4} className="w-full px-4 py-2.5 rounded-btn text-sm font-body bg-white dark:bg-[#0f172a] border border-brand-border dark:border-gray-700 text-brand-black dark:text-white placeholder:text-brand-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-teal/30 resize-y mb-4" />
            {commentMsg && <p className="text-sm font-body mb-3" style={{ color: commentMsg.includes('Fehler') ? '#ef4444' : '#22c55e' }}>{commentMsg}</p>}
            <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-btn font-heading font-semibold text-sm transition-colors disabled:opacity-50 bg-brand-black dark:bg-cyan-500 text-white dark:text-[#0f172a] hover:opacity-90">
              {submitting ? 'Wird gesendet...' : 'Kommentar absenden'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { trackBlogView } from '@/lib/blog-view-tracking';
import BlogArticleClient from './BlogArticleClient';

interface BlogPost {
  id: string; title: string; slug: string; content: string; excerpt: string;
  featured_image: string | null; featured_image_alt: string;
  tags: string[]; author: string; reading_time_min: number;
  seo_title: string | null; seo_description: string | null;
  published_at: string; created_at: string; updated_at: string;
  blog_categories?: { id: string; name: string; slug: string; color: string } | null;
}

async function getPost(slug: string): Promise<BlogPost | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('*, blog_categories(id, name, slug, color)')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  return data as BlogPost | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Artikel nicht gefunden | cam2rent' };

  const title = post.seo_title || post.title;
  const description = post.seo_description || post.excerpt || '';

  return {
    title: `${title} | cam2rent Blog`,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      authors: [post.author],
      tags: post.tags,
      ...(post.featured_image ? { images: [{ url: post.featured_image, alt: post.featured_image_alt }] } : {}),
    },
  };
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  // Verwandte Artikel (gleiche Kategorie)
  let related: { id: string; title: string; slug: string; featured_image: string | null; excerpt: string; published_at: string }[] = [];
  if (post.blog_categories) {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('blog_posts')
      .select('id, title, slug, featured_image, excerpt, published_at')
      .eq('status', 'published')
      .eq('category_id', post.blog_categories.id)
      .neq('id', post.id)
      .order('published_at', { ascending: false })
      .limit(3);
    related = data ?? [];
  }

  // JSON-LD Structured Data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.featured_image ?? undefined,
    author: { '@type': 'Organization', name: post.author, url: 'https://cam2rent.de' },
    publisher: { '@type': 'Organization', name: 'cam2rent', url: 'https://cam2rent.de' },
    datePublished: post.published_at,
    dateModified: post.updated_at,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://cam2rent.de/blog/${post.slug}` },
    keywords: post.tags?.join(', '),
  };

  // View-Count + zeitgestempeltes Aufruf-Event erhöhen (fire-and-forget,
  // server-side). Bot vs. Mensch wird über den User-Agent getrennt gezählt
  // (lib/blog-view-tracking.ts): view_count = Gesamt, bot_view_count = nur Bots.
  const supabase = createServiceClient();
  const ua = (await headers()).get('user-agent');
  trackBlogView(supabase, {
    postId: post.id,
    slug: post.slug,
    userAgent: ua,
    currentViewCount: (post as unknown as { view_count: number }).view_count ?? 0,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // Sweep 8: </ + < + Unicode-Linebreaks escapen, sonst kann ein Blog-
          // Titel mit </script> den JSON-LD-Block aufbrechen und Fremd-JS
          // injizieren (Stored XSS).
          __html: JSON.stringify(jsonLd).replace(
            /[<>\u2028\u2029]/g,
            (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
          ),
        }}
      />
      <BlogArticleClient post={post} related={related} />
    </>
  );
}

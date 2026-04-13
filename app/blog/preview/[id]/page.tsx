import { createServiceClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import BlogArticleClient from '../../[slug]/BlogArticleClient';

export const dynamic = 'force-dynamic';

// Kein generateMetadata — Preview soll nicht indexiert werden

export default async function BlogPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Artikel laden (auch Entwürfe und geplante)
  const { data: post } = await supabase
    .from('blog_posts')
    .select('*, blog_categories(id, name, slug, color)')
    .eq('id', id)
    .single();

  if (!post) notFound();

  // Falls nicht veröffentlicht: published_at auf jetzt setzen für die Anzeige
  const previewPost = {
    ...post,
    published_at: post.published_at || new Date().toISOString(),
  };

  // Verwandte Artikel laden
  let related: { id: string; title: string; slug: string; featured_image: string | null; excerpt: string; published_at: string }[] = [];
  if (post.blog_categories) {
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

  return (
    <>
      {/* Preview-Banner */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2" style={{ background: '#f59e0b', color: '#0f172a' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-heading font-bold">VORSCHAU</span>
          <span className="text-xs font-body">
            {post.status === 'draft' && '(Entwurf — nicht veröffentlicht)'}
            {post.status === 'scheduled' && '(Geplant — noch nicht live)'}
            {post.status === 'published' && '(Veröffentlicht)'}
          </span>
        </div>
        <div className="flex gap-2">
          <a
            href={`/admin/blog/artikel/${id}`}
            className="px-3 py-1 rounded text-xs font-heading font-semibold"
            style={{ background: '#0f172a', color: '#f59e0b' }}
          >
            Bearbeiten
          </a>
          {post.status === 'published' && (
            <a
              href={`/blog/${post.slug}`}
              className="px-3 py-1 rounded text-xs font-heading font-semibold"
              style={{ background: '#0f172a', color: '#22c55e' }}
            >
              Live ansehen
            </a>
          )}
        </div>
      </div>
      <BlogArticleClient post={previewPost} related={related} />
    </>
  );
}

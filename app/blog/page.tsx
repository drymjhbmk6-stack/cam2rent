import type { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase';
import BlogOverview, { type Post, type Category } from './BlogOverview';

// ISR: neue veroeffentlichte Artikel erscheinen ohne Rebuild (spaetestens nach 5 Min).
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Blog | cam2rent – Action-Cam Verleih',
  description: 'Tipps, Vergleiche und Neuigkeiten rund um Action-Kameras. Erfahre alles über GoPro, DJI, Insta360 und mehr bei cam2rent.',
  openGraph: {
    title: 'Blog | cam2rent',
    description: 'Tipps, Vergleiche und Neuigkeiten rund um Action-Kameras.',
    type: 'website',
  },
};

const PAGE_SIZE = 9;

// Seite 1 der Artikel server-seitig laden, damit Titel + Teaser im initialen HTML stehen
// (Crawler/KI-Bots ohne JS sehen die Liste). Interaktive Pagination/Filter laufen weiter
// client-seitig ueber /api/blog/posts. Selbe Query wie app/api/blog/posts/route.ts.
async function loadInitialData(): Promise<{
  posts: Post[];
  totalPages: number;
  categories: Category[];
}> {
  try {
    const supabase = createServiceClient();
    const [postsRes, categoriesRes] = await Promise.all([
      supabase
        .from('blog_posts')
        .select(
          'id, title, slug, excerpt, featured_image, featured_image_alt, tags, author, reading_time_min, published_at, category_id, blog_categories(id, name, slug, color)',
          { count: 'exact' },
        )
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range(0, PAGE_SIZE - 1),
      supabase
        .from('blog_categories')
        .select('id, name, slug, color')
        .order('sort_order', { ascending: true }),
    ]);

    return {
      posts: (postsRes.data ?? []) as unknown as Post[],
      totalPages: Math.ceil((postsRes.count ?? 0) / PAGE_SIZE) || 1,
      categories: (categoriesRes.data ?? []) as unknown as Category[],
    };
  } catch {
    // Defensiv: bei DB-Problem rendert die Seite leer und der Client laedt nach.
    return { posts: [], totalPages: 1, categories: [] };
  }
}

export default async function BlogPage() {
  const { posts, totalPages, categories } = await loadInitialData();
  return (
    <BlogOverview
      initialPosts={posts}
      initialTotalPages={totalPages}
      initialCategories={categories}
    />
  );
}

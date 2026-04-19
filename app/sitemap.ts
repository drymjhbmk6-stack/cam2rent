import type { MetadataRoute } from 'next';
import { getProducts } from '@/lib/get-products';
import { createServiceClient } from '@/lib/supabase';

// Dynamisch zur Request-Zeit generieren (nicht beim Build).
// Sonst timeoutet der Build wenn Supabase kurz nicht erreichbar ist.
export const dynamic = 'force-dynamic';
// 1h Cache — Suchmaschinen holen sich sowieso alle paar Stunden eine neue Version
export const revalidate = 3600;

/** Promise mit Timeout wrappen, damit eine haengende DB-Verbindung den Build nicht blockt. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); }
    );
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://cam2rent.de';

  // Produkte laden (max 5s)
  const products = await withTimeout(getProducts(), 5000, [] as Awaited<ReturnType<typeof getProducts>>);

  // Blog-Posts laden (max 5s)
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceClient();
    type BlogPost = { slug: string; updated_at: string; published_at: string };
    const blogQuery = Promise.resolve().then(() =>
      supabase
        .from('blog_posts')
        .select('slug, updated_at, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
    ).then((res) => ({ data: (res.data as BlogPost[] | null) ?? [] }));
    const { data: posts } = await withTimeout(blogQuery, 5000, { data: [] as BlogPost[] });

    blogPages = (posts ?? []).map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at || post.published_at),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  } catch { /* DB nicht erreichbar */ }

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/kameras`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/kontakt`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/impressum`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/datenschutz`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/agb`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/widerruf`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/stornierung`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/haftungsbedingungen`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.4 },
    { url: `${baseUrl}/versand-zahlung`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/cookie-richtlinie`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
  ];

  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${baseUrl}/kameras/${product.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticPages, ...productPages, ...blogPages];
}

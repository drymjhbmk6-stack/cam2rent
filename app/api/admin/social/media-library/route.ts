/**
 * Media-Library fuer Social-Editor:
 * Liefert Bilder aus allen eigenen Quellen (Shop-Produkte, Sets, Blog-Artikel,
 * bereits generierte/hochgeladene Social-Bilder), damit der Admin direkt aus
 * der eigenen Bibliothek auswaehlen kann — ohne neu generieren oder vom PC
 * hochladen zu muessen.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

interface MediaItem {
  url: string;
  label: string;
  sublabel?: string;
}

interface LibraryResponse {
  products: MediaItem[];
  sets: MediaItem[];
  blog: MediaItem[];
  social: MediaItem[];
}

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const result: LibraryResponse = { products: [], sets: [], blog: [], social: [] };

  // 1) Shop-Produkte — alle images aus admin_config.products
  try {
    const { data } = await supabase.from('admin_config').select('value').eq('key', 'products').single();
    if (data?.value && typeof data.value === 'object') {
      const products = data.value as Record<string, { name: string; brand: string; images?: string[]; imageUrl?: string }>;
      for (const p of Object.values(products)) {
        const imgs = p.images?.length ? p.images : p.imageUrl ? [p.imageUrl] : [];
        for (const url of imgs) {
          if (!url) continue;
          result.products.push({
            url,
            label: `${p.brand} ${p.name}`,
            sublabel: 'Produkt',
          });
        }
      }
    }
  } catch (err) {
    console.warn('[media-library] products failed:', err);
  }

  // 2) Sets
  try {
    const { data } = await supabase.from('sets').select('id, name, image_url').not('image_url', 'is', null);
    for (const s of data ?? []) {
      if (!s.image_url) continue;
      result.sets.push({ url: s.image_url, label: s.name, sublabel: 'Set' });
    }
  } catch (err) {
    console.warn('[media-library] sets failed:', err);
  }

  // 3) Blog-Artikel
  try {
    const { data } = await supabase
      .from('blog_posts')
      .select('title, featured_image, published_at')
      .not('featured_image', 'is', null)
      .order('published_at', { ascending: false })
      .limit(60);
    for (const b of data ?? []) {
      if (!b.featured_image) continue;
      result.blog.push({
        url: b.featured_image,
        label: b.title,
        sublabel: 'Blog',
      });
    }
  } catch (err) {
    console.warn('[media-library] blog failed:', err);
  }

  // 4) Bereits generierte/hochgeladene Social-Bilder im blog-images Bucket
  try {
    const { data } = await supabase.storage.from('blog-images').list('', {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    for (const obj of data ?? []) {
      if (!obj.name?.startsWith('social-')) continue;
      const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(obj.name);
      if (!urlData?.publicUrl) continue;
      result.social.push({
        url: urlData.publicUrl,
        label: obj.name,
        sublabel: 'Social-Upload',
      });
    }
  } catch (err) {
    console.warn('[media-library] storage failed:', err);
  }

  return NextResponse.json(result);
}

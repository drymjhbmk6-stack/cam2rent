import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

async function getUnsplashKey(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'blog_settings')
    .single();
  if (!data?.value) return null;
  try {
    const settings = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return settings?.unsplash_access_key || null;
  } catch {
    return null;
  }
}

/**
 * GET /api/admin/seasonal-images/search?query=...&page=1
 * Sucht Unsplash-Bilder fuer saisonale Bilder.
 */
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query');
  const page = req.nextUrl.searchParams.get('page') ?? '1';

  if (!query) {
    return NextResponse.json({ error: 'Suchbegriff ist erforderlich.' }, { status: 400 });
  }

  const accessKey = await getUnsplashKey();
  if (!accessKey) {
    return NextResponse.json(
      { error: 'Unsplash API Key nicht konfiguriert. Bitte unter Blog → Einstellungen hinterlegen.' },
      { status: 400 },
    );
  }

  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=12&orientation=landscape`,
    { headers: { Authorization: `Client-ID ${accessKey}` } },
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Unsplash-Suche fehlgeschlagen.' }, { status: 500 });
  }

  const data = await res.json();
  const images = data.results.map(
    (img: {
      id: string;
      urls: { small: string; regular: string; full: string };
      alt_description: string | null;
      user: { name: string; links: { html: string } };
      links: { download_location: string };
      width: number;
      height: number;
    }) => ({
      id: img.id,
      thumb: img.urls.small,
      regular: img.urls.regular,
      full: img.urls.full,
      alt: img.alt_description ?? '',
      photographer: img.user.name,
      photographerUrl: img.user.links.html,
      downloadLocation: img.links.download_location,
      width: img.width,
      height: img.height,
    }),
  );

  return NextResponse.json({ images, totalPages: data.total_pages });
}

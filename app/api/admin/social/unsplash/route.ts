import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * Unsplash-Suche + Download für Social-Posts.
 * Nutzt den gleichen Access-Key der auch für Blog-Bilder hinterlegt ist
 * (admin_settings.blog_settings.unsplash_access_key).
 *
 * GET  /api/admin/social/unsplash?query=kirschblüte&page=1
 *        → { images: [{ id, thumb, regular, full, alt, photographer, ... }], totalPages }
 *
 * POST /api/admin/social/unsplash
 *   Body: { imageUrl, downloadLocation, alt }
 *        → { url: "<supabase-storage-url>", alt }
 *   Lädt das Bild von Unsplash herunter, speichert es im blog-images-Bucket
 *   und triggert den Unsplash-Download-Event (API-Richtlinien-Pflicht).
 */

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('query') ?? '').trim();
  const page = searchParams.get('page') ?? '1';
  const orientation = searchParams.get('orientation') ?? 'squarish'; // squarish für Social, landscape für Blog

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

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=12&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });

  if (!res.ok) {
    return NextResponse.json({ error: 'Unsplash-Suche fehlgeschlagen.' }, { status: 500 });
  }

  const data = await res.json();
  const images = (data.results ?? []).map((img: {
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
  }));

  return NextResponse.json({ images, totalPages: data.total_pages ?? 1 });
}

export async function POST(req: NextRequest) {
  let body: { imageUrl?: string; downloadLocation?: string; alt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 });
  }
  const { imageUrl, downloadLocation, alt } = body;

  if (!imageUrl) {
    return NextResponse.json({ error: 'Bild-URL ist erforderlich.' }, { status: 400 });
  }

  const accessKey = await getUnsplashKey();

  // Unsplash Download-Event tracken (Pflicht laut API-Richtlinien)
  if (accessKey && downloadLocation) {
    fetch(`${downloadLocation}?client_id=${accessKey}`).catch(() => {});
  }

  // Bild herunterladen
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    return NextResponse.json({ error: 'Bild konnte nicht heruntergeladen werden.' }, { status: 500 });
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const filename = `social-unsplash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const supabase = createServiceClient();
  const { error: uploadError } = await supabase.storage
    .from('blog-images')
    .upload(filename, buffer, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from('blog-images')
    .getPublicUrl(filename);

  return NextResponse.json({
    url: urlData.publicUrl,
    alt: alt ?? '',
  });
}

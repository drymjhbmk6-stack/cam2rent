import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { detectImageType } from '@/lib/file-type-check';

// Gleicher Bucket wie Blog-Bilder — kein extra Bucket nötig
const BUCKET = 'blog-images';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function isUnsplashUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return [
      'images.unsplash.com',
      'plus.unsplash.com',
      'api.unsplash.com',
      'unsplash.com',
    ].includes(u.hostname);
  } catch {
    return false;
  }
}

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
 * POST /api/admin/seasonal-images/upload
 * Lädt ein Bild hoch — entweder von Unsplash-URL oder als Base64.
 *
 * Body für Unsplash: { imageUrl, downloadLocation, alt }
 * Body für Custom Upload: { base64, filename, alt }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  let buffer: Buffer;
  let contentType = 'image/jpeg';
  let filename: string;

  if (body.imageUrl) {
    // Host-Allowlist: nur Unsplash erlaubt — keine SSRF auf interne Adressen.
    if (!isUnsplashUrl(body.imageUrl)) {
      return NextResponse.json({ error: 'Nur Unsplash-URLs erlaubt.' }, { status: 400 });
    }

    // Unsplash-Download
    const accessKey = await getUnsplashKey();
    // Schluessel via Authorization-Header, nicht in URL — sonst landet er
    // im Access-Log + (frueher) im Server des Angreifers, falls er die
    // downloadLocation kontrolliert.
    if (accessKey && body.downloadLocation && isUnsplashUrl(body.downloadLocation)) {
      fetch(body.downloadLocation, { headers: { Authorization: `Client-ID ${accessKey}` } }).catch(() => {});
    }

    const imageRes = await fetch(body.imageUrl);
    if (!imageRes.ok) {
      return NextResponse.json({ error: 'Bild konnte nicht heruntergeladen werden.' }, { status: 500 });
    }
    buffer = Buffer.from(await imageRes.arrayBuffer());
    filename = `seasonal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  } else if (body.base64) {
    // Custom Upload (Base64) — Magic-Byte-Check + Allowlist-MIME, sonst koennte
    // ein Mitarbeiter Content-Type frei setzen und z.B. text/html in den
    // public Bucket legen.
    const matches = body.base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: 'Ungueltiges Base64-Format.' }, { status: 400 });
    }
    buffer = Buffer.from(matches[2], 'base64');
    const detected = detectImageType(buffer);
    const detectedMime = detected === 'jpeg' ? 'image/jpeg'
      : detected === 'png' ? 'image/png'
      : detected === 'webp' ? 'image/webp'
      : null;
    if (!detectedMime) {
      return NextResponse.json({ error: 'Datei ist kein gueltiges Bild (JPG, PNG, WebP).' }, { status: 400 });
    }
    contentType = detectedMime;
    const ext = MIME_TO_EXT[detectedMime];
    filename = `seasonal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  } else {
    return NextResponse.json({ error: 'Bild-URL oder Base64-Daten erforderlich.' }, { status: 400 });
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  await logAudit({
    action: 'seasonal_image.upload',
    entityType: 'seasonal_image',
    entityLabel: filename,
    request: req,
  });

  return NextResponse.json({
    url: urlData.publicUrl,
    alt: body.alt ?? '',
  });
}

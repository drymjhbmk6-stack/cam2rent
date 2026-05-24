import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { processSetImage } from '@/lib/image-processing';
import { detectImageType, isAllowedImage } from '@/lib/file-type-check';

const BUCKET = 'product-images';

/**
 * Erlaubt nur Unsplash-eigene Hosts. Verhindert SSRF und Schluessel-Exfiltration
 * ueber attacker-controlled `imageUrl` / `downloadLocation`.
 */
function isUnsplashUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return ['images.unsplash.com', 'plus.unsplash.com', 'api.unsplash.com', 'unsplash.com'].includes(u.hostname);
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
 * POST /api/admin/angebote-images/unsplash
 * Body: { angebotId, angebotName, imageUrl, downloadLocation?, alt? }
 *
 * Laedt das Unsplash-Bild herunter, verarbeitet es analog zum Datei-Upload
 * (Wasserzeichen mit Angebotsnamen via `processSetImage`) und speichert es im
 * `product-images`-Bucket unter `angebote/<id>/...`. Triggert den Unsplash-
 * Download-Event (API-Richtlinien-Pflicht).
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = (await req.json()) as { angebotId?: string; angebotName?: string; imageUrl?: string; downloadLocation?: string; alt?: string };
    const angebotId = String(body.angebotId ?? '').trim();
    const angebotName = String(body.angebotName ?? 'Angebot').trim() || 'Angebot';
    const imageUrl = String(body.imageUrl ?? '').trim();
    const downloadLocation = body.downloadLocation ? String(body.downloadLocation).trim() : '';

    if (!angebotId || !imageUrl) {
      return NextResponse.json({ error: 'angebotId und imageUrl erforderlich.' }, { status: 400 });
    }
    if (!/^[a-z0-9_-]{1,80}$/i.test(angebotId)) {
      return NextResponse.json({ error: 'Ungültige angebotId.' }, { status: 400 });
    }
    if (!isUnsplashUrl(imageUrl)) {
      return NextResponse.json({ error: 'Nur Unsplash-URLs erlaubt.' }, { status: 400 });
    }

    const accessKey = await getUnsplashKey();
    // Pflicht-Download-Event (Unsplash-API-Richtlinien). Key in den Header,
    // nicht in die URL — sonst landet er in Access-Logs.
    if (accessKey && downloadLocation && isUnsplashUrl(downloadLocation)) {
      fetch(downloadLocation, { headers: { Authorization: `Client-ID ${accessKey}` } }).catch(() => {});
    }

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return NextResponse.json({ error: 'Bild konnte nicht heruntergeladen werden.' }, { status: 502 });
    }
    const inputBuffer = Buffer.from(await imageRes.arrayBuffer());
    if (!isAllowedImage(inputBuffer, ['jpeg', 'png', 'webp'])) {
      return NextResponse.json({ error: 'Inhalt ist kein erlaubtes Bildformat.' }, { status: 502 });
    }
    // Defensive: sicherstellen dass es wirklich JPEG/PNG/WebP ist (sharp braucht das).
    if (!detectImageType(inputBuffer)) {
      return NextResponse.json({ error: 'Bildformat nicht erkennbar.' }, { status: 502 });
    }

    const { buffer: processedBuffer, contentType } = await processSetImage(inputBuffer, angebotName);
    const ext = contentType === 'image/webp' ? 'webp' : contentType === 'image/png' ? 'png' : 'jpg';
    const filename = `angebote/${angebotId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const supabase = createServiceClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, processedBuffer, { contentType, upsert: false });
    if (uploadError) {
      console.error('Angebot Unsplash upload error:', uploadError);
      return NextResponse.json({ error: 'Upload fehlgeschlagen.' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    await supabase.from('angebote').update({ image_url: urlData.publicUrl }).eq('id', angebotId);
    return NextResponse.json({ url: urlData.publicUrl, path: filename, alt: body.alt ?? '' });
  } catch (err) {
    console.error('POST /api/admin/angebote-images/unsplash error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

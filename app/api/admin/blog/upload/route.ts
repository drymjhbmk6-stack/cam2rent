import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { detectImageType, isAllowedImage } from '@/lib/file-type-check';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const DETECTED_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const DETECTED_TO_EXT: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

/** POST /api/admin/blog/upload - Manueller Bild-Upload */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Maximale Dateigröße: 5 MB.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Sweep 7 Vuln 19 — Magic-Byte-Check:
  // Vorher reichte file.type (Client-MIME). Damit konnte ein content-Mitarbeiter
  // beliebige Inhalte als "image/jpeg" deklariert in den oeffentlichen
  // blog-images-Bucket legen → Phishing-Hosting unter cam2rent-Domain.
  if (!isAllowedImage(buffer, ['jpeg', 'png', 'webp'])) {
    return NextResponse.json(
      { error: 'Datei ist kein gueltiges Bild (JPEG, PNG, WebP).' },
      { status: 400 },
    );
  }
  const detected = detectImageType(buffer) || 'jpeg';
  const ext = DETECTED_TO_EXT[detected] ?? 'jpg';
  const detectedMime = DETECTED_TO_MIME[detected] ?? 'image/jpeg';
  const filename = `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = createServiceClient();
  const { error: uploadError } = await supabase.storage
    .from('blog-images')
    .upload(filename, buffer, { contentType: detectedMime, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from('blog-images')
    .getPublicUrl(filename);

  await logAudit({
    action: 'blog_post.upload',
    entityType: 'blog_post',
    entityLabel: filename,
    request: req,
  });

  return NextResponse.json({ url: urlData.publicUrl });
}

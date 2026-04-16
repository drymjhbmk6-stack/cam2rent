import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import sharp from 'sharp';

const BUCKET = 'product-images';
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 900;

/**
 * Verarbeitet ein Set-Bild:
 * 1. Skaliert auf 1200x900 (4:3) mit weißem Hintergrund
 * 2. Fügt Set-Name als Wasserzeichen unten mittig hinzu
 * 3. Konvertiert zu WebP
 */
async function processSetImage(inputBuffer: Buffer, setName: string): Promise<Buffer> {
  const metadata = await sharp(inputBuffer).metadata();
  const origWidth = metadata.width || TARGET_WIDTH;
  const origHeight = metadata.height || TARGET_HEIGHT;

  // Skalierung: Bild muss in 1200x900 passen
  const scale = Math.min(TARGET_WIDTH / origWidth, TARGET_HEIGHT / origHeight);
  const resizedWidth = Math.round(origWidth * scale);
  const resizedHeight = Math.round(origHeight * scale);

  const resized = await sharp(inputBuffer)
    .resize(resizedWidth, resizedHeight, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();

  // Set-Name als Wasserzeichen (unten mittig)
  const fontSize = 32;
  const padding = 24;
  // HTML-Entities escapen
  const safeName = setName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const watermarkSvg = Buffer.from(`
    <svg width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}">
      <style>
        .set-name {
          font-family: sans-serif;
          font-weight: 700;
          font-size: ${fontSize}px;
          fill: rgba(0, 0, 0, 0.55);
          letter-spacing: 0.5px;
        }
      </style>
      <text x="${TARGET_WIDTH / 2}" y="${TARGET_HEIGHT - padding}" text-anchor="middle" class="set-name">${safeName}</text>
    </svg>
  `);

  const result = await sharp({
    create: {
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: resized, gravity: 'centre' },
      { input: watermarkSvg, gravity: 'south' },
    ])
    .webp({ quality: 85 })
    .toBuffer();

  return result;
}

/**
 * POST /api/set-images
 * Lädt ein Set-Bild hoch mit Set-Name als Wasserzeichen.
 * FormData: setId, setName, file
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const setId = formData.get('setId') as string;
    const setName = formData.get('setName') as string;
    const file = formData.get('file') as File | null;

    if (!setId || !setName || !file) {
      return NextResponse.json({ error: 'setId, setName und file erforderlich.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Nur JPG, PNG und WebP erlaubt.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Datei zu groß (max 10 MB).' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const processedBuffer = await processSetImage(inputBuffer, setName);

    const filename = `sets/${setId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, processedBuffer, {
        contentType: 'image/webp',
        upsert: false,
      });

    if (uploadError) {
      console.error('Set image upload error:', uploadError);
      return NextResponse.json({ error: 'Upload fehlgeschlagen.' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);

    // image_url in Sets-Tabelle speichern
    await supabase.from('sets').update({ image_url: urlData.publicUrl }).eq('id', setId);

    return NextResponse.json({ url: urlData.publicUrl, path: filename });
  } catch (err) {
    console.error('POST /api/set-images error:', err);
    return NextResponse.json({ error: 'Bildverarbeitung fehlgeschlagen.' }, { status: 500 });
  }
}

/**
 * DELETE /api/set-images
 * Löscht ein Set-Bild und entfernt die URL aus der DB.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { path, setId } = await req.json() as { path: string; setId: string };
    if (!path || !setId) {
      return NextResponse.json({ error: 'path und setId erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    await supabase.storage.from(BUCKET).remove([path]);
    await supabase.from('sets').update({ image_url: null }).eq('id', setId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/set-images error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

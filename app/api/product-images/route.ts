import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import sharp from 'sharp';

const BUCKET = 'product-images';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB (Original kann größer sein, wird komprimiert)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Zielgrößen
const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 900; // 4:3

/**
 * Verarbeitet ein Produktbild:
 * 1. Skaliert auf 1200x900 (4:3) mit weißem Hintergrund
 * 2. Fügt "cam2rent" Text-Wasserzeichen hinzu
 * 3. Konvertiert zu WebP (hohe Qualität)
 */
async function processImage(inputBuffer: Buffer): Promise<Buffer> {
  // Bild laden und Metadaten lesen
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const origWidth = metadata.width || TARGET_WIDTH;
  const origHeight = metadata.height || TARGET_HEIGHT;

  // Skalierung berechnen: Bild muss in 1200x900 passen (contain)
  const scale = Math.min(TARGET_WIDTH / origWidth, TARGET_HEIGHT / origHeight);
  const resizedWidth = Math.round(origWidth * scale);
  const resizedHeight = Math.round(origHeight * scale);

  // Bild skalieren
  const resized = await sharp(inputBuffer)
    .resize(resizedWidth, resizedHeight, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();

  // Wasserzeichen als SVG erstellen
  const watermarkText = 'cam2rent';
  const fontSize = 28;
  const padding = 20;
  const watermarkSvg = Buffer.from(`
    <svg width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}">
      <style>
        .watermark {
          font-family: sans-serif;
          font-weight: 700;
          font-size: ${fontSize}px;
          fill: rgba(0, 0, 0, 0.12);
          letter-spacing: 1px;
        }
      </style>
      <text x="${TARGET_WIDTH - padding}" y="${TARGET_HEIGHT - padding}" text-anchor="end" class="watermark">${watermarkText}</text>
    </svg>
  `);

  // Zusammensetzen: weißer Hintergrund + skaliertes Bild (zentriert) + Wasserzeichen
  const result = await sharp({
    create: {
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: resized,
        gravity: 'centre',
      },
      {
        input: watermarkSvg,
        gravity: 'southeast',
      },
    ])
    .webp({ quality: 85 })
    .toBuffer();

  return result;
}

/**
 * POST /api/product-images
 * Lädt ein Produktbild hoch, verarbeitet es automatisch:
 * - Skaliert auf 1200x900 (4:3)
 * - Weißer Hintergrund
 * - "cam2rent" Wasserzeichen
 * - WebP-Format
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const productId = formData.get('productId') as string;
    const file = formData.get('file') as File | null;

    if (!productId || !file) {
      return NextResponse.json({ error: 'productId und file erforderlich.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Nur JPG, PNG und WebP erlaubt.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Datei zu groß (max 10 MB).' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Bild verarbeiten
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const processedBuffer = await processImage(inputBuffer);

    // Eindeutiger Dateiname (immer .webp)
    const filename = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, processedBuffer, {
        contentType: 'image/webp',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Upload fehlgeschlagen.' }, { status: 500 });
    }

    // Public URL generieren
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);

    return NextResponse.json({ url: urlData.publicUrl, path: filename });
  } catch (err) {
    console.error('POST /api/product-images error:', err);
    return NextResponse.json({ error: 'Bildverarbeitung fehlgeschlagen.' }, { status: 500 });
  }
}

/**
 * DELETE /api/product-images
 * Löscht ein Produktbild aus Supabase Storage.
 * Body: { path: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { path } = await req.json() as { path: string };
    if (!path) {
      return NextResponse.json({ error: 'path erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase.storage.from(BUCKET).remove([path]);

    if (error) {
      console.error('Delete error:', error);
      return NextResponse.json({ error: 'Löschen fehlgeschlagen.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/product-images error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

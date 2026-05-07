import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { processProductImage } from '@/lib/image-processing';
import { isAllowedImage } from '@/lib/file-type-check';

const BUCKET = 'product-images';
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * POST /api/product-images
 * Lädt ein Produktbild hoch, verarbeitet es automatisch:
 * - Skaliert auf 1200x900 (4:3)
 * - Weißer Hintergrund
 * - cam2rent Logo-Wasserzeichen (unten rechts)
 * - WebP-Format
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const inputBuffer = Buffer.from(await file.arrayBuffer());

    // Magic-Byte-Check: vom Client gemeldeter MIME reicht nicht.
    if (!isAllowedImage(inputBuffer, ['jpeg', 'png', 'webp'])) {
      return NextResponse.json({ error: 'Datei ist kein gültiges Bild (JPG, PNG oder WebP).' }, { status: 400 });
    }

    const { buffer: processedBuffer, contentType } = await processProductImage(inputBuffer);

    // Extension aus MIME-Type/contentType ableiten (Path-Traversal-Schutz).
    const mimeExt: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext = contentType === 'image/webp' ? 'webp' : (mimeExt[file.type] ?? 'jpg');
    const filename = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, processedBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Upload fehlgeschlagen.' }, { status: 500 });
    }

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
 */
export async function DELETE(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path } = await req.json() as { path: string };
    if (!path) {
      return NextResponse.json({ error: 'path erforderlich.' }, { status: 400 });
    }

    // Sweep 8 M3: Path-Traversal-Schutz. Vorher konnte ein Mitarbeiter mit
    // 'katalog'-Permission beliebige Files im Bucket loeschen — auch Set-
    // oder Zubehoer-Bilder. Format ist '<productId>/<random>.webp'.
    if (path.includes('..') || path.startsWith('/') || path.startsWith('sets/') || path.startsWith('accessories/')) {
      return NextResponse.json({ error: 'Ungueltiger Pfad.' }, { status: 400 });
    }
    if (!/^[a-z0-9_-]+\/[a-z0-9_.-]+\.(webp|jpg|jpeg|png)$/i.test(path)) {
      return NextResponse.json({ error: 'Pfadformat nicht erlaubt.' }, { status: 400 });
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

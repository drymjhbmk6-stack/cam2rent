import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { processSetImage } from '@/lib/image-processing';
import { isAllowedImage } from '@/lib/file-type-check';

const BUCKET = 'product-images';
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * POST /api/accessory-images
 * Laedt ein Zubehoer-Bild hoch mit Name als dezentem Wasserzeichen.
 * Wiederverwendet processSetImage (gleiches Watermark-Layout).
 * FormData: accessoryId, accessoryName, file
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const accessoryId = formData.get('accessoryId') as string;
    const accessoryName = formData.get('accessoryName') as string;
    const file = formData.get('file') as File | null;

    if (!accessoryId || !accessoryName || !file) {
      return NextResponse.json(
        { error: 'accessoryId, accessoryName und file erforderlich.' },
        { status: 400 }
      );
    }

    // Sweep 7 Vuln 20 — Path-Traversal-Schutz:
    // accessoryId wird in den Storage-Pfad interpoliert. Whitelist-Regex
    // verhindert "../products/..."-Angriffe, mit denen ein Mitarbeiter mit
    // katalog-Permission fremde Produktbilder ueberschreiben koennte.
    if (!/^[a-z0-9_-]{1,64}$/i.test(accessoryId)) {
      return NextResponse.json({ error: 'Ungueltige accessoryId.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Nur JPG, PNG und WebP erlaubt.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Datei zu gross (max 10 MB).' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const inputBuffer = Buffer.from(await file.arrayBuffer());

    if (!isAllowedImage(inputBuffer, ['jpeg', 'png', 'webp'])) {
      return NextResponse.json(
        { error: 'Datei ist kein gueltiges Bild (JPG, PNG oder WebP).' },
        { status: 400 }
      );
    }

    const { buffer: processedBuffer, contentType } = await processSetImage(
      inputBuffer,
      accessoryName
    );

    const mimeExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = contentType === 'image/webp' ? 'webp' : (mimeExt[file.type] ?? 'jpg');
    const filename = `accessories/${accessoryId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, processedBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Accessory image upload error:', uploadError);
      return NextResponse.json({ error: 'Upload fehlgeschlagen.' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);

    // image_url in accessories-Tabelle speichern
    await supabase
      .from('accessories')
      .update({ image_url: urlData.publicUrl })
      .eq('id', accessoryId);

    return NextResponse.json({ url: urlData.publicUrl, path: filename });
  } catch (err) {
    console.error('POST /api/accessory-images error:', err);
    return NextResponse.json({ error: 'Bildverarbeitung fehlgeschlagen.' }, { status: 500 });
  }
}

/**
 * DELETE /api/accessory-images
 * Loescht ein Zubehoer-Bild und entfernt die URL aus der DB.
 */
export async function DELETE(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path, accessoryId } = (await req.json()) as { path: string; accessoryId: string };
    if (!path || !accessoryId) {
      return NextResponse.json({ error: 'path und accessoryId erforderlich.' }, { status: 400 });
    }

    // Sweep 7 Vuln 20 — Path-Traversal-Schutz:
    // Vorher konnte ein Mitarbeiter mit katalog-Permission jedes Bild im
    // product-images-Bucket loeschen, indem er einen beliebigen `path`
    // mitschickte (z.B. "products/gopro-hero-12-1234.jpg").
    if (!/^[a-z0-9_-]{1,64}$/i.test(accessoryId)) {
      return NextResponse.json({ error: 'Ungueltige accessoryId.' }, { status: 400 });
    }
    const expectedPrefix = `accessories/${accessoryId}/`;
    if (!path.startsWith(expectedPrefix) || path.includes('..')) {
      return NextResponse.json(
        { error: 'Pfad gehoert nicht zu diesem Zubehoer.' },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    await supabase.storage.from(BUCKET).remove([path]);
    await supabase.from('accessories').update({ image_url: null }).eq('id', accessoryId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/accessory-images error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

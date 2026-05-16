import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { isAllowedImage, detectImageType } from '@/lib/file-type-check';

const BUCKET = 'product-images';
const MAX_SIZE = 8 * 1024 * 1024;

/**
 * POST /api/admin/accessory-part-images
 * Laedt ein kleines Referenzbild fuer EINEN Bestandteil hoch.
 * Bewusst schlank: KEIN Wasserzeichen, KEINE Veraenderung von
 * accessories.image_url — das Bild ist nur eine optionale Anzeige pro
 * included_parts-Zeile. FormData: accessoryId, file. Response: { url, path }.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const formData = await req.formData();
    const accessoryId = formData.get('accessoryId') as string;
    const file = formData.get('file') as File | null;
    if (!accessoryId || !file) {
      return NextResponse.json({ error: 'accessoryId und file erforderlich.' }, { status: 400 });
    }
    // Path-Traversal-Schutz (accessoryId fliesst in den Storage-Pfad).
    // Erlaubt auch temporaere IDs ("tmp-..." beim Neu-Anlegen).
    if (!/^[a-z0-9_-]{1,64}$/i.test(accessoryId)) {
      return NextResponse.json({ error: 'Ungueltige accessoryId.' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Datei zu gross (max 8 MB).' }, { status: 400 });
    }
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    if (!isAllowedImage(inputBuffer, ['jpeg', 'png', 'webp'])) {
      return NextResponse.json(
        { error: 'Datei ist kein gueltiges Bild (JPG, PNG oder WebP).' },
        { status: 400 },
      );
    }
    const detected = detectImageType(inputBuffer); // 'jpeg' | 'png' | 'webp'
    const ext = detected === 'jpeg' ? 'jpg' : detected;
    const contentType = `image/${detected}`;
    const filename = `accessories/${accessoryId}/parts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const supabase = createServiceClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, inputBuffer, { contentType, upsert: false });
    if (uploadError) {
      console.error('accessory-part-image upload error:', uploadError);
      return NextResponse.json({ error: 'Upload fehlgeschlagen.' }, { status: 500 });
    }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return NextResponse.json({ url: urlData.publicUrl, path: filename });
  } catch (err) {
    console.error('POST /api/admin/accessory-part-images error:', err);
    return NextResponse.json({ error: 'Bildverarbeitung fehlgeschlagen.' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/accessory-part-images
 * Entfernt ein Bestandteil-Bild aus dem Storage. Body: { path, accessoryId }.
 * Kein DB-Write — die Verknuepfung lebt in accessories.included_parts_images
 * und wird ueber das normale Accessory-Save aktualisiert.
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
    if (!/^[a-z0-9_-]{1,64}$/i.test(accessoryId)) {
      return NextResponse.json({ error: 'Ungueltige accessoryId.' }, { status: 400 });
    }
    const expectedPrefix = `accessories/${accessoryId}/parts/`;
    if (!path.startsWith(expectedPrefix) || path.includes('..')) {
      return NextResponse.json(
        { error: 'Pfad gehoert nicht zu diesem Zubehoer.' },
        { status: 400 },
      );
    }
    const supabase = createServiceClient();
    await supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/accessory-part-images error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

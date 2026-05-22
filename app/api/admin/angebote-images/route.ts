import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { processSetImage } from '@/lib/image-processing';
import { isAllowedImage } from '@/lib/file-type-check';

const BUCKET = 'product-images';
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * POST /api/admin/angebote-images — Bild fuer ein Angebot hochladen.
 * FormData: angebotId, angebotName, file
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const formData = await req.formData();
    const angebotId = formData.get('angebotId') as string;
    const angebotName = (formData.get('angebotName') as string) || 'Angebot';
    const file = formData.get('file') as File | null;

    if (!angebotId || !file) {
      return NextResponse.json({ error: 'angebotId und file erforderlich.' }, { status: 400 });
    }
    if (!/^[a-z0-9_-]{1,80}$/i.test(angebotId)) {
      return NextResponse.json({ error: 'Ungültige angebotId.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Nur JPG, PNG und WebP erlaubt.' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Datei zu groß (max 10 MB).' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    if (!isAllowedImage(inputBuffer, ['jpeg', 'png', 'webp'])) {
      return NextResponse.json({ error: 'Datei ist kein gültiges Bild (JPG, PNG oder WebP).' }, { status: 400 });
    }

    const { buffer: processedBuffer, contentType } = await processSetImage(inputBuffer, angebotName);
    const ext = contentType === 'image/webp' ? 'webp' : contentType === 'image/png' ? 'png' : 'jpg';
    const filename = `angebote/${angebotId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, processedBuffer, { contentType, upsert: false });
    if (uploadError) {
      console.error('Angebot image upload error:', uploadError);
      return NextResponse.json({ error: 'Upload fehlgeschlagen.' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    await supabase.from('angebote').update({ image_url: urlData.publicUrl }).eq('id', angebotId);
    return NextResponse.json({ url: urlData.publicUrl, path: filename });
  } catch (err) {
    console.error('POST /api/admin/angebote-images error:', err);
    return NextResponse.json({ error: 'Bildverarbeitung fehlgeschlagen.' }, { status: 500 });
  }
}

/** DELETE /api/admin/angebote-images — Angebots-Bild löschen. */
export async function DELETE(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { path, angebotId } = (await req.json()) as { path: string; angebotId: string };
    if (!path || !angebotId) {
      return NextResponse.json({ error: 'path und angebotId erforderlich.' }, { status: 400 });
    }
    if (!/^[a-z0-9_-]{1,80}$/i.test(angebotId)) {
      return NextResponse.json({ error: 'Ungültige angebotId.' }, { status: 400 });
    }
    const expectedPrefix = `angebote/${angebotId}/`;
    if (path.includes('..') || !path.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Pfad gehört nicht zum Angebot.' }, { status: 400 });
    }
    const supabase = createServiceClient();
    await supabase.storage.from(BUCKET).remove([path]);
    await supabase.from('angebote').update({ image_url: null }).eq('id', angebotId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/angebote-images error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

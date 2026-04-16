import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { processSetImage } from '@/lib/image-processing';

const BUCKET = 'product-images';
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * POST /api/set-images
 * Lädt ein Set-Bild hoch mit Set-Name als Wasserzeichen unten mittig.
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
    const { buffer: processedBuffer, contentType } = await processSetImage(inputBuffer, setName);

    const ext = contentType === 'image/webp' ? 'webp' : file.name.split('.').pop() || 'jpg';
    const filename = `sets/${setId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, processedBuffer, {
        contentType,
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

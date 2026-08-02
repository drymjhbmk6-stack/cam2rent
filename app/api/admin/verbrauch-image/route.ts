import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { isAllowedImage, detectImageType } from '@/lib/file-type-check';

const BUCKET = 'product-images';
const MAX_SIZE = 8 * 1024 * 1024;

/**
 * POST /api/admin/verbrauch-image
 * Lädt ein optionales Referenzfoto für EINEN Verbrauchsartikel hoch.
 * FormData: id (verbrauchsartikel.id oder temporäre "tmp-…"-ID beim Neu-Anlegen),
 * file. Response: { url, path }. Die Verknüpfung (image_url) wird über das
 * normale Verbrauch-Save (POST/PATCH) gespeichert — hier nur der Upload.
 *
 * Permission (`katalog`) via middleware (Prefix /api/admin/verbrauch) + eigener
 * checkAdminAuth als Defense-in-Depth.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkAdminAuth())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const formData = await req.formData();
    const id = formData.get('id') as string;
    const file = formData.get('file') as File | null;
    if (!id || !file) {
      return NextResponse.json({ error: 'id und file erforderlich.' }, { status: 400 });
    }
    // Path-Traversal-Schutz (id fließt in den Storage-Pfad). Erlaubt auch
    // temporäre IDs ("tmp-…" beim Neu-Anlegen).
    if (!/^[a-z0-9_-]{1,64}$/i.test(id)) {
      return NextResponse.json({ error: 'Ungültige id.' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Datei zu groß (max 8 MB).' }, { status: 400 });
    }
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    if (!isAllowedImage(inputBuffer, ['jpeg', 'png', 'webp'])) {
      return NextResponse.json(
        { error: 'Datei ist kein gültiges Bild (JPG, PNG oder WebP).' },
        { status: 400 },
      );
    }
    const detected = detectImageType(inputBuffer); // 'jpeg' | 'png' | 'webp'
    const ext = detected === 'jpeg' ? 'jpg' : detected;
    const contentType = `image/${detected}`;
    const filename = `verbrauch/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const supabase = createServiceClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, inputBuffer, { contentType, upsert: false });
    if (uploadError) {
      console.error('verbrauch-image upload error:', uploadError);
      return NextResponse.json({ error: 'Upload fehlgeschlagen.' }, { status: 500 });
    }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return NextResponse.json({ url: urlData.publicUrl, path: filename });
  } catch (err) {
    console.error('POST /api/admin/verbrauch-image error:', err);
    return NextResponse.json({ error: 'Bildverarbeitung fehlgeschlagen.' }, { status: 500 });
  }
}

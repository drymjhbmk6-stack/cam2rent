import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { detectImageType } from '@/lib/file-type-check';

/**
 * POST /api/admin/social/upload-image
 * Nimmt ein Image via multipart/form-data, speichert in Supabase Storage
 * (Bucket 'blog-images') und gibt die öffentliche URL zurück.
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei übergeben (Feld "file")' }, { status: 400 });
  }
  // Max 10 MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Datei zu groß (max 10 MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Magic-Byte-Check: file.type ist Client-kontrolliert und nicht vertrauenswuerdig.
  // Der Bucket "blog-images" ist oeffentlich — eine getarnte Executable hier wuerde
  // mit der vom Client gesetzten MIME ausgeliefert.
  const detected = detectImageType(buffer);
  if (!detected || !['jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(detected)) {
    return NextResponse.json(
      { error: 'Datei ist kein gueltiges Bild (JPEG/PNG/WebP/HEIC/GIF erwartet).' },
      { status: 400 },
    );
  }
  const realMime =
    detected === 'jpeg'
      ? 'image/jpeg'
      : detected === 'png'
      ? 'image/png'
      : detected === 'webp'
      ? 'image/webp'
      : detected === 'gif'
      ? 'image/gif'
      : `image/${detected}`;
  const ext = detected === 'jpeg' ? 'jpg' : detected;
  const filename = `social-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = createServiceClient();
  const { error: uploadError } = await supabase.storage
    .from('blog-images')
    .upload(filename, buffer, { contentType: realMime, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from('blog-images').getPublicUrl(filename);
  return NextResponse.json({ url: data.publicUrl, filename });
}

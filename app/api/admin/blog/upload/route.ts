import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** POST /api/admin/blog/upload - Manueller Bild-Upload */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Nur JPEG, PNG und WebP erlaubt.' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Maximale Dateigröße: 5 MB.' }, { status: 400 });
  }

  // Extension aus MIME-Type ableiten (nicht aus file.name — Path-Traversal-Schutz)
  const ext = MIME_TO_EXT[file.type] ?? 'jpg';
  const filename = `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const supabase = createServiceClient();
  const { error: uploadError } = await supabase.storage
    .from('blog-images')
    .upload(filename, buffer, { contentType: file.type, upsert: false });

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

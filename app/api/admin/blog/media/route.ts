import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** GET /api/admin/blog/media — Alle Bilder aus blog-images Bucket */
export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from('blog-images')
    .list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const images = (data ?? [])
    .filter((f) => !f.name.startsWith('.'))
    .map((f) => {
      const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(f.name);
      return {
        name: f.name,
        url: urlData.publicUrl,
        size: f.metadata?.size ?? 0,
        created_at: f.created_at,
      };
    });

  return NextResponse.json({ images });
}

/** POST /api/admin/blog/media — Bild hochladen */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'Keine Datei.' }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Nur JPEG, PNG, WebP.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Max. 5 MB.' }, { status: 400 });

  const ext = file.name.split('.').pop() ?? 'jpg';
  const filename = `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from('blog-images')
    .upload(filename, buffer, { contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(filename);

  await logAudit({
    action: 'blog_post.upload_media',
    entityType: 'blog_post',
    entityLabel: filename,
    request: req,
  });

  return NextResponse.json({ url: urlData.publicUrl, name: filename });
}

/** DELETE /api/admin/blog/media?name=... — Bild loeschen */
export async function DELETE(req: NextRequest) {
  const name = new URL(req.url).searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Name erforderlich.' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.storage.from('blog-images').remove([name]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'blog_post.delete_media',
    entityType: 'blog_post',
    entityLabel: name,
    request: req,
  });

  return NextResponse.json({ success: true });
}

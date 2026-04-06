import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

const BUCKET = 'product-images';
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * POST /api/product-images
 * Lädt ein Produktbild in Supabase Storage hoch.
 * FormData: productId (string) + file (File)
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
      return NextResponse.json({ error: 'Datei zu groß (max 5 MB).' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Eindeutiger Dateiname
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType: file.type,
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
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
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

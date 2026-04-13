import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/id-document-url?path=userId/front.jpg
 * Gibt eine temporaere Signed URL fuer ein Ausweis-Bild zurueck (60 Min gueltig).
 */
export async function GET(req: NextRequest) {
  try {
    const filePath = req.nextUrl.searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'path Parameter erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase.storage
      .from('id-documents')
      .createSignedUrl(filePath, 3600); // 60 Minuten gueltig

    if (error || !data?.signedUrl) {
      console.error('Signed URL error:', error);
      return NextResponse.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    console.error('GET /api/admin/id-document-url error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

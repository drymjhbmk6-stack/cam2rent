import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/id-document-url?path=userId/front.jpg
 * Gibt eine temporäre Signed URL für ein Ausweis-Bild zurück (5 Min gültig).
 */
export async function GET(req: NextRequest) {
  try {
    const filePath = req.nextUrl.searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'path Parameter erforderlich.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const bucket = supabase.storage.from('id-documents');

    // Ausweisfotos vom Handy sind mehrere MB (4000+ px). Für die Prüfung reicht
    // eine verkleinerte, komprimierte Fassung → lädt auf dem Handy ~10× schneller
    // statt sekundenlang ein schwarzer Kasten. 5 Min gültig (DSGVO: kurzlebig).
    //
    // WICHTIG: Die Supabase-Bildtransformation ist ein Pro-Feature. Ist sie NICHT
    // aktiviert, baut createSignedUrl die Transform-URL zwar, das Bild lädt aber
    // nicht (Render-Endpoint 400). Deshalb liefern wir BEIDES: `url` (verkleinert)
    // + `original` (unverändert). Der Client nimmt `url` und fällt bei einem
    // Ladefehler automatisch auf `original` zurück → nie kaputte Bilder.
    const [transformed, original] = await Promise.all([
      bucket.createSignedUrl(filePath, 300, {
        transform: { width: 1400, quality: 72, resize: 'contain' },
      }),
      bucket.createSignedUrl(filePath, 300),
    ]);

    const originalUrl = original.data?.signedUrl ?? null;
    const primaryUrl = transformed.data?.signedUrl ?? originalUrl;

    if (!primaryUrl) {
      console.error('Signed URL error:', transformed.error || original.error);
      return NextResponse.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
    }

    return NextResponse.json({ url: primaryUrl, original: originalUrl });
  } catch (err) {
    console.error('GET /api/admin/id-document-url error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

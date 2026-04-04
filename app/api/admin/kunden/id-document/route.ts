import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/kunden/id-document
 * Gibt eine Signed URL für ein Ausweisdokument zurück.
 * Query: ?userId=xxx&side=front|back
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    const side = req.nextUrl.searchParams.get('side');

    if (!userId || !side || !['front', 'back'].includes(side)) {
      return NextResponse.json({ error: 'Ungültige Parameter.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Pfad aus Profil holen
    const { data: profile } = await supabase
      .from('profiles')
      .select('id_front_url, id_back_url')
      .eq('id', userId)
      .maybeSingle();

    const storagePath = side === 'front' ? profile?.id_front_url : profile?.id_back_url;
    if (!storagePath) {
      return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 });
    }

    // Signed URL generieren (60 Sekunden gültig)
    const { data: signedUrl, error } = await supabase.storage
      .from('id-documents')
      .createSignedUrl(storagePath, 60);

    if (error || !signedUrl) {
      console.error('Signed URL error:', error);
      return NextResponse.json({ error: 'URL konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ url: signedUrl.signedUrl });
  } catch (err) {
    console.error('GET /api/admin/kunden/id-document error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

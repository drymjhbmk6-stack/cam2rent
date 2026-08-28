import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { signedDamageAttachmentUrl } from '@/lib/damage-attachments';

/**
 * GET /api/admin/damage-attachment-url?path=<storage-pfad>
 * Signierte URL (5 Min) für einen Schadens-Anhang (Dokument oder Foto).
 * Redirect auf die signierte URL.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'path erforderlich.' }, { status: 400 });
  }
  // Path-Traversal-Schutz: 2 oder 3 Segmente, jedes ohne Slash.
  //   `<bookingId>/<datei>`                    → Dokument bzw. Buchungsschaden-Foto
  //   `<bookingId>/<accessoryUnitId>/<datei>`  → Zubehoer-Schadensfoto
  // Die Route bedient beide Buckets (signedDamageAttachmentUrl probiert
  // damage-photos und damage-attachments), deshalb muss sie auch die dreiteilige
  // Fotoform akzeptieren — vorher lief die in ein 400 (Audit K-5 / Paket 3a).
  if (path.includes('..') || path.startsWith('/') ||
      !/^[\w.\-]+\/(?:[\w.\-]+\/)?[\w.\-]+$/.test(path)) {
    return NextResponse.json({ error: 'Ungültiger Pfad.' }, { status: 400 });
  }
  try {
    const supabase = createServiceClient();
    const url = await signedDamageAttachmentUrl(supabase, path);
    if (!url) return NextResponse.json({ error: 'Datei nicht gefunden.' }, { status: 404 });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error('GET /api/admin/damage-attachment-url error:', err);
    return NextResponse.json({ error: 'Fehler.' }, { status: 500 });
  }
}

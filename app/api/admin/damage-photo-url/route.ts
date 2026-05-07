import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/damage-photo-url?path=...
 *
 * Sweep 9 TLS-H-A: Liefert Signed URL fuer ein damage-photos-File.
 * Damit kann der Admin-Frontend `&lt;img src&gt;` mit kurzer URL-Lifetime anzeigen
 * (5 Min) — auch wenn der Bucket privat ist (was er sein muss).
 *
 * Pfad-Whitelist: muss mit `&lt;bookingId&gt;/` beginnen, kein `..`/`/`.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'path erforderlich.' }, { status: 400 });
  }
  if (path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: 'Ungueltiger Pfad.' }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp|heic|gif)$/i.test(path)) {
    return NextResponse.json({ error: 'Pfadformat nicht erlaubt.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from('damage-photos')
    .createSignedUrl(path, 60 * 5);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'URL nicht erzeugbar.' }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, { status: 302 });
}

import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';
import { parseStoredPhotos, type StoredPhoto } from '@/lib/photo-slots';

/**
 * GET /api/admin/handover/[bookingId]/photo-url
 *
 * Liefert Signed URLs (5 Min gueltig) fuer die Uebergabefotos.
 * Service-Role-only Bucket → die Fotos koennen nicht direkt vom Browser
 * geladen werden, deshalb dieser Helper-Endpoint.
 *
 * Antwort:
 *   { url, photos: [{ path, kind, title, cameraLabel?, url }] }
 *
 * `url` ist das Gesamtfoto und bleibt aus Rueckwaertskompatibilitaet erhalten
 * (Altbestand hat nur `handover_data.photoPath`, keine `photos`-Liste).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { bookingId } = await params;
  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('handover_data')
    .eq('id', bookingId)
    .maybeSingle();

  const handover = (booking?.handover_data ?? null) as
    | { photoPath?: string; photos?: unknown }
    | null;

  // Neue Welt: vollstaendige Liste. Altbestand: nur der eine photoPath.
  let photos: StoredPhoto[] = parseStoredPhotos(handover?.photos);
  if (photos.length === 0 && handover?.photoPath) {
    photos = [{ path: handover.photoPath, kind: 'overview', title: 'Foto der Übergabe' }];
  }

  if (photos.length === 0) {
    return NextResponse.json({ error: 'Kein Foto vorhanden.' }, { status: 404 });
  }

  const signed = await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage
        .from('handover-photos')
        .createSignedUrl(p.path, 60 * 5);
      return { ...p, url: data?.signedUrl ?? null };
    }),
  );

  const usable = signed.filter((p) => p.url);
  if (usable.length === 0) {
    return NextResponse.json({ error: 'Signed URL fehlgeschlagen.' }, { status: 500 });
  }

  const overview = usable.find((p) => p.kind === 'overview') ?? usable[0];
  return NextResponse.json({ url: overview.url, photos: usable });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { parseStoredPhotos, type StoredPhoto } from '@/lib/photo-slots';

/**
 * GET /api/admin/versand/[id]/photo-url
 *
 * Liefert kurzlebige Signed URLs (5 Min) fuer die Fotos der
 * Verpackungskontrolle. Bucket "packing-photos" ist privat → nur Admin.
 *
 * Antwort:
 *   { url, photos: [{ path, kind, title, cameraLabel?, url }] }
 *
 * `url` ist das Gesamtfoto und bleibt aus Rueckwaertskompatibilitaet erhalten
 * (Altbestand + Umgebungen ohne die `pack_photos`-Migration haben nur
 * `pack_photo_url`).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  // Defensiv: Migration `supabase-pack-photos.sql` evtl. noch nicht ausgefuehrt
  // → einmal ohne die Spalte laden (dann greift der pack_photo_url-Fallback).
  const first = await supabase
    .from('bookings')
    .select('pack_photo_url, pack_photos')
    .eq('id', id)
    .maybeSingle();
  let booking: { pack_photo_url?: string | null; pack_photos?: unknown } | null = first.data;
  if (first.error && /pack_photos|column|schema cache|PGRST/i.test(first.error.message || '')) {
    const retry = await supabase
      .from('bookings')
      .select('pack_photo_url')
      .eq('id', id)
      .maybeSingle();
    booking = retry.data;
  }

  const row = booking;

  let photos: StoredPhoto[] = parseStoredPhotos(row?.pack_photos);
  if (photos.length === 0 && row?.pack_photo_url) {
    photos = [{ path: row.pack_photo_url, kind: 'overview', title: 'Verpackungs-Foto' }];
  }

  if (photos.length === 0) {
    return NextResponse.json({ error: 'Kein Foto vorhanden.' }, { status: 404 });
  }

  const signed = await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage
        .from('packing-photos')
        .createSignedUrl(p.path, 300); // 5 Minuten
      return { ...p, url: data?.signedUrl ?? null };
    }),
  );

  const usable = signed.filter((p) => p.url);
  if (usable.length === 0) {
    return NextResponse.json({ error: 'Foto-URL konnte nicht erstellt werden.' }, { status: 500 });
  }

  const overview = usable.find((p) => p.kind === 'overview') ?? usable[0];
  return NextResponse.json({ url: overview.url, photos: usable });
}

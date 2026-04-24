import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * GET /api/admin/versand/[id]/photo-url
 * Liefert eine kurzlebige Signed URL fuer das Verpackungs-Foto.
 * Nur Admin (Bucket "packing-photos" ist privat).
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

  const { data: booking } = await supabase
    .from('bookings')
    .select('pack_photo_url')
    .eq('id', id)
    .maybeSingle();

  if (!booking?.pack_photo_url) {
    return NextResponse.json({ error: 'Kein Foto vorhanden.' }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from('packing-photos')
    .createSignedUrl(booking.pack_photo_url, 300); // 5 Minuten

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Foto-URL konnte nicht erstellt werden.' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}

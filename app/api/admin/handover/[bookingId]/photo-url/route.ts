import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/admin/handover/[bookingId]/photo-url
 *
 * Liefert eine Signed URL fuer das hochgeladene Uebergabefoto (5 Min gueltig).
 * Service-Role-only Bucket → Foto kann nicht direkt vom Browser geladen
 * werden, deshalb dieser Helper-Endpoint.
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

  const path = (booking?.handover_data as { photoPath?: string } | null)?.photoPath;
  if (!path) {
    return NextResponse.json({ error: 'Kein Foto vorhanden.' }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from('handover-photos')
    .createSignedUrl(path, 60 * 5);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Signed URL fehlgeschlagen.' }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';

/**
 * POST /api/admin/versand/[id]/pack-reset
 * Setzt den Pack-Workflow auf Anfang zurueck. Foto wird aus Storage geloescht.
 * Genutzt wenn etwas falsch gepackt wurde und neu angefangen werden soll.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  // Foto aus Storage loeschen falls vorhanden
  const { data: booking } = await supabase
    .from('bookings')
    .select('pack_photo_url')
    .eq('id', id)
    .maybeSingle();
  if (booking?.pack_photo_url) {
    await supabase.storage.from('packing-photos').remove([booking.pack_photo_url]).catch(() => {});
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      pack_status: null,
      pack_packed_by: null,
      pack_packed_at: null,
      pack_packed_signature: null,
      pack_packed_items: null,
      pack_packed_condition: null,
      pack_checked_by: null,
      pack_checked_at: null,
      pack_checked_signature: null,
      pack_checked_items: null,
      pack_checked_notes: null,
      pack_photo_url: null,
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

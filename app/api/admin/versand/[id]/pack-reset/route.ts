import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/admin/versand/[id]/pack-reset
 * Setzt den Pack-Workflow auf Anfang zurueck. Foto wird aus Storage geloescht.
 * Nur fuer Owner — Mitarbeiter duerfen einen 4-Augen-bestaetigten Workflow
 * nicht eigenhaendig zuruecksetzen (sonst koennten sie spaeter gepackte Pakete
 * unbemerkt wieder zur Disposition stellen).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  if (user.role !== 'owner') {
    return NextResponse.json(
      { error: 'Nur der Admin/Owner darf den Pack-Workflow zuruecksetzen.' },
      { status: 403 },
    );
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
      pack_packed_by_user_id: null,
      pack_packed_at: null,
      pack_packed_signature: null,
      pack_packed_items: null,
      pack_packed_condition: null,
      pack_checked_by: null,
      pack_checked_by_user_id: null,
      pack_checked_at: null,
      pack_checked_signature: null,
      pack_checked_items: null,
      pack_checked_notes: null,
      pack_photo_url: null,
    })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'versand.pack_reset',
    entityType: 'pack',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}

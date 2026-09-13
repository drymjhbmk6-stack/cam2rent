import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { collectPhotoPaths } from '@/lib/photo-slots';

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

  // ALLE Fotos aus dem Storage loeschen (Gesamtfoto + Kamera-Fotos + Extras).
  // Defensiv: `pack_photos`-Migration evtl. noch nicht ausgefuehrt.
  const readFirst = await supabase
    .from('bookings')
    .select('pack_photo_url, pack_photos')
    .eq('id', id)
    .maybeSingle();
  let booking: { pack_photo_url?: string | null; pack_photos?: unknown } | null = readFirst.data;
  let hasPhotosColumn = true;
  if (readFirst.error && /pack_photos|column|schema cache|PGRST/i.test(readFirst.error.message || '')) {
    hasPhotosColumn = false;
    const retry = await supabase
      .from('bookings')
      .select('pack_photo_url')
      .eq('id', id)
      .maybeSingle();
    booking = retry.data;
  }
  const row = booking;
  const paths = collectPhotoPaths(row?.pack_photo_url, row?.pack_photos);
  if (paths.length > 0) {
    await supabase.storage.from('packing-photos').remove(paths).catch(() => {});
  }

  const resetFields: Record<string, unknown> = {
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
      ...(hasPhotosColumn ? { pack_photos: [] } : {}),
  };

  let { error } = await supabase.from('bookings').update(resetFields).eq('id', id);
  // Defensiv: Spalte fehlt doch (Race/Schema-Cache) → einmal ohne sie.
  if (error && /pack_photos|column|schema cache|PGRST/i.test(error.message || '')) {
    delete resetFields.pack_photos;
    ({ error } = await supabase.from('bookings').update(resetFields).eq('id', id));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'versand.pack_reset',
    entityType: 'pack',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}

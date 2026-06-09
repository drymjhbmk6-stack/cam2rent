import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';

/**
 * GET /api/admin/booking/[id]/accessory-exemplars?accessory_id=X
 *
 * Liefert die wählbaren physischen Exemplare einer Zubehör-Position dieser
 * Buchung — für den manuellen Exemplar-Picker im Pack-Workflow (Fallback wenn
 * der Packer nicht scannen kann).
 *
 * Quelle ist bewusst die Legacy-Tabelle `accessory_units`: nur deren IDs
 * versteht `applyScannedUnits` (lib/scan-substitutions.ts), und der
 * Inventar-Mirror (lib/inventar-mirror.ts) hält die Tabelle auch für
 * Neue-Welt-Stücke (individual tracking) gefüllt.
 *
 * Security: `accessory_id` muss zur set-expandierten Zubehörliste der Buchung
 * gehören — sonst 403. Wählbar = Status `available` ODER für DIESE Buchung
 * reserviert (`accessory_unit_ids`, auch wenn `rented`). Fremd-`rented` /
 * `retired` / `lost` / `damaged` werden ausgeblendet.
 *
 * Response: { is_bulk: boolean, units: [{ id, exemplar_code, status, reserved }] }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const accessoryId = req.nextUrl.searchParams.get('accessory_id');
  if (!accessoryId) {
    return NextResponse.json({ error: 'accessory_id erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, accessory_items, accessories, accessory_unit_ids')
    .eq('id', id)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  // Set-expandierte Zubehörliste der Buchung — gleiche Logik wie scan-lookup,
  // damit Set-Bestandteile (z.B. "Ladestation" im Basic Set) als zur Buchung
  // gehörend gelten und fremdes Zubehör abgewiesen wird.
  type RawItem = { accessory_id: string; qty: number };
  const rawItems: RawItem[] = Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
    ? (booking.accessory_items as RawItem[])
    : (Array.isArray(booking.accessories) ? (booking.accessories as string[]) : []).map((aid) => ({ accessory_id: aid, qty: 1 }));
  const bookingAccessoryIds = new Set<string>(rawItems.map((r) => r.accessory_id));
  if (rawItems.length > 0) {
    const { data: sets } = await supabase
      .from('sets')
      .select('id, accessory_items')
      .in('id', [...bookingAccessoryIds]);
    for (const s of sets ?? []) {
      const subItems = Array.isArray(s.accessory_items) ? (s.accessory_items as RawItem[]) : [];
      for (const sub of subItems) bookingAccessoryIds.add(sub.accessory_id);
    }
  }

  if (!bookingAccessoryIds.has(accessoryId)) {
    return NextResponse.json({ error: 'Zubehör gehört nicht zu dieser Buchung.' }, { status: 403 });
  }

  // is_bulk laden (Sammel-Zubehör hat keine Einzel-Exemplare → Mengen-Modus).
  const { data: acc } = await supabase
    .from('accessories')
    .select('is_bulk')
    .eq('id', accessoryId)
    .maybeSingle();
  const isBulk = (acc as { is_bulk?: boolean } | null)?.is_bulk === true;

  const reservedIds = new Set<string>(
    Array.isArray(booking.accessory_unit_ids)
      ? (booking.accessory_unit_ids as string[]).filter(Boolean)
      : [],
  );

  // Exemplare laden — defensiv: fehlt die Tabelle (Migration nicht durch),
  // liefern wir eine leere Liste statt 500.
  let units: { id: string; exemplar_code: string; status: string; reserved: boolean }[] = [];
  try {
    const { data: rows } = await supabase
      .from('accessory_units')
      .select('id, exemplar_code, status')
      .eq('accessory_id', accessoryId)
      .order('exemplar_code', { ascending: true });
    units = (rows ?? [])
      .filter((u) => {
        const reserved = reservedIds.has(u.id as string);
        // Wählbar: frei verfügbar ODER für genau diese Buchung reserviert.
        return (u.status as string) === 'available' || reserved;
      })
      .map((u) => ({
        id: u.id as string,
        exemplar_code: (u.exemplar_code as string) ?? '',
        status: u.status as string,
        reserved: reservedIds.has(u.id as string),
      }));
  } catch {
    units = [];
  }

  return NextResponse.json({ is_bulk: isBulk, units });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { getProducts } from '@/lib/get-products';
import { lookupProdukteId } from '@/lib/legacy-bridge';

/**
 * GET /api/admin/booking/[id]/camera-exemplars?product_name=X
 *
 * Liefert die wählbaren physischen Kamera-Exemplare (Seriennummern) dieser
 * Buchung für den manuellen Exemplar-Picker — analog zu accessory-exemplars,
 * nur für Kameras. Quelle ist primär die Legacy-Tabelle `product_units`
 * (deren IDs versteht `applyScannedUnits`); ist sie für das Modell leer, wird
 * auf `inventar_units` (typ='kamera', neue Welt) zurückgefallen — dieselben
 * Codes, die der Scanner über scan-lookup auflöst, jeweils über
 * `migration_audit` auf die Legacy-`product_units.id` gemappt.
 *
 * Security: `product_name` muss zu einem Modell DIESER Buchung gehören
 * (Komma-Split des `product_name` bzw. `cameras[]`), sonst 403.
 *
 * Wählbar = Status `available`/`verfuegbar` ODER für genau diese Buchung
 * reserviert (`unit_id` bzw. `cameras[].unit_id`).
 *
 * Response: { is_bulk: false, units: [{ id, exemplar_code, status, reserved }] }
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
  const productName = (req.nextUrl.searchParams.get('product_name') ?? '').trim();
  if (!productName) {
    return NextResponse.json({ error: 'product_name erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, product_id, product_name, unit_id, cameras')
    .eq('id', id)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const want = norm(productName);

  // Welche Modelle gehören zu dieser Buchung? (Multi-Kamera: Komma-Split bzw.
  // cameras[]). Verhindert, dass über diese Route Seriennummern fremder
  // Modelle abgefragt werden.
  type Cam = { product_name?: string | null };
  const bookingCamNames = new Set<string>();
  if (Array.isArray(booking.cameras) && booking.cameras.length > 0) {
    for (const c of booking.cameras as Cam[]) {
      if (c?.product_name) bookingCamNames.add(norm(c.product_name));
    }
  }
  for (const nm of String(booking.product_name ?? '').split(',')) {
    if (nm.trim()) bookingCamNames.add(norm(nm));
  }
  if (!bookingCamNames.has(want)) {
    return NextResponse.json({ error: 'Modell gehört nicht zu dieser Buchung.' }, { status: 403 });
  }

  // Modell → product_id auflösen (Name-Match, Fallback Buchungs-product_id).
  let productId: string | null = null;
  try {
    const products = await getProducts();
    const hit = products.find((p) => norm(p.name) === want);
    productId = hit?.id ?? null;
  } catch { /* getProducts nicht verfügbar */ }
  if (!productId) productId = (booking.product_id as string | null) ?? null;
  if (!productId) {
    return NextResponse.json({ is_bulk: false, units: [] });
  }

  // Reservierte Kamera-Units dieser Buchung (Einzel + Multi-Kamera).
  const reservedIds = new Set<string>();
  if (booking.unit_id) reservedIds.add(booking.unit_id as string);
  if (Array.isArray(booking.cameras)) {
    for (const c of booking.cameras as { unit_id?: string | null }[]) {
      if (c?.unit_id) reservedIds.add(c.unit_id);
    }
  }

  // Primär: Legacy product_units des Modells.
  let units: { id: string; exemplar_code: string; status: string; reserved: boolean }[] = [];
  try {
    const { data: rows } = await supabase
      .from('product_units')
      .select('id, serial_number, label, status')
      .eq('product_id', productId)
      .order('serial_number', { ascending: true });
    units = (rows ?? [])
      .filter((u) => (u.status as string) === 'available' || reservedIds.has(u.id as string))
      .map((u) => ({
        id: u.id as string,
        exemplar_code: (u.serial_number as string) ?? (u.label as string) ?? '',
        status: u.status as string,
        reserved: reservedIds.has(u.id as string),
      }));
  } catch {
    units = [];
  }

  // Neue-Welt-Fallback: keine Legacy-Units → inventar_units (typ='kamera').
  if (units.length === 0) {
    try {
      const produktId = await lookupProdukteId(supabase, 'admin_config.products', productId);
      if (produktId) {
        const { data: invRows } = await supabase
          .from('inventar_units')
          .select('id, inventar_code, seriennummer, bezeichnung, status')
          .eq('produkt_id', produktId)
          .eq('typ', 'kamera')
          .eq('tracking_mode', 'individual')
          .order('seriennummer', { ascending: true });
        const invList = (invRows ?? []) as {
          id: string; inventar_code: string | null; seriennummer: string | null;
          bezeichnung: string; status: string;
        }[];
        const mapped = await Promise.all(invList.map(async (inv) => {
          let legacyId: string | null = null;
          try {
            const { data: audit } = await supabase
              .from('migration_audit')
              .select('alte_id')
              .eq('alte_tabelle', 'product_units')
              .eq('neue_tabelle', 'inventar_units')
              .eq('neue_id', inv.id)
              .maybeSingle();
            legacyId = (audit as { alte_id?: string } | null)?.alte_id ?? null;
          } catch { /* migration_audit fehlt — Inventar-ID nutzen */ }
          const unitId = legacyId ?? inv.id;
          const reserved = reservedIds.has(unitId) || reservedIds.has(inv.id);
          const available = inv.status === 'verfuegbar' || inv.status === 'available';
          return {
            id: unitId,
            exemplar_code: inv.seriennummer ?? inv.inventar_code ?? inv.bezeichnung ?? '',
            status: available ? 'available' : inv.status,
            reserved,
            selectable: available || reserved,
          };
        }));
        units = mapped
          .filter((u) => u.selectable)
          .map((u) => ({ id: u.id, exemplar_code: u.exemplar_code, status: u.status, reserved: u.reserved }));
      }
    } catch { /* neue Welt nicht vorhanden */ }
  }

  return NextResponse.json({ is_bulk: false, units });
}

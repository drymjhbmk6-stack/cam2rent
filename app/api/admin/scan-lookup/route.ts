import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getCurrentAdminUser } from '@/lib/admin-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/admin/scan-lookup
 *
 * Loest einen gescannten Code in das zugehoerige Stueck auf — fuer den
 * Pack-Workflow (`/admin/versand/[id]/packen`). Erlaubt Substitution: wenn
 * der gescannte Code zu einem Stueck der gleichen Kategorie gehoert wie ein
 * Buchungs-Slot, signalisiert die API `matchesBooking=true` und der Client
 * tauscht die Buchungs-Zuordnung beim Pack-Submit aus. Wenn der Code zu einem
 * komplett anderen Artikel gehoert, kommt der Klartext-Name zurueck, damit
 * die UI "Zubehör 'SanDisk 64 GB' wird nicht benötigt" anzeigen kann.
 *
 * Body: { code: string, bookingId: string }
 *
 * Response (kind='camera'):
 *   { kind, productId, productName, unitId, serialNumber, matchesBooking,
 *     conflict?: { bookingId, customerName } }
 *
 * Response (kind='accessory'):
 *   { kind, accessoryId, accessoryName, unitId, exemplarCode, matchesBooking,
 *     conflict?: { bookingId, customerName } }
 *
 * Response (kind='unknown'): { kind: 'unknown' }
 */

const limiter = rateLimit({ maxAttempts: 60, windowMs: 60 * 1000 });

function normalizeCode(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '');
}

export async function POST(req: NextRequest) {
  const user = await getCurrentAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  if (!limiter.check(getClientIp(req)).success) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const rawCode = typeof body.code === 'string' ? body.code : '';
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  const code = normalizeCode(rawCode);
  if (!code || !bookingId) {
    return NextResponse.json({ error: 'code + bookingId erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Buchung laden — fuer matchesBooking-Check brauchen wir product_id
  // (Kamera) und alle accessory_ids im Warenkorb (Zubehoer). Set-Inhalte
  // werden mit aufgeloest, weil ein Set in der UI nur als Container
  // erscheint, die Sub-Items aber physisch gepackt werden.
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, product_id, accessory_items, accessories')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 });
  }

  const bookingProductId = booking.product_id as string | null;

  type RawItem = { accessory_id: string; qty: number };
  const rawItems: RawItem[] = Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
    ? (booking.accessory_items as RawItem[])
    : (Array.isArray(booking.accessories) ? (booking.accessories as string[]) : []).map((aid) => ({ accessory_id: aid, qty: 1 }));

  // Set-Sub-Items expandieren — wenn der User eine Karte aus einem Set tauscht,
  // muss die accessory_id des Sub-Items als "in der Buchung enthalten" gelten.
  const directIds = new Set<string>(rawItems.map((r) => r.accessory_id));
  if (rawItems.length > 0) {
    const { data: sets } = await supabase
      .from('sets')
      .select('id, accessory_items')
      .in('id', [...directIds]);
    for (const s of sets ?? []) {
      const subItems = Array.isArray(s.accessory_items) ? (s.accessory_items as RawItem[]) : [];
      for (const sub of subItems) directIds.add(sub.accessory_id);
    }
  }
  const bookingAccessoryIds = directIds;

  // ── 1) Versuche es als Kamera-Seriennummer ────────────────────────────────
  // Kamera-Seriennummern sind nicht garantiert komplett unique systemweit
  // (theoretisch koennte eine Hero11- und eine Hero13-Charge dieselbe Endung
  // teilen), deshalb maybeSingle + casefold gegen die Spalte mit ilike.
  let cameraUnit: { id: string; product_id: string; serial_number: string; status: string } | null = null;
  {
    const { data } = await supabase
      .from('product_units')
      .select('id, product_id, serial_number, status')
      .ilike('serial_number', code)
      .maybeSingle();
    cameraUnit = data as typeof cameraUnit;
  }

  // Fallback: inventar_units (neue Welt). Wenn dort gefunden, mappen wir
  // ueber migration_audit zur Legacy-Welt zurueck — sonst zeigen wir die
  // Inventar-IDs, die fuer Booking-Overlay nicht passen.
  if (!cameraUnit) {
    const { data: invUnit } = await supabase
      .from('inventar_units')
      .select('id, produkt_id, seriennummer, inventar_code, bezeichnung, status, typ')
      .or(`seriennummer.ilike.${code},inventar_code.ilike.${code},bezeichnung.ilike.${code}`)
      .eq('typ', 'kamera')
      .maybeSingle();
    if (invUnit) {
      const inv = invUnit as { id: string; produkt_id: string | null; seriennummer: string | null; inventar_code: string | null; bezeichnung: string; status: string };
      // legacy product_units.id ueber migration_audit suchen
      let legacyUnitId: string | null = null;
      try {
        const { data: audit } = await supabase
          .from('migration_audit')
          .select('alte_id')
          .eq('alte_tabelle', 'product_units')
          .eq('neue_tabelle', 'inventar_units')
          .eq('neue_id', inv.id)
          .maybeSingle();
        legacyUnitId = (audit as { alte_id?: string } | null)?.alte_id ?? null;
      } catch { /* migration_audit fehlt */ }
      // legacy product_id ueber migration_audit auf produkte suchen
      let legacyProductId: string | null = null;
      if (inv.produkt_id) {
        try {
          const { data: audit2 } = await supabase
            .from('migration_audit')
            .select('alte_id')
            .eq('alte_tabelle', 'admin_config.products')
            .eq('neue_tabelle', 'produkte')
            .eq('neue_id', inv.produkt_id)
            .maybeSingle();
          legacyProductId = (audit2 as { alte_id?: string } | null)?.alte_id ?? null;
        } catch { /* egal */ }
      }
      cameraUnit = {
        id: legacyUnitId ?? inv.id,
        product_id: legacyProductId ?? '',
        serial_number: inv.seriennummer ?? inv.inventar_code ?? inv.bezeichnung,
        status: inv.status,
      };
    }
  }

  if (cameraUnit) {
    // Konflikt-Check: in einer anderen aktiven Buchung als unit_id?
    const { data: conflictBookings } = await supabase
      .from('bookings')
      .select('id, customer_name, status')
      .eq('unit_id', cameraUnit.id)
      .neq('id', bookingId)
      .not('status', 'in', '(cancelled,completed,returned)')
      .limit(1);
    const conflict = conflictBookings && conflictBookings.length > 0
      ? {
          bookingId: conflictBookings[0].id as string,
          customerName: (conflictBookings[0].customer_name as string | null) ?? null,
        }
      : null;

    // Produkt-Name nachladen
    let productName = '';
    if (cameraUnit.product_id) {
      const { data: prod } = await supabase
        .from('admin_config')
        .select('value')
        .eq('key', 'products')
        .maybeSingle();
      const products = (prod?.value as Array<{ id: string; name: string }> | null) ?? [];
      const match = products.find((p) => p.id === cameraUnit.product_id);
      productName = match?.name ?? cameraUnit.product_id;
    }

    return NextResponse.json({
      kind: 'camera',
      productId: cameraUnit.product_id,
      productName,
      unitId: cameraUnit.id,
      serialNumber: cameraUnit.serial_number,
      matchesBooking: cameraUnit.product_id === bookingProductId,
      conflict,
    });
  }

  // ── 2) Versuche es als Zubehoer-Exemplar-Code ─────────────────────────────
  let accessoryUnit: { id: string; accessory_id: string; exemplar_code: string; status: string } | null = null;
  {
    const { data } = await supabase
      .from('accessory_units')
      .select('id, accessory_id, exemplar_code, status')
      .ilike('exemplar_code', code)
      .maybeSingle();
    accessoryUnit = data as typeof accessoryUnit;
  }
  if (!accessoryUnit) {
    const { data: invUnit } = await supabase
      .from('inventar_units')
      .select('id, produkt_id, seriennummer, inventar_code, bezeichnung, status, typ')
      .or(`inventar_code.ilike.${code},seriennummer.ilike.${code},bezeichnung.ilike.${code}`)
      .in('typ', ['zubehoer', 'verbrauch'])
      .maybeSingle();
    if (invUnit) {
      const inv = invUnit as { id: string; produkt_id: string | null; seriennummer: string | null; inventar_code: string | null; bezeichnung: string; status: string };
      let legacyUnitId: string | null = null;
      try {
        const { data: audit } = await supabase
          .from('migration_audit')
          .select('alte_id')
          .eq('alte_tabelle', 'accessory_units')
          .eq('neue_tabelle', 'inventar_units')
          .eq('neue_id', inv.id)
          .maybeSingle();
        legacyUnitId = (audit as { alte_id?: string } | null)?.alte_id ?? null;
      } catch { /* egal */ }
      let legacyAccessoryId: string | null = null;
      if (inv.produkt_id) {
        try {
          const { data: audit2 } = await supabase
            .from('migration_audit')
            .select('alte_id')
            .eq('alte_tabelle', 'accessories')
            .eq('neue_tabelle', 'produkte')
            .eq('neue_id', inv.produkt_id)
            .maybeSingle();
          legacyAccessoryId = (audit2 as { alte_id?: string } | null)?.alte_id ?? null;
        } catch { /* egal */ }
      }
      accessoryUnit = {
        id: legacyUnitId ?? inv.id,
        accessory_id: legacyAccessoryId ?? '',
        exemplar_code: inv.inventar_code ?? inv.seriennummer ?? inv.bezeichnung,
        status: inv.status,
      };
    }
  }

  if (accessoryUnit) {
    const { data: conflictBookings } = await supabase
      .from('bookings')
      .select('id, customer_name, status, accessory_unit_ids')
      .neq('id', bookingId)
      .not('status', 'in', '(cancelled,completed,returned)')
      .overlaps('accessory_unit_ids', [accessoryUnit.id])
      .limit(1);
    const conflict = conflictBookings && conflictBookings.length > 0
      ? {
          bookingId: conflictBookings[0].id as string,
          customerName: (conflictBookings[0].customer_name as string | null) ?? null,
        }
      : null;

    const { data: acc } = await supabase
      .from('accessories')
      .select('name')
      .eq('id', accessoryUnit.accessory_id)
      .maybeSingle();

    return NextResponse.json({
      kind: 'accessory',
      accessoryId: accessoryUnit.accessory_id,
      accessoryName: (acc?.name as string | undefined) ?? accessoryUnit.accessory_id,
      unitId: accessoryUnit.id,
      exemplarCode: accessoryUnit.exemplar_code,
      matchesBooking: bookingAccessoryIds.has(accessoryUnit.accessory_id),
      conflict,
    });
  }

  // Komplett unbekannter Code
  return NextResponse.json({ kind: 'unknown' });
}

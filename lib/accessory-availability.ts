import { createServiceClient } from '@/lib/supabase';
import { RESERVING_BOOKING_STATUSES } from '@/lib/booking-statuses';
import { isTestMode } from '@/lib/env-mode';
import {
  toIsoDate,
  loadBufferDays,
  computeEffectiveBookingSpan,
  computeShipDate,
  computeReturnDueDate,
  isMissingLogisticsColumn,
  DEFAULT_BUFFER,
  type BufferDays,
} from '@/lib/booking-buffer';
import { getBerlinDateKey } from '@/lib/timezone';
import { loadActiveReservations } from '@/lib/reservation-holds';

interface AccessoryItemLite {
  accessory_id: string;
  qty: number;
}

interface ReservingBooking {
  accessories: string[] | null;
  accessory_items: AccessoryItemLite[] | null;
  accessory_unit_ids: string[] | null;
  rental_from: string;
  rental_to: string;
  delivery_mode: string | null;
  status?: string | null;
  ship_date_override?: string | null;
  return_due_date_override?: string | null;
  actual_dispatch_at?: string | null;
  actual_delivery_at?: string | null;
  actual_return_at?: string | null;
  return_arrived_at?: string | null;
}

export interface AccessoryAvailabilityRow {
  id: string;
  name: string;
  total_qty: number;
  booked_qty: number;
  available_qty_remaining: number;
  is_available: boolean;
  compatible: boolean;
}

export interface AccessoryAvailabilityResult {
  accessories: AccessoryAvailabilityRow[];
  buffer: { from: string; to: string; beforeDays: number; afterDays: number };
}

/**
 * Berechnet qty-aware welche Zubehoerteile fuer den Zeitraum verfuegbar sind.
 *
 * Gemeinsame Logik fuer den oeffentlichen Endpoint
 * `GET /api/accessory-availability` UND den serverseitigen Aufruf im
 * Buchungs-Zubehoer-Edit (`PATCH /api/admin/booking/[id]`) — kein
 * HTTP-Self-Fetch mehr (war hinter Cloudflare/Firewall unzuverlaessig).
 *
 * Beruecksichtigt:
 *  - Gesamtmenge: accessories.available_qty (durch syncAccessoryQty gepflegt)
 *  - Bereits gebuchtes Zubehoer mit Prioritaet:
 *      1. accessory_unit_ids (UUID[]) — exakte Units
 *      2. accessory_items (JSONB qty-aware)
 *      3. accessories (TEXT[]) — uralte Legacy, je 1 Stueck
 *  - Puffer-Tage je Lieferart auf eigenen UND fremden Buchungen
 *  - Produkt-Kompatibilitaet (compatible_product_ids)
 *
 * Zaehlt ALLE reservierenden Buchungen mit — inkl. der ggf. gerade
 * bearbeiteten. Der Aufrufer rechnet daher mit dem Delta gegen den
 * Ist-Zustand der Buchung.
 */
export async function computeAccessoryAvailability(opts: {
  from: string;
  to: string;
  productId?: string | null;
  deliveryMode?: string;
  /** Diese Buchung NICHT mitzaehlen — fuer den Buchungs-Zubehoer-Edit, damit
   *  die Buchung nicht gegen sich selbst blockiert (insb. Set-Buchungen, deren
   *  accessory_items nur die Set-ID enthalten). */
  excludeBookingId?: string;
  /** Eigene Admin-Reservierungen dieses Users NICHT mitzaehlen (sonst blockiert
   *  sich der Kunde beim Abschluss seiner eigenen Reservierung selbst). */
  excludeUserId?: string | null;
}): Promise<AccessoryAvailabilityResult> {
  const { from, to } = opts;
  const productId = opts.productId ?? null;
  const deliveryMode = opts.deliveryMode ?? 'versand';
  const excludeBookingId = opts.excludeBookingId ?? null;
  const excludeUserId = opts.excludeUserId ?? null;

  const supabase = createServiceClient();

  // 1. Puffer-Tage laden — zentral, damit Kamera- und Zubehoer-Verfuegbarkeit
  // garantiert dieselben Werte nutzen (frueher eine lokale Kopie hier).
  const buffer: BufferDays = await loadBufferDays(supabase, DEFAULT_BUFFER);

  // 2. Effektiven Zeitraum mit Puffer berechnen
  const beforeDays = deliveryMode === 'abholung' ? buffer.abholung_before : buffer.versand_before;
  const afterDays = deliveryMode === 'abholung' ? buffer.abholung_after : buffer.versand_after;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setDate(fromDate.getDate() - beforeDays);
  toDate.setDate(toDate.getDate() + afterDays);

  // toIsoDate liest die lokalen Kalenderkomponenten (DST-fest) statt
  // toISOString() (UTC → off-by-one an DST-Kanten).
  const bufferedFrom = toIsoDate(fromDate);
  const bufferedTo = toIsoDate(toDate);

  // 3. Alle Zubehörteile laden — inkl. upgrade_group/is_upgrade_base
  //    fuer die Set-Expansion (Default-Item wird uebersprungen wenn der
  //    Kunde im selben accessory_items eine Upgrade-Variante hat).
  //    Wichtig: hier KEIN `available=true`-Filter, weil interne Set-
  //    Default-Items oft `available=false` haben, aber trotzdem
  //    verfuegbarkeitsmaessig zaehlen sollen — sie binden physische
  //    Stuecke aus der Speicher-/Akku-Pool-Tabelle.
  type AccRow = {
    id: string;
    name: string;
    available_qty: number | null;
    available: boolean | null;
    compatible_product_ids: string[] | null;
    upgrade_group?: string | null;
    is_upgrade_base?: boolean | null;
  };
  let accRes: { data: AccRow[] | null; error: { message: string } | null } = await supabase
    .from('accessories')
    .select('id, name, available_qty, available, compatible_product_ids, upgrade_group, is_upgrade_base');
  if (accRes.error && /upgrade_group|is_upgrade_base|column|schema cache|PGRST/i.test(accRes.error.message)) {
    accRes = await supabase
      .from('accessories')
      .select('id, name, available_qty, available, compatible_product_ids');
  }
  const allAccessoriesRaw = accRes.data ?? [];

  if (allAccessoriesRaw.length === 0) {
    return { accessories: [], buffer: { from: bufferedFrom, to: bufferedTo, beforeDays, afterDays } };
  }

  // Anzeige/Output-Liste enthaelt nur kundenseitig sichtbares Zubehoer
  // (Set-Defaults bleiben raus, sonst tauchen sie im UI-Picker auf).
  const allAccessories = allAccessoriesRaw.filter((a) => a.available !== false);

  // Upgrade-Map: accessory_id -> { upgrade_group, is_upgrade_base } fuer die
  // Default-Override-Logik bei Set-Expansion.
  const upgradeInfoById = new Map<string, { group: string; isBase: boolean }>();
  for (const a of allAccessoriesRaw) {
    if (a.upgrade_group) {
      upgradeInfoById.set(a.id, {
        group: a.upgrade_group,
        isBase: a.is_upgrade_base === true,
      });
    }
  }

  // 4. Set-Inhalte laden (id -> Liste der Einzel-Accessories). Brauchen wir
  //    fuer die Expansion bei Set-Buchungen — der Buchungsflow speichert
  //    Sets als pseudo-acc {accessory_id: set_id, qty: 1}, der Verfuegbarkeits-
  //    Check muss die echten Einzelteile dahinter zaehlen.
  const { data: setsData } = await supabase
    .from('sets')
    .select('id, accessory_items');
  const setItemsById = new Map<string, AccessoryItemLite[]>();
  for (const s of (setsData ?? []) as Array<{ id: string; accessory_items: unknown }>) {
    if (!Array.isArray(s.accessory_items)) continue;
    const items: AccessoryItemLite[] = [];
    for (const it of s.accessory_items as Array<{ accessory_id?: string; qty?: number }>) {
      if (!it?.accessory_id) continue;
      const q = typeof it.qty === 'number' && it.qty > 0 ? Math.floor(it.qty) : 1;
      items.push({ accessory_id: it.accessory_id, qty: q });
    }
    if (items.length > 0) setItemsById.set(s.id, items);
  }

  // 5. Überlappende Buchungen laden
  const globalTest = await isTestMode();
  const bkSelBase =
    'id, status, accessories, accessory_items, accessory_unit_ids, rental_from, rental_to, delivery_mode';
  const bkSelOverrides = `${bkSelBase}, ship_date_override, return_due_date_override`;
  const bkSelFull = `${bkSelOverrides}, actual_dispatch_at, actual_delivery_at, actual_return_at, return_arrived_at`;

  const runBookings = (cols: string) => {
    let q = supabase
      .from('bookings')
      .select(cols)
      .in('status', [...RESERVING_BOOKING_STATUSES])
      .or('accessories.neq.{},accessory_items.not.is.null,accessory_unit_ids.neq.{}');
    if (!globalTest) q = q.not('is_test', 'is', true);
    if (excludeBookingId) q = q.neq('id', excludeBookingId);
    return q.returns<ReservingBooking[]>();
  };

  // Dreistufig: voll → ohne Ist-Logistik → ohne Ist-Logistik + Overrides.
  let bkRes = await runBookings(bkSelFull);
  if (bkRes.error && isMissingLogisticsColumn(bkRes.error.message)) {
    bkRes = await runBookings(bkSelOverrides);
  }
  if (
    bkRes.error &&
    /ship_date_override|return_due_date_override/i.test(bkRes.error.message || '')
  ) {
    bkRes = await runBookings(bkSelBase);
  }
  const bookings = bkRes.data;

  // 6. Unit→Accessory-Mapping vorab laden
  const allUnitIds = new Set<string>();
  for (const b of bookings ?? []) {
    if (Array.isArray(b.accessory_unit_ids)) {
      for (const uid of b.accessory_unit_ids) allUnitIds.add(uid);
    }
  }

  const unitToAcc = new Map<string, string>();
  if (allUnitIds.size > 0) {
    const { data: units } = await supabase
      .from('accessory_units')
      .select('id, accessory_id')
      .in('id', [...allUnitIds]);
    for (const u of units ?? []) {
      unitToAcc.set(u.id as string, u.accessory_id as string);
    }
  }

  // Helper: expandiert eine Buchung in eine Map accId -> belegte qty, MIT
  //  Set-Expansion + Upgrade-Default-Override.
  //
  //  Beispiel: accessory_items = [{basic_set, 1}, {512gb, 1}]
  //   - basic_set ist eine Set-ID → wird zu seinen Items expandiert,
  //     z.B. [{64gb, 1}, {ladekabel, 1}].
  //   - 64gb ist ein Upgrade-Default (upgrade_group='storage',
  //     is_upgrade_base=true), und 512gb ist im selben accessory_items
  //     in derselben Gruppe und KEIN Base → 64gb wird uebersprungen
  //     (das Set-Default ist durch das Upgrade ersetzt).
  function expandBookingToAccCounts(items: AccessoryItemLite[]): Map<string, number> {
    // 1. Welche Upgrade-Gruppen sind in dieser Buchung mit einer
    //    Nicht-Base-Variante belegt? Pruefen sowohl direkte items als
    //    auch Set-Inhalte.
    const activeUpgradeGroups = new Set<string>();
    const collectFromAcc = (accId: string) => {
      const info = upgradeInfoById.get(accId);
      if (info && !info.isBase) activeUpgradeGroups.add(info.group);
    };
    for (const it of items) {
      if (setItemsById.has(it.accessory_id)) {
        for (const sub of setItemsById.get(it.accessory_id) ?? []) {
          collectFromAcc(sub.accessory_id);
        }
      } else {
        collectFromAcc(it.accessory_id);
      }
    }

    // 2. Zaehlen mit Override. Default-Items aktiver Upgrade-Gruppen
    //    werden uebersprungen.
    const counts = new Map<string, number>();
    const addCount = (accId: string, qty: number) => {
      const info = upgradeInfoById.get(accId);
      if (info?.isBase && activeUpgradeGroups.has(info.group)) return;
      counts.set(accId, (counts.get(accId) ?? 0) + qty);
    };

    for (const it of items) {
      if (!it?.accessory_id || !it.qty || it.qty <= 0) continue;
      const setSub = setItemsById.get(it.accessory_id);
      if (setSub) {
        for (const sub of setSub) {
          addCount(sub.accessory_id, sub.qty * it.qty);
        }
      } else {
        addCount(it.accessory_id, it.qty);
      }
    }
    return counts;
  }

  // 6. Pro Zubehör: wie viele sind im Zeitraum gebucht?
  const bookedCounts = new Map<string, number>();

  const todayKey = getBerlinDateKey(new Date());

  for (const booking of bookings ?? []) {
    // Gleiche Rechnung wie Kamera-Verfuegbarkeit und Ueberbuchungssperre:
    // Plan (Puffer/Override) plus tatsaechlicher Paketlauf. Frueher wurden hier
    // sogar die Override-Termine ignoriert — ein vorgezogener Versandtag blockte
    // die Kamera, aber nicht die Speicherkarte im selben Paket.
    const eff = computeEffectiveBookingSpan(booking, buffer, { today: todayKey });

    if (!(bufferedFrom <= eff.end && bufferedTo >= eff.start)) {
      continue;
    }

    // Belegte Menge pro Zubehoer = MAXIMUM aus:
    //  (a) konkret zugewiesenen Exemplaren (accessory_unit_ids) und
    //  (b) der gebuchten Zusammensetzung (accessory_items bzw. Legacy-Array,
    //      inkl. Set-Expansion + Upgrade-Default-Override).
    //
    // Frueher war (a) ein exklusiver Vorrang: sobald EIN Exemplar zugewiesen
    // war, wurde der Rest der Buchung ignoriert. Zubehoer ohne eigenes
    // Exemplar (Sammel-Zubehoer, oder wenn die Zuweisung kein freies Stueck
    // fand) fiel damit komplett aus der Belegung — die Verfuegbarkeit war zu
    // hoch und die Position ueberbuchbar. Set-Inhalte wurden gesondert
    // nachgezaehlt, was sie doppelt zaehlte, sobald ihnen doch Exemplare
    // zugewiesen waren (passiert beim Bearbeiten einer Buchung).
    //
    // Maximum statt Summe, weil (a) und (b) dieselbe Buchungsposition aus zwei
    // Blickwinkeln beschreiben — nicht zwei getrennte Bedarfe.
    const fromUnits = new Map<string, number>();
    if (Array.isArray(booking.accessory_unit_ids)) {
      for (const uid of booking.accessory_unit_ids) {
        const accId = unitToAcc.get(uid);
        if (!accId) continue;
        fromUnits.set(accId, (fromUnits.get(accId) ?? 0) + 1);
      }
    }

    const itemSource: AccessoryItemLite[] =
      Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
        ? booking.accessory_items
            .filter((it) => !!it?.accessory_id)
            .map((it) => ({
              accessory_id: it.accessory_id,
              qty: typeof it.qty === 'number' && it.qty > 0 ? Math.floor(it.qty) : 1,
            }))
        : Array.isArray(booking.accessories)
          ? booking.accessories.filter(Boolean).map((id) => ({ accessory_id: id, qty: 1 }))
          : [];

    const expected = expandBookingToAccCounts(itemSource);

    for (const accId of new Set([...fromUnits.keys(), ...expected.keys()])) {
      const qty = Math.max(fromUnits.get(accId) ?? 0, expected.get(accId) ?? 0);
      if (qty <= 0) continue;
      bookedCounts.set(accId, (bookedCounts.get(accId) ?? 0) + qty);
    }
  }

  // 6b. Admin-48h-Reservierungen (Holds) als belegt mitzaehlen — gleiche
  //     qty-aware Set-Expansion wie Buchungen. Eigene Reservierung des
  //     Betrachters ausgeschlossen (excludeUserId). Defensiv (No-Op ohne
  //     reservations-Migration).
  // Grosszuegiges Ladefenster (Puffer-Raender), die exakte Overlap-Pruefung
  // pro Reservierung folgt unten mit deren eigener Puffer-Spanne.
  const resFromDate = new Date(fromDate); resFromDate.setDate(resFromDate.getDate() - 35);
  const resToDate = new Date(toDate); resToDate.setDate(resToDate.getDate() + 35);
  const reservations = await loadActiveReservations(supabase, {
    fromIso: toIsoDate(resFromDate),
    toIso: toIsoDate(resToDate),
    excludeUserId,
    globalTest,
  });
  for (const r of reservations) {
    // 48h-Reservierungen sind reine PLAN-Objekte ohne Paketlauf — hier gibt es
    // bewusst keine Ist-Logistik, nur die Puffer-Rechnung (gleiches gilt fuer
    // die Warenkorb-Holds in lib/cart-holds.ts).
    const rBufferedFrom = toIsoDate(
      computeShipDate(r.rentalFrom, r.deliveryMode, buffer, null),
    );
    const rBufferedTo = toIsoDate(
      computeReturnDueDate(r.rentalTo, r.deliveryMode, buffer, null),
    );
    if (!(bufferedFrom <= rBufferedTo && bufferedTo >= rBufferedFrom)) continue;

    // Alle Zubehoer-Items aller Zeilen aufsummieren, dann wie eine Buchung
    // expandieren (Set-Auflösung + Upgrade-Default-Override).
    const items: AccessoryItemLite[] = [];
    for (const line of r.items.lines) {
      for (const a of line.accessories) {
        if (!a.accessory_id || a.qty <= 0) continue;
        items.push({ accessory_id: a.accessory_id, qty: a.qty * Math.max(1, line.qty) });
      }
    }
    if (items.length === 0) continue;
    const counts = expandBookingToAccCounts(items);
    for (const [accId, qty] of counts) {
      bookedCounts.set(accId, (bookedCounts.get(accId) ?? 0) + qty);
    }
  }

  // 7. Ergebnis zusammenbauen
  const accessories: AccessoryAvailabilityRow[] = allAccessories.map((acc) => {
    const totalQty = acc.available_qty ?? 0;
    const bookedQty = bookedCounts.get(acc.id) ?? 0;
    const remaining = Math.max(0, totalQty - bookedQty);

    const compatIds: string[] = acc.compatible_product_ids ?? [];
    const compatible = compatIds.length === 0 || (productId ? compatIds.includes(productId) : true);

    return {
      id: acc.id,
      name: acc.name,
      total_qty: totalQty,
      booked_qty: bookedQty,
      available_qty_remaining: remaining,
      is_available: remaining > 0 && compatible,
      compatible,
    };
  });

  return { accessories, buffer: { from: bufferedFrom, to: bufferedTo, beforeDays, afterDays } };
}

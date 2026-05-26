import { createServiceClient } from '@/lib/supabase';
import { RESERVING_BOOKING_STATUSES } from '@/lib/booking-statuses';
import { isTestMode } from '@/lib/env-mode';

interface BufferDays {
  versand_before: number;
  versand_after: number;
  abholung_before: number;
  abholung_after: number;
}

const DEFAULT_BUFFER: BufferDays = {
  versand_before: 2, versand_after: 2,
  abholung_before: 0, abholung_after: 1,
};

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
}): Promise<AccessoryAvailabilityResult> {
  const { from, to } = opts;
  const productId = opts.productId ?? null;
  const deliveryMode = opts.deliveryMode ?? 'versand';
  const excludeBookingId = opts.excludeBookingId ?? null;

  const supabase = createServiceClient();

  // 1. Puffer-Tage laden
  const { data: bufferSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'booking_buffer_days')
    .maybeSingle();

  const buffer: BufferDays = bufferSetting?.value
    ? (typeof bufferSetting.value === 'string' ? JSON.parse(bufferSetting.value) : bufferSetting.value)
    : DEFAULT_BUFFER;

  // 2. Effektiven Zeitraum mit Puffer berechnen
  const beforeDays = deliveryMode === 'abholung' ? buffer.abholung_before : buffer.versand_before;
  const afterDays = deliveryMode === 'abholung' ? buffer.abholung_after : buffer.versand_after;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setDate(fromDate.getDate() - beforeDays);
  toDate.setDate(toDate.getDate() + afterDays);

  const bufferedFrom = fromDate.toISOString().split('T')[0];
  const bufferedTo = toDate.toISOString().split('T')[0];

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
  let bookingsQuery = supabase
    .from('bookings')
    .select('id, accessories, accessory_items, accessory_unit_ids, rental_from, rental_to, delivery_mode')
    .in('status', [...RESERVING_BOOKING_STATUSES])
    .or('accessories.neq.{},accessory_items.not.is.null,accessory_unit_ids.neq.{}');
  if (!globalTest) {
    bookingsQuery = bookingsQuery.not('is_test', 'is', true);
  }
  if (excludeBookingId) {
    bookingsQuery = bookingsQuery.neq('id', excludeBookingId);
  }
  const { data: bookings } = await bookingsQuery.returns<ReservingBooking[]>();

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

  for (const booking of bookings ?? []) {
    const bMode = booking.delivery_mode ?? 'versand';
    const bBefore = bMode === 'abholung' ? buffer.abholung_before : buffer.versand_before;
    const bAfter = bMode === 'abholung' ? buffer.abholung_after : buffer.versand_after;

    const bFrom = new Date(booking.rental_from);
    const bTo = new Date(booking.rental_to);
    bFrom.setDate(bFrom.getDate() - bBefore);
    bTo.setDate(bTo.getDate() + bAfter);

    const bookingBufferedFrom = bFrom.toISOString().split('T')[0];
    const bookingBufferedTo = bTo.toISOString().split('T')[0];

    if (!(bufferedFrom <= bookingBufferedTo && bufferedTo >= bookingBufferedFrom)) {
      continue;
    }

    // Prio 1: accessory_unit_ids (konkret zugewiesene Exemplare) — die sind
    //  bereits aufgeloest, keine Set-Expansion noetig. Buchungs-Pipeline
    //  weist heute fuer Set-Inhalte KEINE Units zu (assignAccessoryUnits
    //  bekommt nur Set-ID als pseudo-acc), daher tauchen die Set-Default-
    //  Items hier in der Regel nicht auf — das wird in Prio 2 nachgeholt.
    if (Array.isArray(booking.accessory_unit_ids) && booking.accessory_unit_ids.length > 0) {
      for (const uid of booking.accessory_unit_ids) {
        const accId = unitToAcc.get(uid);
        if (!accId) continue;
        bookedCounts.set(accId, (bookedCounts.get(accId) ?? 0) + 1);
      }
      // ZUSAETZLICH: accessory_items koennen Set-IDs enthalten, deren
      // Inhalte NICHT als Units zugewiesen wurden. Diese Set-Defaults
      // muessen wir trotzdem als belegt zaehlen — sonst wuerde z.B.
      // das 64-GB-Default im "Basic Set" nie als gebucht erkannt, und
      // der Kunden-Verfuegbarkeits-Check wuerde Ueberbuchungen zulassen.
      if (Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0) {
        for (const it of booking.accessory_items) {
          if (!it?.accessory_id) continue;
          // Nur Set-Inhalte expandieren — direkte Items wurden bereits als
          // Units oben gezaehlt. Wir verlassen uns hier auf setItemsById:
          // Wenn die accessory_id KEIN Set ist, ueberspringen.
          const setSub = setItemsById.get(it.accessory_id);
          if (!setSub) continue;
          // Active-Upgrade-Gruppen ueber alle items dieser Buchung sammeln
          // (auch fuer direkt gewaehlte Upgrades, die nicht im Set sind).
          const activeUpgradeGroups = new Set<string>();
          for (const other of booking.accessory_items) {
            if (!other?.accessory_id) continue;
            const otherSet = setItemsById.get(other.accessory_id);
            const collect = (aid: string) => {
              const info = upgradeInfoById.get(aid);
              if (info && !info.isBase) activeUpgradeGroups.add(info.group);
            };
            if (otherSet) {
              for (const sub of otherSet) collect(sub.accessory_id);
            } else {
              collect(other.accessory_id);
            }
          }
          for (const sub of setSub) {
            const info = upgradeInfoById.get(sub.accessory_id);
            if (info?.isBase && activeUpgradeGroups.has(info.group)) continue;
            const qty = sub.qty * (typeof it.qty === 'number' && it.qty > 0 ? Math.floor(it.qty) : 1);
            bookedCounts.set(sub.accessory_id, (bookedCounts.get(sub.accessory_id) ?? 0) + qty);
          }
        }
      }
      continue;
    }

    // Prio 2: accessory_items (qty-aware) — MIT Set-Expansion und
    //  Upgrade-Default-Override. Die Helper-Funktion macht beides:
    //    - Wenn accessory_id eine Set-ID ist → in Einzelteile expandieren
    //    - Wenn das expandierte Default-Item zu einer Upgrade-Gruppe gehoert,
    //      die in derselben Buchung mit einer Upgrade-Variante belegt ist →
    //      Default ueberspringen.
    if (Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0) {
      const counts = expandBookingToAccCounts(booking.accessory_items);
      for (const [accId, qty] of counts) {
        bookedCounts.set(accId, (bookedCounts.get(accId) ?? 0) + qty);
      }
      continue;
    }

    // Prio 3: accessories[] (uralte Legacy, je 1) — analog mit Set-Expansion.
    //  Hier gibts keine qty, kein upgrade-Override (es gibt kein Upgrade-
    //  Konzept im alten string-array Format).
    if (Array.isArray(booking.accessories)) {
      const items: AccessoryItemLite[] = booking.accessories.map((id) => ({ accessory_id: id, qty: 1 }));
      const counts = expandBookingToAccCounts(items);
      for (const [accId, qty] of counts) {
        bookedCounts.set(accId, (bookedCounts.get(accId) ?? 0) + qty);
      }
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

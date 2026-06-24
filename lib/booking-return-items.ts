/**
 * Rückgabe-Positionen einer Buchung — geteilter Resolver für die
 * Rückgabe-Checkliste (Cron `return-checklist`).
 *
 * Liefert die Kameras (mit Seriennummer pro Einheit) + alle Zubehör-/Set-
 * Positionen aufgelöst zu lesbaren Namen. Nutzt dieselben Bausteine wie die
 * Packliste (`resolveBookingCameras` + `resolveAccessoryItems`), damit die
 * Checkliste exakt das auflistet, was auch gepackt/übergeben wurde — inkl.
 * Set-Expansion und Upgrade-Gruppen-Skip.
 */

import type { createServiceClient } from '@/lib/supabase';
import { resolveBookingCameras } from '@/lib/booking-cameras';
import { resolveAccessoryItems } from '@/lib/booking-accessory-apply';

type SB = ReturnType<typeof createServiceClient>;

export interface ReturnCameraLine {
  product_name: string;
  serial_number: string | null;
}

export interface ReturnItemLine {
  name: string;
  qty: number;
  included_parts?: string[];
}

export interface BookingReturnItems {
  cameras: ReturnCameraLine[];
  items: ReturnItemLine[];
}

interface ReturnBookingSource {
  product_id?: string | null;
  product_name?: string | null;
  unit_id?: string | null;
  cameras?: unknown;
  accessory_items?: unknown;
  accessories?: unknown;
}

/**
 * Löst Kameras (mit Seriennummern) + Zubehör/Sets einer Buchung in lesbare
 * Rückgabe-Positionen auf. Set-Container-Zeilen werden herausgefiltert (es
 * bleiben nur die echten physischen Einzelteile), damit die Checkliste eine
 * flache Abhak-Liste ist.
 */
export async function resolveBookingReturnItems(
  supabase: SB,
  booking: ReturnBookingSource,
): Promise<BookingReturnItems> {
  // ── Kameras + Seriennummern (Multi-Kamera-fähig) ──
  const bookingCameras = resolveBookingCameras(booking);
  const cameras: ReturnCameraLine[] = await Promise.all(
    bookingCameras.map(async (c) => {
      let sn: string | null = null;
      if (c.unit_id) {
        const { data: unit } = await supabase
          .from('product_units')
          .select('serial_number')
          .eq('id', c.unit_id)
          .maybeSingle();
        sn = unit?.serial_number ?? null;
      }
      return { product_name: c.product_name, serial_number: sn };
    }),
  );

  // ── Zubehör / Sets ──
  const rawItems: { accessory_id: string; qty: number }[] =
    Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
      ? (booking.accessory_items as { accessory_id: string; qty: number }[])
      : (Array.isArray(booking.accessories) ? (booking.accessories as string[]) : []).map(
          (aid) => ({ accessory_id: aid, qty: 1 }),
        );

  if (rawItems.length === 0) {
    return { cameras, items: [] };
  }

  // Upgrade-Gruppen-Skip: enthält die Buchung sowohl ein Set ALS AUCH ein
  // direkt gewähltes Accessory derselben Upgrade-Gruppe, wird das Set-Default
  // ausgelassen (z.B. 128-GB-Set-Karte vs. direkt gewählte 512-GB-Karte) —
  // konsistent zur Packliste.
  let skipUpgradeGroups: Set<string> | undefined;
  const allIds = [...new Set(rawItems.map((r) => r.accessory_id))];
  const { data: setRows } = await supabase.from('sets').select('id').in('id', allIds);
  const setIds = new Set((setRows ?? []).map((s) => s.id as string));
  const directIds = allIds.filter((id) => !setIds.has(id));
  const hasSet = allIds.some((id) => setIds.has(id));
  if (hasSet && directIds.length > 0) {
    const groups = new Set<string>();
    const accRes = await supabase
      .from('accessories')
      .select('id, upgrade_group')
      .in('id', directIds);
    if (!accRes.error) {
      for (const a of accRes.data ?? []) {
        const g = (a as { upgrade_group?: string | null }).upgrade_group;
        if (g) groups.add(g);
      }
    }
    if (groups.size > 0) skipUpgradeGroups = groups;
  }

  const resolved = await resolveAccessoryItems(
    supabase,
    rawItems,
    skipUpgradeGroups ? { skipUpgradeGroups } : undefined,
  );

  // Set-Container-Zeilen herausfiltern: die haben kein `accessory_id`
  // (resolveAccessoryItems setzt das nur auf echten Einzelteilen + direkten
  // Accessories). Übrig bleiben die physisch zurückzugebenden Stücke.
  const items: ReturnItemLine[] = resolved
    .filter((r) => !!r.accessory_id)
    .map((r) => ({
      name: r.name,
      qty: r.qty,
      included_parts:
        r.included_parts && r.included_parts.length > 0 ? r.included_parts : undefined,
    }));

  return { cameras, items };
}

/**
 * Zentrale Helpers fuer Buchung-Zubehoer mit Stueckzahlen.
 *
 * Zwei Datenquellen:
 *   1. bookings.accessory_items JSONB  — [{accessory_id, qty}] (neu, authoritative)
 *   2. bookings.accessories TEXT[]     — string[] mit unique IDs (legacy)
 *
 * Neue Buchungen schreiben beide Felder. Alte Buchungen haben nur accessories[]
 * ohne qty — dann wird qty=1 pro Eintrag angenommen.
 *
 * Alle Stellen, die Zubehoer von einer Buchung/Intent-Metadata lesen, sollen
 * `getBookingAccessoryItems(...)` verwenden, damit die qty-Logik an einer
 * Stelle lebt.
 */

export interface BookingAccessoryItem {
  accessory_id: string;
  qty: number;
}

/**
 * Normalisiert accessory_items aus einer Buchungs-Row. Akzeptiert auch rohe
 * string[]-Arrays (Legacy) und erzeugt qty=1-Eintraege.
 */
export function normalizeAccessoryItems(
  items: unknown,
  legacyIds?: unknown,
): BookingAccessoryItem[] {
  // Primary: accessory_items JSONB
  if (Array.isArray(items)) {
    const out: BookingAccessoryItem[] = [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const id = (it as Record<string, unknown>).accessory_id;
      const qtyRaw = (it as Record<string, unknown>).qty;
      if (typeof id !== 'string' || !id) continue;
      const qty = typeof qtyRaw === 'number' && Number.isFinite(qtyRaw) && qtyRaw > 0
        ? Math.floor(qtyRaw)
        : 1;
      out.push({ accessory_id: id, qty });
    }
    if (out.length > 0) return out;
  }
  // Fallback: Legacy-Array aus unique IDs → qty=1
  if (Array.isArray(legacyIds)) {
    return legacyIds
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .map((accessory_id) => ({ accessory_id, qty: 1 }));
  }
  return [];
}

/**
 * Aggregiert ein string[]-Array (evtl. mit Duplikaten) zu {id, qty}[].
 */
export function aggregateToItems(ids: string[]): BookingAccessoryItem[] {
  const map = new Map<string, number>();
  for (const id of ids) {
    if (!id) continue;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return [...map.entries()].map(([accessory_id, qty]) => ({ accessory_id, qty }));
}

/**
 * Projiziert {id, qty}[] auf unique string[] fuer die Legacy-Spalte.
 */
export function itemsToLegacyIds(items: BookingAccessoryItem[]): string[] {
  return [...new Set(items.map((i) => i.accessory_id))];
}

/**
 * Summiert die Gesamt-Stueckzahl aller Zubehoer.
 */
export function totalQty(items: BookingAccessoryItem[]): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

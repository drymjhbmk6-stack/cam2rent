import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadBufferDays,
  computeShipDate,
  computeReturnDueDate,
  toIsoDate,
  type BufferDays,
} from '@/lib/booking-buffer';

/**
 * Reservation-Holds — admin-erstellte 48-Stunden-Reservierungen.
 *
 * Eine offene, nicht abgelaufene Reservierung blockiert das Inventar (Kamera +
 * Zubehoer) fuer ALLE ANDEREN Kunden — exakt das Muster der Warenkorb-Holds
 * (lib/cart-holds.ts), nur admin-erzeugt, 48h statt 30min und fuer Kamera UND
 * Zubehoer. Der eigene Kunde wird ueber `excludeUserId` ausgeblendet, damit er
 * seine eigene Reservierung im Checkout nicht als "belegt" sieht.
 *
 * Siehe supabase/supabase-reservations.sql. Bei fehlender Migration sind alle
 * Helper defensive No-Ops (try/catch) — der Shop laeuft dann wie vorher ohne
 * Reservierungs-Layer.
 */

export interface ReservationAccessoryItem {
  accessory_id: string;
  qty: number;
}

export interface ReservationLine {
  productId: string;
  qty: number;
  haftung?: 'none' | 'standard' | 'premium';
  accessories: ReservationAccessoryItem[];
}

export interface ReservationItems {
  lines: ReservationLine[];
}

export interface ActiveReservation {
  userId: string;
  rentalFrom: string; // YYYY-MM-DD
  rentalTo: string; // YYYY-MM-DD
  deliveryMode: 'versand' | 'abholung';
  items: ReservationItems;
}

function isMissingTable(msg: string | undefined): boolean {
  return /reservations|relation .* does not exist|schema cache|PGRST|42P01/i.test(msg || '');
}

/** Normalisiert die items-JSONB defensiv in ReservationItems. */
export function normalizeReservationItems(raw: unknown): ReservationItems {
  const lines: ReservationLine[] = [];
  const linesRaw = (raw as { lines?: unknown } | null)?.lines;
  if (Array.isArray(linesRaw)) {
    for (const l of linesRaw as Array<Record<string, unknown>>) {
      const productId = typeof l?.productId === 'string' ? l.productId : '';
      if (!productId) continue;
      const qty = typeof l.qty === 'number' && l.qty > 0 ? Math.floor(l.qty) : 1;
      const haftung = l.haftung === 'standard' || l.haftung === 'premium' || l.haftung === 'none'
        ? (l.haftung as 'none' | 'standard' | 'premium')
        : 'none';
      const accessories: ReservationAccessoryItem[] = [];
      if (Array.isArray(l.accessories)) {
        for (const a of l.accessories as Array<Record<string, unknown>>) {
          const accId = typeof a?.accessory_id === 'string' ? a.accessory_id : '';
          if (!accId) continue;
          const aQty = typeof a.qty === 'number' && a.qty > 0 ? Math.floor(a.qty) : 1;
          accessories.push({ accessory_id: accId, qty: aQty });
        }
      }
      lines.push({ productId, qty, haftung, accessories });
    }
  }
  return { lines };
}

/**
 * Laedt aktive (offene, nicht abgelaufene) Reservierungen im Zeitfenster.
 * `excludeUserId` blendet die eigenen Reservierungen des Betrachters aus.
 * `globalTest=false` (Live-Modus) blendet Test-Reservierungen aus.
 */
export async function loadActiveReservations(
  supabase: SupabaseClient,
  args: {
    fromIso: string; // erweitertes Suchfenster (YYYY-MM-DD)
    toIso: string;
    excludeUserId?: string | null;
    globalTest: boolean;
  },
): Promise<ActiveReservation[]> {
  try {
    let q = supabase
      .from('reservations')
      .select('user_id, items, rental_from, rental_to, delivery_mode, is_test, status, expires_at')
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString())
      .lte('rental_from', args.toIso)
      .gte('rental_to', args.fromIso);
    if (args.excludeUserId) q = q.neq('user_id', args.excludeUserId);
    if (!args.globalTest) q = q.not('is_test', 'is', true);

    const { data, error } = await q;
    if (error) {
      if (!isMissingTable(error.message)) console.error('[reservation-holds] load error:', error);
      return [];
    }
    return (data ?? []).map((r) => ({
      userId: r.user_id as string,
      rentalFrom: r.rental_from as string,
      rentalTo: r.rental_to as string,
      deliveryMode: (r.delivery_mode === 'abholung' ? 'abholung' : 'versand') as 'versand' | 'abholung',
      items: normalizeReservationItems(r.items),
    }));
  } catch {
    return [];
  }
}

/**
 * Zaehlt belegte Kamera-Einheiten pro Tag aus Reservierungen fuer EIN Produkt —
 * spiegelt die Puffer-Expansion des Kalenders (jede Reservierung belegt
 * [ship .. return] inkl. eigener Puffer). Map dateStr → Anzahl. Pro Reservierung
 * zaehlt die Summe der qty der Zeilen dieses Produkts.
 */
export function reservationsToCameraBlockedDays(
  reservations: ActiveReservation[],
  productId: string,
  buf: BufferDays,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of reservations) {
    let count = 0;
    for (const line of r.items.lines) {
      if (line.productId === productId) count += Math.max(1, line.qty);
    }
    if (count <= 0) continue;
    const ship = computeShipDate(r.rentalFrom, r.deliveryMode, buf, null);
    const ret = computeReturnDueDate(r.rentalTo, r.deliveryMode, buf, null);
    for (let d = new Date(ship); d <= ret; d.setDate(d.getDate() + 1)) {
      const key = toIsoDate(d);
      map.set(key, (map.get(key) ?? 0) + count);
    }
  }
  return map;
}

/** Bequemer Wrapper: laedt Reservierungen + liefert Kamera-Tages-Belegung. */
export async function getReservationCameraBlockedDays(
  supabase: SupabaseClient,
  args: {
    productId: string;
    fromIso: string;
    toIso: string;
    excludeUserId?: string | null;
    globalTest: boolean;
    buf?: BufferDays;
  },
): Promise<Map<string, number>> {
  const reservations = await loadActiveReservations(supabase, args);
  if (reservations.length === 0) return new Map();
  const buf = args.buf ?? (await loadBufferDays(supabase));
  return reservationsToCameraBlockedDays(reservations, args.productId, buf);
}

/**
 * Setzt alle offenen Reservierungen eines Users auf `completed` — Aufruf nach
 * erfolgreichem Buchungsabschluss, damit der Hold nicht mehr doppelt zaehlt
 * (die echte Buchung uebernimmt die Blockade). Analog releaseUserCartHolds.
 */
export async function releaseUserReservations(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  if (!userId) return;
  try {
    await supabase
      .from('reservations')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'open');
  } catch {
    // best-effort
  }
}

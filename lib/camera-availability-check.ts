import type { SupabaseClient } from '@supabase/supabase-js';
import { RESERVING_BOOKING_STATUSES } from '@/lib/booking-statuses';
import { resolveBookingCameras } from '@/lib/booking-cameras';
import {
  loadBufferDays,
  computeShipDate,
  computeReturnDueDate,
  toIsoDate,
  type BufferDays,
} from '@/lib/booking-buffer';
import { isTestMode } from '@/lib/env-mode';
import { getProductById } from '@/lib/get-products';
import { loadActiveHoldsForProduct, holdsToBlockedDayCount } from '@/lib/cart-holds';

/**
 * Harte, serverseitige Ueberbuchungs-Sperre fuer Kameras.
 *
 * Spiegelt die Zaehllogik des Kunden-Kalenders (/api/availability) fuer EINEN
 * angefragten Mietzeitraum. Wird VOR der Zahlung aufgerufen (create-payment-
 * intent / checkout-intent), damit eine Buchung gar nicht erst entstehen kann,
 * wenn die Kamera im Zeitraum schon voll belegt ist — egal ob durch einen
 * veralteten Browser-Tab, einen parallelen Buchungsversuch oder einen Direkt-/
 * Angebotslink, der den Live-Kalender umgeht.
 *
 * `stock` kommt aus getProductById() → wird seit dem Live-Stock-Fix aus den
 * echten physischen Einheiten gezaehlt, nicht aus dem (potenziell veralteten)
 * Config-Wert. Damit kann diese Pruefung nie mehr Kapazitaet sehen, als
 * physisch existiert.
 *
 * Gibt `null` zurueck, wenn der Zeitraum buchbar ist; sonst ein Konflikt-Objekt
 * mit dem ersten ausgebuchten Tag.
 */
export interface AvailabilityConflict {
  productId: string;
  productName: string;
  day: string;
  available: number;
  totalStock: number;
}

function isoAddDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

export async function findCameraOverbookingConflict(
  supabase: SupabaseClient,
  args: {
    productId: string;
    rentalFrom: string; // YYYY-MM-DD
    rentalTo: string; // YYYY-MM-DD
    deliveryMode?: 'versand' | 'abholung';
    /** Diese Buchung bei der Zaehlung ausschliessen (z.B. bei Bearbeitung). */
    excludeBookingId?: string | null;
    /** Eigene Warenkorb-Holds dieses Users nicht mitzaehlen (sonst blockiert
     *  sich der Kunde selbst, weil seine Cart-Reservierung schon existiert). */
    excludeUserId?: string | null;
  },
): Promise<AvailabilityConflict | null> {
  const { productId, rentalFrom, rentalTo } = args;

  if (!productId || !rentalFrom || !rentalTo) return null;
  if (rentalTo < rentalFrom) return null;

  const product = await getProductById(productId);
  // Unbekanntes Produkt: hier nicht blockieren — andere Validierung greift.
  if (!product) return null;

  const totalStock = product.stock ?? 0;

  // Kein physischer Bestand → immer ausgebucht.
  if (totalStock <= 0) {
    return {
      productId,
      productName: product.name,
      day: rentalFrom,
      available: 0,
      totalStock: 0,
    };
  }

  const buf: BufferDays = await loadBufferDays(supabase, {
    versand_before: 2,
    versand_after: 2,
    abholung_before: 0,
    abholung_after: 1,
  });

  const globalTest = await isTestMode();

  // Suchfenster grosszuegig um Puffer + moegliche Override-Datumsfelder.
  const baseBuffer = Math.max(
    buf.versand_before,
    buf.versand_after,
    buf.abholung_before,
    buf.abholung_after,
  );
  const margin = baseBuffer + 30;
  const extFrom = isoAddDays(rentalFrom, -margin);
  const extTo = isoAddDays(rentalTo, margin);

  const selBase = 'id, rental_from, rental_to, delivery_mode, product_name, product_id, unit_id, cameras';
  const sel = `${selBase}, ship_date_override, return_due_date_override`;

  type Row = Record<string, unknown>;
  type QResult = { data: Row[] | null; error: { message: string } | null };

  const buildQ1 = async (cols: string): Promise<QResult> => {
    let q = supabase
      .from('bookings')
      .select(cols)
      .eq('product_id', productId)
      .in('status', [...RESERVING_BOOKING_STATUSES])
      .lte('rental_from', extTo)
      .gte('rental_to', extFrom);
    if (!globalTest) q = q.not('is_test', 'is', true);
    return (await q) as unknown as QResult;
  };
  const buildQ2 = async (cols: string): Promise<QResult> => {
    let q = supabase
      .from('bookings')
      .select(cols)
      .contains('cameras', [{ product_id: productId }])
      .in('status', [...RESERVING_BOOKING_STATUSES])
      .lte('rental_from', extTo)
      .gte('rental_to', extFrom);
    if (!globalTest) q = q.not('is_test', 'is', true);
    return (await q) as unknown as QResult;
  };

  let [r1, r2] = await Promise.all([buildQ1(sel), buildQ2(sel)]);

  // Override-Spalten fehlen (Migration nicht durch) → ohne sie neu fragen.
  if (r1.error && /ship_date_override|return_due_date_override/i.test(r1.error.message || '')) {
    [r1, r2] = await Promise.all([buildQ1(selBase), buildQ2(selBase)]);
  }

  // Bei DB-Fehler NICHT blind durchwinken — aber auch nicht den ganzen
  // Checkout lahmlegen: der Aufrufer behandelt `null` als "kein Konflikt".
  // Ein echter Fehler wird geloggt; die Pruefung ist Best-Effort-Defense.
  if (r1.error) {
    console.error('[camera-availability-check] bookings query error:', r1.error);
    return null;
  }

  const mergedById = new Map<string, Row>();
  for (const b of [...(r1.data ?? []), ...(r2.error ? [] : r2.data ?? [])]) {
    const id = b.id as string;
    if (args.excludeBookingId && id === args.excludeBookingId) continue;
    mergedById.set(id, b);
  }
  const bookings = [...mergedById.values()];

  // Warenkorb-Reservierungen FREMDER Kunden (eigene ausgeschlossen) — blocken
  // den Zeitraum ebenfalls, damit zwei Kunden nicht parallel denselben Slot
  // bis zur Zahlung durchlaufen koennen.
  const otherHolds = await loadActiveHoldsForProduct(supabase, {
    productId,
    fromIso: extFrom,
    toIso: extTo,
    excludeUserId: args.excludeUserId ?? null,
    globalTest,
  });
  const holdDayCount = holdsToBlockedDayCount(otherHolds, buf);

  // Belegte Einheiten pro angefragtem Tag zaehlen. Bestehende Buchungen
  // belegen die Kamera physisch ueber [ship .. return] (inkl. ihrer eigenen
  // Puffer / Override-Termine).
  for (let cur = rentalFrom; cur <= rentalTo; cur = isoAddDays(cur, 1)) {
    let bookedCount = 0;
    for (const bRaw of bookings) {
      const b = bRaw as {
        rental_from: string;
        rental_to: string;
        delivery_mode?: string;
        ship_date_override?: string | null;
        return_due_date_override?: string | null;
      };
      const bMode = b.delivery_mode ?? 'versand';
      const effFrom = toIsoDate(computeShipDate(b.rental_from, bMode, buf, b.ship_date_override ?? null));
      const effTo = toIsoDate(computeReturnDueDate(b.rental_to, bMode, buf, b.return_due_date_override ?? null));
      if (effFrom <= cur && effTo >= cur) {
        bookedCount += resolveBookingCameras(bRaw).filter((c) => c.product_id === productId).length;
      }
    }
    bookedCount += holdDayCount.get(cur) ?? 0;
    if (bookedCount >= totalStock) {
      return {
        productId,
        productName: product.name,
        day: cur,
        available: 0,
        totalStock,
      };
    }
  }

  // Hinweis: bewusst NUR der Kern-Mietzeitraum geprueft (keine Puffer der NEUEN
  // Buchung). Das ist die harte physische Invariante "zwei Buchungen brauchen
  // dieselbe Kamera am selben Tag" und vermeidet faelschliche Ablehnungen an
  // reinen Puffertagen, die der Kalender weicher behandelt.
  return null;
}

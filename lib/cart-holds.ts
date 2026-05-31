import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadBufferDays,
  computeShipDate,
  computeReturnDueDate,
  toIsoDate,
  type BufferDays,
} from '@/lib/booking-buffer';

/**
 * Cart-Holds — zeitlich begrenzte Warenkorb-Reservierungen.
 *
 * Sobald ein eingeloggter Kunde eine Kamera in den Warenkorb legt, wird der
 * gewaehlte Mietzeitraum serverseitig fuer 30 Minuten fuer ALLE ANDEREN Kunden
 * reserviert. Laeuft die Buchung nicht durch, verfaellt der Hold automatisch
 * (expires_at) und gibt den Zeitraum wieder frei.
 *
 * Siehe supabase/supabase-cart-holds.sql. Bei fehlender Migration sind alle
 * Helper defensive No-Ops (try/catch) — der Shop laeuft dann wie vorher ohne
 * Reservierungs-Layer.
 */

export const CART_HOLD_MINUTES = 30;

export interface CartHoldItem {
  cartItemId: string;
  productId: string;
  productName?: string | null;
  rentalFrom: string; // YYYY-MM-DD
  rentalTo: string; // YYYY-MM-DD
  deliveryMode?: 'versand' | 'abholung';
}

export interface ActiveHoldRange {
  productId: string;
  rentalFrom: string;
  rentalTo: string;
  deliveryMode: 'versand' | 'abholung';
}

function isMissingTable(msg: string | undefined): boolean {
  return /cart_holds|relation .* does not exist|schema cache|PGRST|42P01/i.test(msg || '');
}

/**
 * Synchronisiert die Holds eines Users mit seinem aktuellen Warenkorb.
 * - Legt/aktualisiert pro Cart-Item einen Hold (gleitende 30-Min-Frist).
 * - Loescht Holds des Users, deren Cart-Item nicht mehr im Warenkorb ist.
 *
 * Best-effort: wirft nie, gibt `{ ok: false }` bei fehlender Migration.
 */
export async function syncCartHolds(
  supabase: SupabaseClient,
  userId: string,
  items: CartHoldItem[],
  opts: { isTest?: boolean } = {},
): Promise<{ ok: boolean; held: number }> {
  if (!userId) return { ok: false, held: 0 };
  const expiresAt = new Date(Date.now() + CART_HOLD_MINUTES * 60_000).toISOString();
  const isTest = !!opts.isTest;

  try {
    const valid = items.filter(
      (it) => it.cartItemId && it.productId && it.rentalFrom && it.rentalTo,
    );

    // 1) Upsert pro Cart-Item (gleitende Frist).
    if (valid.length > 0) {
      const rows = valid.map((it) => ({
        user_id: userId,
        cart_item_id: it.cartItemId,
        product_id: it.productId,
        product_name: it.productName ?? null,
        rental_from: it.rentalFrom,
        rental_to: it.rentalTo,
        delivery_mode: it.deliveryMode === 'abholung' ? 'abholung' : 'versand',
        is_test: isTest,
        expires_at: expiresAt,
      }));
      const { error } = await supabase
        .from('cart_holds')
        .upsert(rows, { onConflict: 'user_id,cart_item_id' });
      if (error) {
        if (isMissingTable(error.message)) return { ok: false, held: 0 };
        console.error('[cart-holds] upsert error:', error);
      }
    }

    // 2) Verwaiste Holds des Users entfernen (Item nicht mehr im Warenkorb).
    // cart_item_id ist eine crypto.randomUUID() ([0-9a-f-]) — defensiv saeubern.
    const keepIds = valid
      .map((it) => it.cartItemId.replace(/[^0-9a-zA-Z_-]/g, ''))
      .filter(Boolean);
    let delQ = supabase.from('cart_holds').delete().eq('user_id', userId);
    if (keepIds.length > 0) {
      delQ = delQ.not('cart_item_id', 'in', `(${keepIds.join(',')})`);
    }
    const { error: delErr } = await delQ;
    if (delErr && !isMissingTable(delErr.message)) {
      console.error('[cart-holds] cleanup delete error:', delErr);
    }

    return { ok: true, held: valid.length };
  } catch (err) {
    console.error('[cart-holds] syncCartHolds failed:', err);
    return { ok: false, held: 0 };
  }
}

/** Alle Holds eines Users entfernen (z.B. nach Buchungsabschluss). */
export async function releaseUserCartHolds(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  if (!userId) return;
  try {
    await supabase.from('cart_holds').delete().eq('user_id', userId);
  } catch {
    // best-effort
  }
}

/**
 * Laedt aktive (nicht abgelaufene) Holds FREMDER User fuer ein Produkt im
 * Zeitfenster. `excludeUserId` schliesst die eigenen Holds aus (der Kunde soll
 * seinen eigenen Warenkorb nicht als "belegt" sehen).
 *
 * `globalTest=false` (Live-Modus) blendet Test-Holds aus.
 */
export async function loadActiveHoldsForProduct(
  supabase: SupabaseClient,
  args: {
    productId: string;
    fromIso: string; // erweitertes Suchfenster (YYYY-MM-DD)
    toIso: string;
    excludeUserId?: string | null;
    globalTest: boolean;
  },
): Promise<ActiveHoldRange[]> {
  try {
    let q = supabase
      .from('cart_holds')
      .select('user_id, product_id, rental_from, rental_to, delivery_mode, is_test, expires_at')
      .eq('product_id', args.productId)
      .gt('expires_at', new Date().toISOString())
      .lte('rental_from', args.toIso)
      .gte('rental_to', args.fromIso);
    if (args.excludeUserId) q = q.neq('user_id', args.excludeUserId);
    if (!args.globalTest) q = q.not('is_test', 'is', true);

    const { data, error } = await q;
    if (error) {
      if (!isMissingTable(error.message)) console.error('[cart-holds] load error:', error);
      return [];
    }
    return (data ?? []).map((r) => ({
      productId: r.product_id as string,
      rentalFrom: r.rental_from as string,
      rentalTo: r.rental_to as string,
      deliveryMode: (r.delivery_mode === 'abholung' ? 'abholung' : 'versand') as 'versand' | 'abholung',
    }));
  } catch {
    return [];
  }
}

/**
 * Zaehlt belegte Einheiten pro Tag aus Holds — spiegelt die Puffer-Expansion
 * des Kalenders (jeder Hold belegt [ship .. return] inkl. eigener Puffer).
 * Gibt eine Map dateStr → Anzahl zurueck. Pro Hold = 1 Einheit.
 */
export function holdsToBlockedDayCount(
  holds: ActiveHoldRange[],
  buf: BufferDays,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const h of holds) {
    const ship = computeShipDate(h.rentalFrom, h.deliveryMode, buf, null);
    const ret = computeReturnDueDate(h.rentalTo, h.deliveryMode, buf, null);
    for (let d = new Date(ship); d <= ret; d.setDate(d.getDate() + 1)) {
      const key = toIsoDate(d);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

/** Bequemer Wrapper: laedt Holds + liefert Tages-Belegung pro Produkt. */
export async function getHoldBlockedDays(
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
  const holds = await loadActiveHoldsForProduct(supabase, args);
  if (holds.length === 0) return new Map();
  const buf = args.buf ?? (await loadBufferDays(supabase));
  return holdsToBlockedDayCount(holds, buf);
}

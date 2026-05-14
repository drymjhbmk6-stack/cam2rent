/**
 * Server-seitige Plausibilitäts-Prüfung für Zubehör-Preise einer Buchung.
 *
 * Hintergrund: Im Frontend wird `priceAccessories` aus den ausgewählten
 * Zubehör-IDs berechnet und an die Stripe-Metadata bzw. das Cart-Item
 * gehängt. Wenn der Frontend-State inkonsistent ist (Cross-Product-Leak,
 * State-Race, manueller URL-Hack), kann ein Zubehör in `accessory_items`
 * landen ohne dass sein Preis in `priceAccessories` summiert wurde.
 *
 * Beispiel: Kunde hat Insta360 X5 + Brusthalterung gebucht.
 *   Brusthalterung = 3,90 EUR flat. accessory_items = [Set, Brusthalterung].
 *   priceAccessories vom Frontend = 0 EUR → Stripe charged nur Miete + Set
 *   (zu wenig). Buchung schreibt price_accessories=0, Rechnung zeigt 0.
 *
 * Diese Funktion laedt zur Booking-Zeit die echten Preise aus DB
 * (`accessories` + `sets`) und summiert sie aus `accessory_items`. Liefert
 * `{ computed, mismatch }` — der Aufrufer kann dann je nach Wert eine
 * Admin-Notification ausloesen oder den Wert in die DB schreiben.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingAccessoryItem } from '@/lib/booking-accessories';

export interface AccessoryPriceCheckResult {
  /** Server-berechneter Gesamtpreis aller Zubehoer/Sets fuer die Buchung. */
  computed: number;
  /** Wert, den der Aufrufer (Frontend / Stripe-Metadata) gemeldet hat. */
  reported: number;
  /** True wenn |computed - reported| > 0.5 EUR (Toleranz fuer Rundung). */
  mismatch: boolean;
  /** Detail-Items fuer Debug/Notification: id, name, einzel-Preis, qty. */
  details: Array<{ accessory_id: string; name: string; unit_price: number; qty: number; line_total: number }>;
  /** IDs, die weder in accessories noch in sets gefunden wurden. */
  unknownIds: string[];
}

export async function verifyAccessoryPrice(
  supabase: SupabaseClient,
  opts: {
    items: BookingAccessoryItem[];
    days: number;
    reportedTotal: number;
  },
): Promise<AccessoryPriceCheckResult> {
  const result: AccessoryPriceCheckResult = {
    computed: 0,
    reported: opts.reportedTotal,
    mismatch: false,
    details: [],
    unknownIds: [],
  };

  if (!opts.items.length) {
    return result;
  }

  const ids = opts.items.map((i) => i.accessory_id).filter(Boolean);
  const idsArray = [...new Set(ids)];

  // Zubehoer aus DB
  const accLookup = new Map<string, { name: string; price: number; pricingMode: 'flat' | 'perDay' }>();
  try {
    const { data: accs } = await supabase
      .from('accessories')
      .select('id, name, price, pricing_mode')
      .in('id', idsArray);
    for (const a of accs ?? []) {
      accLookup.set(a.id as string, {
        name: (a.name as string) ?? (a.id as string),
        price: Number(a.price ?? 0),
        pricingMode: (a.pricing_mode as 'flat' | 'perDay') ?? 'perDay',
      });
    }
  } catch (err) {
    console.error('[verify-accessory-price] accessories lookup failed:', err);
  }

  // Sets aus DB — fuer IDs, die nicht in accessories sind (Set-IDs)
  const missing = idsArray.filter((id) => !accLookup.has(id));
  if (missing.length > 0) {
    try {
      const { data: sets } = await supabase
        .from('sets')
        .select('id, name, price, pricing_mode')
        .in('id', missing);
      for (const s of sets ?? []) {
        accLookup.set(s.id as string, {
          name: (s.name as string) ?? (s.id as string),
          price: Number(s.price ?? 0),
          pricingMode: (s.pricing_mode as 'flat' | 'perDay') ?? 'flat',
        });
      }
    } catch (err) {
      console.error('[verify-accessory-price] sets lookup failed:', err);
    }
  }

  const days = Math.max(1, opts.days);
  for (const item of opts.items) {
    const info = accLookup.get(item.accessory_id);
    if (!info) {
      result.unknownIds.push(item.accessory_id);
      continue;
    }
    const unitPrice = info.pricingMode === 'flat' ? info.price : info.price * days;
    const lineTotal = Math.round(unitPrice * item.qty * 100) / 100;
    result.computed += lineTotal;
    result.details.push({
      accessory_id: item.accessory_id,
      name: info.name,
      unit_price: unitPrice,
      qty: item.qty,
      line_total: lineTotal,
    });
  }
  result.computed = Math.round(result.computed * 100) / 100;
  result.mismatch = Math.abs(result.computed - result.reported) > 0.5;
  return result;
}

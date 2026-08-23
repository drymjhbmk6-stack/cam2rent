/**
 * Gruppierung von Warenkorb-Positionen für den Checkout.
 *
 * EINE Wahrheit für alle vier Stellen, die gruppieren müssen:
 *   - app/warenkorb/page.tsx        (Anzeige + "N separate Buchungen"-Modal)
 *   - app/checkout/page.tsx         (Anzeige "Deine Bestellungen")
 *   - app/api/confirm-cart/route.ts (legt die Buchungen an)
 *   - app/api/stripe-webhook/route.ts (Race-Pfad, legt die Buchungen an)
 *
 * Vorher hatte jede Stelle ihre eigene Kopie der Gruppierung — der Webhook
 * hatte gar keine und schrieb den gesamten Warenkorb als EINE Buchung mit dem
 * Zeitraum von Position 1 (Kunden-Bug: zwei Kameras, zwei Zeiträume, aber nur
 * ein Zeitraum in Buchung + Mietvertrag).
 *
 * ── Gruppenschlüssel ──────────────────────────────────────────────────────
 * `rentalFrom | rentalTo | haftung`
 *
 * Der Zeitraum ist offensichtlich: `bookings.rental_from`/`rental_to` sind
 * skalare Spalten, zwei Zeiträume passen nicht in eine Buchung.
 *
 * `haftung` gehört aus demselben Grund dazu: `bookings.haftung` ist EINE
 * Spalte. Zwei Kameras im selben Zeitraum mit unterschiedlichem Haftungsschutz
 * wurden vorher zu einer Buchung verschmolzen, die nur die Haftung des ersten
 * Items trug — während `price_haftung` die Summe beider war. Getrennte Gruppen
 * sind die einzige korrekte Abbildung ohne Schema-Änderung.
 *
 * Gleicher Zeitraum + gleiche Haftung bleibt unverändert EINE Buchung.
 */

/** Minimale Form, die zum Gruppieren reicht (CartItem erfüllt sie). */
export interface PeriodGroupable {
  rentalFrom: string;
  rentalTo: string;
  haftung: 'none' | 'standard' | 'premium';
}

export interface PeriodGroup<T extends PeriodGroupable> {
  /** Stabiler Schlüssel (React-`key`, Map-Lookups). */
  key: string;
  rentalFrom: string;
  rentalTo: string;
  haftung: 'none' | 'standard' | 'premium';
  items: T[];
}

/** Baut den Gruppenschlüssel einer einzelnen Position. */
export function periodGroupKey(item: PeriodGroupable): string {
  return `${item.rentalFrom}_${item.rentalTo}_${item.haftung ?? 'none'}`;
}

/**
 * Gruppiert Warenkorb-Positionen zu je einer künftigen Buchung.
 * Die Reihenfolge der Gruppen folgt dem ersten Auftreten im Warenkorb, damit
 * Gruppe 0 stabil dieselbe bleibt (sie trägt die unsuffixierte
 * `payment_intent_id`).
 */
export function groupByPeriod<T extends PeriodGroupable>(items: T[]): PeriodGroup<T>[] {
  const byKey = new Map<string, PeriodGroup<T>>();
  for (const item of items) {
    const key = periodGroupKey(item);
    const existing = byKey.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      byKey.set(key, {
        key,
        rentalFrom: item.rentalFrom,
        rentalTo: item.rentalTo,
        haftung: item.haftung ?? 'none',
        items: [item],
      });
    }
  }
  return [...byKey.values()];
}

/**
 * `payment_intent_id` der Gruppe. Gruppe 0 trägt die echte Stripe-ID, jede
 * weitere ein `_g<n>`-Suffix. Beide Schreibpfade (confirm-cart UND Webhook)
 * MÜSSEN dieselbe Konvention nutzen — sonst legen sie bei einem Race doppelte
 * Buchungen für dieselbe Gruppe an, statt am Unique-Index zu kollidieren.
 */
export function groupPaymentIntentId(paymentIntentId: string, groupIndex: number): string {
  return groupIndex === 0 ? paymentIntentId : `${paymentIntentId}_g${groupIndex + 1}`;
}

/**
 * Verteilt einen Gesamtbetrag proportional zu `weights` auf die Gruppen.
 * Der Rundungsrest landet in der LETZTEN Gruppe, damit die Summe der Anteile
 * exakt dem Gesamtbetrag entspricht (kein verlorener/erfundener Cent).
 *
 * Wird für `price_total` (aus `intent.amount`) und für die Versandkosten
 * genutzt: Der Checkout kassiert Versand EINMAL auf den ganzen Warenkorb —
 * bei mehreren Gruppen darf `confirm-cart` ihn deshalb nicht je Gruppe neu
 * berechnen, sondern muss den kassierten Betrag aufteilen.
 */
export function distributeAmount(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [Math.round(total * 100) / 100];

  const sum = weights.reduce((s, w) => s + w, 0);
  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < n - 1; i++) {
    const share = sum > 0
      ? Math.round(total * (weights[i] / sum) * 100) / 100
      : Math.round((total / n) * 100) / 100;
    out.push(share);
    assigned += share;
  }
  // Letzte Gruppe bekommt den Rest (Rundungs-Cent).
  out.push(Math.round((total - assigned) * 100) / 100);
  return out;
}

/**
 * Serverseitig gespeicherter Checkout-Kontext
 * (`admin_settings.checkout_<payment_intent_id>`, geschrieben von
 * `app/api/checkout-intent`).
 *
 * Gelesen von `confirm-cart` UND vom Stripe-Webhook — beide brauchen dieselbe
 * Sicht, deshalb liegt der Typ hier neben der Gruppierung. Alle Felder sind
 * optional: der Kontext stammt aus JSON und kann aus aelteren Checkouts
 * stammen, in denen ein Feld noch nicht existierte.
 */
export interface CheckoutContext {
  items?: unknown[];
  customerName?: string;
  customerEmail?: string;
  userId?: string | null;
  deliveryMode?: string;
  shippingMethod?: string;
  /** Der TATSAECHLICH kassierte Versand fuer den GESAMTEN Warenkorb (1x). */
  shippingPrice?: number;
  country?: string;
  discountAmount?: number;
  couponCode?: string;
  productDiscount?: number;
  productDiscountLabel?: string;
  durationDiscount?: number;
  earlyBirdDiscount?: number;
  loyaltyDiscount?: number;
  referralCode?: string;
  street?: string;
  zip?: string;
  city?: string;
  billingName?: string;
  billingStreet?: string;
  billingZip?: string;
  billingCity?: string;
  earlyServiceConsentAt?: string | null;
  earlyServiceConsentIp?: string | null;
  verificationRequired?: boolean;
  preBookingId?: string;
  contractSignature?: unknown;
}

// ─── Gutschein-System ─────────────────────────────────────────────────────────
//
// Gutscheine werden in der Supabase-Tabelle `coupons` gespeichert und
// über die Admin-Seite /admin/gutscheine verwaltet.
//
// Validierung läuft serverseitig über POST /api/validate-coupon.
//
// ─────────────────────────────────────────────────────────────────────────────

export interface Coupon {
  id?: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  description: string;
  /**
   * 'all'       → auf gesamten Bestellwert
   * 'accessory' → nur auf ein bestimmtes Zubehör (targetId = Zubehör-ID)
   * 'group'     → auf alle Zubehör einer Gruppe (targetGroupId = Gruppen-ID)
   */
  target_type: 'all' | 'accessory' | 'group' | 'user';
  target_id?: string | null;
  target_group_id?: string | null;
  target_name?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  max_uses?: number | null;
  used_count?: number;
  min_order_value?: number | null;
  target_user_email?: string | null;
  once_per_customer?: boolean;
  not_combinable?: boolean;
  active?: boolean;
}

/**
 * Berechnet den Rabattbetrag.
 * baseAmount ist:
 *   - bei target_type 'all':       der gesamte Bestellwert
 *   - bei target_type 'accessory': der Preis des betroffenen Zubehörs
 *   - bei target_type 'group':     der Preis aller Zubehör der Gruppe
 *
 * Die Berechnung von baseAmount übernimmt der Aufrufer (checkout page).
 */
export function calcDiscount(coupon: Coupon, baseAmount: number): number {
  if (coupon.type === 'percent') {
    return Math.round(baseAmount * coupon.value) / 100;
  }
  return Math.min(coupon.value, baseAmount);
}

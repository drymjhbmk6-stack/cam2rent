import type { SupabaseClient } from '@supabase/supabase-js';
import { differenceInCalendarDays } from 'date-fns';
import { getProducts } from '@/lib/get-products';
import { getAccessories } from '@/lib/get-accessories';
import { getPriceForDays } from '@/data/products';
import { getAccessoryPrice } from '@/data/accessories';
import {
  DEFAULT_HAFTUNG,
  DEFAULT_SHIPPING,
  calcHaftungTieredPrice,
  getActiveSpecialDiscountPercent,
  type HaftungConfig,
} from '@/lib/price-config';
import { calcShipping } from '@/data/shipping';
import { findCameraOverbookingConflict } from '@/lib/camera-availability-check';
import { computeAccessoryAvailability } from '@/lib/accessory-availability';

/**
 * Preis- + Verfügbarkeits-Rechner fürs Admin (Angebots-/Preisanfragen).
 *
 * Rein lesend: berechnet für eine Auswahl aus Kamera(s) (auch mehrfach) +
 * Zubehör + Haftungsschutz + Zeitraum den Preis und prüft die Verfügbarkeit —
 * ohne Buchung, ohne Inventar-Hold. Nutzt dieselben Helfer wie Checkout/
 * Reservierung, damit Preise + Verfügbarkeit autoritativ sind.
 */

export interface QuoteLineInput {
  productId: string;
  qty: number;
  haftung: 'none' | 'standard' | 'premium';
  accessories: { accessory_id: string; qty: number }[];
}

export interface QuoteInput {
  rentalFrom: string; // YYYY-MM-DD
  rentalTo: string;
  deliveryMode: 'versand' | 'abholung';
  shippingMethod: 'standard' | 'express';
  lines: QuoteLineInput[];
  customerUserId?: string | null;
  discount?: { mode: 'none' | 'percent' | 'amount'; value: number };
}

export interface QuoteAccessoryLine {
  accessoryId: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  available: boolean;
  remaining: number | null;
  /** true = dieser Eintrag ist ein Set (Pseudo-Zubehör, in Bestandteile expandiert). */
  isSet?: boolean;
}

interface SetRow {
  id: string;
  name: string;
  pricingMode: 'perDay' | 'flat';
  price: number;
  items: { accessory_id: string; qty: number }[];
}

export interface QuoteLine {
  productId: string;
  productName: string;
  qty: number;
  rentalUnitPrice: number;
  rentalTotal: number;
  haftung: 'none' | 'standard' | 'premium';
  haftungLabel: string;
  haftungPrice: number;
  accessories: QuoteAccessoryLine[];
  lineSubtotal: number;
  cameraAvailable: boolean;
  cameraFree: number | null;
  cameraConflictDay: string | null;
  deposit: number;
}

export interface QuoteResult {
  days: number;
  lines: QuoteLine[];
  subtotalItems: number;
  discountBase: number;
  discountAmount: number;
  discountLabel: string;
  shipping: { price: number; isFree: boolean };
  grandTotal: number;
  depositSum: number;
  customerSpecialPercent: number;
  allAvailable: boolean;
  conflicts: string[];
}

const HAFTUNG_LABEL: Record<'none' | 'standard' | 'premium', string> = {
  none: 'Ohne Haftungsschutz',
  standard: 'Basis-Haftungsschutz',
  premium: 'Premium-Haftungsschutz',
};

function inclusiveDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (from.getTime() === to.getTime()) return 1;
  return Math.max(1, differenceInCalendarDays(to, from) + 1);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function loadHaftungConfig(supabase: SupabaseClient): Promise<HaftungConfig> {
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'haftung_config')
      .maybeSingle();
    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return { ...DEFAULT_HAFTUNG, ...parsed };
    }
  } catch { /* Fallback */ }
  return DEFAULT_HAFTUNG;
}

async function loadShippingConfig(supabase: SupabaseClient) {
  try {
    const { data } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'shipping')
      .maybeSingle();
    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return { ...DEFAULT_SHIPPING, ...parsed };
    }
  } catch { /* Fallback */ }
  return DEFAULT_SHIPPING;
}

/**
 * Laedt alle Sets (id, name, pricing_mode, price, accessory_items). Ein im
 * Preisrechner/Reservierung gewaehltes Set wird als Pseudo-Zubehoer-Eintrag
 * ({ accessory_id: setId, qty }) in `line.accessories` gefuehrt; hier loesen
 * wir Preis + Bestandteile auf. Defensiv: bei Fehler leere Map.
 */
async function loadSets(supabase: SupabaseClient): Promise<Map<string, SetRow>> {
  const map = new Map<string, SetRow>();
  try {
    const { data } = await supabase
      .from('sets')
      .select('id, name, pricing_mode, price, accessory_items');
    for (const r of (data ?? []) as {
      id: string; name: string | null; pricing_mode: string | null;
      price: number | null; accessory_items: unknown;
    }[]) {
      const items = Array.isArray(r.accessory_items)
        ? (r.accessory_items as { accessory_id: string; qty: number }[]).filter(
            (it) => it && typeof it.accessory_id === 'string',
          )
        : [];
      map.set(r.id, {
        id: r.id,
        name: r.name ?? r.id,
        pricingMode: (r.pricing_mode as 'perDay' | 'flat') ?? 'perDay',
        price: Number(r.price ?? 0),
        items,
      });
    }
  } catch { /* Fallback: keine Sets */ }
  return map;
}

export async function computeQuote(supabase: SupabaseClient, input: QuoteInput): Promise<QuoteResult> {
  const days = inclusiveDays(input.rentalFrom, input.rentalTo);
  const [products, accessories, haftungConfig, shippingConfig, setById] = await Promise.all([
    getProducts(),
    getAccessories(),
    loadHaftungConfig(supabase),
    loadShippingConfig(supabase),
    loadSets(supabase),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const accById = new Map(accessories.map((a) => [a.id, a]));

  const conflicts: string[] = [];

  // ── Verfügbarkeit vorbereiten ──────────────────────────────────────────────
  // Kamera: benötigte Einheiten pro Modell aufsummieren, EIN Check pro Modell.
  const neededByProduct = new Map<string, number>();
  for (const line of input.lines) {
    if (!productById.has(line.productId)) continue;
    neededByProduct.set(line.productId, (neededByProduct.get(line.productId) ?? 0) + Math.max(1, line.qty));
  }
  const cameraAvail = new Map<string, { available: boolean; free: number | null; day: string | null }>();
  for (const [productId, needed] of neededByProduct) {
    const conflict = await findCameraOverbookingConflict(supabase, {
      productId,
      rentalFrom: input.rentalFrom,
      rentalTo: input.rentalTo,
      deliveryMode: input.deliveryMode,
      neededUnits: needed,
    });
    if (conflict) {
      cameraAvail.set(productId, { available: false, free: conflict.available, day: conflict.day });
      conflicts.push(`${conflict.productName}: nur ${conflict.available} frei am ${conflict.day} (benötigt ${needed})`);
    } else {
      cameraAvail.set(productId, { available: true, free: null, day: null });
    }
  }

  // Zubehör: benötigte Menge pro accessory_id + Restbestand. Set-Einträge
  // werden in ihre echten Bestandteile expandiert (analog Shop), damit die
  // Verfügbarkeitsprüfung die Set-Inhalte nicht überbucht.
  const neededAcc = new Map<string, number>();
  for (const line of input.lines) {
    for (const a of line.accessories) {
      const aQty = Math.max(1, a.qty);
      const set = setById.get(a.accessory_id);
      if (set) {
        for (const it of set.items) {
          const need = Math.max(1, it.qty) * aQty;
          neededAcc.set(it.accessory_id, (neededAcc.get(it.accessory_id) ?? 0) + need);
        }
      } else {
        neededAcc.set(a.accessory_id, (neededAcc.get(a.accessory_id) ?? 0) + aQty);
      }
    }
  }
  const accRemaining = new Map<string, number>();
  if (neededAcc.size > 0) {
    const firstProductId = input.lines[0]?.productId;
    const avail = await computeAccessoryAvailability({
      from: input.rentalFrom,
      to: input.rentalTo,
      productId: firstProductId,
      deliveryMode: input.deliveryMode,
    });
    for (const a of avail.accessories) accRemaining.set(a.id, a.available_qty_remaining);
    for (const [accId, need] of neededAcc) {
      const remaining = accRemaining.get(accId);
      if (remaining !== undefined && remaining < need) {
        const name = avail.accessories.find((a) => a.id === accId)?.name ?? accId;
        conflicts.push(`Zubehör ${name}: nur ${remaining} frei (benötigt ${need})`);
      }
    }
  }

  // ── Zeilen berechnen ────────────────────────────────────────────────────────
  const lines: QuoteLine[] = [];
  let subtotalItems = 0;
  let discountBase = 0;
  let depositSum = 0;

  for (const line of input.lines) {
    const product = productById.get(line.productId);
    if (!product) continue;
    const qty = Math.max(1, line.qty);

    const rentalUnitPrice = getPriceForDays(product, days);
    const rentalTotal = round2(rentalUnitPrice * qty);

    const accLines: QuoteAccessoryLine[] = [];
    let accSum = 0;
    for (const a of line.accessories) {
      const aQty = Math.max(1, a.qty);
      const set = setById.get(a.accessory_id);
      if (set) {
        // Set: Preis flat/perDay, Verfügbarkeit aus den Bestandteilen (worst
        // case über alle Positionen).
        const unitPrice = set.pricingMode === 'flat' ? set.price : set.price * days;
        const total = round2(unitPrice * aQty);
        accSum += total;
        let setAvailable = true;
        let setRemaining: number | null = null;
        for (const it of set.items) {
          const needTotal = Math.max(1, it.qty) * aQty;
          const rem = accRemaining.get(it.accessory_id);
          if (rem === undefined) continue;
          if (setRemaining === null || rem < setRemaining) setRemaining = rem;
          if (rem < needTotal) setAvailable = false;
        }
        accLines.push({
          accessoryId: a.accessory_id,
          name: set.name,
          qty: aQty,
          unitPrice: round2(unitPrice),
          total,
          available: setAvailable,
          remaining: setRemaining,
          isSet: true,
        });
      } else {
        const acc = accById.get(a.accessory_id);
        const unitPrice = acc ? getAccessoryPrice(acc, days) : 0;
        const total = round2(unitPrice * aQty);
        accSum += total;
        const remaining = accRemaining.get(a.accessory_id);
        accLines.push({
          accessoryId: a.accessory_id,
          name: acc?.name ?? a.accessory_id,
          qty: aQty,
          unitPrice,
          total,
          available: remaining === undefined ? true : remaining >= (neededAcc.get(a.accessory_id) ?? aQty),
          remaining: remaining === undefined ? null : remaining,
        });
      }
    }

    // Haftungsschutz pro Kamera → × qty.
    let haftungPerCam = 0;
    if (line.haftung === 'standard') {
      haftungPerCam = calcHaftungTieredPrice(haftungConfig.standard, haftungConfig.standardIncrement, days);
    } else if (line.haftung === 'premium') {
      haftungPerCam = calcHaftungTieredPrice(haftungConfig.premium, haftungConfig.premiumIncrement, days);
    }
    const haftungPrice = round2(haftungPerCam * qty);

    const lineSubtotal = round2(rentalTotal + accSum + haftungPrice);
    subtotalItems = round2(subtotalItems + lineSubtotal);
    discountBase = round2(discountBase + rentalTotal + accSum); // ohne Haftung
    const deposit = round2((product.deposit ?? 0) * qty);
    depositSum = round2(depositSum + deposit);

    const cam = cameraAvail.get(line.productId) ?? { available: true, free: null, day: null };
    lines.push({
      productId: line.productId,
      productName: product.name,
      qty,
      rentalUnitPrice,
      rentalTotal,
      haftung: line.haftung,
      haftungLabel: HAFTUNG_LABEL[line.haftung],
      haftungPrice,
      accessories: accLines,
      lineSubtotal,
      cameraAvailable: cam.available,
      cameraFree: cam.free,
      cameraConflictDay: cam.day,
      deposit,
    });
  }

  // ── Sonderkondition (nur informativ zurückgeben) ────────────────────────────
  let customerSpecialPercent = 0;
  if (input.customerUserId) {
    try {
      const { data: sp } = await supabase
        .from('profiles')
        .select('special_discount_percent, special_discount_valid_until')
        .eq('id', input.customerUserId)
        .maybeSingle();
      customerSpecialPercent = getActiveSpecialDiscountPercent({
        percent: (sp as { special_discount_percent?: number | null } | null)?.special_discount_percent ?? null,
        validUntil: (sp as { special_discount_valid_until?: string | null } | null)?.special_discount_valid_until ?? null,
      });
    } catch { /* keine Sonderkondition */ }
  }

  // ── Rabatt (auf Miete + Zubehör, nicht Haftung/Versand) ─────────────────────
  const disc = input.discount ?? { mode: 'none', value: 0 };
  let discountAmount = 0;
  let discountLabel = '';
  if (disc.mode === 'percent' && disc.value > 0) {
    const pct = Math.min(100, Math.max(0, disc.value));
    discountAmount = round2(discountBase * (pct / 100));
    discountLabel = `Rabatt (${pct} %)`;
  } else if (disc.mode === 'amount' && disc.value > 0) {
    discountAmount = round2(Math.min(disc.value, discountBase));
    discountLabel = 'Rabatt';
  }

  // ── Versand ─────────────────────────────────────────────────────────────────
  const shippingBasis = round2(subtotalItems - discountAmount);
  const shipping = calcShipping(shippingBasis, input.shippingMethod, input.deliveryMode, shippingConfig);

  const grandTotal = round2(subtotalItems - discountAmount + shipping.price);

  const allAvailable = conflicts.length === 0;

  return {
    days,
    lines,
    subtotalItems,
    discountBase,
    discountAmount,
    discountLabel,
    shipping: { price: round2(shipping.price), isFree: shipping.isFree },
    grandTotal,
    depositSum,
    customerSpecialPercent,
    allAvailable,
    conflicts,
  };
}

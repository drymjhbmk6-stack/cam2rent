/**
 * Shared price configuration types and helpers.
 * Prices are stored in Supabase (admin_config table).
 * These defaults are used as fallbacks if the DB is not yet set up.
 */

// ─── Shipping ─────────────────────────────────────────────────────────────────

export interface ShippingPriceConfig {
  freeShippingThreshold: number;
  standardPrice: number;
  expressPrice: number;
}

export const DEFAULT_SHIPPING: ShippingPriceConfig = {
  freeShippingThreshold: 50,
  standardPrice: 5.99,
  expressPrice: 12.99,
};

// ─── Haftungsoptionen ─────────────────────────────────────────────────────────

export interface HaftungConfig {
  /** Basispreis Standard-Haftungsschutz (1-7 Tage) */
  standard: number;
  /** Aufschlag Standard pro weitere Woche */
  standardIncrement: number;
  /** Max. Eigenbeteiligung bei Standard (Fallback wenn keine Kategorie passt) */
  standardEigenbeteiligung: number;
  /** Eigenbeteiligung pro Produktkategorie bei Standard, z.B. { "action-cam": 200, "360-cam": 300 } */
  eigenbeteiligungByCategory?: Record<string, number>;
  /** Basispreis Premium-Haftungsschutz (1-7 Tage) */
  premium: number;
  /** Aufschlag Premium pro weitere Woche */
  premiumIncrement: number;
}

export const DEFAULT_HAFTUNG: HaftungConfig = {
  standard: 15,
  standardIncrement: 5,
  standardEigenbeteiligung: 200,
  eigenbeteiligungByCategory: {
    'action-cam': 200,
    '360-cam': 300,
  },
  premium: 25,
  premiumIncrement: 10,
};

/** Gibt die Eigenbeteiligung für eine Produktkategorie zurück */
export function getEigenbeteiligung(config: HaftungConfig, category?: string): number {
  if (category && config.eigenbeteiligungByCategory?.[category] !== undefined) {
    return config.eigenbeteiligungByCategory[category];
  }
  return config.standardEigenbeteiligung;
}

/** Berechnet den gestaffelten Haftungspreis basierend auf Miettagen */
export function calcHaftungTieredPrice(
  basePrice: number,
  increment: number,
  days: number
): number {
  const weeks = Math.ceil(days / 7);
  return basePrice + Math.max(0, weeks - 1) * increment;
}

// ─── Kaution Tiers ────────────────────────────────────────────────────────────

export interface KautionTier {
  name: string;   // z.B. "Kaution 1"
  amount: number; // z.B. 150
}

export interface KautionTiers {
  1: KautionTier;
  2: KautionTier;
  3: KautionTier;
}

export const DEFAULT_KAUTION_TIERS: KautionTiers = {
  1: { name: 'Kaution 1', amount: 150 },
  2: { name: 'Kaution 2', amount: 200 },
  3: { name: 'Kaution 3', amount: 300 },
};

// ─── Admin Product Specs ──────────────────────────────────────────────────────

export interface AdminProductSpec {
  id: string;
  name: string;
  value: string;
  icon: string; // 'resolution' | 'fps' | 'water' | 'battery' | 'weight' | 'storage' | 'custom'
  priority: number;
}

// ─── Admin Product ────────────────────────────────────────────────────────────

export interface AdminProduct {
  id: string;
  name: string;
  brand: string; // 'GoPro' | 'DJI' | 'Insta360' | custom
  slug: string;
  shortDescription: string;
  /**
   * Vollständige Preistabelle für Tag 1–30.
   * priceTable[0] = Tag-1-Preis, priceTable[29] = Tag-30-Preis
   */
  priceTable: number[];
  /** Preis pro zusätzlichem Tag ab Tag 31 */
  perDayAfter30: number;
  /**
   * Haftungsmodell (gegenseitig ausschließend):
   * - kautionTier 1/2/3: Produkt nutzt Kaution-Tier (keine Standard/Premium-Option)
   * - hasHaftungsoption: true → bietet Standard/Premium-Option (keine Kaution)
   */
  kautionTier: 1 | 2 | 3 | null;
  hasHaftungsoption: boolean;
  available: boolean;
  stock: number;
  imageUrl?: string;
  /** Produktbilder (Supabase Storage URLs). Erstes Bild = Hauptbild. */
  images?: string[];
  /** Frei verwaltbare Specs (Name, Wert, Icon, Priorität) */
  specs?: AdminProductSpec[];
  /** Ausführliche Produktbeschreibung (Admin-Editor) */
  description?: string;
  /** Modellname z.B. "Hero 13" */
  model?: string;
  /** Produktkategorie z.B. "action-cam", "360-cam" */
  category?: string;
  /** Tags z.B. ["popular","new","deal"] */
  tags?: string[];
  /** Kaution in Euro (direkt, unabhängig von kautionTier) */
  deposit?: number;
}

export type AdminProducts = Record<string, AdminProduct>;

/** Berechnet den Mietpreis aus der 30-Tage-Tabelle */
export function calcPriceFromTable(product: AdminProduct, days: number): number {
  if (days <= 0) return 0;
  if (days <= 30) return product.priceTable[days - 1] ?? 0;
  const day30Price = product.priceTable[29] ?? 0;
  return day30Price + (days - 30) * product.perDayAfter30;
}

// ─── Defaults: products (based on data/products.ts) ──────────────────────────

function buildDefaultPriceTable(prices: Partial<Record<number, number>>, fallbackPerDay: number): number[] {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    if (prices[day] !== undefined) return prices[day]!;
    // Linear interpolation between known points
    const known = Object.keys(prices).map(Number).sort((a, b) => a - b);
    for (let k = 0; k < known.length - 1; k++) {
      if (day > known[k] && day < known[k + 1]) {
        const t = (day - known[k]) / (known[k + 1] - known[k]);
        return Math.round(prices[known[k]]! + t * (prices[known[k + 1]]! - prices[known[k]]!));
      }
    }
    return Math.round(day * fallbackPerDay);
  });
}

export const DEFAULT_ADMIN_PRODUCTS: AdminProducts = {
  '1': {
    id: '1', name: 'GoPro Hero 13 Black', brand: 'GoPro', slug: 'gopro-hero-13-black',
    shortDescription: '5.3K60, 27MP, wasserdicht bis 10m',
    priceTable: [13,22,31,40,50,60,69,72,76,79,83,86,90,93,97,100,104,107,111,114,118,121,125,128,132,135,139,142,146,149],
    perDayAfter30: 4, kautionTier: null, hasHaftungsoption: true, available: true, stock: 5,
  },
  '2': {
    id: '2', name: 'GoPro Hero 12 Black', brand: 'GoPro', slug: 'gopro-hero-12-black',
    shortDescription: '5.3K60, 27MP, wasserdicht bis 10m',
    priceTable: buildDefaultPriceTable({1:10,2:17,3:24,7:55,14:80,30:120}, 10),
    perDayAfter30: 3, kautionTier: null, hasHaftungsoption: true, available: true, stock: 3,
  },
  '3': {
    id: '3', name: 'DJI Osmo Action 4', brand: 'DJI', slug: 'dji-osmo-action-4',
    shortDescription: '4K120, großer Sensor, Dual-Screen',
    priceTable: buildDefaultPriceTable({1:12,2:20,3:28,7:65,14:90,30:135}, 12),
    perDayAfter30: 3, kautionTier: null, hasHaftungsoption: true, available: true, stock: 4,
  },
  '4': {
    id: '4', name: 'DJI Osmo Action 5 Pro', brand: 'DJI', slug: 'dji-osmo-action-5-pro',
    shortDescription: '4K120, 40m wasserdicht, längere Akkulaufzeit',
    priceTable: buildDefaultPriceTable({1:14,2:24,3:33,7:75,14:100,30:150}, 14),
    perDayAfter30: 4, kautionTier: null, hasHaftungsoption: true, available: true, stock: 2,
  },
  '5': {
    id: '5', name: 'Insta360 Ace Pro 2', brand: 'Insta360', slug: 'insta360-ace-pro-2',
    shortDescription: '8K30, Leica Objektiv, AI-Features',
    priceTable: buildDefaultPriceTable({1:15,2:26,3:36,7:80,14:108,30:160}, 15),
    perDayAfter30: 4, kautionTier: null, hasHaftungsoption: true, available: false, stock: 0,
  },
  '6': {
    id: '6', name: 'Insta360 X4', brand: 'Insta360', slug: 'insta360-x4',
    shortDescription: '8K30 360°, unsichtbarer Selfie-Stick',
    priceTable: buildDefaultPriceTable({1:17,2:29,3:40,7:90,14:121,30:175}, 17),
    perDayAfter30: 5, kautionTier: null, hasHaftungsoption: true, available: true, stock: 2,
  },
};

// ─── Legacy compatibility (6-key format still used by API) ───────────────────

export interface ProductKeyPrices {
  d1: number; d2: number; d3: number; d7: number; d14: number; d30: number;
  deposit: number;
}

export const DEFAULT_PRODUCT_PRICES: Record<string, ProductKeyPrices> = {
  '1': { d1: 13,  d2: 22, d3: 31, d7: 69,  d14: 93,  d30: 149, deposit: 150 },
  '2': { d1: 10,  d2: 17, d3: 24, d7: 55,  d14: 80,  d30: 120, deposit: 120 },
  '3': { d1: 12,  d2: 20, d3: 28, d7: 65,  d14: 90,  d30: 135, deposit: 140 },
  '4': { d1: 14,  d2: 24, d3: 33, d7: 75,  d14: 100, d30: 150, deposit: 160 },
  '5': { d1: 15,  d2: 26, d3: 36, d7: 80,  d14: 108, d30: 160, deposit: 180 },
  '6': { d1: 17,  d2: 29, d3: 40, d7: 90,  d14: 121, d30: 175, deposit: 200 },
};

// ─── Mengenrabatte (Dauer-basiert) ───────────────────────────────────────────

export interface DurationDiscount {
  min_days: number;
  discount_percent: number;
  label: string;
}

export const DEFAULT_DURATION_DISCOUNTS: DurationDiscount[] = [
  { min_days: 5, discount_percent: 5, label: '5+ Tage: 5% Rabatt' },
  { min_days: 10, discount_percent: 10, label: '10+ Tage: 10% Rabatt' },
  { min_days: 20, discount_percent: 15, label: '20+ Tage: 15% Rabatt' },
];

/** Gibt den höchsten passenden Mengenrabatt zurück (oder null) */
export function calcDurationDiscount(
  days: number,
  discounts: DurationDiscount[]
): DurationDiscount | null {
  const sorted = [...discounts].sort((a, b) => b.min_days - a.min_days);
  return sorted.find((d) => days >= d.min_days) ?? null;
}

// ─── Treuerabatte ────────────────────────────────────────────────────────────

export interface LoyaltyDiscount {
  min_bookings: number;
  discount_percent: number;
  label: string;
}

export const DEFAULT_LOYALTY_DISCOUNTS: LoyaltyDiscount[] = [];

/** Gibt den höchsten passenden Treuerabatt zurück (oder null) */
export function calcLoyaltyDiscount(
  bookingCount: number,
  discounts: LoyaltyDiscount[]
): LoyaltyDiscount | null {
  const sorted = [...discounts].sort((a, b) => b.min_bookings - a.min_bookings);
  return sorted.find((d) => bookingCount >= d.min_bookings) ?? null;
}

// ─── Produktrabatte (z.B. Black Friday) ──────────────────────────────────────

export type DiscountType = 'percent' | 'fixed' | 'free';

export interface ProductDiscount {
  id: string;
  name: string;
  /** Rabatt-Typ: prozentual, fester EUR-Betrag, oder gratis. Default 'percent' (Legacy). */
  discount_type?: DiscountType;
  /** Prozentwert (nur bei discount_type='percent') */
  discount_percent: number;
  /** Fester EUR-Betrag pro Cart-Item (nur bei discount_type='fixed') */
  discount_amount?: number;
  /** Legacy: 'all' oder eine bestimmte Produkt-ID. Bleibt fuer Backward-Compat. */
  product_id?: string;
  /** Liste von Kamera-IDs (Mehrfach). Leer = alle */
  product_ids?: string[];
  /** Liste von Zubehoer-IDs. Triggert wenn im Cart-Item enthalten. */
  accessory_ids?: string[];
  /** Liste von Set-IDs. Triggert wenn das Set in der Buchung enthalten ist. */
  set_ids?: string[];
  /** Wenn true, gilt der Rabatt auf den Warenkorb-Gesamtbetrag statt pro Item. */
  applies_to_cart?: boolean;
  valid_from: string | null;
  valid_until: string | null;
  active: boolean;
}

/**
 * Berechnet den Warenkorb-Level-Rabatt fuer applies_to_cart-Aktionen.
 * Mehrere Cart-Level-Aktionen stacken (hoechste gewinnt, nicht summiert,
 * weil 50%+50% sonst >100% ergaeben). Cap auf cartTotal.
 */
export function calcCartLevelDiscount(
  cartTotal: number,
  discounts: ProductDiscount[],
): number {
  if (cartTotal <= 0) return 0;
  const now = new Date();
  let best = 0;
  for (const d of discounts) {
    if (!d.applies_to_cart) continue;
    if (!isWithinValidity(d, now)) continue;
    const amount = calcDiscountValue(d, cartTotal);
    if (amount > best) best = amount;
  }
  return Math.min(best, cartTotal);
}

export const DEFAULT_PRODUCT_DISCOUNTS: ProductDiscount[] = [];

export type DiscountTarget = 'rental' | 'accessories';

export interface DiscountMatch {
  discount: ProductDiscount;
  /** rental = Mietpreis (Kamera). accessories = Zubehoer-/Set-Preis. */
  target: DiscountTarget;
  /** Berechneter Rabattbetrag in EUR fuer dieses Item. */
  amount: number;
}

function isWithinValidity(d: ProductDiscount, now: Date): boolean {
  if (!d.active) return false;
  if (d.valid_from && new Date(d.valid_from) > now) return false;
  if (d.valid_until && new Date(d.valid_until) < now) return false;
  return true;
}

function hasProductTargets(d: ProductDiscount): boolean {
  if (d.product_id && d.product_id !== 'all') return true;
  return (d.product_ids?.length ?? 0) > 0;
}
function hasAccessoryTargets(d: ProductDiscount): boolean {
  return (d.accessory_ids?.length ?? 0) > 0 || (d.set_ids?.length ?? 0) > 0;
}

function calcDiscountValue(d: ProductDiscount, base: number): number {
  if (base <= 0) return 0;
  const type = d.discount_type ?? 'percent';
  if (type === 'free') return base;
  if (type === 'fixed') return Math.min(base, Math.max(0, d.discount_amount ?? 0));
  // percent (Default — Legacy)
  return Math.round(base * (d.discount_percent ?? 0)) / 100;
}

/**
 * Liefert alle aktiven Rabatte, die fuer ein Cart-Item greifen, jeweils mit
 * berechnetem Betrag und Target. Ein Discount kann auf 'rental' (Mietpreis)
 * oder 'accessories' (Zubehoer/Sets) wirken — Auto-Detection:
 * - Match via product_ids → 'rental'
 * - Match via accessory_ids/set_ids → 'accessories'
 * - Match via Legacy product_id → 'rental'
 * - Kein Target gesetzt → 'rental' (wirkt auf alle Kameras)
 */
export function getDiscountMatchesForItem(
  productId: string,
  priceRental: number,
  priceAccessories: number,
  cartAccessoryIds: string[],
  discounts: ProductDiscount[]
): DiscountMatch[] {
  const now = new Date();
  const matches: DiscountMatch[] = [];

  for (const d of discounts) {
    if (!isWithinValidity(d, now)) continue;
    // Cart-Level-Discounts werden separat in calcCartLevelDiscount berechnet.
    if (d.applies_to_cart) continue;

    const productIds = d.product_ids ?? [];
    const accIds = d.accessory_ids ?? [];
    const setIds = d.set_ids ?? [];

    const matchesAllLegacy = d.product_id === 'all';
    const matchesSpecificLegacy = d.product_id && d.product_id !== 'all' && d.product_id === productId;
    const matchesNewProductList = productIds.includes(productId);
    const matchesAccOrSet = accIds.some((id) => cartAccessoryIds.includes(id))
                         || setIds.some((id) => cartAccessoryIds.includes(id));

    // Wenn weder Produkt- noch Zubehoer-Targets gesetzt sind und kein
    // Legacy-product_id → matched alle Kameras (Default).
    const noTargets = !d.product_id && !hasProductTargets(d) && !hasAccessoryTargets(d);

    let target: DiscountTarget;
    if (matchesAllLegacy || matchesSpecificLegacy || matchesNewProductList || noTargets) {
      target = 'rental';
    } else if (matchesAccOrSet) {
      target = 'accessories';
    } else {
      continue; // kein Match
    }

    const base = target === 'rental' ? priceRental : priceAccessories;
    const amount = calcDiscountValue(d, base);
    if (amount > 0) matches.push({ discount: d, target, amount });
  }

  return matches;
}

/**
 * Berechnet den Gesamtrabatt fuer ein Item bei mehreren matchenden Aktionen.
 * Pro Target gewinnt der hoechste Rabatt (verhindert Doppel-Rabatt auf
 * dieselbe Basis); Targets stacken untereinander. Cap auf Item-Gesamtpreis.
 */
export function calcItemDiscountTotal(
  matches: DiscountMatch[],
  priceRental: number,
  priceAccessories: number
): number {
  let rentalDiscount = 0;
  let accessoriesDiscount = 0;
  for (const m of matches) {
    if (m.target === 'rental') rentalDiscount = Math.max(rentalDiscount, m.amount);
    else accessoriesDiscount = Math.max(accessoriesDiscount, m.amount);
  }
  rentalDiscount = Math.min(rentalDiscount, priceRental);
  accessoriesDiscount = Math.min(accessoriesDiscount, priceAccessories);
  return Math.min(rentalDiscount + accessoriesDiscount, priceRental + priceAccessories);
}

/**
 * Backward-Compat: Liefert den hoechsten Match (oder null). Aufrufer, die
 * nicht stacken muessen, koennen weiter dieses einfache API nutzen.
 */
export function getActiveProductDiscount(
  productId: string,
  discounts: ProductDiscount[],
  cartAccessoryIds: string[] = []
): ProductDiscount | null {
  // Vereinfacht: nimmt nur Rental-Targets, da das Legacy-Verhalten
  const matches = getDiscountMatchesForItem(productId, 1, 0, cartAccessoryIds, discounts);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.amount - a.amount)[0].discount;
}

// ─── PriceConfig (used by /api/prices) ───────────────────────────────────────

export interface PriceConfig {
  shipping: ShippingPriceConfig;
  haftung: HaftungConfig;
  products: Record<string, ProductKeyPrices>;
  adminProducts?: AdminProducts;
  kautionTiers?: KautionTiers;
}

// ─── calcPriceFromKeyDays (legacy fallback) ───────────────────────────────────

const KEY_DAY_MAP: [number, keyof ProductKeyPrices][] = [
  [1, 'd1'], [2, 'd2'], [3, 'd3'], [7, 'd7'], [14, 'd14'], [30, 'd30'],
];

export function calcPriceFromKeyDays(p: ProductKeyPrices, days: number): number {
  if (days <= 0) return 0;
  const exact = KEY_DAY_MAP.find(([d]) => d === days);
  if (exact) return p[exact[1]] as number;
  for (let i = 0; i < KEY_DAY_MAP.length - 1; i++) {
    const [d0, k0] = KEY_DAY_MAP[i];
    const [d1, k1] = KEY_DAY_MAP[i + 1];
    if (days > d0 && days < d1) {
      const t = (days - d0) / (d1 - d0);
      return Math.round((p[k0] as number) + t * ((p[k1] as number) - (p[k0] as number)));
    }
  }
  if (days > 30) {
    const ratePerDay = p.d30 / 30;
    return Math.round(p.d30 + (days - 30) * ratePerDay * 0.8);
  }
  return Math.round(days * p.d1);
}

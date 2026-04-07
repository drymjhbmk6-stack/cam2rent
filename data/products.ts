// ─── Pricing types ────────────────────────────────────────────────────────────

/**
 * Explicit price for an exact number of rental days.
 */
export interface PriceEntry {
  days: number;
  price: number;
}

/**
 * Linear formula for long rentals (31+ days): price = base + perDay × days
 */
export interface PriceFormula {
  base: number;
  perDay: number;
}

/**
 * Returns the total rental price for a given number of days.
 * Uses the product's priceTable (exact lookup) first, then the
 * priceFormula31plus for long rentals, then falls back to the
 * simple pricePerDay / pricePerWeek model.
 */
export function getPriceForDays(product: Product, days: number): number {
  if (days <= 0) return 0;

  // 1. Exact table lookup
  if (product.priceTable) {
    const entry = product.priceTable.find((e) => e.days === days);
    if (entry) return entry.price;
  }

  // 2. Formula for 31+ days
  if (product.priceFormula31plus && days >= 31) {
    const { base, perDay } = product.priceFormula31plus;
    return base + perDay * days;
  }

  // 3. Simple fallback: week + remaining days, or daily
  if (days >= 7) {
    const fullWeeks = Math.floor(days / 7);
    const remaining = days % 7;
    return fullWeeks * product.pricePerWeek + remaining * product.pricePerDay;
  }
  return days * product.pricePerDay;
}

// ─── Product interface ────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  brand: string;
  model: string;
  description: string;
  shortDescription: string;

  /** Fallback prices (used when no priceTable is defined) */
  pricePerDay: number;
  pricePerWeekend: number;
  pricePerWeek: number;

  /** Exact per-day-count price table */
  priceTable?: PriceEntry[];
  /** Formula for 31+ days: price = base + perDay × n */
  priceFormula31plus?: PriceFormula;

  deposit: number;

  /**
   * If true, the booking flow offers Haftungsoptionen (Standard 15 €, Premium 25 €).
   * If false, only Kaution applies (full liability for the renter).
   * Can be toggled per product in the admin area.
   */
  offersHaftungsoption: boolean;

  images: string[];
  specs: {
    resolution: string;
    fps: string;
    waterproof: string;
    battery: string;
    weight: string;
    storage: string;
  };
  category: string;
  tags: ('popular' | 'new' | 'deal')[];
  available: boolean;
  stock: number;
  slug: string;
}

// ─── Specs helper ─────────────────────────────────────────────────────────────

import type { AdminProductSpec } from '@/lib/price-config';

const STATIC_SPEC_MAP: Record<string, { icon: string; label: string }> = {
  resolution: { icon: 'resolution', label: 'Auflösung' },
  fps: { icon: 'fps', label: 'FPS' },
  waterproof: { icon: 'water', label: 'Wasserdicht' },
  battery: { icon: 'battery', label: 'Akku' },
  weight: { icon: 'weight', label: 'Gewicht' },
  storage: { icon: 'storage', label: 'Speicher' },
};

/**
 * Gibt Admin-Specs zurück wenn vorhanden, sonst konvertiert die
 * statischen 6 Spec-Felder in das AdminProductSpec-Format.
 */
export function getMergedSpecs(product: Product, adminSpecs?: AdminProductSpec[]): AdminProductSpec[] {
  if (adminSpecs?.length) return [...adminSpecs].sort((a, b) => a.priority - b.priority);

  return Object.entries(product.specs).map(([key, value], i) => ({
    id: key,
    name: STATIC_SPEC_MAP[key]?.label ?? key,
    value,
    icon: STATIC_SPEC_MAP[key]?.icon ?? 'custom',
    priority: i,
  }));
}

// ─── Products ─────────────────────────────────────────────────────────────────

export const products: Product[] = [
  {
    id: '1',
    name: 'GoPro Hero 13 Black',
    brand: 'GoPro',
    model: 'Hero 13',
    description:
      'Die neueste GoPro mit verbessertem Sensor, erweitertem Zubehör-Ökosystem und langer Akkulaufzeit. Perfekt für Sport, Reisen und Abenteuer.',
    shortDescription: '5.3K60, 27MP, wasserdicht bis 10m',
    pricePerDay: 13,
    pricePerWeekend: 22,
    pricePerWeek: 69,
    // Full pricing table (from Cam2Rent pricing config)
    priceTable: [
      { days: 1, price: 13 },
      { days: 2, price: 22 },
      { days: 3, price: 31 },
      { days: 4, price: 40 },
      { days: 5, price: 50 },
      { days: 6, price: 60 },
      { days: 7, price: 69 },
      { days: 8, price: 72 },
      { days: 9, price: 76 },
      { days: 10, price: 79 },
      { days: 11, price: 83 },
      { days: 12, price: 86 },
      { days: 13, price: 90 },
      { days: 14, price: 93 },
      { days: 15, price: 97 },
      { days: 16, price: 100 },
      { days: 17, price: 104 },
      { days: 18, price: 107 },
      { days: 19, price: 111 },
      { days: 20, price: 114 },
      { days: 21, price: 118 },
      { days: 22, price: 121 },
      { days: 23, price: 125 },
      { days: 24, price: 128 },
      { days: 25, price: 132 },
      { days: 26, price: 135 },
      { days: 27, price: 139 },
      { days: 28, price: 142 },
      { days: 29, price: 146 },
      { days: 30, price: 149 },
    ],
    priceFormula31plus: { base: 29, perDay: 4 },
    deposit: 150,
    offersHaftungsoption: true,
    images: ['/images/gopro-hero13.png'],
    specs: {
      resolution: '5.3K',
      fps: '60fps',
      waterproof: '10m',
      battery: '1900mAh',
      weight: '154g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['new', 'popular'],
    available: true,
    stock: 5,
    slug: 'gopro-hero-13-black',
  },
  {
    id: '2',
    name: 'GoPro Hero 12 Black',
    brand: 'GoPro',
    model: 'Hero 12',
    description:
      'Bewährte Qualität zum günstigen Preis. Die Hero 12 bietet alle wichtigen Features für beeindruckende Videos und Fotos.',
    shortDescription: '5.3K60, 27MP, wasserdicht bis 10m',
    pricePerDay: 10,
    pricePerWeekend: 18,
    pricePerWeek: 55,
    deposit: 120,
    offersHaftungsoption: true,
    images: ['/images/gopro-hero12.png'],
    specs: {
      resolution: '5.3K',
      fps: '60fps',
      waterproof: '10m',
      battery: '1720mAh',
      weight: '154g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['popular'],
    available: true,
    stock: 3,
    slug: 'gopro-hero-12-black',
  },
  {
    id: '3',
    name: 'DJI Osmo Action 4',
    brand: 'DJI',
    model: 'Action 4',
    description:
      "DJIs Flaggschiff-Actionkamera mit großem 1/1.3\"-Sensor für beeindruckende Low-Light-Aufnahmen. Dual-Screen und hervorragende Stabilisierung.",
    shortDescription: '4K120, großer Sensor, Dual-Screen',
    pricePerDay: 12,
    pricePerWeekend: 20,
    pricePerWeek: 65,
    deposit: 140,
    offersHaftungsoption: true,
    images: ['/images/dji-action4.png'],
    specs: {
      resolution: '4K',
      fps: '120fps',
      waterproof: '18m',
      battery: '1770mAh',
      weight: '145g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['popular'],
    available: true,
    stock: 4,
    slug: 'dji-osmo-action-4',
  },
  {
    id: '4',
    name: 'DJI Osmo Action 5 Pro',
    brand: 'DJI',
    model: 'Action 5 Pro',
    description:
      'Die neueste DJI Action-Cam mit verbesserter Stabilisierung, noch längerem Akku und beeindruckender Wasserbeständigkeit bis 40m ohne Gehäuse.',
    shortDescription: '4K120, 40m wasserdicht, längere Akkulaufzeit',
    pricePerDay: 14,
    pricePerWeekend: 24,
    pricePerWeek: 75,
    deposit: 160,
    offersHaftungsoption: true,
    images: ['/images/dji-action5-pro.png'],
    specs: {
      resolution: '4K',
      fps: '120fps',
      waterproof: '40m',
      battery: '1950mAh',
      weight: '145g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['new'],
    available: true,
    stock: 2,
    slug: 'dji-osmo-action-5-pro',
  },
  {
    id: '5',
    name: 'Insta360 Ace Pro 2',
    brand: 'Insta360',
    model: 'Ace Pro 2',
    description:
      'Insta360s Premium-Actionkamera mit Leica-Optik und KI-gestützten Features. Brillante Bildqualität bei jedem Licht.',
    shortDescription: '8K30, Leica Objektiv, AI-Features',
    pricePerDay: 15,
    pricePerWeekend: 26,
    pricePerWeek: 80,
    deposit: 180,
    offersHaftungsoption: true,
    images: ['/images/insta360-ace-pro2.png'],
    specs: {
      resolution: '8K',
      fps: '30fps',
      waterproof: '12m',
      battery: '1800mAh',
      weight: '177g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['new'],
    available: false,
    stock: 0,
    slug: 'insta360-ace-pro-2',
  },
  {
    id: '6',
    name: 'Insta360 X4',
    brand: 'Insta360',
    model: 'X4',
    description:
      'Die beste 360°-Kamera auf dem Markt. Unsichtbarer Selfie-Stick-Effekt, Me-Modus und beeindruckende 8K-Qualität für immersive Videos.',
    shortDescription: '8K30 360°, unsichtbarer Selfie-Stick',
    pricePerDay: 17,
    pricePerWeekend: 29,
    pricePerWeek: 90,
    deposit: 200,
    offersHaftungsoption: true,
    images: ['/images/insta360-x4.png'],
    specs: {
      resolution: '8K 360°',
      fps: '30fps',
      waterproof: '10m',
      battery: '2290mAh',
      weight: '203g',
      storage: 'microSD',
    },
    category: '360-cam',
    tags: ['deal'],
    available: true,
    stock: 2,
    slug: 'insta360-x4',
  },
];

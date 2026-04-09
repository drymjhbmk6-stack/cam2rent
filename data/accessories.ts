// ─── Accessory types ──────────────────────────────────────────────────────────

/**
 * How the accessory price is billed:
 *  - 'perDay'  → price × rental days  (e.g. extra battery: 2 €/Tag)
 *  - 'flat'    → one-time flat fee for the whole booking  (e.g. insurance bag: 5 €)
 */
export type AccessoryPricingMode = 'perDay' | 'flat';

/**
 * Icon identifier – rendered to an SVG by the UI layer.
 * Add new IDs here and map them in the booking page icon map.
 */
export type AccessoryIconId =
  | 'tripod'
  | 'sd-card'
  | 'battery'
  | 'charger'
  | 'case'
  | 'mount'
  | 'light'
  | 'mic';

// ─── Accessory Groups ─────────────────────────────────────────────────────────
//
// Gruppen-IDs frei wählbar (Kleinbuchstaben, kein Leerzeichen).
// Den Anzeigenamen hier eintragen — wird im Checkout und in der Admin-UI genutzt.
//
// Neue Gruppe hinzufügen:
//   1. Hier einen neuen Eintrag ergänzen
//   2. Beim Zubehör unten group: 'deine-gruppe-id' setzen
//
// ─────────────────────────────────────────────────────────────────────────────

export const ACCESSORY_GROUPS: Record<string, string> = {
  speicherkarten: 'Speicherkarten',
  stative:        'Stative & Halterungen',
  akkus:          'Akkus & Ladegeräte',
  gehaeuse:       'Schutzgehäuse',
  audio:          'Audio',
  beleuchtung:    'Beleuchtung',
};

export interface Accessory {
  id: string;
  name: string;
  description: string;

  /**
   * 'perDay' → customer pays price × days
   * 'flat'   → customer pays price once per booking
   */
  pricingMode: AccessoryPricingMode;

  /** Price in €. Per day if pricingMode='perDay', one-time if pricingMode='flat'. */
  price: number;

  /** If false, the item is hidden in the booking flow. */
  available: boolean;

  /** Internes Zubehoer — nur im Admin und in Sets sichtbar, Kunde kann es nicht einzeln buchen. */
  internal?: boolean;

  /** Maps to an SVG icon in the booking page. */
  iconId: AccessoryIconId;

  /**
   * Optionale Gruppe — ID aus ACCESSORY_GROUPS.
   * Ermöglicht Gruppenrabatte per Gutschein-Code.
   * Weglassen = kein Gruppenrabatt möglich für dieses Zubehör.
   */
  group?: string;
}

// ─── Accessories ──────────────────────────────────────────────────────────────
// Neues Zubehör hinzufügen:
//   1. Eintrag kopieren, id und Felder anpassen
//   2. group: 'gruppe-id' setzen (optional, aber für Gruppenrabatte nötig)
//   3. npm run build

export const accessories: Accessory[] = [
  {
    id: 'tripod',
    name: 'Mini-Stativ',
    description: 'Flexibles Gorilla-Pod Stativ, universell',
    pricingMode: 'perDay',
    price: 2.0,
    available: true,
    iconId: 'tripod',
    group: 'stative',
  },
  {
    id: 'sd64',
    name: 'SD-Karte 64 GB',
    description: 'SanDisk Extreme, Class 10, 4K-ready',
    pricingMode: 'perDay',
    price: 1.0,
    available: true,
    iconId: 'sd-card',
    group: 'speicherkarten',
  },
  {
    id: 'sd128',
    name: 'SD-Karte 128 GB',
    description: 'SanDisk Extreme Pro, Class 10, 4K-ready',
    pricingMode: 'perDay',
    price: 1.5,
    available: true,
    iconId: 'sd-card',
    group: 'speicherkarten',
  },
  {
    id: 'battery',
    name: 'Extra Akku',
    description: 'Original-Ersatzakku für die Kamera',
    pricingMode: 'perDay',
    price: 2.0,
    available: true,
    iconId: 'battery',
    group: 'akkus',
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns the total cost of one accessory for a given number of rental days.
 * - pricingMode='perDay' → price × days
 * - pricingMode='flat'   → price (regardless of days)
 */
export function getAccessoryPrice(acc: Accessory, days: number): number {
  if (acc.pricingMode === 'flat') return acc.price;
  return acc.price * Math.max(1, days);
}

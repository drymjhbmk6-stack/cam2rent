// ─── Rental Sets ─────────────────────────────────────────────────────────────
//
// Sets sind vordefinierte Zubehör-Pakete zu einem Pauschalpreis.
// Statische Metadaten (Name, Beschreibung, enthaltene Artikel) stehen hier.
// Preis, Abrechnungsart und Verfügbarkeit werden über das Admin-Panel
// in Supabase verwaltet (Tabelle: sets).
//
// ─────────────────────────────────────────────────────────────────────────────

export interface RentalSet {
  id: string;
  name: string;
  description: string;
  /** Kurze Liste der enthaltenen Artikel (für UI-Anzeige) */
  includedItems: string[];
  /** Maschinenlesbare Liste der enthaltenen Artikel mit Anzahl (aus DB) */
  accessory_items?: { accessory_id: string; qty: number }[];
  /**
   * Angereicherte Variante mit Name + Upgrade-Infos pro Eintrag. Wird von
   * der Sets-API (GET /api/sets) befuellt und erlaubt dem Frontend, den
   * Default-Eintrag einer Upgrade-Gruppe (z.B. "64 GB") aus der Anzeige
   * auszublenden, sobald die Upgrade-Variante (z.B. "512 GB") gewaehlt
   * ist — auch wenn das Default-Accessory `internal=true` ist und nicht in
   * /api/accessories enthalten waere.
   */
  accessory_items_detailed?: {
    accessory_id: string;
    qty: number;
    name: string;
    upgrade_group: string | null;
    is_upgrade_base: boolean;
  }[];
  /** Optionales Badge (z.B. "Beliebt") */
  badge?: string;
  badgeColor?: string;
  /** Sortierreihenfolge */
  sortOrder: number;
  // ── Felder aus Supabase (werden zur Laufzeit befüllt) ──
  pricingMode: 'perDay' | 'flat';
  price: number;
  available: boolean;
  /** Set-Bild URL (optional) */
  image_url?: string | null;
  /**
   * Welche Kameras (product_ids) haben dieses Set als PFLICHT-Basis-Set?
   * Muss eine Teilmenge von product_ids sein. Wird in der Sets-API + im
   * Admin-UI validiert; leeres Array = kein Basis-Set fuer keine Kamera.
   */
  basic_for_product_ids?: string[];
  /** Liste der Sub-Items als Datenbasis fuer Verfuegbarkeits-Check (von API gesetzt). */
  product_ids?: string[];
}

// ─── Statische Set-Definitionen ───────────────────────────────────────────────
// Preis und pricingMode sind Standardwerte, die im Admin-Panel überschrieben werden.

export const RENTAL_SETS_STATIC: Omit<RentalSet, 'pricingMode' | 'price' | 'available'>[] = [
  {
    id: 'basic',
    name: 'Basic Set',
    description: 'Das Starterpaket für einfache Aufnahmen.',
    includedItems: ['Extra Akku', 'SD-Karte 64 GB'],
    sortOrder: 1,
  },
  {
    id: 'fahrrad',
    name: 'Fahrrad Set',
    description: 'Perfekt für Mountainbike- und Rennradtouren.',
    includedItems: ['Lenkerhalterung', 'Extra Akku', 'SD-Karte 64 GB'],
    badge: 'Beliebt',
    badgeColor: 'bg-accent-blue text-white',
    sortOrder: 2,
  },
  {
    id: 'ski',
    name: 'Ski Set',
    description: 'Für spektakuläre Aufnahmen auf der Piste.',
    includedItems: ['Helmhalterung', 'Extra Akku', 'SD-Karte 128 GB', 'Schutzgehäuse'],
    sortOrder: 3,
  },
  {
    id: 'motorrad',
    name: 'Motorrad Set',
    description: 'Halterungen und Zubehör für Motorradtouren.',
    includedItems: ['Helmhalterung', 'Lenkerhalterung', 'Extra Akku', 'SD-Karte 64 GB'],
    sortOrder: 4,
  },
  {
    id: 'taucher',
    name: 'Taucher Set',
    description: 'Wasserdicht bis 40 m – für Schnorcheln und Tauchen.',
    includedItems: ['Wasserdichtes Gehäuse', 'Extra Akku', 'SD-Karte 128 GB'],
    badge: 'Wasserdicht',
    badgeColor: 'bg-accent-teal text-white',
    sortOrder: 5,
  },
  {
    id: 'vlogging',
    name: 'Vlogging Set',
    description: 'Mikrofon, Stativ und Speicher für Content Creator.',
    includedItems: ['Mini-Stativ', 'Mikrofon', 'SD-Karte 128 GB', 'Extra Akku'],
    sortOrder: 6,
  },
  {
    id: 'allrounder',
    name: 'Allrounder Set',
    description: 'Das komplette Paket für jeden Einsatz.',
    includedItems: ['Mini-Stativ', 'Extra Akku', 'SD-Karte 128 GB', 'Schutzgehäuse', 'Mikrofon'],
    badge: 'Komplett',
    badgeColor: 'bg-brand-black text-white',
    sortOrder: 7,
  },
];

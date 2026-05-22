// ─── Angebote (Festpreis-Buendel Kamera + Zubehoer) ──────────────────────────
//
// Ein "Angebot" ist ein kuratiertes, zeitlich begrenztes Festpreis-Buendel:
// EINE Kamera (mehrere Kamera-Optionen mit je eigenem Preis moeglich) + fest
// enthaltenes Zubehoer. Der Preis ersetzt die normale Kamerapreis-Berechnung
// vollstaendig (all-in). Verwaltet im Admin-Panel (Tabelle: angebote).
//
// ─────────────────────────────────────────────────────────────────────────────

export interface AngebotCameraOption {
  product_id: string;
  /** Komplettpreis fuer diese Kamera (flat = fuer fixed_days, perDay = pro Tag). */
  price: number;
}

export interface AngebotAccessoryItem {
  accessory_id: string;
  qty: number;
}

export interface Angebot {
  id: string;
  name: string;
  description: string;
  /** ISO-Timestamp — Beginn des Verkaufs-/Mietfensters (null = offen). */
  valid_from: string | null;
  /** ISO-Timestamp — Ende des Verkaufs-/Mietfensters (null = offen). */
  valid_until: string | null;
  /** 'flat' = Pauschale fuer fixed_days Tage, 'perDay' = Preis pro Tag. */
  pricing_mode: 'flat' | 'perDay';
  /** Feste Mietdauer in Tagen (nur bei pricing_mode='flat' relevant). */
  fixed_days: number | null;
  camera_options: AngebotCameraOption[];
  accessory_items: AngebotAccessoryItem[];
  image_url: string | null;
  badge: string | null;
  badge_color: string | null;
  sort_order: number;
  active: boolean;
}

/**
 * Ist das Angebot aktuell gueltig (aktiv + im Verkaufs-/Mietfenster)?
 * valid_from/valid_until werden inklusive End-of-Day gespeichert, daher
 * reicht ein einfacher Date-Vergleich.
 */
export function isAngebotActive(a: Angebot, now: Date = new Date()): boolean {
  if (!a.active) return false;
  if (a.valid_from && new Date(a.valid_from) > now) return false;
  if (a.valid_until && new Date(a.valid_until) < now) return false;
  return true;
}

/** Mappt eine rohe DB-Zeile defensiv auf das Angebot-Objekt. */
export function mapAngebotRow(r: Record<string, unknown>): Angebot {
  return {
    id: String(r.id),
    name: (r.name as string) ?? '',
    description: (r.description as string) ?? '',
    valid_from: (r.valid_from as string) ?? null,
    valid_until: (r.valid_until as string) ?? null,
    pricing_mode: r.pricing_mode === 'perDay' ? 'perDay' : 'flat',
    fixed_days: typeof r.fixed_days === 'number' ? r.fixed_days : null,
    camera_options: Array.isArray(r.camera_options) ? (r.camera_options as AngebotCameraOption[]) : [],
    accessory_items: Array.isArray(r.accessory_items) ? (r.accessory_items as AngebotAccessoryItem[]) : [],
    image_url: (r.image_url as string) ?? null,
    badge: (r.badge as string) ?? null,
    badge_color: (r.badge_color as string) ?? null,
    sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
    active: r.active !== false,
  };
}

/** Preis der Kamera-Option, oder null wenn die Kamera nicht Teil des Angebots ist. */
export function getAngebotCameraPrice(a: Angebot, productId: string): number | null {
  const opt = a.camera_options.find((o) => o.product_id === productId);
  return opt ? opt.price : null;
}

/** Gesamtpreis des Angebots fuer eine Kamera + Tagezahl, oder null. */
export function calcAngebotPrice(a: Angebot, productId: string, days: number): number | null {
  const base = getAngebotCameraPrice(a, productId);
  if (base === null) return null;
  return a.pricing_mode === 'perDay' ? base * Math.max(1, days) : base;
}

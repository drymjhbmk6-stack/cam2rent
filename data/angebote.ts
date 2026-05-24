// ─── Angebote (Festpreis-Buendel Kamera + Zubehoer) ──────────────────────────
//
// Ein "Angebot" ist ein kuratiertes, zeitlich begrenztes Festpreis-Buendel:
// EINE Kamera (mehrere Kamera-Optionen mit je eigenem Preis moeglich) + fest
// enthaltenes Zubehoer. Das Zubehoer wird PRO Kamera gepflegt — verschiedene
// Kameras haben unterschiedliches Zubehoer (eigene Akkus, Tauchgehaeuse etc.).
// Der Preis ersetzt die normale Kamerapreis-Berechnung vollstaendig (all-in).
// Verwaltet im Admin-Panel (Tabelle: angebote).
//
// ─────────────────────────────────────────────────────────────────────────────

export interface AngebotAccessoryItem {
  accessory_id: string;
  qty: number;
}

export interface AngebotCameraOption {
  product_id: string;
  /** Komplettpreis fuer diese Kamera (flat = fuer fixed_days, perDay = pro Tag). */
  price: number;
  /** Enthaltenes Zubehoer fuer genau diese Kamera. */
  accessory_items: AngebotAccessoryItem[];
}

export interface Angebot {
  id: string;
  name: string;
  description: string;
  /** ISO-Timestamp — Beginn des Mietfensters (null = offen). */
  valid_from: string | null;
  /** ISO-Timestamp — Ende des Mietfensters (null = offen). */
  valid_until: string | null;
  /**
   * Optional: ISO-Timestamp ab dem das Angebot sichtbar/buchbar wird —
   * UNABHAENGIG vom Mietfenster. null = Sichtbarkeit ab `valid_from`.
   * Beispiel: published_from=01.04., valid_from=01.05., valid_until=30.05.
   * → Kunde sieht/bucht das Angebot ab 01.04., der Mietzeitraum muss aber
   * weiterhin komplett innerhalb 01.05.–30.05. liegen.
   */
  published_from: string | null;
  /** 'flat' = Pauschale fuer fixed_days Tage, 'perDay' = Preis pro Tag. */
  pricing_mode: 'flat' | 'perDay';
  /** Feste Mietdauer in Tagen (nur bei pricing_mode='flat' relevant). */
  fixed_days: number | null;
  camera_options: AngebotCameraOption[];
  image_url: string | null;
  badge: string | null;
  badge_color: string | null;
  sort_order: number;
  active: boolean;
}

/** Normalisiert eine rohe accessory_items-Liste defensiv. */
function normalizeAccessoryItems(input: unknown): AngebotAccessoryItem[] {
  if (!Array.isArray(input)) return [];
  const out: AngebotAccessoryItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const aid = String((raw as { accessory_id?: unknown }).accessory_id ?? '').trim();
    if (!aid) continue;
    const qty = Math.floor(Number((raw as { qty?: unknown }).qty));
    out.push({ accessory_id: aid, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 });
  }
  return out;
}

/**
 * Ist das Angebot aktuell sichtbar/buchbar (= "aktiv" im UI/API-Sinn)?
 * Untere Schranke: `published_from` (Vorab-Veroeffentlichung) bzw. — wenn
 * leer — `valid_from`. Obere Schranke: `valid_until`. Beide Endpunkte werden
 * inklusive End-of-Day gespeichert, daher reicht ein einfacher Date-Vergleich.
 * Die Mietzeitraum-Validierung (`valid_from`..`valid_until`) ist davon
 * getrennt und passiert im Buchungs-Wizard ueber `offerAllowedRange`.
 */
export function isAngebotActive(a: Angebot, now: Date = new Date()): boolean {
  if (!a.active) return false;
  const visibleFromIso = a.published_from ?? a.valid_from;
  if (visibleFromIso && new Date(visibleFromIso) > now) return false;
  if (a.valid_until && new Date(a.valid_until) < now) return false;
  return true;
}

/** Mappt eine rohe DB-Zeile defensiv auf das Angebot-Objekt. */
export function mapAngebotRow(r: Record<string, unknown>): Angebot {
  const rawCams = Array.isArray(r.camera_options) ? r.camera_options : [];
  const camera_options: AngebotCameraOption[] = rawCams
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      product_id: String(c.product_id ?? ''),
      price: Number(c.price) || 0,
      accessory_items: normalizeAccessoryItems(c.accessory_items),
    }))
    .filter((c) => c.product_id);
  return {
    id: String(r.id),
    name: (r.name as string) ?? '',
    description: (r.description as string) ?? '',
    valid_from: (r.valid_from as string) ?? null,
    valid_until: (r.valid_until as string) ?? null,
    published_from: (r.published_from as string) ?? null,
    pricing_mode: r.pricing_mode === 'perDay' ? 'perDay' : 'flat',
    fixed_days: typeof r.fixed_days === 'number' ? r.fixed_days : null,
    camera_options,
    image_url: (r.image_url as string) ?? null,
    badge: (r.badge as string) ?? null,
    badge_color: (r.badge_color as string) ?? null,
    sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
    active: r.active !== false,
  };
}

/** Kamera-Option des Angebots, oder null wenn die Kamera nicht enthalten ist. */
export function getAngebotCameraOption(a: Angebot, productId: string): AngebotCameraOption | null {
  return a.camera_options.find((o) => o.product_id === productId) ?? null;
}

/** Preis der Kamera-Option, oder null wenn die Kamera nicht Teil des Angebots ist. */
export function getAngebotCameraPrice(a: Angebot, productId: string): number | null {
  const opt = getAngebotCameraOption(a, productId);
  return opt ? opt.price : null;
}

/** Gesamtpreis des Angebots fuer eine Kamera + Tagezahl, oder null. */
export function calcAngebotPrice(a: Angebot, productId: string, days: number): number | null {
  const base = getAngebotCameraPrice(a, productId);
  if (base === null) return null;
  return a.pricing_mode === 'perDay' ? base * Math.max(1, days) : base;
}

/**
 * Multi-Kamera pro Buchung — zentraler Resolver + Skelett-Builder.
 *
 * Eine Buchung kann beliebig viele Kameras enthalten, auch verschiedene
 * Modelle. Quelle der Wahrheit ist `bookings.cameras` (JSONB-Array, ein
 * Eintrag pro physischer Kamera). Ist die Spalte NULL (Legacy / Migration
 * noch nicht durch), wird die Liste defensiv aus `product_name` (Komma-
 * String) + `product_id` + `unit_id` abgeleitet — Verhalten dann identisch
 * zum bisherigen Einzel-Kamera-Pfad (Regressionsschutz).
 *
 * Siehe supabase/supabase-bookings-cameras.sql.
 */

export interface BookingCamera {
  /** Produkt-ID dieser Kamera (Legacy: fuer alle gleich = booking.product_id) */
  product_id: string | null;
  /** Anzeigename dieser Kamera */
  product_name: string;
  /** Zugewiesene physische Einheit (product_units.id) oder null */
  unit_id: string | null;
}

interface BookingCameraSource {
  product_id?: string | null;
  product_name?: string | null;
  unit_id?: string | null;
  cameras?: unknown;
}

function normalizeEntry(raw: unknown): BookingCamera | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.product_name === 'string' ? o.product_name.trim() : '';
  const pid =
    typeof o.product_id === 'string' && o.product_id.trim() !== ''
      ? o.product_id.trim()
      : null;
  const uid =
    typeof o.unit_id === 'string' && o.unit_id.trim() !== ''
      ? o.unit_id.trim()
      : null;
  if (!name && !pid && !uid) return null;
  return { product_id: pid, product_name: name, unit_id: uid };
}

/**
 * Liefert die normalisierte Kamera-Liste einer Buchung.
 *
 * Bevorzugt `booking.cameras`; faellt sonst auf den Legacy-Ableitungspfad
 * (product_name-Split, erste Kamera bekommt unit_id) zurueck.
 */
export function resolveBookingCameras(
  booking: BookingCameraSource | null | undefined,
): BookingCamera[] {
  if (!booking) return [];

  if (Array.isArray(booking.cameras) && booking.cameras.length > 0) {
    const list = booking.cameras
      .map(normalizeEntry)
      .filter((c): c is BookingCamera => c !== null);
    if (list.length > 0) return list;
  }

  // Legacy-Fallback: product_name Komma-Split
  const names = String(booking.product_name ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (names.length === 0) return [];

  const legacyPid =
    typeof booking.product_id === 'string' && booking.product_id.trim() !== ''
      ? booking.product_id.trim()
      : null;
  const legacyUnit =
    typeof booking.unit_id === 'string' && booking.unit_id.trim() !== ''
      ? booking.unit_id.trim()
      : null;

  return names.map((name, i) => ({
    product_id: legacyPid,
    product_name: name,
    unit_id: i === 0 ? legacyUnit : null,
  }));
}

/** Anzahl Kameras in einer Buchung (Multi-Kamera-aware, Legacy-Fallback). */
export function countBookingCameras(
  booking: BookingCameraSource | null | undefined,
): number {
  return resolveBookingCameras(booking).length;
}

export interface DesiredCamera {
  product_id: string | null;
  product_name: string;
  qty: number;
}

/**
 * Baut das Kamera-Skelett (ein Eintrag pro physischer Kamera, unit_id=null)
 * aus einer Wunschliste. `qty` wird flach expandiert.
 */
export function buildCameraSkeleton(items: DesiredCamera[]): BookingCamera[] {
  const out: BookingCamera[] = [];
  for (const it of items) {
    const qty = Math.max(1, Math.floor(it.qty || 1));
    for (let i = 0; i < qty; i++) {
      out.push({
        product_id: it.product_id ?? null,
        product_name: it.product_name,
        unit_id: null,
      });
    }
  }
  return out;
}

/**
 * Leitet die Wunschliste (DesiredCamera[]) aus einer bestehenden Buchungs-
 * zeile ab — fuer Recovery-/Webhook-Pfade, die nur die persistierte Zeile
 * kennen. Nutzt den Resolver (cameras[] bevorzugt, sonst product_name-Split),
 * ein DesiredCamera pro physischer Kamera.
 */
export function desiredFromBooking(
  booking: BookingCameraSource | null | undefined,
): DesiredCamera[] {
  return resolveBookingCameras(booking).map((c) => ({
    product_id: c.product_id,
    product_name: c.product_name,
    qty: 1,
  }));
}

/** Legacy `product_name` (Komma-String) aus einer Kamera-Liste. */
export function camerasToProductName(cameras: BookingCamera[]): string {
  return cameras.map((c) => c.product_name).filter(Boolean).join(', ');
}

/** Legacy `unit_id` = erste Kamera mit zugewiesener Einheit. */
export function firstAssignedUnitId(cameras: BookingCamera[]): string | null {
  return cameras.find((c) => c.unit_id)?.unit_id ?? null;
}

/**
 * Zentrale Berechnung von Versand-/Uebergabe-Tag (vor Mietbeginn) und
 * Rueckgabe-Soll-Tag (nach Mietende) pro Buchung.
 *
 * Default: aus `admin_settings.booking_buffer_days` + delivery_mode.
 * Override pro Buchung: `bookings.ship_date_override` /
 * `bookings.return_due_date_override` (DATE, optional) — wenn gesetzt,
 * hat der Wert Vorrang.
 *
 * Wird genutzt von:
 *  - /api/availability/[productId]      (Customer-Kalender)
 *  - /api/admin/availability-gantt      (Admin-Verfuegbarkeit)
 *  - /api/admin/auftragskalender        (Aufgaben-Kalender)
 *  - /admin/retouren                    (Rueckgabe-Soll-Datum)
 *
 * So sind „1 Tag Abholung" / „3 Tage Versand" und individuelle Override-
 * Termine ueberall konsistent.
 */

import type { createServiceClient } from '@/lib/supabase';
import { getBerlinHour } from '@/lib/timezone';

type SB = ReturnType<typeof createServiceClient>;

export interface BufferDays {
  versand_before: number;
  versand_after: number;
  abholung_before: number;
  abholung_after: number;
  /**
   * Optionaler Cutoff (Berlin-Stunde 0-23). Ab dieser Stunde gilt der heutige
   * Tag NICHT mehr als nutzbarer Vorlauf-Tag → der effektive Vorlauf wird um
   * +1 Tag erhoeht. `null`/`undefined` = kein Cutoff (Verhalten wie bisher).
   *
   * Beispiel Versand-Cutoff 12:00 und Vorlauf 3:
   * - Buchung um 11:30 Berlin → Vorlauf = 3 Tage
   * - Buchung um 12:01 Berlin → Vorlauf = 4 Tage (heute zaehlt nicht mehr)
   */
  versand_cutoff_hour?: number | null;
  abholung_cutoff_hour?: number | null;
}

/**
 * System-Default: 2/2 Versand, 0/1 Abholung — passt zum bestehenden
 * Customer-Kalender. /admin/auftragskalender nutzt historisch 3/3 vs 1/1;
 * deshalb gibt es dort einen eigenen Default. Hier ist der Customer-Default
 * relevant — Aufrufer koennen mit `{ ...DEFAULT_BUFFER, ...localOverride }`
 * eigene Defaults setzen.
 */
export const DEFAULT_BUFFER: BufferDays = {
  versand_before: 2,
  versand_after: 2,
  abholung_before: 0,
  abholung_after: 1,
  versand_cutoff_hour: null,
  abholung_cutoff_hour: null,
};

/** Laedt die globalen Puffer aus admin_settings (defensiver Fallback). */
export async function loadBufferDays(
  supabase: SB,
  fallback: BufferDays = DEFAULT_BUFFER,
): Promise<BufferDays> {
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'booking_buffer_days')
      .maybeSingle();
    if (!data?.value) return fallback;
    const parsed =
      typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (parsed && typeof parsed === 'object') {
      return { ...fallback, ...(parsed as Partial<BufferDays>) };
    }
  } catch {
    // Setting nicht ladbar (RLS, Migration) → Fallback
  }
  return fallback;
}

/**
 * Mietzeitraum-Endpunkte aus einer Buchung extrahieren. Akzeptiert ISO-
 * Datum (YYYY-MM-DD) ODER ISO-Datetime — beides wird auf 00:00 Berlin-Zeit
 * normalisiert (Lokal-Datum), damit Tageszahlen-Arithmetik stabil ist.
 */
function parseDay(s: string): Date {
  // YYYY-MM-DD direkt als Local-Date (verhindert UTC-Versatz)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Datum als YYYY-MM-DD im lokalen Kalender (kein UTC-Shift). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Versand-/Uebergabe-Tag (vor Mietbeginn). Override hat Vorrang.
 * Returns Date (Local-Date, 00:00:00).
 */
export function computeShipDate(
  rentalFrom: string,
  deliveryMode: string | null | undefined,
  buf: BufferDays,
  override?: string | null,
): Date {
  if (override) return parseDay(override);
  const d = parseDay(rentalFrom);
  const before = deliveryMode === 'abholung' ? buf.abholung_before : buf.versand_before;
  d.setDate(d.getDate() - before);
  return d;
}

/**
 * Rueckgabe-Soll-Tag (nach Mietende). Override hat Vorrang.
 * Returns Date (Local-Date, 00:00:00).
 */
export function computeReturnDueDate(
  rentalTo: string,
  deliveryMode: string | null | undefined,
  buf: BufferDays,
  override?: string | null,
): Date {
  if (override) return parseDay(override);
  const d = parseDay(rentalTo);
  const after = deliveryMode === 'abholung' ? buf.abholung_after : buf.versand_after;
  d.setDate(d.getDate() + after);
  return d;
}

/**
 * Effektive Vorlaufzeit fuer eine NEUE Buchung ab `now`. Beruecksichtigt
 * den optionalen Cutoff-Hour: ist die aktuelle Berlin-Stunde >= cutoff,
 * faellt der heutige Tag aus der Vorlaufzeit raus (+1 Tag).
 *
 * Beispiel Versand 3 Tage + Cutoff 12:00:
 *  - 11:30 Berlin → 3 Tage (Buchung heute um 11:30 + 3 Tage = frueheste Miete uebermorgen+1)
 *  - 12:01 Berlin → 4 Tage (kein voller Versandtag mehr heute → +1 Puffer)
 */
export function getEffectiveLeadDays(
  buf: BufferDays,
  deliveryMode: string | null | undefined,
  now: Date = new Date(),
): number {
  const isPickup = deliveryMode === 'abholung';
  const base = isPickup ? buf.abholung_before : buf.versand_before;
  const cutoff = isPickup ? buf.abholung_cutoff_hour : buf.versand_cutoff_hour;
  if (typeof cutoff !== 'number' || !Number.isFinite(cutoff)) return base;
  const cutoffInt = Math.floor(cutoff);
  if (cutoffInt < 0 || cutoffInt > 23) return base;
  return getBerlinHour(now) >= cutoffInt ? base + 1 : base;
}

/** Convenience: liefert beide Daten als ISO-Strings (YYYY-MM-DD). */
export function computeShipAndReturn(
  rentalFrom: string,
  rentalTo: string,
  deliveryMode: string | null | undefined,
  buf: BufferDays,
  shipOverride?: string | null,
  returnOverride?: string | null,
): { ship_date: string; return_date: string } {
  return {
    ship_date: toIsoDate(computeShipDate(rentalFrom, deliveryMode, buf, shipOverride)),
    return_date: toIsoDate(computeReturnDueDate(rentalTo, deliveryMode, buf, returnOverride)),
  };
}

/**
 * Validiert + saniert ein Override-Datum aus User-Input. Akzeptiert leeren
 * String/null als „kein Override mehr" und gibt explizit null zurueck. Bei
 * gueltigem Format wird YYYY-MM-DD zurueckgegeben, ungueltig → throwt.
 */
export function sanitizeOverrideDate(input: unknown): string | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input !== 'string') {
    throw new Error('Datum muss als String (YYYY-MM-DD) angegeben werden.');
  }
  const s = input.trim();
  if (!s) return null;
  // Akzeptiere YYYY-MM-DD und ISO-Datetime; speichere nur Datum-Anteil.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error('Ungueltiges Datumsformat (YYYY-MM-DD erwartet).');
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new Error('Datum ausserhalb des erlaubten Bereichs.');
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

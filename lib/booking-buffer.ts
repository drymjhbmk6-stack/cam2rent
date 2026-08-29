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
import { getBerlinDateKey, getBerlinHour } from '@/lib/timezone';
import { RESERVING_BOOKING_STATUSES } from '@/lib/booking-statuses';

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

/* ─── Ist-Logistik: tatsaechlicher Verlauf statt reiner Planung ──────────── */

/**
 * Tage zu einem YYYY-MM-DD-String addieren. UTC-verankert und damit DST-immun:
 * `new Date('YYYY-MM-DD')` ist UTC-Mitternacht, lokale Tagesarithmetik darauf
 * verschiebt das Ergebnis um einen Tag, sobald die Spanne ueber eine Sommer-/
 * Winterzeit-Umstellung laeuft.
 */
export function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Timestamp (oder YYYY-MM-DD) → Kalendertag in Berlin-Zeit. */
function toBerlinDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Reines Datum ohne Uhrzeit: unveraendert uebernehmen (keine TZ-Umrechnung).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return getBerlinDateKey(d);
}

/** Buchungsfelder, die der Ist-Logistik-Helper auswertet. Alle Ist-Felder optional. */
export interface BookingLogisticsInput {
  rental_from: string;
  rental_to: string;
  delivery_mode?: string | null;
  status?: string | null;
  ship_date_override?: string | null;
  return_due_date_override?: string | null;
  /** Geraet hat das Lager verlassen (Carrier-Annahme bzw. Uebergabe). */
  actual_dispatch_at?: string | null;
  /** Paket beim Kunden zugestellt. */
  actual_delivery_at?: string | null;
  /** Rueckpaket eingetroffen bzw. Kamera zurueck. */
  actual_return_at?: string | null;
  /** Legacy-Fallback (Erkennungszeit des Retoure-Crons). */
  return_arrived_at?: string | null;
  /**
   * Zeitpunkt der abgeschlossenen Rueckgabe-Pruefung. Letzter Fallback fuer das
   * Ist-Rueckgabedatum — immer >= dem echten Eingang, als Verkuerzungsgrenze also
   * konservativ. Greift auch ohne die Ist-Logistik-Migration und bei Abholungen
   * ohne Paket-Tracking.
   */
  returned_at?: string | null;
}

export type LogisticsMarkerKind =
  | 'early-dispatch'
  | 'late-dispatch'
  | 'early-delivery'
  | 'early-return'
  | 'overdue-return'
  | 'returned-early';

export interface LogisticsMarker {
  kind: LogisticsMarkerKind;
  /** Erster Tag des Segments (YYYY-MM-DD, inklusive). */
  from: string;
  /** Letzter Tag des Segments (YYYY-MM-DD, inklusive). */
  to: string;
}

export interface EffectiveBookingSpan {
  /** Geplanter Versand-/Uebergabetag (Puffer bzw. Override). */
  plannedStart: string;
  /** Geplanter Rueckgabe-Soll-Tag. */
  plannedEnd: string;
  /** Effektiver Blockbeginn — nie spaeter als `plannedStart`. */
  start: string;
  /** Effektives Blockende — nie frueher als `plannedEnd`. */
  end: string;
  actualDispatchDate: string | null;
  actualDeliveryDate: string | null;
  actualReturnDate: string | null;
  markers: LogisticsMarker[];
}

/**
 * Effektive Blockspanne einer Buchung aus Plan + tatsaechlichem Verlauf.
 *
 * KERN-INVARIANTE: Der tatsaechliche Verlauf darf die Spanne nur AUSDEHNEN,
 * nie verkuerzen. Verkuerzt wird ausschliesslich dadurch, dass die Buchung die
 * reservierenden Status verlaesst (= Rueckgabe-Pruefung abgeschlossen).
 *
 * Sind keine Ist-Felder gesetzt (Migration nicht ausgefuehrt, Fremdversand ohne
 * Sendcloud, Aufrufer laedt sie nicht), ist das Ergebnis identisch zur bisherigen
 * `computeShipDate`/`computeReturnDueDate`-Rechnung — `markers` bleibt leer.
 *
 * @param opts.today       Referenztag (YYYY-MM-DD, Berlin). Default: heute.
 * @param opts.applyOverdue Ueberfaellige Rueckgabe dehnt die Spanne bis `today`
 *                          aus (Default true). Fuer rein planende Ansichten
 *                          (Auftragskalender) auf false setzen.
 */
export function computeEffectiveBookingSpan(
  b: BookingLogisticsInput,
  buf: BufferDays,
  opts?: { today?: string; applyOverdue?: boolean },
): EffectiveBookingSpan {
  const mode = b.delivery_mode ?? 'versand';
  const plannedStart = toIsoDate(
    computeShipDate(b.rental_from, mode, buf, b.ship_date_override ?? null),
  );
  const plannedEnd = toIsoDate(
    computeReturnDueDate(b.rental_to, mode, buf, b.return_due_date_override ?? null),
  );

  const actualDispatchDate = toBerlinDay(b.actual_dispatch_at);
  const actualDeliveryDate = toBerlinDay(b.actual_delivery_at);
  // Fallback-Kette: echtes Ist-Datum → Cron-Erkennungszeit → Zeitpunkt der
  // Rueckgabe-Pruefung. Letzteres greift auch ohne Migration und bei Abholungen.
  const actualReturnDate =
    toBerlinDay(b.actual_return_at) ??
    toBerlinDay(b.return_arrived_at) ??
    toBerlinDay(b.returned_at);

  const rentalFrom = b.rental_from.slice(0, 10);
  const today = opts?.today ?? getBerlinDateKey(new Date());
  const applyOverdue = opts?.applyOverdue !== false;
  // Ohne Status (z.B. Reservierungs-Pseudo-Buchungen) konservativ als "blockt noch"
  // behandeln — verkuerzen darf der Helper ohnehin nie.
  const stillReserving =
    !b.status || (RESERVING_BOOKING_STATUSES as readonly string[]).includes(b.status);

  // ── Spanne: ausschliesslich ausdehnen ──────────────────────────────────
  let start = plannedStart;
  if (actualDispatchDate && actualDispatchDate < start) start = actualDispatchDate;

  let end = plannedEnd;
  if (actualReturnDate && actualReturnDate > end) end = actualReturnDate;
  const overdue =
    applyOverdue && stillReserving && !actualReturnDate && today > plannedEnd;
  if (overdue && today > end) end = today;

  // Rueckgabe-Pruefung abgeschlossen: ab hier ist Verkuerzen risikolos, weil die
  // Buchung ohnehin nicht mehr in RESERVING_BOOKING_STATUSES steht und damit
  // nirgends mehr blockt. Die Spanne endet am tatsaechlichen Rueckgabetag statt
  // am geplanten Ende — sonst zeigt der Admin-Gantt "belegt", wo laengst frei ist.
  const settledEarly = !stillReserving && !!actualReturnDate && actualReturnDate < plannedEnd;
  if (settledEarly && actualReturnDate) end = actualReturnDate;

  // ── Markierungs-Segmente ───────────────────────────────────────────────
  const markers: LogisticsMarker[] = [];

  if (actualDispatchDate && actualDispatchDate < plannedStart) {
    // Zusaetzliche Tage, die durch die fruehere Abgabe dazugekommen sind.
    markers.push({
      kind: 'early-dispatch',
      from: actualDispatchDate,
      to: isoAddDays(plannedStart, -1),
    });
  } else if (actualDispatchDate && actualDispatchDate > plannedStart) {
    // Spaeter abgegeben: Spanne bleibt unveraendert, nur der Ist-Tag wird markiert.
    markers.push({ kind: 'late-dispatch', from: actualDispatchDate, to: actualDispatchDate });
  }

  if (actualDeliveryDate && actualDeliveryDate < rentalFrom) {
    // Kunde hat das Geraet vor Mietbeginn — bleibt blockiert, wird markiert.
    markers.push({
      kind: 'early-delivery',
      from: actualDeliveryDate,
      to: isoAddDays(rentalFrom, -1),
    });
  }

  if (actualReturnDate && actualReturnDate <= plannedEnd && stillReserving) {
    // Rueckpaket ist da, Pruefung steht aus → NICHT freigeben, nur markieren.
    markers.push({ kind: 'early-return', from: actualReturnDate, to: plannedEnd });
  }

  if (overdue) {
    markers.push({ kind: 'overdue-return', from: isoAddDays(plannedEnd, 1), to: today });
  }

  if (settledEarly && actualReturnDate) {
    // Tage, die geplant waren, aber durch die frueher abgeschlossene Rueckgabe
    // wieder frei sind.
    markers.push({
      kind: 'returned-early',
      from: isoAddDays(actualReturnDate, 1),
      to: plannedEnd,
    });
  }

  return {
    plannedStart,
    plannedEnd,
    start,
    end,
    actualDispatchDate,
    actualDeliveryDate,
    actualReturnDate,
    markers,
  };
}

/** Findet den Marker, der einen bestimmten Tag abdeckt (erster Treffer gewinnt). */
export function markerForDay(
  markers: LogisticsMarker[],
  dateStr: string,
  only?: LogisticsMarkerKind[],
): LogisticsMarker | null {
  for (const m of markers) {
    if (only && !only.includes(m.kind)) continue;
    if (dateStr >= m.from && dateStr <= m.to) return m;
  }
  return null;
}

/** Spalten, die die Lese-Pfade fuer die Ist-Logistik zusaetzlich selektieren. */
export const LOGISTICS_ACTUAL_COLUMNS =
  'actual_dispatch_at, actual_delivery_at, actual_return_at, return_arrived_at';

/** Erkennt, ob ein Supabase-Fehler an den (noch) fehlenden Ist-Spalten liegt. */
export function isMissingLogisticsColumn(message?: string | null): boolean {
  return /actual_dispatch_at|actual_delivery_at|actual_return_at|return_arrived_at/i.test(
    message || '',
  );
}

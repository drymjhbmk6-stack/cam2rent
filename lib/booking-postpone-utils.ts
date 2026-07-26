/**
 * Reine Datums-/Anker-Helfer für die Verlegung (Verlegung). Bewusst OHNE
 * schwere Imports (kein Supabase, keine PDF-/React-Module), damit die Logik
 * isoliert unit-getestet werden kann. `lib/booking-postpone.ts` re-exportiert
 * diese Funktionen.
 */

/** YYYY-MM-DD aus einem Date (lokaler Kalender). */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Storno-Anker beim Verlegen einfrieren — AGB § 15 Abs. 2 / Vertrag § 15 Abs. 2.
 * Der Anker ist der FRÜHESTE je gesetzte Mietbeginn und wird NIE auf den neuen
 * Termin gesetzt: MIN(bestehender Anker, alter rental_from). Eine Verlegung
 * nach hinten öffnet das kostenlose Storno-Fenster damit nicht neu.
 */
export function freezeAnchor(existingAnchor: string | null | undefined, oldFrom: string): string {
  const old = oldFrom.slice(0, 10);
  const anchor = (existingAnchor || '').slice(0, 10);
  if (!anchor) return old;
  return anchor < old ? anchor : old;
}

/** YYYY-MM-DD + n Tage (lokaler Kalender, kein UTC-Shift). */
export function isoAddDays(iso: string, n: number): string {
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso.slice(0, 10);
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

/** Neues Enddatum aus Startdatum + Mietdauer (gleiche Anzahl Tage). */
export function computePostponeTo(newFrom: string, days: number): string {
  const d = Math.max(1, Math.floor(days || 1));
  return isoAddDays(newFrom, d - 1);
}

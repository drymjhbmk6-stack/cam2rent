import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';

/**
 * Generiert eine Buchungsnummer im Format: C2R-YYKW-NNN
 * Beispiel: C2R-2615-001 (Jahr 2026, Kalenderwoche 15, Laufnummer 1 in dieser Woche)
 *
 * Im Test-Modus wird `TEST-` vorangestellt (z.B. `TEST-C2R-2615-001`),
 * damit die fortlaufende Live-Nummerierung nicht von Test-Buchungen
 * hochgezaehlt wird (GoBD-konform).
 *
 * Jahr + KW werden in Berlin-Zeit berechnet — sonst kippt die Nummer
 * zwischen 22:00-02:00 Berlin auf den UTC-Tag (Vorwoche bzw. -jahr)
 * weil der Server in UTC laeuft.
 *
 * Performance: Der Counter wird ueber den `created_at`-Bereich der
 * aktuellen ISO-Woche eingegrenzt, statt ueber die gesamte Tabelle zu
 * zaehlen. Damit bleibt die Query auch bei tausenden Buchungen unter
 * 50 ms, weil hoechstens die Eintraege der aktuellen Woche gezaehlt
 * werden — voraussetzung ist ein Index auf bookings.created_at (siehe
 * supabase-performance-indizes.sql).
 */
export async function generateBookingId(): Promise<string> {
  const berlin = getBerlinDateParts(new Date());
  const yearTwoDigit = String(berlin.year).slice(-2); // "26"
  const week = String(getISOWeekFromParts(berlin)).padStart(2, '0'); // "15"

  const supabase = createServiceClient();
  const testMode = await isTestMode();

  // Beginn + Ende der ISO-Woche (Montag 00:00 Berlin .. Montag 00:00 naechste Woche)
  const { weekStartUTC, weekEndUTC } = isoWeekRangeUTC(berlin);

  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('is_test', testMode)
    .gte('created_at', weekStartUTC)
    .lt('created_at', weekEndUTC);

  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const base = `C2R-${yearTwoDigit}${week}-${seq}`;
  return testMode ? `TEST-${base}` : base;
}

interface BerlinParts { year: number; month: number; day: number }

function getBerlinDateParts(at: Date): BerlinParts {
  // sv-SE: "2026-04-20"
  const iso = at.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m, day: d };
}

/** ISO-Kalenderwoche aus Berlin-Datumskomponenten berechnen */
function getISOWeekFromParts({ year, month, day }: BerlinParts): number {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Liefert UTC-ISO-Strings fuer den Beginn und das Ende der ISO-Woche, in der
 * der gegebene Berlin-Tag liegt. Beginn = Montag 00:00 Berlin, Ende = Montag
 * 00:00 der naechsten Woche (exklusiv). Berlin-Sommer-/Winterzeit wird
 * korrekt beruecksichtigt.
 */
function isoWeekRangeUTC({ year, month, day }: BerlinParts): { weekStartUTC: string; weekEndUTC: string } {
  // ISO: Montag = 1, Sonntag = 7
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const dow = localDate.getUTCDay() || 7; // 1..7
  const mondayDate = new Date(localDate);
  mondayDate.setUTCDate(mondayDate.getUTCDate() - (dow - 1));

  const my = mondayDate.getUTCFullYear();
  const mm = mondayDate.getUTCMonth() + 1;
  const md = mondayDate.getUTCDate();

  // Berlin-Offset fuer den Monatag 00:00 ermitteln (DST-aware)
  const offsetMin = berlinOffsetMinutes(my, mm, md);
  const weekStart = new Date(Date.UTC(my, mm - 1, md, 0, -offsetMin, 0));
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStartUTC: weekStart.toISOString(), weekEndUTC: weekEnd.toISOString() };
}

/** Berlin UTC-Offset in Minuten fuer den gegebenen Lokal-Tag (positiv im Sommer/Winter, +60/+120). */
function berlinOffsetMinutes(year: number, month: number, day: number): number {
  // Trick: vergleiche `Date` in UTC vs Berlin via toLocaleString
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const berlinNoon = new Date(probe.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  return Math.round((berlinNoon.getTime() - probe.getTime()) / 60000);
}

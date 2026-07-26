/**
 * Timezone-Helper für Berlin-basierte Queries.
 *
 * Problem: new Date().setHours(0,0,0,0) liefert lokale Mitternacht, aber
 * .toISOString() konvertiert in UTC. Bei Server-Timezone != UTC verschiebt
 * sich das Datum — Queries nach "heute" liefern keine Treffer.
 *
 * Lösung: Wir berechnen Mitternacht in Europe/Berlin und wandeln sie
 * explizit in UTC-ISO um.
 */

/** Maßgebliche Zeitzone für ALLE fristrelevanten Berechnungen (AGB/Mietvertrag). */
export const BERLIN_TZ = 'Europe/Berlin';

/** Berlin-UTC-Offset als String, z.B. "+02:00" (Sommer) oder "+01:00" (Winter). */
export function getBerlinOffsetString(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: BERLIN_TZ,
    timeZoneName: 'longOffset',
  }).formatToParts(at);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return tz.replace('GMT', '') || '+00:00';
}

/** Datum als "YYYY-MM-DD" in Berlin-Zeit. */
export function getBerlinDateString(at: Date = new Date()): string {
  return at.toLocaleDateString('sv-SE', { timeZone: BERLIN_TZ });
}

/** Mitternacht heute in Berlin, als UTC-Date. Nutze .toISOString() für SQL-Queries. */
export function getBerlinDayStart(at: Date = new Date()): Date {
  const todayBerlin = getBerlinDateString(at);
  const offset = getBerlinOffsetString(at);
  return new Date(`${todayBerlin}T00:00:00${offset}`);
}

/** Mitternacht heute in Berlin als ISO-String für Supabase .gte(). */
export function getBerlinDayStartISO(at: Date = new Date()): string {
  return getBerlinDayStart(at).toISOString();
}

/** Start des Tages N Tage vor heute in Berlin, als ISO. */
export function getBerlinDaysAgoISO(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return getBerlinDayStart(date).toISOString();
}

/** Start des aktuellen Berlin-Monats (1. um 00:00 Berlin) als UTC-ISO. */
export function getBerlinMonthStartISO(at: Date = new Date()): string {
  const dateStr = at.toLocaleDateString('sv-SE', { timeZone: BERLIN_TZ });
  const firstOfMonth = `${dateStr.slice(0, 8)}01`;
  const offset = getBerlinOffsetString(at);
  return new Date(`${firstOfMonth}T00:00:00${offset}`).toISOString();
}

/** Start des aktuellen Berlin-Jahres (01.01. um 00:00 Berlin) als UTC-ISO. */
export function getBerlinYearStartISO(at: Date = new Date()): string {
  const year = at.toLocaleDateString('sv-SE', { timeZone: BERLIN_TZ }).slice(0, 4);
  const offset = getBerlinOffsetString(at);
  return new Date(`${year}-01-01T00:00:00${offset}`).toISOString();
}

/** "YYYY-MM-DD" 00:00 Berlin als UTC-ISO. Fuer custom from-Werte. */
export function getBerlinDayStartFromDateString(dateStr: string, at: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const offset = getBerlinOffsetString(at);
  const d = new Date(`${dateStr}T00:00:00${offset}`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** "YYYY-MM-DD" 23:59:59.999 Berlin als UTC-ISO. Fuer custom to-Werte. */
export function getBerlinDayEndFromDateString(dateStr: string, at: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const offset = getBerlinOffsetString(at);
  const d = new Date(`${dateStr}T23:59:59.999${offset}`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Gibt die Stunde (0-23) einer UTC-Zeit in Berlin-Zeit zurueck. Wichtig
 * fuer Analytics-Charts, die auf Server mit UTC-Timezone laufen — sonst
 * landet ein Besuch um 01:30 Berlin (23:30 UTC) auf Stunde 23.
 */
export function getBerlinHour(at: Date | string): number {
  const d = typeof at === 'string' ? new Date(at) : at;
  const formatted = new Intl.DateTimeFormat('de-DE', {
    timeZone: BERLIN_TZ,
    hour: '2-digit',
    hour12: false,
  }).format(d);
  const h = parseInt(formatted, 10);
  return Number.isFinite(h) ? h % 24 : 0;
}

/**
 * YYYY-MM-DD in Berlin-Zeit einer UTC-Zeit. Fuer Tages-Gruppierung
 * (z.B. History-Chart) damit der Tageswechsel um 00:00 Berlin passiert
 * und nicht um 00:00 UTC (= 02:00 Berlin CEST).
 */
export function getBerlinDateKey(at: Date | string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  return d.toLocaleDateString('sv-SE', { timeZone: BERLIN_TZ });
}

/**
 * Wandelt einen UTC-ISO-String ("2026-04-19T16:02:00Z") in das Format
 * um, das ein <input type="datetime-local"> erwartet, als Berlin-Zeit.
 * Rückgabe: "YYYY-MM-DDTHH:mm" (z.B. "2026-04-19T18:02").
 */
export function utcToBerlinLocalInput(utcIso: string | null | undefined): string {
  if (!utcIso) return '';
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return '';
  // sv-SE → "2026-04-19 18:02:00"
  const berlin = d.toLocaleString('sv-SE', { timeZone: BERLIN_TZ });
  return berlin.replace(' ', 'T').slice(0, 16);
}

/**
 * Wandelt einen datetime-local Input-Wert ("2026-04-19T18:02"), der in
 * Berlin-Zeit gemeint ist, in einen UTC-ISO-String zum Speichern.
 */
export function berlinLocalInputToUTC(localInput: string | null | undefined): string | null {
  if (!localInput) return null;
  // Offset für das EINGEGEBENE Datum bestimmen, NICHT für "jetzt" — sonst
  // wird im Sommer ein Winter-Datum (oder umgekehrt) um eine Stunde daneben
  // konvertiert. Naiv als UTC parsen, den Berlin-Offset an diesem Instant
  // holen, dann korrekt zusammensetzen.
  const naive = new Date(`${localInput}:00Z`);
  if (isNaN(naive.getTime())) return null;
  const offset = getBerlinOffsetString(naive);
  const d = new Date(`${localInput}:00${offset}`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Kalendertage zwischen zwei "YYYY-MM-DD"-Strings (Ergebnis = toDateStr − fromDateStr).
 * DST-immun: beide Daten werden als UTC-Mitternacht verankert (UTC kennt keine
 * Sommerzeit), die Differenz ist damit exakt die Anzahl Kalendertage — anders als
 * eine Millisekunden-Division über lokale Timestamps, die am 30.03. (23 h) bzw.
 * 26.10. (25 h) kippt.
 */
export function calendarDaysBetween(fromDateStr: string, toDateStr: string): number {
  const a = Date.parse(`${fromDateStr.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toDateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Kalendertage von HEUTE (Berliner Kalendertag) bis zum Ziel-Datum
 * (positiv = Zukunft, negativ = Vergangenheit). `now` ist der maßgebliche
 * Instant (Zugang der Erklärung); er wird zuerst in den Berliner Kalendertag
 * übersetzt, dann datumsbasiert (DST-immun) gegen das Ziel verrechnet.
 *
 * Das ist die EINE Utility für alle fristrelevanten Kalendertag-Differenzen
 * (AGB § 15 Stornostaffel etc.). Der Ziel-Wert ist ein `DATE` (z. B.
 * rental_from / cancellation_anchor_date) — daraus wird bewusst KEIN
 * UTC-Mitternacht-Timestamp gebaut, der in Berlin schon der Vortag wäre.
 */
export function berlinDaysUntil(targetDateStr: string, now: Date = new Date()): number {
  return calendarDaysBetween(getBerlinDateString(now), targetDateStr);
}

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

/** Berlin-UTC-Offset als String, z.B. "+02:00" (Sommer) oder "+01:00" (Winter). */
export function getBerlinOffsetString(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'longOffset',
  }).formatToParts(at);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return tz.replace('GMT', '') || '+00:00';
}

/** Datum als "YYYY-MM-DD" in Berlin-Zeit. */
export function getBerlinDateString(at: Date = new Date()): string {
  return at.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
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
  const berlin = d.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' });
  return berlin.replace(' ', 'T').slice(0, 16);
}

/**
 * Wandelt einen datetime-local Input-Wert ("2026-04-19T18:02"), der in
 * Berlin-Zeit gemeint ist, in einen UTC-ISO-String zum Speichern.
 */
export function berlinLocalInputToUTC(localInput: string | null | undefined): string | null {
  if (!localInput) return null;
  const offset = getBerlinOffsetString();
  const d = new Date(`${localInput}:00${offset}`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

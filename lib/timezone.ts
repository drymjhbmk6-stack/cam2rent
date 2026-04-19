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

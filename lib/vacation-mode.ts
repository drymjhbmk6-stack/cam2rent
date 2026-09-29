import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Urlaubsmodus — sperrt ALLE noch freien Kameras für einen Zeitraum.
 *
 * Speicherung: admin_settings.vacation_mode = { periods: VacationPeriod[] }
 * (keine Migration). Bereits bestehende Buchungen bleiben unangetastet — der
 * Urlaub nimmt nur die übrige Kapazität aus dem Kunden-Kalender und aus der
 * harten Überbuchungssperre vor der Zahlung.
 *
 * Während des Urlaubs kann weder versendet noch eine Rücksendung angenommen
 * bzw. übergeben werden. Eine NEUE Buchung ist deshalb gesperrt, sobald ihre
 * logistische Spanne (Versand-/Übergabetag … Rückgabe-Soll-Tag) den Urlaub
 * berührt. Für den Kalender heißt das: ein Tag d ist als Start/Ende gesperrt,
 * wenn d im Bereich [Urlaub-Start − Puffer nachher, Urlaub-Ende + Puffer vorher]
 * liegt — exakt die Logik, mit der der Kalender auch echte Buchungen um den
 * Puffer der neuen Buchung erweitert.
 *
 * Pure Helfer (normalize/…) sind ohne DB nutzbar (Client + Tests).
 */

export const VACATION_SETTINGS_KEY = 'vacation_mode';

export interface VacationPeriod {
  id: string;
  /** YYYY-MM-DD, erster Urlaubstag (inklusive) */
  from: string;
  /** YYYY-MM-DD, letzter Urlaubstag (inklusive) */
  to: string;
  /** Optionaler Hinweis, erscheint im Kunden-Kalender als Tooltip */
  note?: string;
}

export interface VacationConfig {
  periods: VacationPeriod[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PERIODS = 50;

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Normalisiert den DB-Wert (Objekt, JSON-String, Legacy-Array, null). */
export function normalizeVacationConfig(value: unknown): VacationConfig {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { periods: [] };
    }
  }
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { periods?: unknown }).periods)
      ? ((raw as { periods: unknown[] }).periods)
      : [];

  const periods: VacationPeriod[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const from = typeof o.from === 'string' ? o.from.trim() : '';
    let to = typeof o.to === 'string' ? o.to.trim() : '';
    if (!isValidDate(from)) continue;
    if (!to) to = from;
    if (!isValidDate(to)) continue;
    const [a, b] = from <= to ? [from, to] : [to, from];
    const note = typeof o.note === 'string' ? o.note.trim().slice(0, 200) : '';
    const id =
      typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 64) : `${a}_${b}`;
    periods.push({ id, from: a, to: b, ...(note ? { note } : {}) });
    if (periods.length >= MAX_PERIODS) break;
  }
  periods.sort((x, y) => x.from.localeCompare(y.from));
  return { periods };
}

/** YYYY-MM-DD ± n Tage (UTC-verankert, DST-fest). */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Welcher Urlaub sperrt den Tag `day` als Start-/Endtag einer neuen Buchung?
 * `before`/`after` = Puffer der neuen Buchung (Versand vorher / Rückgabe nachher).
 */
export function vacationBlockingDay(
  day: string,
  periods: VacationPeriod[],
  before: number,
  after: number,
): VacationPeriod | null {
  for (const p of periods) {
    if (day >= addDays(p.from, -Math.max(0, after)) && day <= addDays(p.to, Math.max(0, before))) {
      return p;
    }
  }
  return null;
}

/**
 * Überschneidet die logistische Spanne [spanStart..spanEnd] einer neuen Buchung
 * einen Urlaub? Liefert den ersten betroffenen Urlaub oder null.
 */
export function vacationOverlappingSpan(
  spanStart: string,
  spanEnd: string,
  periods: VacationPeriod[],
): VacationPeriod | null {
  for (const p of periods) {
    if (spanStart <= p.to && spanEnd >= p.from) return p;
  }
  return null;
}

/** Nur Urlaube, die heute oder später enden (für Anzeige/Prüfung). */
export function upcomingVacations(periods: VacationPeriod[], todayIso: string): VacationPeriod[] {
  return periods.filter((p) => p.to >= todayIso);
}

/** DD.MM.YYYY für Meldungen. */
export function fmtVacationDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

let cache: { at: number; periods: VacationPeriod[] } | null = null;
const CACHE_MS = 30_000;

/** Lädt die Urlaubszeiträume (30 s In-Memory-Cache). Fehler → leere Liste. */
export async function loadVacationPeriods(supabase: SupabaseClient): Promise<VacationPeriod[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.periods;
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', VACATION_SETTINGS_KEY)
      .maybeSingle();
    if (error) return cache?.periods ?? [];
    const periods = normalizeVacationConfig(data?.value).periods;
    cache = { at: Date.now(), periods };
    return periods;
  } catch {
    return cache?.periods ?? [];
  }
}

export function invalidateVacationCache(): void {
  cache = null;
}

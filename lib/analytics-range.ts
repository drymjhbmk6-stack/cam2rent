import type { NextRequest } from 'next/server';
import {
  getBerlinDayStartISO,
  getBerlinMonthStartISO,
  getBerlinYearStartISO,
  getBerlinDayStartFromDateString,
  getBerlinDayEndFromDateString,
} from './timezone';

export type AnalyticsRange = 'today' | '24h' | '7d' | '30d' | 'month' | 'year' | 'custom';

const VALID: AnalyticsRange[] = ['today', '24h', '7d', '30d', 'month', 'year', 'custom'];

export interface ParsedRange {
  range: AnalyticsRange;
  /** UTC-ISO Anfang des Bereichs (inklusiv) — fuer .gte('created_at', startISO) */
  startISO: string;
  /** UTC-ISO Ende des Bereichs (inklusiv). Nur fuer 'custom' gesetzt — alle anderen Bereiche enden "jetzt" */
  endISO?: string;
  /** Anzahl Kalender-Tage zwischen Start und Ende (gerundet, mind. 1). Fuer Auslastungs-Normalisierung. */
  days: number;
}

/**
 * Parsed konsistent den Zeitraum-Filter aus Query-Parametern.
 * - range=today (default) → Mitternacht Berlin bis jetzt
 * - range=24h → rollendes 24h-Fenster
 * - range=7d / 30d → rollendes N-Tage-Fenster
 * - range=month → 1. des aktuellen Berlin-Monats bis jetzt
 * - range=year → 01.01. des aktuellen Berlin-Jahres bis jetzt
 * - range=custom + from=YYYY-MM-DD + to=YYYY-MM-DD → Berlin-Tag-Grenzen
 *
 * Bei ungueltigen Werten oder fehlenden custom-Parametern: Fallback auf 'today'.
 */
export function parseAnalyticsRange(req: NextRequest): ParsedRange {
  const raw = req.nextUrl.searchParams.get('range') ?? 'today';
  const range: AnalyticsRange = (VALID as string[]).includes(raw) ? (raw as AnalyticsRange) : 'today';
  const now = Date.now();

  if (range === 'custom') {
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');
    const startISO = from ? getBerlinDayStartFromDateString(from) : null;
    const endISO = to ? getBerlinDayEndFromDateString(to) : null;
    if (!startISO || !endISO || new Date(startISO) > new Date(endISO)) {
      return { range: 'today', startISO: getBerlinDayStartISO(), days: 1 };
    }
    const days = Math.max(1, Math.ceil((new Date(endISO).getTime() - new Date(startISO).getTime()) / 86400000));
    return { range: 'custom', startISO, endISO, days };
  }

  if (range === '24h') return { range, startISO: new Date(now - 24 * 60 * 60 * 1000).toISOString(), days: 1 };
  if (range === '7d') return { range, startISO: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), days: 7 };
  if (range === '30d') return { range, startISO: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(), days: 30 };

  if (range === 'month') {
    const startISO = getBerlinMonthStartISO();
    const days = Math.max(1, Math.ceil((now - new Date(startISO).getTime()) / 86400000));
    return { range, startISO, days };
  }

  if (range === 'year') {
    const startISO = getBerlinYearStartISO();
    const days = Math.max(1, Math.ceil((now - new Date(startISO).getTime()) / 86400000));
    return { range, startISO, days };
  }

  // today
  const startISO = getBerlinDayStartISO();
  return { range: 'today', startISO, days: 1 };
}

/** Helper fuer Supabase-Builder: wendet .gte(start) und ggf. .lte(end) an. */
export function applyRange<T extends { gte: (col: string, v: string) => T; lte: (col: string, v: string) => T }>(
  query: T,
  parsed: ParsedRange,
  column: string = 'created_at',
): T {
  let q = query.gte(column, parsed.startISO);
  if (parsed.endISO) q = q.lte(column, parsed.endISO);
  return q;
}

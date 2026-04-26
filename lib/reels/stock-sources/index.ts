/**
 * Multi-Source Stock-Footage-Picker (Phase 1.5).
 *
 * Strategie:
 *   1. Bestimme Primaerquelle pro Reel (deterministisch via reelId-Hash).
 *      Wenn nur eine Quelle einen API-Key hat → die ist Primaer.
 *      Wenn beide Keys vorhanden → 50/50 zufaellig pro Reel (Hash-basiert).
 *   2. Pro Query: Primaerquelle befragen.
 *   3. Wenn weniger als 3 brauchbare Treffer → Sekundaerquelle als Fallback.
 *   4. Ersten nicht-excluded Clip zurueckgeben.
 *
 * Backward-Compat: `findClipForQuery` liefert ein StockClip; der Orchestrator
 * uebergibt das an `renderReel` (clips-Parameter), das die `downloadUrl`
 * verwendet.
 */

import { pexelsSource } from './pexels';
import { pixabaySource } from './pixabay';
import type { StockClip, StockSource } from './types';

const ALL_SOURCES: StockSource[] = [pexelsSource, pixabaySource];

/**
 * Stabiler 32-bit-Hash eines Strings (FNV-1a).
 * Wir brauchen Determinismus — bei einem Re-Render mit gleicher reelId muss
 * dieselbe Primaerquelle gewaehlt werden, damit die Reproduzierbarkeit haelt.
 */
function stableHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Liefert die Liste verfuegbarer Quellen (Key-Check), Primaerquelle zuerst.
 */
async function pickSourceOrder(seed: string): Promise<StockSource[]> {
  const availability = await Promise.all(
    ALL_SOURCES.map(async (s) => ({ source: s, available: await s.isAvailable() }))
  );
  const available = availability.filter((a) => a.available).map((a) => a.source);
  if (available.length === 0) return [];
  if (available.length === 1) return available;

  // Beide verfuegbar — Hash entscheidet, wer primary
  const idx = stableHash(seed) % available.length;
  const primary = available[idx];
  const rest = available.filter((s) => s !== primary);
  return [primary, ...rest];
}

export interface FindClipOptions {
  /**
   * Seed fuer die Source-Auswahl (typisch: reelId oder reelId+segmentIdx).
   * Identischer Seed → identische Primaerquelle bei Re-Render.
   */
  seed: string;
  /**
   * Bereits verwendete externalIds (cross-source). Format: `<source>:<id>`.
   */
  excludeIds?: Set<string>;
  /**
   * Default 1080. Phase 1.4 Aufloesungs-Floor.
   */
  minHeight?: number;
}

/**
 * Sucht einen passenden Stock-Clip fuer `query`. Liefert null wenn weder
 * Pexels noch Pixabay einen Treffer haben (Caller muss damit umgehen — typ.
 * Soft-Fail mit Warnung im render_log).
 */
export async function findClipForQuery(query: string, opts: FindClipOptions): Promise<StockClip | null> {
  const sources = await pickSourceOrder(opts.seed);
  if (sources.length === 0) {
    throw new Error('Keine Stock-Footage-Quelle verfuegbar — weder Pexels- noch Pixabay-Key konfiguriert.');
  }

  const excludeIds = opts.excludeIds ?? new Set<string>();
  const minHeight = opts.minHeight ?? 1080;

  for (const source of sources) {
    let results: StockClip[];
    try {
      results = await source.search(query, { excludeIds, minHeight });
    } catch (err) {
      // Eine Quelle down → nicht abbrechen, naechste versuchen.
      console.warn(`[stock-sources] ${source.name} search fehlgeschlagen für "${query}":`, err);
      continue;
    }
    if (results.length > 0) {
      return results[0];
    }
  }
  return null;
}

export type { StockClip, StockSource, StockSourceName, StockSearchOptions } from './types';

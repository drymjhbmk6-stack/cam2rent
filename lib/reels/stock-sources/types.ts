/**
 * Multi-Source-Stock-Footage-Adapter (Phase 1.5).
 *
 * Vereinheitlicht Pexels + Pixabay (und ggf. spaetere Quellen) hinter einem
 * gemeinsamen Interface. Der Orchestrator ruft `findClipForQuery()` aus
 * `./index` auf, der wiederum eine der beiden Implementierungen waehlt.
 */

export type StockSourceName = 'pexels' | 'pixabay';

/**
 * Normalisierter Stock-Clip — egal ob aus Pexels oder Pixabay.
 * `externalId` ist immer ein String, damit excludeIds quer ueber Quellen funktioniert
 * (Pexels nutzt numerische IDs, Pixabay numerische — wir prefixen mit Source-Name).
 */
export interface StockClip {
  source: StockSourceName;
  externalId: string;        // Format: `pexels:12345` | `pixabay:67890`
  downloadUrl: string;       // Direkt-Download-URL (mp4)
  width: number;
  height: number;
  durationSec: number;
  attribution?: string;      // Pixabay erfordert Credit (Photographer-Name)
  pageUrl?: string;          // Quell-URL (fuer Debug + render_log)
  rawWidth?: number;         // Originalvideo-Breite (vor Datei-Auswahl)
  rawHeight?: number;
}

export interface StockSearchOptions {
  excludeIds: Set<string>;    // Bereits verwendete externalIds (cross-source)
  minHeight?: number;         // Default 1080 (Phase 1.4 Floor)
  perPage?: number;           // Default 15
}

export interface StockSource {
  name: StockSourceName;
  /**
   * Liefert true, wenn die Quelle einen API-Key hat (sonst skippen).
   */
  isAvailable(): Promise<boolean>;
  /**
   * Sucht Clips zu `query`. Liefert ein Array — Caller waehlt selbst aus,
   * welcher Treffer passt (z.B. ueber excludeIds + Auflosungs-Floor).
   */
  search(query: string, opts: StockSearchOptions): Promise<StockClip[]>;
}

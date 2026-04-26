/**
 * Backward-Compat Re-Export (Phase 1.5).
 *
 * Die eigentliche Pexels-Implementierung liegt jetzt unter
 * `lib/reels/stock-sources/pexels.ts` (Multi-Source-Architektur, Phase 1.5
 * der Reels-Ueberarbeitung). Diese Datei haelt nur die alten Symbole am Leben,
 * damit externe Caller (Tests, manuelle Skripte) nicht brechen.
 *
 * Die Single-Source-`findClipForQuery` mit dem alten `Set<number>`-Signature
 * bleibt verfuegbar — sie ruft intern aber jetzt schon den neuen Code mit
 * Aufloesungs-Floor auf. Fuer neuen Code: `lib/reels/stock-sources` nutzen.
 */

export type {
  PexelsVideo,
  PexelsVideoFile,
  PexelsSearchResult,
} from './stock-sources/pexels';

export {
  searchPexelsVideos,
  pickBestVideoFile,
  findClipForQuery,
  pexelsSource,
} from './stock-sources/pexels';

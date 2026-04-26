/**
 * Pexels Videos API Adapter (Phase 1.5).
 *
 * Refactor von `lib/reels/pexels.ts` — die alten Exports (PexelsVideo,
 * PexelsVideoFile, searchPexelsVideos, pickBestVideoFile, findClipForQuery)
 * bleiben fuer Backward-Compat erhalten, kapseln aber jetzt zusaetzlich den
 * neuen `StockSource`-Adapter.
 *
 * Neu: Auflosungs-Floor (Phase 1.4) — `pickBestVideoFile` ignoriert Datei-
 * Varianten unter 1080 in der kuerzeren Dimension. So landen keine 720p-
 * Hochskalierungen mehr in den Reels.
 *
 * Docs: https://www.pexels.com/api/documentation/
 * Rate-Limit: 200 Requests/Stunde, 20.000/Monat (gratis).
 */

import { createServiceClient } from '@/lib/supabase';
import type { StockClip, StockSource } from './types';

const PEXELS_BASE = 'https://api.pexels.com/videos';
const DEFAULT_MIN_HEIGHT = 1080; // Phase 1.4: harter Floor

export interface PexelsVideoFile {
  id: number;
  quality: 'sd' | 'hd' | 'uhd';
  file_type: string;
  width: number;
  height: number;
  link: string;
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number; // in Sekunden
  url: string;       // Pexels-Detail-URL
  image: string;     // Thumbnail
  user: { name: string; url: string };
  video_files: PexelsVideoFile[];
}

export interface PexelsSearchResult {
  total_results: number;
  videos: PexelsVideo[];
}

async function getApiKey(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('admin_settings').select('value').eq('key', 'reels_settings').maybeSingle();
  if (data?.value) {
    try {
      const settings = typeof data.value === 'string' ? JSON.parse(data.value) : (data.value as { pexels_api_key?: string });
      const fromDb = settings?.pexels_api_key?.trim();
      if (fromDb) return fromDb;
    } catch {
      /* ignore parse error, fall through to env */
    }
  }
  return process.env.PEXELS_API_KEY?.trim() ?? null;
}

/**
 * Sucht Videos nach Query, bevorzugt vertikale Clips (für Reels 9:16).
 *
 * `orientation: 'portrait'` filtert auf Hochformat-Clips.
 * `size`: 'large' = mind. 4K, 'medium' = 1080p, 'small' = 360p.
 */
export async function searchPexelsVideos(
  query: string,
  options: { perPage?: number; orientation?: 'landscape' | 'portrait' | 'square'; size?: 'large' | 'medium' | 'small' } = {}
): Promise<PexelsSearchResult> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Pexels API Key nicht konfiguriert — siehe /admin/social/reels (Einstellungen).');
  }

  const url = new URL(`${PEXELS_BASE}/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(options.perPage ?? 15));
  url.searchParams.set('orientation', options.orientation ?? 'portrait');
  if (options.size) url.searchParams.set('size', options.size);

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pexels-API Fehler ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as PexelsSearchResult;
}

/**
 * Wählt die beste Video-Datei aus einem Pexels-Video-Objekt.
 * Phase 1.4: Filtert auf Mindestauflosung (Default 1080 in kurzerer Dimension).
 * Bei keinem Treffer ueber dem Floor → null (Caller versucht naechsten Pexels-Treffer).
 */
export function pickBestVideoFile(video: PexelsVideo, minHeight: number = DEFAULT_MIN_HEIGHT): PexelsVideoFile | null {
  const mp4 = video.video_files.filter((f) => f.file_type === 'video/mp4');
  if (mp4.length === 0) return null;

  // Phase 1.4: Harter Floor — kuerzere Dimension >= minHeight (typ. 1080).
  // Bei Portrait-Videos heisst das width >= 1080, bei Landscape height >= 1080.
  const sufficientRes = mp4.filter((f) => Math.min(f.width, f.height) >= minHeight);
  if (sufficientRes.length === 0) return null;

  const portrait = sufficientRes.filter((f) => f.height >= f.width);
  const candidates = portrait.length > 0 ? portrait : sufficientRes;

  // Sortiere nach Naehe zu 1920px Hoehe — bevorzugt 1080x1920 fuer 9:16-Output
  return candidates.sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920))[0] ?? null;
}

/**
 * Sucht + wählt automatisch den ersten passenden Clip aus.
 * Backward-Compat: gibt das alte { video, file }-Format zurueck.
 *
 * Phase 1.4: Versucht jetzt bis zu 5 weitere Treffer wenn der erste nicht
 * den Aufloesungs-Floor erreicht (statt sofort auf Landscape-Fallback zu gehen).
 */
export async function findClipForQuery(query: string, excludeIds: Set<number> = new Set()): Promise<{ video: PexelsVideo; file: PexelsVideoFile } | null> {
  const portraitRes = await searchPexelsVideos(query, { perPage: 15, orientation: 'portrait' });
  for (const video of portraitRes.videos) {
    if (excludeIds.has(video.id)) continue;
    const file = pickBestVideoFile(video);
    if (file) return { video, file };
  }
  // Fallback: landscape versuchen (wird beim Rendern hochformatig gecropped)
  const landscapeRes = await searchPexelsVideos(query, { perPage: 15, orientation: 'landscape' });
  for (const video of landscapeRes.videos) {
    if (excludeIds.has(video.id)) continue;
    const file = pickBestVideoFile(video);
    if (file) return { video, file };
  }
  return null;
}

// ── Phase 1.5: StockSource-Adapter ──────────────────────────────────────────

function videoToStockClip(video: PexelsVideo, file: PexelsVideoFile): StockClip {
  return {
    source: 'pexels',
    externalId: `pexels:${video.id}`,
    downloadUrl: file.link,
    width: file.width,
    height: file.height,
    durationSec: video.duration,
    attribution: video.user?.name,
    pageUrl: video.url,
    rawWidth: video.width,
    rawHeight: video.height,
  };
}

export const pexelsSource: StockSource = {
  name: 'pexels',
  async isAvailable() {
    const key = await getApiKey();
    return Boolean(key);
  },
  async search(query, opts) {
    const minHeight = opts.minHeight ?? DEFAULT_MIN_HEIGHT;
    const perPage = opts.perPage ?? 15;
    const results: StockClip[] = [];

    // Erst Portrait, dann Landscape — analog zur Backward-Compat-Logik
    const orientations: Array<'portrait' | 'landscape'> = ['portrait', 'landscape'];
    for (const orientation of orientations) {
      const res = await searchPexelsVideos(query, { perPage, orientation });
      for (const video of res.videos) {
        const externalId = `pexels:${video.id}`;
        if (opts.excludeIds.has(externalId)) continue;
        const file = pickBestVideoFile(video, minHeight);
        if (!file) continue;
        results.push(videoToStockClip(video, file));
      }
      if (results.length >= 3) break; // genug Auswahl, Landscape-Fallback nicht noetig
    }
    return results;
  },
};

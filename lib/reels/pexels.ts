/**
 * Pexels Videos API Client — kostenlose Stock-Footage.
 *
 * Docs: https://www.pexels.com/api/documentation/
 * Rate-Limit: 200 Requests/Stunde, 20.000/Monat (gratis, API-Key-registrierung nötig).
 *
 * API-Key wird aus admin_settings.reels_settings.pexels_api_key gelesen.
 * Fallback: ENV-Variable PEXELS_API_KEY (für Self-Hosted-Tests).
 */

import { createServiceClient } from '@/lib/supabase';

const PEXELS_BASE = 'https://api.pexels.com/videos';

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
 * Bevorzugt 1080p HD in MP4 — fällt notfalls auf SD zurück.
 */
export function pickBestVideoFile(video: PexelsVideo): PexelsVideoFile | null {
  const mp4 = video.video_files.filter((f) => f.file_type === 'video/mp4');
  if (mp4.length === 0) return null;

  // Bevorzuge ~1080p portrait (nah an 1080x1920)
  const portrait = mp4.filter((f) => f.height >= f.width);
  const candidates = portrait.length > 0 ? portrait : mp4;

  // Sortiere nach Nähe zu 1920px Höhe
  return candidates.sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920))[0] ?? null;
}

/**
 * Sucht + wählt automatisch den ersten passenden Clip aus.
 * Gibt null zurück wenn nichts gefunden.
 */
export async function findClipForQuery(query: string, excludeIds: Set<number> = new Set()): Promise<{ video: PexelsVideo; file: PexelsVideoFile } | null> {
  const res = await searchPexelsVideos(query, { perPage: 15, orientation: 'portrait' });
  for (const video of res.videos) {
    if (excludeIds.has(video.id)) continue;
    const file = pickBestVideoFile(video);
    if (file) return { video, file };
  }
  // Fallback: landscape versuchen (wird beim Rendern hochformatig gecropped)
  const land = await searchPexelsVideos(query, { perPage: 15, orientation: 'landscape' });
  for (const video of land.videos) {
    if (excludeIds.has(video.id)) continue;
    const file = pickBestVideoFile(video);
    if (file) return { video, file };
  }
  return null;
}

/**
 * Pixabay Videos API Adapter (Phase 1.5).
 *
 * Zweite Stock-Footage-Quelle neben Pexels — verhindert dass Reels bei 60/Monat
 * repetitiv werden. Free-Tier reicht satt: 5.000 req/h, kein hard monthly cap.
 *
 * Docs: https://pixabay.com/api/docs/#api_videos
 *
 * Rechtliches: Pixabay-Lizenz erlaubt kommerzielle Nutzung ohne Credit, aber
 * fuer interne Nachverfolgung halten wir den Photographer-Namen in `attribution`.
 *
 * Key-Quelle:
 *   1. admin_settings.reels_settings.pixabay_api_key
 *   2. process.env.PIXABAY_API_KEY (Self-Hosted-Tests)
 *
 * Wenn KEIN Key gesetzt → `isAvailable()` liefert false, Source wird vom Picker
 * uebersprungen. Das ist der Default-Zustand bei initialem Deploy (nur Pexels).
 */

import { createServiceClient } from '@/lib/supabase';
import type { StockClip, StockSearchOptions, StockSource } from './types';

const PIXABAY_BASE = 'https://pixabay.com/api/videos/';
const DEFAULT_MIN_HEIGHT = 1080;

interface PixabayVideoFile {
  url: string;
  width: number;
  height: number;
  size: number;
}

interface PixabayVideo {
  id: number;
  pageURL: string;
  duration: number;
  user: string;
  videos: {
    large?: PixabayVideoFile;
    medium?: PixabayVideoFile;
    small?: PixabayVideoFile;
    tiny?: PixabayVideoFile;
  };
}

interface PixabaySearchResponse {
  total: number;
  totalHits: number;
  hits: PixabayVideo[];
}

async function getApiKey(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'reels_settings')
    .maybeSingle();
  if (data?.value) {
    try {
      const settings =
        typeof data.value === 'string'
          ? JSON.parse(data.value)
          : (data.value as { pixabay_api_key?: string });
      const fromDb = settings?.pixabay_api_key?.trim();
      if (fromDb) return fromDb;
    } catch {
      /* ignore parse error, fall through to env */
    }
  }
  return process.env.PIXABAY_API_KEY?.trim() ?? null;
}

/**
 * Waehlt die beste Video-Datei aus einem Pixabay-Video-Objekt.
 * Phase 1.4: Filtert auf Mindestaufloesung (Default 1080 in kuerzerer Dimension).
 *
 * Pixabay liefert die Varianten als named fields (large/medium/small/tiny);
 * `large` ist 1920x1080 oder hoeher, `medium` ist 1280x720 oder so. Wir
 * versuchen `large` zuerst — bei Sub-Floor null und Caller skipt den Treffer.
 */
function pickBestPixabayFile(video: PixabayVideo, minHeight: number): PixabayVideoFile | null {
  const candidates: PixabayVideoFile[] = [];
  if (video.videos.large) candidates.push(video.videos.large);
  if (video.videos.medium) candidates.push(video.videos.medium);
  if (video.videos.small) candidates.push(video.videos.small);

  const sufficientRes = candidates.filter((f) => Math.min(f.width, f.height) >= minHeight);
  if (sufficientRes.length === 0) return null;

  // Sortiere nach Naehe zu 1920 Hoehe (analog Pexels-Logik)
  return sufficientRes.sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920))[0];
}

function videoToStockClip(video: PixabayVideo, file: PixabayVideoFile): StockClip {
  return {
    source: 'pixabay',
    externalId: `pixabay:${video.id}`,
    downloadUrl: file.url,
    width: file.width,
    height: file.height,
    durationSec: video.duration,
    attribution: video.user,
    pageUrl: video.pageURL,
  };
}

export const pixabaySource: StockSource = {
  name: 'pixabay',
  async isAvailable() {
    const key = await getApiKey();
    return Boolean(key);
  },
  async search(query, opts: StockSearchOptions) {
    const apiKey = await getApiKey();
    if (!apiKey) return [];

    const minHeight = opts.minHeight ?? DEFAULT_MIN_HEIGHT;
    const perPage = opts.perPage ?? 15;

    const url = new URL(PIXABAY_BASE);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', query);
    url.searchParams.set('video_type', 'film');
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('safesearch', 'true');
    // Pixabay ignoriert min_width/min_height bei Videos teilweise — wir filtern selbst.

    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Pixabay-API Fehler ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as PixabaySearchResponse;

    const results: StockClip[] = [];
    for (const video of data.hits) {
      const externalId = `pixabay:${video.id}`;
      if (opts.excludeIds.has(externalId)) continue;
      const file = pickBestPixabayFile(video, minHeight);
      if (!file) continue;
      results.push(videoToStockClip(video, file));
    }
    return results;
  },
};

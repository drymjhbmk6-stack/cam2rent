import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/google-reviews
 * Holt Google-Bewertungen über beide Places APIs:
 * - Places API (New): Rating + Gesamtanzahl
 * - Places API (alt): Neueste Bewertungen (reviews_sort=newest, max 5 — Google-Limit)
 *
 * Zusaetzlich werden **manuell gepflegte Reviews** aus
 * `admin_settings.manual_google_reviews` geladen und gemergt — der Owner kann
 * damit weitere Google-Reviews (z.B. aeltere oder besonders schoene) im Admin
 * eintragen, da Google hart max. 5 Reviews per API liefert.
 *
 * Cached 6 Stunden im Speicher; manuelle Reviews kommen direkt aus der DB
 * (kein Cache, damit Admin-Aenderungen sofort sichtbar sind).
 */

interface GoogleReviewData {
  author: string;
  rating: number;
  text: string;
  date: string;
  profilePhoto?: string;
  /** Markierung damit das Frontend manuell gepflegte Reviews als solche
   *  erkennen kann (z.B. fuer Admin-Hinweis). Standard 'api'. */
  source?: 'api' | 'manual';
}

interface CachedData {
  reviews: GoogleReviewData[];
  avgRating: number;
  totalReviews: number;
  fetchedAt: number;
}

// Cache nur die Google-API-Antwort. Manuelle Reviews werden bei jedem
// Request frisch geladen (damit Admin-Edits ohne Cache-Bust sofort wirken).
let apiCache: CachedData | null = null;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 Stunden

/** Lädt die manuell gepflegten Reviews aus admin_settings (defensiv). */
async function loadManualReviews(): Promise<GoogleReviewData[]> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'manual_google_reviews')
      .maybeSingle();
    if (!data?.value) return [];
    const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        author: String(r.author ?? '').trim().slice(0, 120) || 'Google Nutzer',
        rating: Math.max(1, Math.min(5, Number(r.rating) || 5)),
        text: String(r.text ?? '').trim().slice(0, 1500),
        date: typeof r.date === 'string' ? r.date : '',
        source: 'manual' as const,
      }))
      .filter((r) => r.rating >= 4);
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const debug = searchParams.get('debug') === '1';

  // Manuelle Reviews IMMER frisch laden (kein Cache).
  const manualReviews = await loadManualReviews();

  // Cache-Hit: API-Reviews aus Cache + frische manuelle
  if (!debug && apiCache && Date.now() - apiCache.fetchedAt < CACHE_DURATION) {
    return NextResponse.json(
      {
        reviews: [...apiCache.reviews, ...manualReviews],
        avgRating: apiCache.avgRating,
        totalReviews: apiCache.totalReviews,
        fetchedAt: apiCache.fetchedAt,
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400' } },
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    // Keine API konfiguriert → nur manuelle Reviews ausliefern.
    return NextResponse.json(
      {
        reviews: manualReviews,
        avgRating: 0,
        totalReviews: 0,
        error: apiKey || placeId ? undefined : 'Google Places nicht konfiguriert',
        debug: debug ? { hasApiKey: !!apiKey, hasPlaceId: !!placeId } : undefined,
      },
      { status: 200 },
    );
  }

  try {
    // Beide APIs parallel aufrufen:
    // 1. Places API (alt) — neueste Bewertungen (reviews_sort=newest)
    // 2. Places API (New) — Rating + Gesamtanzahl
    const [oldRes, newRes] = await Promise.all([
      // Legacy Places API akzeptiert KEINEN X-Goog-Api-Key-Header — Key
      // muss zwingend als Query-Parameter mitgegeben werden. Outbound-Call
      // zu Google landet nicht in unseren Reverse-Proxy-Logs.
      fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&reviews_sort=newest&language=de&key=${apiKey}`,
      ),
      fetch(
        `https://places.googleapis.com/v1/places/${placeId}`,
        {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'rating,userRatingCount',
            'Accept-Language': 'de',
          },
        }
      ),
    ]);

    // Rating + Gesamtanzahl aus neuer API
    let avgRating = 0;
    let totalReviews = 0;
    if (newRes.ok) {
      const newData = await newRes.json();
      avgRating = newData.rating ?? 0;
      totalReviews = newData.userRatingCount ?? 0;
    }

    // Neueste Bewertungen aus alter API
    let apiReviews: GoogleReviewData[] = [];
    if (oldRes.ok) {
      const oldData = await oldRes.json();

      if (debug && oldData.status !== 'OK') {
        return NextResponse.json({ error: 'Google Places API (alt) Fehler', status: oldData.status, details: oldData.error_message, placeId });
      }

      apiReviews = (oldData.result?.reviews ?? [])
        .map((r: {
          author_name?: string;
          rating?: number;
          text?: string;
          time?: number;
          profile_photo_url?: string;
          relative_time_description?: string;
        }) => ({
          author: r.author_name ?? 'Google Nutzer',
          rating: r.rating ?? 5,
          text: r.text ?? '',
          date: r.time ? new Date(r.time * 1000).toISOString() : '',
          profilePhoto: r.profile_photo_url ?? undefined,
          source: 'api' as const,
        }))
        // Nur Bewertungen mit 4+ Sternen anzeigen
        .filter((r: GoogleReviewData) => r.rating >= 4);
    } else if (debug) {
      const errText = await oldRes.text();
      return NextResponse.json({ error: 'Google API Fehler', status: oldRes.status, details: errText, placeId });
    }

    apiCache = {
      reviews: apiReviews,
      avgRating,
      totalReviews,
      fetchedAt: Date.now(),
    };

    return NextResponse.json(
      {
        reviews: [...apiReviews, ...manualReviews],
        avgRating,
        totalReviews,
        fetchedAt: apiCache.fetchedAt,
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400' } },
    );
  } catch (err) {
    console.error('Google Reviews Fehler:', err);
    if (apiCache) {
      return NextResponse.json({
        reviews: [...apiCache.reviews, ...manualReviews],
        avgRating: apiCache.avgRating,
        totalReviews: apiCache.totalReviews,
        fetchedAt: apiCache.fetchedAt,
      });
    }
    return NextResponse.json({ reviews: manualReviews, avgRating: 0, totalReviews: 0 }, { status: 200 });
  }
}


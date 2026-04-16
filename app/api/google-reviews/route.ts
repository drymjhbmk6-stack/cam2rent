import { NextResponse } from 'next/server';

/**
 * GET /api/google-reviews
 * Holt Google-Bewertungen über beide Places APIs:
 * - Places API (New): Rating + Gesamtanzahl
 * - Places API (alt): Neueste Bewertungen (reviews_sort=newest)
 * Cached 6 Stunden im Speicher.
 */

interface GoogleReviewData {
  author: string;
  rating: number;
  text: string;
  date: string;
  profilePhoto?: string;
}

interface CachedData {
  reviews: GoogleReviewData[];
  avgRating: number;
  totalReviews: number;
  fetchedAt: number;
}

let cache: CachedData | null = null;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 Stunden

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const debug = searchParams.get('debug') === '1';

  // Cache prüfen
  if (!debug && cache && Date.now() - cache.fetchedAt < CACHE_DURATION) {
    return NextResponse.json(cache, {
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400' },
    });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return NextResponse.json(
      { reviews: [], avgRating: 0, totalReviews: 0, error: 'Google Places nicht konfiguriert', debug: debug ? { hasApiKey: !!apiKey, hasPlaceId: !!placeId } : undefined },
      { status: 200 }
    );
  }

  try {
    // Beide APIs parallel aufrufen:
    // 1. Places API (alt) — neueste Bewertungen (reviews_sort=newest)
    // 2. Places API (New) — Rating + Gesamtanzahl
    const [oldRes, newRes] = await Promise.all([
      fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&reviews_sort=newest&language=de&key=${apiKey}`
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
    let reviews: GoogleReviewData[] = [];
    if (oldRes.ok) {
      const oldData = await oldRes.json();

      if (debug && oldData.status !== 'OK') {
        return NextResponse.json({ error: 'Google Places API (alt) Fehler', status: oldData.status, details: oldData.error_message, placeId });
      }

      reviews = (oldData.result?.reviews ?? [])
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
        }))
        // Nur Bewertungen mit 4+ Sternen anzeigen
        .filter((r: GoogleReviewData) => r.rating >= 4);
    } else if (debug) {
      const errText = await oldRes.text();
      return NextResponse.json({ error: 'Google API Fehler', status: oldRes.status, details: errText, placeId });
    }

    const result: CachedData = {
      reviews,
      avgRating,
      totalReviews,
      fetchedAt: Date.now(),
    };

    cache = result;

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('Google Reviews Fehler:', err);
    if (cache) {
      return NextResponse.json(cache);
    }
    return NextResponse.json({ reviews: [], avgRating: 0, totalReviews: 0 }, { status: 200 });
  }
}

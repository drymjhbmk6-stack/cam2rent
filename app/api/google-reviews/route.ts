import { NextResponse } from 'next/server';

/**
 * GET /api/google-reviews
 * Holt Google-Bewertungen über die Places API (New) und cached sie 6 Stunden.
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
    // Places API (New) — Place Details mit Reviews
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'reviews,rating,userRatingCount',
        'Accept-Language': 'de',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Google Places API Fehler:', res.status, errText);
      if (debug) {
        return NextResponse.json({ error: 'Google API Fehler', status: res.status, details: errText, placeId });
      }
      if (cache) {
        return NextResponse.json(cache);
      }
      return NextResponse.json({ reviews: [], avgRating: 0, totalReviews: 0 }, { status: 200 });
    }

    const data = await res.json();

    const reviews: GoogleReviewData[] = (data.reviews ?? []).map((r: {
      authorAttribution?: { displayName?: string; photoUri?: string };
      rating?: number;
      text?: { text?: string };
      relativePublishTimeDescription?: string;
      publishTime?: string;
    }) => ({
      author: r.authorAttribution?.displayName ?? 'Google Nutzer',
      rating: r.rating ?? 5,
      text: r.text?.text ?? '',
      date: r.publishTime ?? r.relativePublishTimeDescription ?? '',
      profilePhoto: r.authorAttribution?.photoUri ?? undefined,
    }));

    const result: CachedData = {
      reviews,
      avgRating: data.rating ?? 0,
      totalReviews: data.userRatingCount ?? 0,
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

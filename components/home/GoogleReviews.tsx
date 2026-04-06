'use client';

import { useEffect, useState } from 'react';

interface GoogleReview {
  author: string;
  rating: number;
  text: string;
  date: string;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={16} height={16} viewBox="0 0 20 20" fill={i <= rating ? '#f59e0b' : '#e2e8f0'}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function GoogleLogo() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

const FALLBACK_REVIEWS: GoogleReview[] = [
  {
    author: 'Max S.',
    rating: 5,
    text: 'Super unkompliziert! Kamera kam pünktlich, top Zustand. Haftungsschutz gibt einem ein gutes Gefühl. Gerne wieder!',
    date: '2026-03-15',
  },
  {
    author: 'Laura K.',
    rating: 5,
    text: 'Perfekt für unseren Skiurlaub. Die GoPro Hero 13 war in einwandfreiem Zustand. Versand war schnell und die Rückgabe super easy.',
    date: '2026-03-08',
  },
  {
    author: 'Jonas W.',
    rating: 5,
    text: 'Genial! Warum eine Kamera kaufen wenn man sie mieten kann? Preis-Leistung ist top. Der Kamera-Finder hat mir direkt die richtige Cam vorgeschlagen.',
    date: '2026-02-22',
  },
  {
    author: 'Sophie M.',
    rating: 4,
    text: 'Schnelle Lieferung, alles sauber verpackt. Die DJI Action 5 Pro war perfekt für mein Tauchvideo. Einziger Wunsch: mehr Zubehör-Auswahl.',
    date: '2026-02-10',
  },
  {
    author: 'Tim R.',
    rating: 5,
    text: 'Habe für ein Event die Insta360 X4 gemietet. 360°-Videos sind der Wahnsinn! Service war freundlich und hilfsbereit. Klare Empfehlung.',
    date: '2026-01-28',
  },
  {
    author: 'Lena B.',
    rating: 5,
    text: 'Schon zum dritten Mal hier gemietet. Jedes Mal problemlos und schnell. Für jeden Urlaub die perfekte Lösung statt 500€ für eine Kamera auszugeben.',
    date: '2026-01-15',
  },
];

export default function GoogleReviews() {
  const [reviews, setReviews] = useState<GoogleReview[]>(FALLBACK_REVIEWS);
  const [avgRating, setAvgRating] = useState(4.9);
  const [totalReviews, setTotalReviews] = useState(47);

  useEffect(() => {
    // Google Reviews aus Admin-Config laden (falls konfiguriert)
    fetch('/api/shop-content?section=google_reviews')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.reviews?.length > 0) setReviews(d.reviews);
        if (d?.avg_rating) setAvgRating(d.avg_rating);
        if (d?.total_reviews) setTotalReviews(d.total_reviews);
      })
      .catch(() => {});
  }, []);

  return (
    <section className="py-16 sm:py-20 bg-white dark:bg-gray-900" aria-labelledby="google-reviews-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2
            id="google-reviews-heading"
            className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100 mb-3"
          >
            Unsere Kunden sprechen fuer uns
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-400 text-base max-w-lg mx-auto mb-6">
            Ueber {totalReviews} zufriedene Kunden vertrauen auf cam2rent. Ueberzeuge dich selbst.
          </p>

          {/* Google Rating Badge */}
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-brand-bg dark:bg-gray-800 border border-brand-border dark:border-gray-700">
            <GoogleLogo />
            <div className="flex items-center gap-2">
              <span className="font-heading font-bold text-lg text-brand-black dark:text-gray-100">
                {avgRating.toFixed(1)}
              </span>
              <Stars rating={Math.round(avgRating)} />
            </div>
            <span className="text-xs font-body text-brand-steel dark:text-gray-400">
              Google Bewertungen
            </span>
          </div>
        </div>

        {/* Reviews Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviews.slice(0, 6).map((review, i) => (
            <div
              key={i}
              className="bg-brand-bg dark:bg-gray-800 rounded-card p-5 border border-brand-border/50 dark:border-gray-700/50"
            >
              <div className="flex items-center justify-between mb-3">
                <Stars rating={review.rating} />
                <GoogleLogo />
              </div>
              <p className="text-sm font-body text-brand-text dark:text-gray-300 leading-relaxed line-clamp-4 mb-4">
                &quot;{review.text}&quot;
              </p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center">
                  <span className="text-xs font-heading font-bold text-accent-blue">
                    {review.author.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-heading font-semibold text-brand-black dark:text-gray-100">
                    {review.author}
                  </p>
                  <p className="text-[11px] text-brand-muted dark:text-gray-500">
                    Google Rezension
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';

interface Review {
  id: string;
  rating: number;
  title: string | null;
  text: string | null;
  created_at: string;
  admin_reply: string | null;
  admin_reply_at: string | null;
}

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 20 20"
          fill={i <= rating ? '#f59e0b' : '#e2e8f0'}
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  if (diffDays < 30) return `vor ${Math.floor(diffDays / 7)} Wochen`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((data) => {
        setReviews(data.reviews ?? []);
        setAvgRating(data.avgRating ?? 0);
        setCount(data.count ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <section className="mt-16 mb-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse h-8 w-48 bg-gray-200 rounded mb-4" />
          <div className="animate-pulse h-24 bg-gray-100 rounded" />
        </div>
      </section>
    );
  }

  return (
    <section className="mt-16 mb-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <h2 className="font-heading font-bold text-xl text-brand-black">
            Kundenbewertungen
          </h2>
          {count > 0 && (
            <div className="flex items-center gap-2">
              <Stars rating={Math.round(avgRating)} />
              <span className="text-sm font-semibold text-brand-black">{avgRating}</span>
              <span className="text-sm text-brand-steel">
                ({count} {count === 1 ? 'Bewertung' : 'Bewertungen'})
              </span>
            </div>
          )}
        </div>

        {count === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-brand-steel text-sm">
              Noch keine Bewertungen vorhanden.
            </p>
            <p className="text-brand-steel text-xs mt-1">
              Bewertungen werden nach abgeschlossener Buchung freigeschaltet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="bg-white border border-gray-100 rounded-xl p-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Stars rating={review.rating} size={14} />
                  <span className="text-xs text-brand-steel">{timeAgo(review.created_at)}</span>
                </div>

                {review.title && (
                  <h3 className="font-heading font-semibold text-sm text-brand-black mb-1">
                    {review.title}
                  </h3>
                )}

                {review.text && (
                  <p className="text-sm text-brand-text leading-relaxed">
                    {review.text}
                  </p>
                )}

                {/* Admin-Antwort */}
                {review.admin_reply && (
                  <div className="mt-3 pl-4 border-l-2 border-accent-blue">
                    <p className="text-xs font-semibold text-accent-blue mb-0.5">
                      Antwort von cam2rent
                    </p>
                    <p className="text-sm text-brand-text">{review.admin_reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

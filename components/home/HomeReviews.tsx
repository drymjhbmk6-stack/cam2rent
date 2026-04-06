'use client';

import { useEffect, useState } from 'react';
import { products } from '@/data/products';

interface Review {
  id: string;
  product_id: string;
  rating: number;
  title: string | null;
  text: string | null;
  created_at: string;
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={i <= rating ? '#f59e0b' : '#e2e8f0'}>
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

function getProductName(productId: string): string {
  return products.find((p) => p.id === productId)?.name ?? 'Kamera';
}

export default function HomeReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(true);
  const [maxCount, setMaxCount] = useState(6);

  useEffect(() => {
    // Config laden
    fetch('/api/shop-content?section=reviews_config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          if (d.show_reviews === false || d.is_active === false) { setShow(false); return; }
          if (d.count) setMaxCount(d.count);
        }
      })
      .catch(() => {});

    // Reviews aller Produkte laden
    fetch('/api/home-reviews')
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d) => setReviews(d.reviews ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!show || loading) return null;
  if (reviews.length === 0) return null;

  const displayed = reviews.slice(0, maxCount);

  return (
    <section className="py-16 bg-brand-bg dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100 mb-2">
            Das sagen unsere Kunden
          </h2>
          <p className="text-brand-steel dark:text-gray-400 text-sm">
            Echte Bewertungen von Cam2Rent-Nutzern
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((review) => (
            <div
              key={review.id}
              className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <Stars rating={review.rating} />
                <span className="text-[11px] text-brand-muted dark:text-gray-500">{timeAgo(review.created_at)}</span>
              </div>
              {review.title && (
                <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-gray-100 mb-1">
                  {review.title}
                </h3>
              )}
              {review.text && (
                <p className="text-sm text-brand-text dark:text-gray-300 leading-relaxed line-clamp-3">
                  {review.text}
                </p>
              )}
              <p className="text-[11px] text-brand-muted dark:text-gray-500 mt-3">
                {getProductName(review.product_id)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

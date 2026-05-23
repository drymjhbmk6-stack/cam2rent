'use client';

import { useEffect, useState } from 'react';
import { useProducts } from '@/components/ProductsProvider';

/**
 * Kombinierte Bewertungs-Section auf der Startseite. Mergt drei Quellen:
 *
 * 1) Google Places API (max. 5 — Google-Limit)
 * 2) Manuell gepflegte Google-Reviews aus `admin_settings.manual_google_reviews`
 *    (Owner trägt zusätzliche Reviews aus Google Business ein, um über das
 *    5er-Limit hinauszugehen — alle drei mit Google-Logo markiert)
 * 3) Eigene Kundenbewertungen aus `/api/home-reviews` (interne Reviews-Tabelle,
 *    gefüllt durch den DANKE-Coupon-Flow nach jeder Buchung — ohne Google-
 *    Logo, mit Produktname als Hinweis)
 */

interface GoogleReview {
  author: string;
  rating: number;
  text: string;
  date: string;
  profilePhoto?: string;
  source?: 'api' | 'manual';
}

interface InternalReview {
  id: string;
  product_id: string;
  rating: number;
  title: string | null;
  text: string | null;
  created_at: string;
}

type AnyReview =
  | { kind: 'google'; r: GoogleReview }
  | { kind: 'internal'; r: InternalReview };

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

function CamIcon() {
  return (
    <svg className="w-5 h-5 text-accent-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Heute';
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Woche${Math.floor(days / 7) > 1 ? 'n' : ''}`;
  if (days < 365) return `vor ${Math.floor(days / 30)} Monat${Math.floor(days / 30) > 1 ? 'en' : ''}`;
  return `vor ${Math.floor(days / 365)} Jahr${Math.floor(days / 365) > 1 ? 'en' : ''}`;
}

// User-bereitgestellter Bewertungs-Link mit GBP-Tracking-Parametern (funktioniert
// für Cam2Rent — der placeId hier weicht leicht von der Places-API-ID ab, da
// Google für writereview eine eigene Place-ID verwendet).
const WRITE_REVIEW_URL = 'https://search.google.com/local/writereview?placeid=ChIJ4eUe5O9FqEcRllyeTvywEBE&source=g.page.m._&utm_source=gbp&laa=merchant-review-solicitation';
const REVIEWS_VIEW_URL = 'https://search.google.com/local/reviews?placeid=ChIJ4eUe5O9FqEcRllyeThCwEBE';

export default function GoogleReviews() {
  const { products } = useProducts();
  const getProductName = (productId: string) => products.find((p) => p.id === productId)?.name ?? 'Kamera';

  const [googleReviews, setGoogleReviews] = useState<GoogleReview[]>([]);
  const [internalReviews, setInternalReviews] = useState<InternalReview[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Anzahl initial gezeigter Reviews; per "Mehr anzeigen" expandierbar.
  const INITIAL_SHOW = 6;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/google-reviews').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/home-reviews').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([googleData, internalData]) => {
        if (googleData?.reviews?.length > 0) {
          setGoogleReviews(googleData.reviews);
          setAvgRating(googleData.avgRating ?? 0);
          setTotalReviews(googleData.totalReviews ?? 0);
        }
        if (internalData?.reviews?.length > 0) {
          setInternalReviews(internalData.reviews);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Alle Reviews mischen — Google zuerst (Vertrauens-Anker), dann interne.
  const allReviews: AnyReview[] = [
    ...googleReviews.map((r) => ({ kind: 'google' as const, r })),
    ...internalReviews.map((r) => ({ kind: 'internal' as const, r })),
  ];

  if (loaded && allReviews.length === 0) return null;
  if (!loaded) return null;

  const visible = expanded ? allReviews : allReviews.slice(0, INITIAL_SHOW);
  const canExpand = !expanded && allReviews.length > INITIAL_SHOW;

  return (
    <section className="py-16 sm:py-20 bg-white dark:bg-gray-900" aria-labelledby="reviews-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2
            id="reviews-heading"
            className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100 mb-3"
          >
            Das sagen unsere Kunden
          </h2>
          <p className="font-body text-brand-steel dark:text-gray-400 text-base max-w-lg mx-auto mb-6">
            {totalReviews > 0
              ? `${totalReviews} Bewertungen auf Google – überzeuge dich selbst.`
              : 'Echte Bewertungen unserer Kunden.'}
          </p>

          {/* Google Rating Badge */}
          {avgRating > 0 && (
            <a
              href={REVIEWS_VIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-brand-bg dark:bg-gray-800 border border-brand-border dark:border-gray-700 hover:border-accent-blue/50 transition-colors"
            >
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
            </a>
          )}
        </div>

        {/* Reviews Grid — gemischt Google + eigen */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((entry, i) => (
            <div
              key={entry.kind === 'google' ? `g-${i}` : `i-${entry.r.id}`}
              className="bg-brand-bg dark:bg-gray-800 rounded-card p-5 border border-brand-border/50 dark:border-gray-700/50"
            >
              <div className="flex items-center justify-between mb-3">
                <Stars rating={entry.r.rating} />
                {entry.kind === 'google' ? <GoogleLogo /> : <CamIcon />}
              </div>
              {entry.kind === 'google' ? (
                <GoogleCardBody review={entry.r} />
              ) : (
                <InternalCardBody review={entry.r} productName={getProductName(entry.r.product_id)} />
              )}
            </div>
          ))}
        </div>

        {/* Mehr anzeigen + CTAs */}
        <div className="text-center mt-8 flex flex-wrap items-center justify-center gap-3">
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-btn bg-accent-blue text-white text-sm font-heading font-semibold hover:bg-blue-700 transition-colors"
            >
              {allReviews.length - INITIAL_SHOW} weitere Bewertungen anzeigen
            </button>
          )}
          <a
            href={WRITE_REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-btn bg-brand-bg dark:bg-gray-800 border border-brand-border dark:border-gray-700 text-sm font-heading font-semibold text-brand-black dark:text-gray-100 hover:border-accent-blue/50 transition-colors"
          >
            <GoogleLogo />
            Bewertung auf Google schreiben
          </a>
        </div>
      </div>
    </section>
  );
}

function GoogleCardBody({ review }: { review: GoogleReview }) {
  return (
    <>
      {review.text && (
        <p className="text-sm font-body text-brand-text dark:text-gray-300 leading-relaxed line-clamp-4 mb-4">
          &quot;{review.text}&quot;
        </p>
      )}
      <div className="flex items-center gap-2">
        {/* Sweep 8 K14: Google-Profilfotos werden NICHT mehr direkt vom
            googleusercontent.com-CDN geladen — DSGVO/§ 25 TTDSG-Konflikt
            (Drittland-Fluss vor Cookie-Consent). Fallback: Initialen-Avatar. */}
        <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center overflow-hidden flex-shrink-0">
          <span className="text-xs font-heading font-bold text-accent-blue">
            {review.author.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-heading font-semibold text-brand-black dark:text-gray-100 truncate">
            {review.author}
          </p>
          <p className="text-[11px] text-brand-muted dark:text-gray-500">
            {timeAgo(review.date)}
          </p>
        </div>
      </div>
    </>
  );
}

function InternalCardBody({ review, productName }: { review: InternalReview; productName: string }) {
  return (
    <>
      {review.title && (
        <h3 className="font-heading font-semibold text-sm text-brand-black dark:text-gray-100 mb-1">
          {review.title}
        </h3>
      )}
      {review.text && (
        <p className="text-sm font-body text-brand-text dark:text-gray-300 leading-relaxed line-clamp-4 mb-4">
          &quot;{review.text}&quot;
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-brand-muted dark:text-gray-500">
          Verifizierte Buchung · {productName}
        </p>
        <p className="text-[11px] text-brand-muted dark:text-gray-500 flex-shrink-0">
          {timeAgo(review.created_at)}
        </p>
      </div>
    </>
  );
}

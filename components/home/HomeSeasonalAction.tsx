'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SeasonalAction {
  title: string;
  subtitle: string;
  badgeText: string;
  ctaLabel: string;
  ctaUrl: string;
  couponCode: string | null;
  validUntil: string | null;
}

/**
 * Saison-Aktions-Karte zwischen Hero und Produkten.
 * Versteckt sich automatisch wenn aus oder abgelaufen.
 */
export default function HomeSeasonalAction() {
  const [action, setAction] = useState<SeasonalAction | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/seasonal-action')
      .then((r) => (r.ok ? r.json() : { action: null }))
      .then((d) => setAction(d.action))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || !action) return null;

  const validUntilLabel = action.validUntil
    ? new Date(action.validUntil).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Berlin',
      })
    : null;

  return (
    <section className="py-8 bg-white dark:bg-brand-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-accent-blue via-blue-600 to-purple-600 p-6 sm:p-8 text-white shadow-lg">
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between">
            <div className="flex-1">
              {action.badgeText && (
                <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur rounded-full text-xs font-heading font-bold uppercase tracking-wide mb-3">
                  {action.badgeText}
                </span>
              )}
              <h2 className="font-heading font-bold text-2xl sm:text-3xl mb-2">{action.title}</h2>
              {action.subtitle && (
                <p className="font-body text-white/90 text-sm sm:text-base max-w-xl">
                  {action.subtitle}
                </p>
              )}
              {(action.couponCode || validUntilLabel) && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-body text-white/80">
                  {action.couponCode && (
                    <span className="inline-flex items-center gap-1">
                      Code: <span className="font-mono font-bold bg-white/15 px-2 py-0.5 rounded">{action.couponCode}</span>
                    </span>
                  )}
                  {validUntilLabel && <span>· gültig bis {validUntilLabel}</span>}
                </div>
              )}
            </div>
            <Link
              href={action.ctaUrl}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-black font-heading font-bold rounded-btn hover:bg-white/90 transition-colors whitespace-nowrap shadow-md"
            >
              {action.ctaLabel}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
              <circle cx="80" cy="20" r="40" fill="white" />
              <circle cx="20" cy="80" r="30" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

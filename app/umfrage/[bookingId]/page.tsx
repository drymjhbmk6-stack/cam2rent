'use client';

import { useState, use } from 'react';
import Link from 'next/link';

export default function UmfragePage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = use(params);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, rating, feedback }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4">
        <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-lg w-full text-center">
          <div className="w-16 h-16 rounded-full bg-status-success/10 flex items-center justify-center mx-auto mb-5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8 text-status-success">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
            Vielen Dank für dein Feedback!
          </h1>
          <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-6">
            Deine Meinung hilft uns, unseren Service stetig zu verbessern.
          </p>

          {rating >= 4 && (
            <div className="bg-accent-blue-soft/30 dark:bg-accent-blue/10 rounded-xl p-5 mb-6">
              <p className="font-heading font-bold text-sm text-accent-blue mb-2">
                Freut uns, dass du zufrieden bist!
              </p>
              <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-4">
                Würdest du deine Erfahrung auch auf Google teilen? Das hilft uns sehr!
              </p>
              <a
                href="https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                </svg>
                Google Bewertung schreiben
              </a>
            </div>
          )}

          <Link href="/kameras" className="text-sm font-body text-accent-blue hover:underline">
            Zurück zum Shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-accent-blue-soft dark:bg-accent-blue/20 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8 text-accent-blue">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
            Wie war deine Erfahrung?
          </h1>
          <p className="font-body text-sm text-brand-steel dark:text-gray-400">
            Buchung {bookingId} — dein Feedback ist uns wichtig!
          </p>
        </div>

        {/* Sterne */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="transition-transform hover:scale-110"
            >
              <svg
                className={`w-10 h-10 ${(hoverRating || rating) >= star ? 'text-amber-400' : 'text-brand-border dark:text-gray-600'}`}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          ))}
        </div>
        <p className="text-center text-sm font-body text-brand-steel dark:text-gray-400 mb-6">
          {rating === 0 && 'Klicke auf einen Stern'}
          {rating === 1 && 'Sehr schlecht'}
          {rating === 2 && 'Nicht so gut'}
          {rating === 3 && 'Okay'}
          {rating === 4 && 'Gut!'}
          {rating === 5 && 'Ausgezeichnet!'}
        </p>

        {/* Freitext */}
        <div className="mb-6">
          <label className="block text-sm font-heading font-semibold text-brand-black dark:text-white mb-2">
            Möchtest du uns noch etwas mitteilen? (optional)
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Was hat dir gefallen? Was können wir verbessern?"
            rows={3}
            className="w-full px-4 py-3 border border-brand-border dark:border-white/10 rounded-[10px] text-sm font-body bg-white dark:bg-brand-black text-brand-black dark:text-white placeholder-brand-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent-blue"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="w-full py-3.5 bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Wird gesendet...' : 'Feedback absenden'}
        </button>
      </div>
    </div>
  );
}

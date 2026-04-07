'use client';

import { useState, useEffect } from 'react';

interface Review {
  id: string;
  product_id: string;
  product_name: string;
  rating: number;
  title: string | null;
  text: string | null;
  created_at: string;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} className={`w-4 h-4 ${s <= rating ? 'text-accent-amber' : 'text-gray-200 dark:text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  useEffect(() => {
    fetch('/api/meine-bewertungen')
      .then((r) => r.json())
      .then((d) => setReviews(d.reviews ?? []))
      .catch(() => {})
      .finally(() => setLoadingReviews(false));
  }, []);

  async function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setFeedbackError('');
    setFeedbackSuccess(false);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error();
      setFeedbackSuccess(true);
      setMessage('');
    } catch {
      setFeedbackError('Feedback konnte nicht gesendet werden.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white">Feedback</h1>

      {/* Meine Bewertungen */}
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
        <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">Meine Bewertungen</h2>

        {loadingReviews ? (
          <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
        ) : reviews.length === 0 ? (
          <p className="text-sm text-brand-steel dark:text-gray-400">Du hast noch keine Bewertungen abgegeben.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="border border-brand-border dark:border-white/10 rounded-[10px] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-heading font-semibold text-sm text-brand-black dark:text-white">
                    {review.product_name}
                  </span>
                  <span className="text-xs text-brand-steel dark:text-gray-400">
                    {new Date(review.created_at).toLocaleDateString('de-DE')}
                  </span>
                </div>
                <Stars rating={review.rating} />
                {review.title && (
                  <p className="font-heading font-semibold text-sm text-brand-black dark:text-white mt-2">{review.title}</p>
                )}
                {review.text && (
                  <p className="text-sm text-brand-text dark:text-gray-300 mt-1">{review.text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Allgemeines Feedback */}
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
        <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-1">Allgemeines Feedback</h2>
        <p className="text-sm text-brand-steel dark:text-gray-400 mb-4">
          Teile uns deine Meinung mit — wir freuen uns über jede Rückmeldung.
        </p>

        {feedbackSuccess && (
          <div className="mb-4 p-3 rounded-[10px] bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-status-success text-sm">
            Vielen Dank für dein Feedback!
          </div>
        )}
        {feedbackError && (
          <div className="mb-4 p-3 rounded-[10px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-status-error text-sm">
            {feedbackError}
          </div>
        )}

        <form onSubmit={handleSubmitFeedback} className="space-y-4">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={5}
            className="w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors resize-none"
            placeholder="Was können wir besser machen? Was hat dir gefallen?"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-brand-muted dark:text-gray-500">{message.length}/2000</span>
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark dark:hover:bg-accent-blue/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? 'Wird gesendet…' : 'Feedback senden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

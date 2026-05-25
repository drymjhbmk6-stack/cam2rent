'use client';

import { useState, use, useEffect } from 'react';
import Link from 'next/link';

// Google-Bewertungs-URL (Place-ID gleiche wie unter /admin/einstellungen und
// auf der Startseite — siehe components/home/GoogleReviews.tsx + Umfrage-Cron).
const GOOGLE_REVIEW_URL =
  'https://search.google.com/local/writereview?placeid=ChIJ4eUe5O9FqEcRllyeThCwEBE';

type Mode = 'choice' | 'rating' | 'reward';

export default function UmfragePage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = use(params);
  // Sweep 7 Vuln 25 — Token aus URL-Param `?t=...` lesen und mit absenden.
  const [token, setToken] = useState<string>('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('t');
    if (t) setToken(t);
  }, []);

  // Default-Modus: Smart-Filter (Google-Bewertung als Haupt-CTA). Backup-Link
  // schaltet auf 'rating' fuer Kunden, die lieber direktes Feedback geben.
  const [mode, setMode] = useState<Mode>('choice');

  // Sterne-Backup-Pfad
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState('');

  // Gemeinsamer Submit-State
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Schritt-1-Click auf "Bei Google bewerten" — oeffnet Google in neuem Tab
  // UND triggert parallel den Coupon-Endpoint. Coupon ist idempotent pro
  // Buchung, ein versehentlicher Doppelklick erzeugt also keinen 2. Code.
  async function handleGoogleClick() {
    if (typeof window !== 'undefined') {
      window.open(GOOGLE_REVIEW_URL, '_blank', 'noopener,noreferrer');
    }
    setSubmitting(true);
    setCouponError(null);
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action: 'google_click', token }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.couponCode) {
        setCouponCode(data.couponCode);
        setDiscount(data.discount ?? null);
      } else if (data?.error) {
        setCouponError(data.error);
      }
      setSubmitted(true);
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : 'Unbekannter Fehler');
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRating() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action: 'rating', rating, feedback, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.couponCode) {
        setCouponCode(data.couponCode);
        setDiscount(data.discount ?? null);
      }
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRatingSubmit() {
    if (rating === 0) return;
    // Bei >= 4 zeigen wir den Reward-Hinweis vor Absenden,
    // bei <= 3 direkt senden (kein Coupon).
    if (rating >= 4) {
      setMode('reward');
      return;
    }
    await submitRating();
  }

  async function handleClaimRewardFromRating() {
    await submitRating();
  }

  // ── Erfolgs-Screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-8">
        <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-lg w-full text-center">
          <div className="w-16 h-16 rounded-full bg-status-success/10 flex items-center justify-center mx-auto mb-5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8 text-status-success">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
            Vielen Dank!
          </h1>
          <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-6">
            {couponCode
              ? 'Dein Gutschein wartet auf dich.'
              : 'Wir haben dein Feedback erhalten.'}
          </p>

          {/* Gutschein-Anzeige */}
          {couponCode && discount && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-dashed border-amber-400 dark:border-amber-600 rounded-xl p-5 mb-6">
              <p className="font-heading font-semibold text-xs text-amber-700 dark:text-amber-500 uppercase tracking-wider mb-2">
                Dein Dankeschön
              </p>
              <p className="font-mono font-bold text-xl text-amber-900 dark:text-amber-300 mb-2 tracking-wide select-all">
                {couponCode}
              </p>
              <p className="font-body text-xs text-amber-700 dark:text-amber-400">
                {discount}% Rabatt · gültig 90 Tage · Mindestbestellwert 50 €
              </p>
              <p className="font-body text-xs text-brand-steel dark:text-gray-400 mt-3">
                Wir haben dir den Code auch per E-Mail an deine hinterlegte Adresse geschickt.
              </p>
            </div>
          )}

          {!couponCode && couponError && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6 text-left">
              <p className="font-body text-xs text-amber-700 dark:text-amber-400">
                Dein Gutschein konnte nicht automatisch erstellt werden ({couponError}).
                Schreib uns kurz, wir helfen dir weiter.
              </p>
            </div>
          )}

          {/* Wenn Kunde Google geklickt hat: kurzer Reminder, dass das Tab offen ist */}
          {couponCode && (
            <div className="bg-accent-blue-soft/30 dark:bg-accent-blue/10 rounded-xl p-4 mb-6 text-left">
              <p className="font-body text-xs text-brand-steel dark:text-gray-400">
                <strong className="text-accent-blue">Hinweis:</strong> Google hat sich in einem neuen Tab geöffnet.
                Falls nicht, kannst du die Bewertung{' '}
                <a
                  href={GOOGLE_REVIEW_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-blue underline"
                >
                  hier direkt abgeben
                </a>
                .
              </p>
            </div>
          )}

          <Link href="/kameras" className="text-sm font-body text-accent-blue hover:underline">
            Zurück zum Shop
          </Link>
        </div>
      </div>
    );
  }

  // ── Backup-Pfad Schritt 2: Reward-Hinweis vor Absenden (bei Rating >= 4)
  if (mode === 'reward') {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-8">
        <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-lg w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8 text-amber-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
            <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
              Danke für deine Bewertung!
            </h1>
            <p className="font-body text-sm text-brand-steel dark:text-gray-400">
              Als Dankeschön schenken wir dir einen persönlichen Gutschein für deine nächste Buchung.
            </p>
          </div>

          <div className="bg-brand-bg dark:bg-brand-black/40 rounded-xl p-4 mb-6 text-xs font-body text-brand-steel dark:text-gray-400">
            <p className="flex items-start gap-2 mb-1.5">
              <span className="text-accent-blue">✓</span>
              <span>10% Rabatt auf deine nächste Kamera-Buchung</span>
            </p>
            <p className="flex items-start gap-2 mb-1.5">
              <span className="text-accent-blue">✓</span>
              <span>90 Tage gültig</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-accent-blue">✓</span>
              <span>Ab 50 € Bestellwert einlösbar</span>
            </p>
          </div>

          <p className="text-xs font-body text-brand-steel dark:text-gray-400 mb-4">
            Wir schicken den Code an die in deiner Buchung hinterlegte E-Mail-Adresse.
          </p>

          <button
            onClick={handleClaimRewardFromRating}
            disabled={submitting}
            className="w-full py-3.5 bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Gutschein wird erstellt…' : 'Gutschein sichern & Feedback senden'}
          </button>

          <button
            onClick={() => setMode('rating')}
            disabled={submitting}
            className="w-full py-2 mt-2 text-xs font-body text-brand-muted dark:text-gray-500 hover:text-brand-steel dark:hover:text-gray-400 transition-colors"
          >
            ← Zurück zur Bewertung
          </button>
        </div>
      </div>
    );
  }

  // ── Backup-Pfad Schritt 1: Sterne-Umfrage
  if (mode === 'rating') {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-8">
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
              Buchung {bookingId} — dein Feedback hilft uns weiter.
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
                aria-label={`${star} Stern${star > 1 ? 'e' : ''}`}
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

          {rating >= 4 && rating > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="font-body text-xs text-amber-700 dark:text-amber-400 text-center">
                <strong>Im nächsten Schritt:</strong> Sichere dir 10% Gutschein für deine nächste Buchung!
              </p>
            </div>
          )}

          <button
            onClick={handleRatingSubmit}
            disabled={rating === 0 || submitting}
            className="w-full py-3.5 bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Wird gesendet…' : rating >= 4 ? 'Weiter' : 'Feedback absenden'}
          </button>

          <button
            onClick={() => setMode('choice')}
            disabled={submitting}
            className="w-full py-2 mt-2 text-xs font-body text-brand-muted dark:text-gray-500 hover:text-brand-steel dark:hover:text-gray-400 transition-colors"
          >
            ← Zurück
          </button>
        </div>
      </div>
    );
  }

  // ── Default: Smart-Filter (Google-CTA als Haupt-CTA) ──────────────────────
  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-8">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-lg w-full text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-5">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9 text-amber-500">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>

        <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-2">
          Danke für dein Vertrauen!
        </h1>
        <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-6">
          Hat dir cam2rent gefallen? Hinterlasse uns eine kurze Google-Bewertung –
          als Danke schenken wir dir <strong className="text-amber-600 dark:text-amber-400">10 % auf deine nächste Buchung</strong>.
        </p>

        {/* Was du bekommst */}
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 mb-6 text-left">
          <p className="font-body text-xs text-amber-700 dark:text-amber-400 mb-2">
            <strong>Dein Dankeschön nach dem Klick:</strong>
          </p>
          <p className="flex items-start gap-2 mb-1 text-xs text-amber-700 dark:text-amber-400">
            <span>✓</span>
            <span>10 % Rabatt-Gutschein, persönlich auf deine E-Mail-Adresse</span>
          </p>
          <p className="flex items-start gap-2 mb-1 text-xs text-amber-700 dark:text-amber-400">
            <span>✓</span>
            <span>90 Tage gültig, ab 50 € Bestellwert</span>
          </p>
          <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <span>✓</span>
            <span>Code wird sofort hier angezeigt und per E-Mail geschickt</span>
          </p>
        </div>

        {/* Primary CTA: Google */}
        <button
          onClick={handleGoogleClick}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-3 px-6 py-4 bg-accent-blue text-white font-heading font-semibold text-base rounded-btn hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
          </svg>
          {submitting ? 'Wird vorbereitet…' : 'Jetzt bei Google bewerten'}
        </button>

        <p className="text-[11px] font-body text-brand-muted dark:text-gray-500 mb-5">
          Öffnet Google in einem neuen Tab. Dein Gutschein wird sofort freigeschaltet.
        </p>

        {/* Backup-Link */}
        <div className="pt-5 border-t border-brand-border dark:border-white/10">
          <p className="text-xs font-body text-brand-steel dark:text-gray-400 mb-2">
            Nicht zufrieden? Wir hören dir gerne direkt zu.
          </p>
          <button
            onClick={() => setMode('rating')}
            className="text-sm font-body text-accent-blue hover:underline"
          >
            Lieber direktes Feedback geben →
          </button>
        </div>
      </div>
    </div>
  );
}

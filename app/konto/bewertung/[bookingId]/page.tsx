'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

function Stars({
  rating,
  interactive,
  onSelect,
}: {
  rating: number;
  interactive?: boolean;
  onSelect?: (r: number) => void;
}) {
  const [hover, setHover] = useState(0);

  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={() => onSelect?.(i)}
          onMouseEnter={() => interactive && setHover(i)}
          onMouseLeave={() => interactive && setHover(0)}
          className={interactive ? 'cursor-pointer transition-transform hover:scale-110' : ''}
        >
          <svg
            width={32}
            height={32}
            viewBox="0 0 20 20"
            fill={i <= (hover || rating) ? '#f59e0b' : '#e2e8f0'}
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </span>
  );
}

interface Booking {
  id: string;
  product_name: string;
  product_id: string;
  rental_from: string;
  rental_to: string;
  status: string;
}

export default function BewertungPage() {
  const params = useParams();
  const bookingId = params.bookingId as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  useEffect(() => {
    fetch(`/api/meine-buchungen`)
      .then((r) => r.json())
      .then((data) => {
        const b = (data.bookings ?? data ?? []).find((b: Booking) => b.id === bookingId);
        if (b) {
          setBooking(b);
          if (b.status !== 'completed') {
            setError('Bewertung nur nach abgeschlossener Buchung möglich.');
          }
        } else {
          setError('Buchung nicht gefunden.');
        }
      })
      .catch(() => setError('Fehler beim Laden.'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError('Bitte wähle eine Sternebewertung.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          productId: booking?.product_id,
          rating,
          title: title.trim() || undefined,
          text: text.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setAlreadyReviewed(true);
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Fehler beim Speichern.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse h-6 w-48 bg-gray-200 rounded mb-4" />
        <div className="animate-pulse h-40 bg-gray-100 rounded" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="p-6 max-w-lg">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="font-heading font-bold text-lg text-brand-black mb-2">
            Vielen Dank für deine Bewertung!
          </h2>
          <p className="text-sm text-brand-steel mb-4">
            Deine Bewertung wird nach einer kurzen Prüfung auf der Produktseite angezeigt.
          </p>
          <Link
            href="/konto/buchungen"
            className="inline-block px-5 py-2.5 bg-accent-blue text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Zurück zu meinen Buchungen
          </Link>
        </div>
      </div>
    );
  }

  if (alreadyReviewed) {
    return (
      <div className="p-6 max-w-lg">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
          <h2 className="font-heading font-bold text-lg text-brand-black mb-2">
            Bereits bewertet
          </h2>
          <p className="text-sm text-brand-steel mb-4">
            Du hast diese Buchung bereits bewertet. Danke!
          </p>
          <Link
            href="/konto/buchungen"
            className="inline-block px-5 py-2.5 bg-accent-blue text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Zurück zu meinen Buchungen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="font-heading font-bold text-xl text-brand-black mb-1">
        Bewertung abgeben
      </h1>

      {booking && (
        <p className="text-sm text-brand-steel mb-6">
          {booking.product_name} · {new Date(booking.rental_from).toLocaleDateString('de-DE')} – {new Date(booking.rental_to).toLocaleDateString('de-DE')}
        </p>
      )}

      {error && !booking?.status ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
          {error}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Sterne */}
          <div>
            <label className="block text-sm font-semibold text-brand-black mb-2">
              Deine Bewertung *
            </label>
            <Stars rating={rating} interactive onSelect={setRating} />
            {rating > 0 && (
              <span className="ml-3 text-sm text-brand-steel">
                {['', 'Schlecht', 'Geht so', 'Okay', 'Gut', 'Ausgezeichnet'][rating]}
              </span>
            )}
          </div>

          {/* Titel */}
          <div>
            <label className="block text-sm font-semibold text-brand-black mb-1.5">
              Titel <span className="font-normal text-brand-steel">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="z.B. Super Kamera für den Urlaub"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-accent-blue focus:border-transparent outline-none"
            />
          </div>

          {/* Text */}
          <div>
            <label className="block text-sm font-semibold text-brand-black mb-1.5">
              Dein Erfahrungsbericht <span className="font-normal text-brand-steel">(optional)</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Erzähl anderen Kunden von deiner Erfahrung..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-accent-blue focus:border-transparent outline-none resize-none"
            />
            <p className="text-xs text-brand-steel mt-1">{text.length}/1000</p>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || rating === 0}
            className="w-full py-3 bg-accent-blue text-white rounded-lg font-heading font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Wird gesendet...' : 'Bewertung abschicken'}
          </button>
        </form>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';

interface BookingOption {
  id: string;
  product_name: string;
  rental_from: string;
  rental_to: string;
  status: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ReklamationPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    fetch('/api/meine-buchungen')
      .then((r) => r.json())
      .then((data) => {
        const eligible = (data.bookings || []).filter(
          (b: BookingOption) => b.status === 'shipped' || b.status === 'completed'
        );
        setBookings(eligible);
      })
      .catch(() => setError('Buchungen konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [user]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length + photos.length > 5) {
      setError('Maximal 5 Fotos erlaubt.');
      return;
    }
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) {
        setError(`"${f.name}" ist zu groß (max 5 MB).`);
        return;
      }
    }
    setError('');
    setPhotos((prev) => [...prev, ...files].slice(0, 5));
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBooking || !description.trim()) {
      setError('Bitte Buchung auswählen und Beschreibung eingeben.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('bookingId', selectedBooking);
      formData.append('description', description.trim());
      for (const photo of photos) {
        formData.append('photos', photo);
      }

      const res = await fetch('/api/damage-report', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Einreichen.');
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-brand-muted font-body">Bitte melde dich an, um eine Schadensmeldung einzureichen.</p>
        <Link href="/login" className="inline-block mt-4 px-6 py-2 bg-brand-black text-white rounded-btn font-heading font-semibold">
          Anmelden
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h1 className="font-heading font-bold text-xl text-green-800 mb-2">Schadensmeldung eingereicht</h1>
          <p className="text-sm font-body text-green-700 mb-6">
            Wir haben deine Meldung erhalten und prüfen sie innerhalb von 1–2 Werktagen.
            Du bekommst eine Bestätigung per E-Mail.
          </p>
          <Link href="/konto/buchungen" className="inline-block px-6 py-2.5 bg-brand-black text-white rounded-btn font-heading font-semibold text-sm">
            Zu meinen Buchungen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm font-body text-brand-muted mb-6">
        <Link href="/konto" className="hover:text-brand-black transition-colors">Mein Konto</Link>
        <span>/</span>
        <span className="text-brand-black">Schadensmeldung</span>
      </div>

      <h1 className="font-heading font-bold text-2xl text-brand-black mb-2">Schaden melden</h1>
      <p className="text-sm font-body text-brand-muted mb-8">
        Wenn ein Gerät beschädigt wurde, kannst du hier eine Schadensmeldung einreichen.
        Bitte beschreibe den Schaden möglichst genau und lade Fotos hoch.
      </p>

      {error && (
        <div className="p-3 mb-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-body">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Buchung auswählen */}
        <div>
          <label className="block text-sm font-heading font-semibold text-brand-black mb-2">
            Buchung auswählen
          </label>
          {loading ? (
            <p className="text-sm text-brand-muted font-body">Lädt Buchungen...</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-brand-muted font-body">
              Keine Buchungen vorhanden, für die eine Schadensmeldung möglich ist.
            </p>
          ) : (
            <select
              value={selectedBooking}
              onChange={(e) => setSelectedBooking(e.target.value)}
              className="w-full px-4 py-3 border border-brand-border rounded-xl text-sm font-body text-brand-black bg-white focus:ring-2 focus:ring-brand-black focus:border-transparent outline-none"
              required
            >
              <option value="">Bitte wählen...</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} – {b.product_name} ({formatDate(b.rental_from)} – {formatDate(b.rental_to)})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Beschreibung */}
        <div>
          <label className="block text-sm font-heading font-semibold text-brand-black mb-2">
            Schadensbeschreibung
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beschreibe den Schaden möglichst genau..."
            rows={5}
            maxLength={2000}
            className="w-full px-4 py-3 border border-brand-border rounded-xl text-sm font-body text-brand-black resize-none focus:ring-2 focus:ring-brand-black focus:border-transparent outline-none"
            required
          />
          <p className="text-xs text-brand-muted mt-1 text-right">
            {description.length}/2000
          </p>
        </div>

        {/* Foto-Upload */}
        <div>
          <label className="block text-sm font-heading font-semibold text-brand-black mb-2">
            Fotos hochladen <span className="font-normal text-brand-muted">(max. 5 Bilder, je max. 5 MB)</span>
          </label>

          {photos.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-3">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative group">
                  <div className="w-20 h-20 rounded-lg overflow-hidden border border-brand-border bg-brand-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(photo)}
                      alt={`Foto ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length < 5 && (
            <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-brand-border rounded-xl cursor-pointer hover:border-brand-black hover:bg-brand-bg transition-colors">
              <svg className="w-5 h-5 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm font-body text-brand-muted">Fotos hinzufügen</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !selectedBooking || !description.trim()}
          className="w-full py-3 bg-brand-black text-white rounded-btn font-heading font-semibold text-sm hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Wird eingereicht...' : 'Schadensmeldung einreichen'}
        </button>
      </form>
    </div>
  );
}

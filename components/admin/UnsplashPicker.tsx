'use client';

import { useState } from 'react';

/**
 * Modal zum Suchen + Auswählen eines Unsplash-Bildes.
 * Beim Klick auf ein Thumbnail wird das Bild in den Supabase-Storage
 * übernommen und die öffentliche URL via onSelect zurückgegeben.
 *
 * Nutzt /api/admin/social/unsplash für Suche + Download.
 */

interface UnsplashImage {
  id: string;
  thumb: string;
  regular: string;
  full: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  downloadLocation: string;
  width: number;
  height: number;
}

interface UnsplashPickerProps {
  open: boolean;
  onClose: () => void;
  /** Wird aufgerufen sobald das Bild erfolgreich in Supabase hochgeladen ist. */
  onSelect: (url: string, alt: string) => void;
  /** Vorschlags-Suchbegriff (z.B. Post-Caption). */
  initialQuery?: string;
  /** Bild-Ausrichtung. 'squarish' für Social (1:1), 'landscape' für Blog. */
  orientation?: 'squarish' | 'landscape' | 'portrait';
}

export default function UnsplashPicker({
  open,
  onClose,
  onSelect,
  initialQuery = '',
  orientation = 'squarish',
}: UnsplashPickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [images, setImages] = useState<UnsplashImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/social/unsplash?query=${encodeURIComponent(query)}&orientation=${orientation}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Suche fehlgeschlagen');
      setImages(data.images ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      setImages([]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePick(img: UnsplashImage) {
    setDownloadingId(img.id);
    setError('');
    try {
      const res = await fetch('/api/admin/social/unsplash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: img.regular,
          downloadLocation: img.downloadLocation,
          alt: img.alt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Download fehlgeschlagen');
      onSelect(data.url, data.alt ?? '');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setDownloadingId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="font-semibold text-white">Unsplash-Bild suchen</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="text-slate-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSearch} className="px-5 py-3 border-b border-slate-700 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="z.B. Kirschblüte, Radtour, Surfer…"
            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 disabled:opacity-40"
          >
            {loading ? 'Suche…' : 'Suchen'}
          </button>
        </form>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {!loading && images.length === 0 && !error && (
            <p className="text-sm text-slate-400 text-center py-8">
              Gib einen Suchbegriff ein und klicke auf „Suchen&rdquo;.
            </p>
          )}

          {images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => handlePick(img)}
                  disabled={downloadingId !== null}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-700 hover:border-cyan-500 transition disabled:opacity-40"
                  title={img.alt || `Foto von ${img.photographer}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.thumb}
                    alt={img.alt}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-[10px] text-slate-200 truncate">
                      {downloadingId === img.id ? 'Wird geladen…' : `Foto: ${img.photographer}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-700 text-[11px] text-slate-500">
          Fotos via{' '}
          <a
            href="https://unsplash.com/?utm_source=cam2rent&utm_medium=referral"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white underline"
          >
            Unsplash
          </a>
          . Fotografen-Credit wird pro Bild automatisch getrackt.
        </div>
      </div>
    </div>
  );
}

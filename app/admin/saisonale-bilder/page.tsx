'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import {
  SEASONAL_ZONES,
  MONTH_THEMES,
  MONTH_NAMES,
  getCurrentAndNextMonth,
  isImageLeftMonth,
  type SeasonalImage,
  type SeasonalImagesData,
  type SeasonalZone,
} from '@/lib/seasonal-themes';

interface UnsplashImage {
  id: string;
  thumb: string;
  regular: string;
  full: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  downloadLocation: string;
}

type ModalTarget = {
  zone: SeasonalZone;
  yearMonth: string;
} | null;

export default function SaisonaleBilderPage() {
  const [images, setImages] = useState<SeasonalImagesData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Unsplash Modal
  const [unsplashOpen, setUnsplashOpen] = useState(false);
  const [unsplashTarget, setUnsplashTarget] = useState<ModalTarget>(null);
  const [unsplashQuery, setUnsplashQuery] = useState('');
  const [unsplashResults, setUnsplashResults] = useState<UnsplashImage[]>([]);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const [unsplashPage, setUnsplashPage] = useState(1);
  const [unsplashTotalPages, setUnsplashTotalPages] = useState(1);
  const [unsplashSaving, setUnsplashSaving] = useState<string | null>(null);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<ModalTarget>(null);

  const { current, next } = getCurrentAndNextMonth();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    fetch('/api/admin/seasonal-images')
      .then((r) => r.json())
      .then((d) => setImages(d.images ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveImage(zone: string, yearMonth: string, image: SeasonalImage) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/seasonal-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone, yearMonth, image }),
      });
      const d = await res.json();
      if (d.images) setImages(d.images);
      showToast('Bild gespeichert!');
    } catch {
      showToast('Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  async function removeImage(zone: string, yearMonth: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/seasonal-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone, yearMonth, remove: true }),
      });
      const d = await res.json();
      if (d.images) setImages(d.images);
      showToast('Bild entfernt.');
    } catch {
      showToast('Fehler beim Entfernen.');
    } finally {
      setSaving(false);
    }
  }

  // Unsplash suchen
  async function searchUnsplash(query: string, page = 1) {
    setUnsplashLoading(true);
    try {
      const res = await fetch(
        `/api/admin/seasonal-images/search?query=${encodeURIComponent(query)}&page=${page}`,
      );
      const d = await res.json();
      if (d.error) {
        showToast(d.error);
        return;
      }
      setUnsplashResults(d.images ?? []);
      setUnsplashTotalPages(d.totalPages ?? 1);
      setUnsplashPage(page);
    } catch {
      showToast('Unsplash-Suche fehlgeschlagen.');
    } finally {
      setUnsplashLoading(false);
    }
  }

  async function selectUnsplash(img: UnsplashImage) {
    if (!unsplashTarget) return;
    setUnsplashSaving(img.id);
    try {
      // Bild in Supabase Storage hochladen
      const uploadRes = await fetch('/api/admin/seasonal-images/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: img.regular,
          downloadLocation: img.downloadLocation,
          alt: img.alt,
        }),
      });
      const uploadData = await uploadRes.json();
      if (uploadData.error) {
        showToast(uploadData.error);
        return;
      }

      await saveImage(unsplashTarget.zone, unsplashTarget.yearMonth, {
        url: uploadData.url,
        alt: img.alt || `Saisonales Bild - ${img.photographer}`,
        source: 'unsplash',
        photographer: img.photographer,
        photographerUrl: img.photographerUrl,
      });
      setUnsplashOpen(false);
    } catch {
      showToast('Fehler beim Speichern des Unsplash-Bildes.');
    } finally {
      setUnsplashSaving(null);
    }
  }

  function openUnsplash(zone: SeasonalZone, yearMonth: string) {
    setUnsplashTarget({ zone, yearMonth });
    const month = parseInt(yearMonth.split('-')[1]);
    const theme = MONTH_THEMES[month];
    setUnsplashQuery(theme?.unsplashQuery ?? 'action camera adventure');
    setUnsplashResults([]);
    setUnsplashOpen(true);
  }

  // Custom Upload
  function openUpload(zone: SeasonalZone, yearMonth: string) {
    setUploadTarget({ zone, yearMonth });
    fileInputRef.current?.click();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setSaving(true);
      try {
        const uploadRes = await fetch('/api/admin/seasonal-images/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, alt: file.name }),
        });
        const uploadData = await uploadRes.json();
        if (uploadData.error) {
          showToast(uploadData.error);
          return;
        }
        await saveImage(uploadTarget.zone, uploadTarget.yearMonth, {
          url: uploadData.url,
          alt: file.name,
          source: 'custom',
        });
      } catch {
        showToast('Fehler beim Hochladen.');
      } finally {
        setSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  function getImage(zone: string, yearMonth: string): SeasonalImage | null {
    return images[zone]?.[yearMonth] ?? null;
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="inline-block w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading font-bold text-2xl text-white mb-2">Saisonale Bilder</h1>
        <p className="text-sm text-slate-400">
          Verwalte monatlich wechselnde Bilder fuer Startseite und andere Seitenbereiche.
          Bilder werden automatisch zum Monatswechsel aktiv.
        </p>
      </div>

      {/* Monats-Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl p-4" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
          <div className="text-xs font-heading font-semibold text-cyan-400 uppercase tracking-wider mb-1">
            Aktueller Monat
          </div>
          <div className="text-white font-heading font-bold text-lg">
            {MONTH_NAMES[current.month]} {current.year}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Hero-Layout: Bild {isImageLeftMonth(current.month) ? 'links' : 'rechts'}
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div className="text-xs font-heading font-semibold text-indigo-400 uppercase tracking-wider mb-1">
            Naechster Monat
          </div>
          <div className="text-white font-heading font-bold text-lg">
            {MONTH_NAMES[next.month]} {next.year}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Hero-Layout: Bild {isImageLeftMonth(next.month) ? 'links' : 'rechts'}
          </div>
        </div>
      </div>

      {/* Zonen */}
      {SEASONAL_ZONES.map((zone) => (
        <div key={zone.id} className="mb-8 rounded-xl overflow-hidden" style={{ background: '#111827', border: '1px solid #1e293b' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid #1e293b' }}>
            <h2 className="font-heading font-bold text-lg text-white">{zone.label}</h2>
            {zone.id === 'hero' && (
              <p className="text-xs text-slate-400 mt-1">
                Das Bild wechselt monatlich die Seite: ungerade Monate links, gerade Monate rechts.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Aktueller Monat */}
            <ImageSlot
              label={`${MONTH_NAMES[current.month]} ${current.year}`}
              badge="Aktuell"
              badgeColor="#06b6d4"
              image={getImage(zone.id, current.key)}
              zone={zone.id as SeasonalZone}
              yearMonth={current.key}
              onUnsplash={openUnsplash}
              onUpload={openUpload}
              onRemove={removeImage}
              saving={saving}
              layoutHint={zone.id === 'hero' ? (isImageLeftMonth(current.month) ? 'Bild links' : 'Bild rechts') : undefined}
            />

            {/* Naechster Monat */}
            <ImageSlot
              label={`${MONTH_NAMES[next.month]} ${next.year}`}
              badge="Naechster"
              badgeColor="#6366f1"
              image={getImage(zone.id, next.key)}
              zone={zone.id as SeasonalZone}
              yearMonth={next.key}
              onUnsplash={openUnsplash}
              onUpload={openUpload}
              onRemove={removeImage}
              onActivateNow={async (z, ym) => {
                const img = getImage(z, ym);
                if (!img) return;
                await saveImage(z, current.key, img);
              }}
              saving={saving}
              layoutHint={zone.id === 'hero' ? (isImageLeftMonth(next.month) ? 'Bild links' : 'Bild rechts') : undefined}
            />
          </div>
        </div>
      ))}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Unsplash Modal */}
      {unsplashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl flex flex-col"
            style={{ background: '#111827', border: '1px solid #1e293b' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #1e293b' }}>
              <h3 className="font-heading font-bold text-lg text-white">Unsplash-Bild suchen</h3>
              <button
                onClick={() => setUnsplashOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                style={{ color: '#94a3b8' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Suchleiste */}
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #1e293b' }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (unsplashQuery.trim()) searchUnsplash(unsplashQuery.trim());
                }}
                className="flex gap-3"
              >
                <input
                  type="text"
                  value={unsplashQuery}
                  onChange={(e) => setUnsplashQuery(e.target.value)}
                  placeholder="Suchbegriff eingeben..."
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-body text-white placeholder:text-slate-500"
                  style={{ background: '#0a0f1e', border: '1px solid #1e293b' }}
                />
                <button
                  type="submit"
                  disabled={unsplashLoading}
                  className="px-5 py-2.5 rounded-lg text-sm font-heading font-semibold text-white transition-colors"
                  style={{ background: '#06b6d4' }}
                >
                  {unsplashLoading ? 'Suche...' : 'Suchen'}
                </button>
              </form>
            </div>

            {/* Ergebnisse */}
            <div className="flex-1 overflow-y-auto p-6">
              {unsplashResults.length === 0 && !unsplashLoading && (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Gib einen Suchbegriff ein und klicke auf &quot;Suchen&quot;.
                </div>
              )}
              {unsplashLoading && (
                <div className="text-center py-12">
                  <div className="inline-block w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                </div>
              )}
              {!unsplashLoading && unsplashResults.length > 0 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {unsplashResults.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => selectUnsplash(img)}
                        disabled={unsplashSaving !== null}
                        className="group relative rounded-xl overflow-hidden aspect-[3/2] transition-all hover:ring-2 hover:ring-cyan-400"
                        style={{ background: '#0a0f1e' }}
                      >
                        <Image
                          src={img.thumb}
                          alt={img.alt}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        {unsplashSaving === img.id && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white text-xs font-body truncate block">
                            Foto: {img.photographer}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* Pagination */}
                  {unsplashTotalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-6">
                      <button
                        onClick={() => searchUnsplash(unsplashQuery, unsplashPage - 1)}
                        disabled={unsplashPage <= 1 || unsplashLoading}
                        className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors disabled:opacity-30"
                        style={{ background: '#1e293b', color: '#e2e8f0' }}
                      >
                        Zurueck
                      </button>
                      <span className="px-3 py-1.5 text-xs text-slate-400">
                        Seite {unsplashPage} von {unsplashTotalPages}
                      </span>
                      <button
                        onClick={() => searchUnsplash(unsplashQuery, unsplashPage + 1)}
                        disabled={unsplashPage >= unsplashTotalPages || unsplashLoading}
                        className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors disabled:opacity-30"
                        style={{ background: '#1e293b', color: '#e2e8f0' }}
                      >
                        Weiter
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-heading font-semibold text-white shadow-lg animate-fade-in"
          style={{ background: '#06b6d4' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/* ============================================
   ImageSlot — Einzelner Bild-Slot pro Monat
   ============================================ */

function ImageSlot({
  label,
  badge,
  badgeColor,
  image,
  zone,
  yearMonth,
  onUnsplash,
  onUpload,
  onRemove,
  onActivateNow,
  saving,
  layoutHint,
}: {
  label: string;
  badge: string;
  badgeColor: string;
  image: SeasonalImage | null;
  zone: SeasonalZone;
  yearMonth: string;
  onUnsplash: (zone: SeasonalZone, ym: string) => void;
  onUpload: (zone: SeasonalZone, ym: string) => void;
  onRemove: (zone: string, ym: string) => void;
  onActivateNow?: (zone: SeasonalZone, ym: string) => void;
  saving: boolean;
  layoutHint?: string;
}) {
  return (
    <div className="p-5" style={{ borderRight: '1px solid #1e293b' }}>
      {/* Slot Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-heading font-bold uppercase tracking-wider text-white"
            style={{ background: badgeColor }}
          >
            {badge}
          </span>
          <span className="text-sm font-heading font-semibold text-white">{label}</span>
        </div>
        {layoutHint && (
          <span className="text-[10px] font-body text-slate-500 px-2 py-0.5 rounded-full" style={{ background: '#1e293b' }}>
            {layoutHint}
          </span>
        )}
      </div>

      {/* Bild-Vorschau */}
      <div className="relative rounded-xl overflow-hidden aspect-[16/9] mb-3" style={{ background: '#0a0f1e' }}>
        {image ? (
          <>
            <Image
              src={image.url}
              alt={image.alt}
              fill
              className="object-cover"
              unoptimized
            />
            {/* Overlay Info */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-heading font-bold uppercase text-white"
                  style={{
                    background:
                      image.source === 'unsplash'
                        ? '#059669'
                        : image.source === 'ai'
                          ? '#7c3aed'
                          : '#d97706',
                  }}
                >
                  {image.source === 'unsplash' ? 'Unsplash' : image.source === 'ai' ? 'KI' : 'Eigenes'}
                </span>
                {image.photographer && (
                  <span className="text-white/70 text-[11px] font-body truncate">
                    Foto: {image.photographer}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-slate-600 text-xs font-body">Kein Bild gesetzt</span>
          </div>
        )}
      </div>

      {/* Aktionen */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onUnsplash(zone, yearMonth)}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-white/10 disabled:opacity-50"
          style={{ color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Unsplash
        </button>
        <button
          onClick={() => onUpload(zone, yearMonth)}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-white/10 disabled:opacity-50"
          style={{ color: '#d97706', border: '1px solid rgba(217,119,6,0.3)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Hochladen
        </button>
        {image && onActivateNow && (
          <button
            onClick={() => onActivateNow(zone, yearMonth)}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
            style={{ color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Sofort aktivieren
          </button>
        )}
        {image && (
          <button
            onClick={() => onRemove(zone, yearMonth)}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-red-500/10 disabled:opacity-50"
            style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Entfernen
          </button>
        )}
      </div>
    </div>
  );
}

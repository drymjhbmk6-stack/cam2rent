'use client';

import { useEffect, useState } from 'react';

interface ProductImageGalleryProps {
  productId: string;
  brand: string;
  available: boolean;
}

const brandColors: Record<string, string> = {
  GoPro: '#3b82f6',
  DJI: '#0d9488',
  Insta360: '#f59e0b',
};

const brandBg: Record<string, string> = {
  GoPro: 'bg-accent-blue-soft',
  DJI: 'bg-accent-teal-soft',
  Insta360: 'bg-accent-amber-soft',
};

function CameraPlaceholder({ brand, size = 'lg' }: { brand: string; size?: 'lg' | 'sm' }) {
  const color = brandColors[brand] ?? '#94a3b8';
  const dim = size === 'lg' ? { w: 160, h: 120, vw: '0 0 160 120' } : { w: 48, h: 36, vw: '0 0 48 36' };
  return (
    <svg viewBox={dim.vw} fill="none" style={{ width: size === 'lg' ? 160 : 48, height: size === 'lg' ? 120 : 36 }} aria-hidden="true">
      <rect x={size === 'lg' ? 12 : 3} y={size === 'lg' ? 20 : 7} width={size === 'lg' ? 136 : 42} height={size === 'lg' ? 82 : 22} rx={size === 'lg' ? 10 : 3} fill={color} fillOpacity="0.12" stroke={color} strokeWidth={size === 'lg' ? 2.5 : 1.5} />
      <circle cx={size === 'lg' ? 80 : 24} cy={size === 'lg' ? 61 : 18} r={size === 'lg' ? 26 : 8} fill={color} fillOpacity="0.18" stroke={color} strokeWidth={size === 'lg' ? 2.5 : 1.5} />
      <circle cx={size === 'lg' ? 80 : 24} cy={size === 'lg' ? 61 : 18} r={size === 'lg' ? 16 : 5} fill={color} fillOpacity="0.35" />
      <circle cx={size === 'lg' ? 80 : 24} cy={size === 'lg' ? 61 : 18} r={size === 'lg' ? 8 : 2.5} fill={color} fillOpacity="0.65" />
      <rect x={size === 'lg' ? 56 : 16} y={size === 'lg' ? 8 : 2} width={size === 'lg' ? 32 : 10} height={size === 'lg' ? 14 : 6} rx={size === 'lg' ? 4 : 1.5} fill={color} fillOpacity="0.12" stroke={color} strokeWidth={size === 'lg' ? 2.5 : 1.5} />
    </svg>
  );
}

export default function ProductImageGallery({ productId, brand, available }: ProductImageGalleryProps) {
  const [images, setImages] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const bg = brandBg[brand] ?? 'bg-gray-100';

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => {
        const adminProducts = d.adminProducts;
        if (adminProducts?.[productId]?.images?.length > 0) {
          setImages(adminProducts[productId].images);
        }
      })
      .catch(() => {});
  }, [productId]);

  const hasImages = images.length > 0;

  return (
    <div>
      {/* Main image */}
      <div className={`relative rounded-card overflow-hidden ${hasImages ? 'bg-white dark:bg-gray-700' : bg} flex items-center justify-center`} style={{ aspectRatio: '4/3' }}>
        {!available && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
            <span className="px-4 py-2 bg-status-error text-white font-heading font-bold text-sm rounded-full shadow-lg">
              Aktuell ausgebucht
            </span>
          </div>
        )}
        {hasImages ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[activeIndex]}
            alt="Produktbild"
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            <CameraPlaceholder brand={brand} size="lg" />
            <p className="absolute bottom-4 left-0 right-0 text-center text-xs font-body text-brand-muted/60 select-none">
              Foto folgt
            </p>
          </>
        )}
      </div>

      {/* Thumbnails */}
      <div className="mt-3 grid grid-cols-4 gap-3">
        {hasImages ? (
          images.slice(0, 4).map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                activeIndex === i ? 'border-accent-blue' : 'border-transparent hover:border-brand-border dark:hover:border-gray-600'
              }`}
              aria-label={`Bild ${i + 1} anzeigen`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Bild ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))
        ) : (
          [0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`aspect-square rounded-xl overflow-hidden ${bg} flex items-center justify-center border-2 ${
                i === 0 ? 'border-accent-blue' : 'border-transparent'
              }`}
            >
              <CameraPlaceholder brand={brand} size="sm" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

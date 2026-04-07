'use client';

import { useState } from 'react';
import { type Product, getMergedSpecs } from '@/data/products';
import NotifyModal from '@/components/NotifyModal';
import SpecIcon from '@/components/SpecIcon';
import { useFavorites } from '@/components/FavoritesProvider';
import { useCompare } from '@/components/CompareProvider';
import { useAuth } from '@/components/AuthProvider';

interface ProductCardProps {
  product: Product;
  imageUrl?: string;
}

const tagConfig = {
  popular: { label: 'Beliebt', className: 'bg-accent-blue text-white' },
  new: { label: 'Neu', className: 'bg-accent-teal text-white' },
  deal: { label: 'Angebot', className: 'bg-accent-amber text-white' },
};

const brandBg: Record<string, string> = {
  GoPro: 'bg-accent-blue-soft',
  DJI: 'bg-accent-teal-soft',
  Insta360: 'bg-accent-amber-soft',
};

function CameraIcon({ brand }: { brand: string }) {
  const colorMap: Record<string, string> = {
    GoPro: '#3b82f6',
    DJI: '#0d9488',
    Insta360: '#f59e0b',
  };
  const color = colorMap[brand] ?? '#6b7280';

  return (
    <svg
      viewBox="0 0 80 60"
      fill="none"
      className="w-32 h-24"
      aria-hidden="true"
    >
      {/* Camera body */}
      <rect x="8" y="18" width="64" height="36" rx="6" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
      {/* Lens */}
      <circle cx="40" cy="36" r="13" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2" />
      <circle cx="40" cy="36" r="8" fill={color} fillOpacity="0.35" />
      <circle cx="40" cy="36" r="4" fill={color} fillOpacity="0.6" />
      {/* Viewfinder bump */}
      <rect x="28" y="10" width="16" height="10" rx="3" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
      {/* Flash dot */}
      <circle cx="62" cy="26" r="3" fill={color} fillOpacity="0.5" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? '#ef4444' : 'none'}
      stroke={filled ? '#ef4444' : 'currentColor'}
      strokeWidth={2}
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function ScalesIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={active ? '#3b82f6' : 'none'}
      stroke={active ? '#3b82f6' : 'currentColor'}
      strokeWidth={2}
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0-17.25c-1.326 0-2.598.088-3.842.261C6.895 3.675 6 4.738 6 5.952v.028c0 .504.151.997.433 1.418l.233.348a1.5 1.5 0 01-.092 1.768l-.914 1.097A2.25 2.25 0 005 12.36v.028c0 .596.235 1.169.654 1.591L7.5 15.825m4.5-12.575c1.326 0 2.598.088 3.842.261 1.263.214 2.158 1.277 2.158 2.491v.028c0 .504-.151.997-.433 1.418l-.233.348a1.5 1.5 0 00.092 1.768l.914 1.097A2.25 2.25 0 0119 12.36v.028c0 .596-.235 1.169-.654 1.591L16.5 15.825" />
    </svg>
  );
}

export default function ProductCard({ product, imageUrl }: ProductCardProps) {
  const { user } = useAuth();
  const { isFavorited, toggleFavorite } = useFavorites();
  const { addToCompare, isInCompare } = useCompare();
  const [notifyOpen, setNotifyOpen] = useState(false);

  const wishlisted = isFavorited(product.id);
  const comparing = isInCompare(product.id);
  const primaryTag = product.tags[0];

  const handleFavorite = () => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    toggleFavorite(product.id);
  };

  return (
    <>
      <article className="group bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-200 overflow-hidden flex flex-col">
        {/* Image area */}
        <div className={`relative ${imageUrl ? 'bg-white' : brandBg[product.brand] ?? 'bg-gray-100'} flex items-center justify-center overflow-hidden`} style={{ aspectRatio: '4/3' }}>
          {/* Tag badge */}
          {primaryTag && (
            <span
              className={`absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full text-xs font-heading font-semibold ${tagConfig[primaryTag].className}`}
            >
              {tagConfig[primaryTag].label}
            </span>
          )}

          {/* Wishlist + Compare buttons */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleFavorite}
              className="p-1.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 text-brand-steel hover:text-brand-black dark:hover:text-gray-100 transition-colors shadow-sm"
              aria-label={wishlisted ? 'Von Wunschliste entfernen' : 'Zur Wunschliste hinzufügen'}
              aria-pressed={wishlisted}
            >
              <HeartIcon filled={wishlisted} />
            </button>
            <button
              type="button"
              onClick={() => addToCompare(product.id)}
              className={`p-1.5 rounded-full backdrop-blur-sm transition-colors shadow-sm ${
                comparing
                  ? 'bg-accent-blue text-white'
                  : 'bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 text-brand-steel hover:text-brand-black dark:hover:text-gray-100'
              }`}
              aria-label={comparing ? 'Aus Vergleich entfernen' : 'Zum Vergleich hinzufügen'}
              aria-pressed={comparing}
              title="Vergleichen"
            >
              <ScalesIcon active={comparing} />
            </button>
          </div>

          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={product.name}
              className="w-full h-full object-contain p-2"
            />
          ) : (
            <CameraIcon brand={product.brand} />
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col flex-1 p-5">
          <div className="mb-3">
            <p className="text-xs font-body font-semibold text-accent-blue uppercase tracking-wider mb-1">
              {product.brand}
            </p>
            <h3 className="font-heading font-semibold text-base text-brand-black dark:text-gray-100 leading-snug mb-1">
              {product.name}
            </h3>
            <p className="text-sm font-body text-brand-steel dark:text-gray-400 line-clamp-2">
              {product.shortDescription}
            </p>
          </div>

          {/* Top 3 Specs */}
          <div className="flex flex-wrap gap-2 mb-3">
            {getMergedSpecs(product).slice(0, 3).map((spec) => (
              <span key={spec.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-bg dark:bg-gray-700 text-xs font-body text-brand-text dark:text-gray-300">
                <SpecIcon iconId={spec.icon} className="w-3 h-3 text-brand-muted" />
                {spec.value}
              </span>
            ))}
          </div>

          {/* Availability */}
          <div className="flex items-center gap-1.5 mb-4">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                product.available ? 'bg-status-success' : 'bg-status-error'
              }`}
              aria-hidden="true"
            />
            <span
              className={`text-xs font-body font-medium ${
                product.available ? 'text-status-success' : 'text-status-error'
              }`}
            >
              {product.available ? 'Verfügbar' : 'Ausgebucht'}
            </span>
          </div>

          {/* Price + CTA */}
          <div className="mt-auto">
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-xs font-body text-brand-steel dark:text-gray-400">ab</span>
              <span className="font-heading font-bold text-xl text-brand-black dark:text-gray-100">
                {product.pricePerDay.toFixed(2).replace('.', ',')} €
              </span>
              <span className="text-xs font-body text-brand-steel dark:text-gray-400">/ Tag</span>
            </div>

            {product.available ? (
              <a
                href={`/kameras/${product.slug}`}
                className="block w-full text-center px-4 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors"
              >
                Jetzt mieten
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setNotifyOpen(true)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent-blue-soft text-accent-blue font-heading font-semibold text-sm rounded-[10px] hover:bg-blue-100 transition-colors"
              >
                <BellIcon />
                Benachrichtige mich
              </button>
            )}
          </div>
        </div>
      </article>

      <NotifyModal
        isOpen={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        productName={product.name}
      />
    </>
  );
}

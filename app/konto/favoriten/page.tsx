'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useFavorites } from '@/components/FavoritesProvider';
import { type Product } from '@/data/products';
import { useProducts } from '@/components/ProductsProvider';
import Link from 'next/link';

export default function FavoritenPage() {
  const { products } = useProducts();
  const { user } = useAuth();
  const { favorites, loading, toggleFavorite } = useFavorites();
  const [favProducts, setFavProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (loading) return;
    const matched = products.filter((p) => favorites.has(p.id));
    setFavProducts(matched);
  }, [favorites, loading]);

  if (!user) {
    return (
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 text-center">
        <p className="text-brand-steel dark:text-gray-400 text-sm">Bitte melde dich an, um deine Favoriten zu sehen.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 text-center">
        <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white">Meine Favoriten</h1>
        <p className="text-sm text-brand-steel dark:text-gray-400 mt-1">
          {favProducts.length > 0
            ? `${favProducts.length} Kamera${favProducts.length !== 1 ? 's' : ''} gespeichert`
            : 'Speichere deine Lieblingskameras für später'}
        </p>
      </div>

      {favProducts.length === 0 ? (
        /* Empty state */
        <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </div>
          <p className="font-heading font-semibold text-brand-black dark:text-white mb-1">Noch keine Favoriten</p>
          <p className="text-sm text-brand-steel dark:text-gray-400 mb-5">
            Klicke auf das Herz bei einer Kamera, um sie hier zu speichern.
          </p>
          <Link
            href="/kameras"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark dark:hover:bg-accent-blue/90 transition-colors"
          >
            Kameras entdecken
          </Link>
        </div>
      ) : (
        /* Favorites grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {favProducts.map((product) => {
            const brandColors: Record<string, { bg: string; text: string }> = {
              GoPro: { bg: 'bg-accent-blue-soft', text: 'text-accent-blue' },
              DJI: { bg: 'bg-accent-teal-soft', text: 'text-accent-teal' },
              Insta360: { bg: 'bg-accent-amber-soft', text: 'text-accent-amber' },
            };
            const colors = brandColors[product.brand] || brandColors.GoPro;

            return (
              <div
                key={product.id}
                className="bg-white dark:bg-brand-dark rounded-card shadow-card overflow-hidden flex flex-col"
              >
                {/* Top: brand bar + remove button */}
                <div className={`${colors.bg} px-5 py-4 flex items-center justify-between`}>
                  <div>
                    <p className={`text-xs font-body font-semibold ${colors.text} uppercase tracking-wider`}>
                      {product.brand}
                    </p>
                    <h3 className="font-heading font-semibold text-base text-brand-black dark:text-white mt-0.5">
                      {product.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => toggleFavorite(product.id)}
                    className="p-2 rounded-full bg-white/70 hover:bg-white text-red-400 hover:text-red-500 transition-colors"
                    title="Aus Favoriten entfernen"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-sm text-brand-steel dark:text-gray-400 line-clamp-2 mb-3">
                    {product.shortDescription}
                  </p>

                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-brand-steel dark:text-gray-400">ab</span>
                      <span className="font-heading font-bold text-lg text-brand-black dark:text-white">
                        {product.pricePerDay.toFixed(2).replace('.', ',')} €
                      </span>
                      <span className="text-xs text-brand-steel dark:text-gray-400">/ Tag</span>
                    </div>
                    <Link
                      href={`/kameras/${product.slug}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-xs rounded-btn hover:bg-brand-dark dark:hover:bg-accent-blue/90 transition-colors"
                    >
                      Ansehen
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

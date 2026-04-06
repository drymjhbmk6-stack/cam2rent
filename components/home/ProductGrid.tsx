'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { products, type Product } from '@/data/products';
import ProductCard from '@/components/ProductCard';

type FilterBrand = 'Alle' | Product['brand'];
const filters: FilterBrand[] = ['Alle', 'GoPro', 'DJI', 'Insta360'];

export default function ProductGrid() {
  const [activeBrand, setActiveBrand] = useState<FilterBrand>('Alle');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [productImages, setProductImages] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => {
        const imgs: Record<string, string> = {};
        const ap = d.adminProducts;
        if (ap) {
          Object.keys(ap).forEach((id) => {
            if (ap[id]?.images?.length > 0) {
              imgs[id] = ap[id].images[0];
            }
          });
        }
        setProductImages(imgs);
      })
      .catch(() => {});
  }, []);

  const filtered = products.filter((p) => {
    const brandMatch = activeBrand === 'Alle' || p.brand === activeBrand;
    const availMatch = !onlyAvailable || p.available;
    return brandMatch && availMatch;
  });

  return (
    <section className="py-20 bg-brand-bg dark:bg-gray-950" aria-labelledby="products-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-8">
          <h2
            id="products-heading"
            className="font-heading font-bold text-3xl sm:text-4xl text-brand-black dark:text-gray-100"
          >
            Unsere Kameras
          </h2>
          <Link
            href="/kameras"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-body font-semibold text-accent-blue hover:text-blue-700 transition-colors"
          >
            Alle anzeigen
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-10">
          {/* Brand pills */}
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Nach Marke filtern">
            {filters.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => setActiveBrand(brand)}
                className={`px-4 py-2 rounded-full text-sm font-body font-medium transition-colors ${
                  activeBrand === brand
                    ? 'bg-brand-black dark:bg-accent-blue text-white shadow-sm'
                    : 'bg-white dark:bg-gray-800 text-brand-steel dark:text-gray-400 border border-brand-border dark:border-gray-600 hover:border-brand-muted dark:hover:border-gray-500 hover:text-brand-text dark:hover:text-gray-200'
                }`}
                aria-pressed={activeBrand === brand}
              >
                {brand}
              </button>
            ))}
          </div>

          {/* Availability toggle */}
          <div className="ml-auto flex items-center gap-2">
            <label
              htmlFor="available-toggle"
              className="text-sm font-body text-brand-steel dark:text-gray-400 cursor-pointer select-none"
            >
              Nur Verfügbare
            </label>
            <button
              id="available-toggle"
              type="button"
              role="switch"
              aria-checked={onlyAvailable}
              onClick={() => setOnlyAvailable(!onlyAvailable)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 ${
                onlyAvailable ? 'bg-accent-blue' : 'bg-brand-border'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                  onlyAvailable ? 'translate-x-5' : 'translate-x-0'
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} imageUrl={productImages[product.id]} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="font-body text-brand-steel text-lg">
              Keine Kameras gefunden. Versuche einen anderen Filter.
            </p>
          </div>
        )}

        {/* Mobile: Alle anzeigen */}
        <div className="sm:hidden text-center mt-8">
          <Link
            href="/kameras"
            className="inline-flex items-center gap-1 text-sm font-body font-semibold text-accent-blue hover:text-blue-700"
          >
            Alle Kameras anzeigen
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

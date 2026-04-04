'use client';

import { useState } from 'react';
import Link from 'next/link';
import { products, type Product } from '@/data/products';
import ProductCard from '@/components/ProductCard';

type FilterBrand = 'Alle' | Product['brand'];
const BRANDS: FilterBrand[] = ['Alle', 'GoPro', 'DJI', 'Insta360'];

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-brand-muted" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function KamerasPage() {
  const [activeBrand, setActiveBrand] = useState<FilterBrand>('Alle');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const filtered = products.filter((p) => {
    const brandMatch = activeBrand === 'Alle' || p.brand === activeBrand;
    const availMatch = !onlyAvailable || p.available;
    return brandMatch && availMatch;
  });

  const availableCount = products.filter((p) => p.available).length;

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Page header */}
      <div className="bg-white border-b border-brand-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb */}
          <nav aria-label="Brotkrume" className="mb-4">
            <ol className="flex items-center gap-2 text-sm font-body">
              <li>
                <Link
                  href="/"
                  className="text-brand-steel hover:text-accent-blue transition-colors"
                >
                  Startseite
                </Link>
              </li>
              <li>
                <ChevronIcon />
              </li>
              <li>
                <span className="text-brand-black font-medium" aria-current="page">
                  Kameras
                </span>
              </li>
            </ol>
          </nav>

          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-heading font-bold text-3xl sm:text-4xl text-brand-black">
                Alle Kameras
              </h1>
              <p className="mt-1.5 font-body text-brand-steel">
                {products.length} Action-Cams und 360°-Kameras zur Miete –{' '}
                <span className="text-status-success font-medium">{availableCount} sofort verfügbar</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Filter bar */}
        <div className="bg-white rounded-card shadow-card p-4 mb-8 flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-2 flex-wrap"
            role="group"
            aria-label="Nach Marke filtern"
          >
            {BRANDS.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => setActiveBrand(brand)}
                className={`px-4 py-2 rounded-full text-sm font-body font-medium transition-colors ${
                  activeBrand === brand
                    ? 'bg-brand-black text-white shadow-sm'
                    : 'bg-brand-bg text-brand-steel border border-brand-border hover:border-brand-muted hover:text-brand-text'
                }`}
                aria-pressed={activeBrand === brand}
              >
                {brand}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <label
              htmlFor="avail-toggle"
              className="text-sm font-body text-brand-steel cursor-pointer select-none"
            >
              Nur Verfügbare
            </label>
            <button
              id="avail-toggle"
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

        {/* Results count */}
        <p className="text-sm font-body text-brand-steel mb-6">
          {filtered.length} {filtered.length === 1 ? 'Kamera' : 'Kameras'} gefunden
        </p>

        {/* Product grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-full bg-white shadow-card flex items-center justify-center mx-auto mb-5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="w-8 h-8 text-brand-muted"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
                />
              </svg>
            </div>
            <p className="font-heading font-semibold text-brand-black text-lg">
              Keine Kameras gefunden
            </p>
            <p className="font-body text-brand-muted text-sm mt-1">
              Versuche einen anderen Filter oder aktiviere alle Marken.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveBrand('Alle');
                setOnlyAvailable(false);
              }}
              className="mt-5 px-5 py-2 bg-brand-black text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors"
            >
              Filter zurücksetzen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

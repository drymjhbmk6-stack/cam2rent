'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { type Product, getMergedSpecs } from '@/data/products';
import { useProducts } from '@/components/ProductsProvider';
import ProductCard from '@/components/ProductCard';
import { useProductImage } from '@/components/ProductImagesProvider';
import { useSpecDefinitions } from '@/components/admin/SpecDefinitions';

function ProductCardWithImage({ product }: { product: Product }) {
  const imageUrl = useProductImage(product.id);
  return <ProductCard product={product} imageUrl={imageUrl} />;
}

type FilterBrand = string;

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
  const { products } = useProducts();
  const { specs: specDefs } = useSpecDefinitions();
  const brands: FilterBrand[] = ['Alle', ...Array.from(new Set(products.map((p) => p.brand)))];
  const [activeBrand, setActiveBrand] = useState<FilterBrand>('Alle');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Dynamische Spec-Filter: { specId: filterValue }
  const [specFilters, setSpecFilters] = useState<Record<string, string>>({});

  function extractNum(str: string): number {
    const m = str.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }

  // Sammle alle vorhandenen Werte pro Spec aus den Produkten
  const specFilterOptions = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const p of products) {
      const specs = getMergedSpecs(p);
      for (const s of specs) {
        if (!map[s.id]) map[s.id] = new Set();
        if (s.value) map[s.id].add(s.value);
      }
    }
    return map;
  }, [products]);

  const hasActiveSpecFilter = Object.values(specFilters).some((v) => v !== '');

  const filtered = products.filter((p) => {
    const brandMatch = activeBrand === 'Alle' || p.brand === activeBrand;
    const availMatch = !onlyAvailable || p.available;

    const q = searchQuery.toLowerCase().trim();
    const searchMatch = !q || p.name.toLowerCase().includes(q) || p.model.toLowerCase().includes(q) || p.shortDescription.toLowerCase().includes(q);

    // Dynamische Spec-Filter
    let specMatch = true;
    const pSpecs = getMergedSpecs(p);
    for (const [specId, filterVal] of Object.entries(specFilters)) {
      if (!filterVal) continue;
      const pSpec = pSpecs.find((s) => s.id === specId);
      if (!pSpec) { specMatch = false; break; }
      // Numerischer Vergleich: Filterwert als Minimum
      const pNum = extractNum(pSpec.value);
      const fNum = parseFloat(filterVal);
      if (!isNaN(fNum) && pNum < fNum) { specMatch = false; break; }
    }

    return brandMatch && availMatch && searchMatch && specMatch;
  });

  const availableCount = products.filter((p) => p.available).length;

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-gray-950">
      {/* Page header */}
      <div className="bg-white dark:bg-gray-900 border-b border-brand-border dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb */}
          <nav aria-label="Brotkrume" className="mb-4">
            <ol className="flex items-center gap-2 text-sm font-body">
              <li>
                <Link
                  href="/"
                  className="text-brand-steel dark:text-gray-400 hover:text-accent-blue transition-colors"
                >
                  Startseite
                </Link>
              </li>
              <li>
                <ChevronIcon />
              </li>
              <li>
                <span className="text-brand-black dark:text-gray-100 font-medium" aria-current="page">
                  Kameras
                </span>
              </li>
            </ol>
          </nav>

          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-heading font-bold text-3xl sm:text-4xl text-brand-black dark:text-gray-100">
                Alle Kameras
              </h1>
              <p className="mt-1.5 font-body text-brand-steel dark:text-gray-400">
                {products.length} Action-Cams und 360°-Kameras zur Miete –{' '}
                <span className="text-status-success font-medium">{availableCount} sofort verfügbar</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Ausklappbarer Filter-Bereich */}
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 mb-4 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="text-sm font-heading font-semibold text-brand-black dark:text-gray-100">Suche & Filter</span>
              {(searchQuery || hasActiveSpecFilter) && (
                <span className="px-2 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue text-xs font-semibold">aktiv</span>
              )}
            </div>
            <svg className={`w-4 h-4 text-brand-muted transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showFilters && (
            <div className="px-4 pb-4 space-y-3 border-t border-brand-border dark:border-gray-700 pt-3">
              {/* Suche */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Kamera suchen…"
                  className="w-full pl-10 pr-4 py-2 rounded-full text-sm font-body border border-brand-border dark:border-gray-600 bg-brand-bg dark:bg-gray-700 text-brand-black dark:text-gray-100 placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent"
                />
              </div>

              {/* Dynamische Spec-Filter */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-heading font-semibold text-brand-muted dark:text-gray-500 uppercase tracking-wider">Specs</span>
                {specDefs.filter((d) => specFilterOptions[d.id]?.size > 0).map((def) => {
                  const values = Array.from(specFilterOptions[def.id] ?? []).sort((a, b) => extractNum(a) - extractNum(b));
                  return (
                    <div key={def.id} className="flex items-center gap-1.5">
                      <label className="text-sm font-body text-brand-steel dark:text-gray-400 whitespace-nowrap">{def.name}</label>
                      <select
                        value={specFilters[def.id] ?? ''}
                        onChange={(e) => setSpecFilters((f) => ({ ...f, [def.id]: e.target.value }))}
                        className="px-3 py-1.5 rounded-full text-sm font-body border border-brand-border dark:border-gray-600 bg-brand-bg dark:bg-gray-700 text-brand-black dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-blue"
                      >
                        <option value="">Alle</option>
                        {values.map((v) => (
                          <option key={v} value={String(extractNum(v))}>{v}+</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                {hasActiveSpecFilter && (
                  <button
                    type="button"
                    onClick={() => setSpecFilters({})}
                    className="px-3 py-1.5 rounded-full text-xs font-body font-medium text-accent-blue hover:bg-accent-blue-soft transition-colors whitespace-nowrap"
                  >
                    Filter zurücksetzen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Brand filter bar */}
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-4 mb-8 flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-2 flex-wrap"
            role="group"
            aria-label="Nach Marke filtern"
          >
            {brands.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => setActiveBrand(brand)}
                className={`px-4 py-2 rounded-full text-sm font-body font-medium transition-colors ${
                  activeBrand === brand
                    ? 'bg-brand-black dark:bg-accent-blue text-white shadow-sm'
                    : 'bg-brand-bg dark:bg-gray-700 text-brand-steel dark:text-gray-400 border border-brand-border dark:border-gray-600 hover:border-brand-muted dark:hover:border-gray-500 hover:text-brand-text dark:hover:text-gray-200'
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
              className="text-sm font-body text-brand-steel dark:text-gray-400 cursor-pointer select-none"
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
                onlyAvailable ? 'bg-accent-blue' : 'bg-brand-border dark:bg-gray-600'
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
        <p className="text-sm font-body text-brand-steel dark:text-gray-400 mb-6">
          {filtered.length} {filtered.length === 1 ? 'Kamera' : 'Kameras'} gefunden
        </p>

        {/* Product grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((product) => (
              <ProductCardWithImage key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-full bg-white dark:bg-gray-800 shadow-card flex items-center justify-center mx-auto mb-5">
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
            <p className="font-heading font-semibold text-brand-black dark:text-gray-100 text-lg">
              Keine Kameras gefunden
            </p>
            <p className="font-body text-brand-muted dark:text-gray-500 text-sm mt-1">
              Versuche einen anderen Filter oder aktiviere alle Marken.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveBrand('Alle');
                setOnlyAvailable(false);
              }}
              className="mt-5 px-5 py-2 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors"
            >
              Filter zurücksetzen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
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
  const [searchQuery, setSearchQuery] = useState('');
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
  const [waterproofMin, setWaterproofMin] = useState<string>('');
  const [resolutionMin, setResolutionMin] = useState<string>('');
  const [fpsMin, setFpsMin] = useState<string>('');
  const [batteryMin, setBatteryMin] = useState<string>('');
  const [weightMax, setWeightMax] = useState<string>('');

  function extractNum(str: string): number {
    const m = str.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }

  const hasActiveSpecFilter = !!(waterproofMin || resolutionMin || fpsMin || batteryMin || weightMax);

  const filtered = products.filter((p) => {
    const brandMatch = activeBrand === 'Alle' || p.brand === activeBrand;
    const availMatch = !onlyAvailable || p.available;

    // Textsuche
    const q = searchQuery.toLowerCase().trim();
    const searchMatch = !q || p.name.toLowerCase().includes(q) || p.model.toLowerCase().includes(q) || p.shortDescription.toLowerCase().includes(q);

    // Spezifikationsfilter
    let waterMatch = true;
    if (waterproofMin) {
      waterMatch = extractNum(p.specs.waterproof) >= parseInt(waterproofMin, 10);
    }

    let resMatch = true;
    if (resolutionMin) {
      // Auflösung: "5.3K" → 5.3, "4K" → 4, "8K" → 8
      const resValue = extractNum(p.specs.resolution);
      resMatch = resValue >= parseFloat(resolutionMin);
    }

    let fpsMatch = true;
    if (fpsMin) {
      fpsMatch = extractNum(p.specs.fps) >= parseInt(fpsMin, 10);
    }

    let battMatch = true;
    if (batteryMin) {
      battMatch = extractNum(p.specs.battery) >= parseInt(batteryMin, 10);
    }

    let weightMatch = true;
    if (weightMax) {
      weightMatch = extractNum(p.specs.weight) <= parseInt(weightMax, 10);
    }

    return brandMatch && availMatch && searchMatch && waterMatch && resMatch && fpsMatch && battMatch && weightMatch;
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
        {/* Search + Spec filter */}
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-4 mb-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
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
          </div>
          {hasActiveSpecFilter && (
            <button
              type="button"
              onClick={() => { setWaterproofMin(''); setResolutionMin(''); setFpsMin(''); setBatteryMin(''); setWeightMax(''); }}
              className="px-3 py-2 rounded-full text-xs font-body font-medium text-accent-blue hover:bg-accent-blue-soft transition-colors whitespace-nowrap"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        {/* Spezifikationsfilter */}
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-4 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-heading font-semibold text-brand-muted dark:text-gray-500 uppercase tracking-wider mr-1">Specs</span>
          <div className="flex items-center gap-2">
            <label htmlFor="waterproof-filter" className="text-sm font-body text-brand-steel dark:text-gray-400 whitespace-nowrap">Wasserdicht</label>
            <select
              id="waterproof-filter"
              value={waterproofMin}
              onChange={(e) => setWaterproofMin(e.target.value)}
              className="px-3 py-2 rounded-full text-sm font-body border border-brand-border dark:border-gray-600 bg-brand-bg dark:bg-gray-700 text-brand-black dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-blue"
            >
              <option value="">Alle</option>
              <option value="5">5m+</option>
              <option value="10">10m+</option>
              <option value="20">20m+</option>
              <option value="40">40m+</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="resolution-filter" className="text-sm font-body text-brand-steel dark:text-gray-400 whitespace-nowrap">Auflösung</label>
            <select
              id="resolution-filter"
              value={resolutionMin}
              onChange={(e) => setResolutionMin(e.target.value)}
              className="px-3 py-2 rounded-full text-sm font-body border border-brand-border dark:border-gray-600 bg-brand-bg dark:bg-gray-700 text-brand-black dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-blue"
            >
              <option value="">Alle</option>
              <option value="4">4K+</option>
              <option value="5.3">5.3K+</option>
              <option value="8">8K+</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="fps-filter" className="text-sm font-body text-brand-steel dark:text-gray-400 whitespace-nowrap">FPS</label>
            <select
              id="fps-filter"
              value={fpsMin}
              onChange={(e) => setFpsMin(e.target.value)}
              className="px-3 py-2 rounded-full text-sm font-body border border-brand-border dark:border-gray-600 bg-brand-bg dark:bg-gray-700 text-brand-black dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-blue"
            >
              <option value="">Alle</option>
              <option value="60">60fps+</option>
              <option value="120">120fps+</option>
              <option value="240">240fps+</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="battery-filter" className="text-sm font-body text-brand-steel dark:text-gray-400 whitespace-nowrap">Akku</label>
            <select
              id="battery-filter"
              value={batteryMin}
              onChange={(e) => setBatteryMin(e.target.value)}
              className="px-3 py-2 rounded-full text-sm font-body border border-brand-border dark:border-gray-600 bg-brand-bg dark:bg-gray-700 text-brand-black dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-blue"
            >
              <option value="">Alle</option>
              <option value="60">60min+</option>
              <option value="90">90min+</option>
              <option value="120">120min+</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="weight-filter" className="text-sm font-body text-brand-steel dark:text-gray-400 whitespace-nowrap">Gewicht</label>
            <select
              id="weight-filter"
              value={weightMax}
              onChange={(e) => setWeightMax(e.target.value)}
              className="px-3 py-2 rounded-full text-sm font-body border border-brand-border dark:border-gray-600 bg-brand-bg dark:bg-gray-700 text-brand-black dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-blue"
            >
              <option value="">Alle</option>
              <option value="150">&lt;150g</option>
              <option value="200">&lt;200g</option>
              <option value="300">&lt;300g</option>
            </select>
          </div>
        </div>

        {/* Brand filter bar */}
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-4 mb-8 flex flex-wrap items-center gap-3">
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
              <ProductCard key={product.id} product={product} imageUrl={productImages[product.id]} />
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

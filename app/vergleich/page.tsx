'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { type Product } from '@/data/products';
import { useProducts } from '@/components/ProductsProvider';
import { Suspense } from 'react';

const brandColor: Record<string, string> = {
  GoPro: '#3b82f6',
  DJI: '#0d9488',
  Insta360: '#f59e0b',
};

// Spec-Zeilen-Konfiguration
interface SpecRow {
  key: string;
  label: string;
  getValue: (p: Product) => string;
  /** Wie wird der "beste" Wert ermittelt? */
  bestMode?: 'highest-number' | 'lowest-number' | 'lowest-price' | 'boolean-true';
}

const specRows: SpecRow[] = [
  { key: 'price', label: 'Preis pro Tag', getValue: (p) => `ab ${p.pricePerDay.toFixed(2).replace('.', ',')} \u20AC`, bestMode: 'lowest-price' },
  { key: 'resolution', label: 'Auflösung', getValue: (p) => p.specs.resolution, bestMode: 'highest-number' },
  { key: 'fps', label: 'FPS', getValue: (p) => p.specs.fps, bestMode: 'highest-number' },
  { key: 'waterproof', label: 'Wasserdicht', getValue: (p) => p.specs.waterproof, bestMode: 'highest-number' },
  { key: 'battery', label: 'Akku', getValue: (p) => p.specs.battery, bestMode: 'highest-number' },
  { key: 'weight', label: 'Gewicht', getValue: (p) => p.specs.weight, bestMode: 'lowest-number' },
  { key: 'storage', label: 'Speicher', getValue: (p) => p.specs.storage },
  { key: 'available', label: 'Verfügbarkeit', getValue: (p) => p.available ? 'Verfügbar' : 'Ausgebucht', bestMode: 'boolean-true' },
];

function extractNum(str: string): number {
  const m = str.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function findBestIndices(prods: Product[], row: SpecRow): Set<number> {
  if (!row.bestMode || prods.length < 2) return new Set();

  const values = prods.map((p) => {
    if (row.bestMode === 'lowest-price') return p.pricePerDay;
    if (row.bestMode === 'boolean-true') return p.available ? 1 : 0;
    return extractNum(row.getValue(p));
  });

  let bestValue: number;
  if (row.bestMode === 'lowest-price' || row.bestMode === 'lowest-number') {
    bestValue = Math.min(...values);
  } else {
    bestValue = Math.max(...values);
  }

  const indices = new Set<number>();
  values.forEach((v, i) => {
    if (v === bestValue) indices.add(i);
  });

  // Wenn alle gleich, niemand hervorheben
  if (indices.size === prods.length) return new Set();
  return indices;
}

function CameraPlaceholder({ brand }: { brand: string }) {
  const color = brandColor[brand] || '#6b7280';
  return (
    <div
      className="w-full aspect-square rounded-card flex items-center justify-center"
      style={{ backgroundColor: `${color}10`, border: `2px solid ${color}30` }}
    >
      <svg viewBox="0 0 80 60" fill="none" className="w-20 h-16" aria-hidden="true">
        <rect x="8" y="18" width="64" height="36" rx="6" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
        <circle cx="40" cy="36" r="13" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2" />
        <circle cx="40" cy="36" r="8" fill={color} fillOpacity="0.35" />
        <circle cx="40" cy="36" r="4" fill={color} fillOpacity="0.6" />
        <rect x="28" y="10" width="16" height="10" rx="3" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
        <circle cx="62" cy="26" r="3" fill={color} fillOpacity="0.5" />
      </svg>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-brand-muted" aria-hidden="true">
      <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function CompareContent() {
  const { products } = useProducts();
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids') || '';
  const ids = idsParam.split(',').filter(Boolean);
  const [onlyDifferences, setOnlyDifferences] = useState(false);

  const selectedProducts = ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => !!p);

  // Zeilen filtern: bei "Nur Unterschiede" werden gleiche Werte ausgeblendet
  const visibleRows = onlyDifferences
    ? specRows.filter((row) => {
        const values = selectedProducts.map((p) => row.getValue(p));
        return new Set(values).size > 1;
      })
    : specRows;

  if (selectedProducts.length === 0) {
    return (
      <div className="min-h-screen bg-brand-bg">
        <div className="bg-white border-b border-brand-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <nav aria-label="Brotkrume" className="mb-4">
              <ol className="flex items-center gap-2 text-sm font-body">
                <li><Link href="/" className="text-brand-steel hover:text-accent-blue transition-colors">Startseite</Link></li>
                <li><ChevronIcon /></li>
                <li><Link href="/kameras" className="text-brand-steel hover:text-accent-blue transition-colors">Kameras</Link></li>
                <li><ChevronIcon /></li>
                <li><span className="text-brand-black font-medium" aria-current="page">Vergleich</span></li>
              </ol>
            </nav>
            <h1 className="font-heading font-bold text-3xl sm:text-4xl text-brand-black">Kameravergleich</h1>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-white shadow-card flex items-center justify-center mx-auto mb-5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-brand-muted" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
          <p className="font-heading font-semibold text-brand-black text-lg">Keine Kameras zum Vergleichen</p>
          <p className="font-body text-brand-muted text-sm mt-1">
            Gehe zur Kameraübersicht und wähle bis zu 3 Kameras zum Vergleichen aus.
          </p>
          <Link
            href="/kameras"
            className="inline-block mt-5 px-5 py-2 bg-brand-black text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors"
          >
            Zu den Kameras
          </Link>
        </div>
      </div>
    );
  }

  const colCount = selectedProducts.length;

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <div className="bg-white border-b border-brand-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <nav aria-label="Brotkrume" className="mb-4">
            <ol className="flex items-center gap-2 text-sm font-body">
              <li><Link href="/" className="text-brand-steel hover:text-accent-blue transition-colors">Startseite</Link></li>
              <li><ChevronIcon /></li>
              <li><Link href="/kameras" className="text-brand-steel hover:text-accent-blue transition-colors">Kameras</Link></li>
              <li><ChevronIcon /></li>
              <li><span className="text-brand-black font-medium" aria-current="page">Vergleich</span></li>
            </ol>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="font-heading font-bold text-3xl sm:text-4xl text-brand-black">Kameravergleich</h1>
              <p className="mt-1.5 font-body text-brand-steel">{colCount} {colCount === 1 ? 'Kamera' : 'Kameras'} im Vergleich</p>
            </div>

            {/* Toggle: Nur Unterschiede */}
            <div className="flex items-center gap-2.5">
              <label htmlFor="diff-toggle" className="text-sm font-body text-brand-steel cursor-pointer select-none">
                Nur Unterschiede
              </label>
              <button
                id="diff-toggle"
                type="button"
                role="switch"
                aria-checked={onlyDifferences}
                onClick={() => setOnlyDifferences(!onlyDifferences)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 ${
                  onlyDifferences ? 'bg-accent-blue' : 'bg-brand-border'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                    onlyDifferences ? 'translate-x-5' : 'translate-x-0'
                  }`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Vergleichstabelle */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full min-w-[600px] border-separate border-spacing-0">
            {/* Produktbilder + Namen (sticky Header auf Mobile) */}
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-brand-bg w-[140px] sm:w-[180px]" />
                {selectedProducts.map((product) => (
                  <th key={product.id} className="p-3 align-top w-1/3 max-w-[260px]">
                    <div className="bg-white rounded-card shadow-card p-4">
                      <CameraPlaceholder brand={product.brand} />
                      <p className="text-xs font-body font-semibold text-accent-blue uppercase tracking-wider mt-3 mb-0.5">
                        {product.brand}
                      </p>
                      <h2 className="font-heading font-semibold text-base text-brand-black leading-snug">
                        {product.name}
                      </h2>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((row, rowIdx) => {
                const bestIndices = findBestIndices(selectedProducts, row);
                return (
                  <tr key={row.key} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-brand-bg'}>
                    <td className="sticky left-0 z-10 px-4 py-3 text-sm font-body font-semibold text-brand-steel whitespace-nowrap"
                      style={{ backgroundColor: rowIdx % 2 === 0 ? 'white' : undefined }}
                    >
                      {row.label}
                    </td>
                    {selectedProducts.map((product, colIdx) => {
                      const value = row.getValue(product);
                      const isBest = bestIndices.has(colIdx);

                      // Verfügbarkeit: farbiger Punkt
                      if (row.key === 'available') {
                        return (
                          <td key={product.id} className="px-4 py-3 text-sm font-body text-center">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${product.available ? 'bg-status-success' : 'bg-status-error'}`}
                                aria-hidden="true"
                              />
                              <span className={`font-medium ${product.available ? 'text-status-success' : 'text-status-error'}`}>
                                {value}
                              </span>
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={product.id}
                          className={`px-4 py-3 text-sm font-body text-center ${
                            isBest ? 'text-accent-blue font-bold' : 'text-brand-black'
                          }`}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* CTA-Zeile */}
              <tr>
                <td className="sticky left-0 z-10 px-4 py-4 bg-brand-bg" />
                {selectedProducts.map((product) => (
                  <td key={product.id} className="px-4 py-4 text-center">
                    {product.available ? (
                      <Link
                        href={`/kameras/${product.slug}/buchen`}
                        className="inline-block px-5 py-2.5 bg-brand-black text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors"
                      >
                        Jetzt buchen
                      </Link>
                    ) : (
                      <span className="inline-block px-5 py-2.5 bg-brand-bg text-brand-muted font-heading font-semibold text-sm rounded-[10px] border border-brand-border cursor-not-allowed">
                        Nicht verfügbar
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Zurück-Link */}
        <div className="mt-8 text-center">
          <Link
            href="/kameras"
            className="text-sm font-body text-accent-blue hover:underline"
          >
            &larr; Zurück zur Kameraübersicht
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VergleichPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <p className="font-body text-brand-steel">Vergleich wird geladen...</p>
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}

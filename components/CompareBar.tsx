'use client';

import { useRouter } from 'next/navigation';
import { useCompare } from '@/components/CompareProvider';
import { useProducts } from '@/components/ProductsProvider';
import { getBrandStyle } from '@/lib/brand-colors';
import { useBrandColors } from '@/hooks/useBrandColors';

function XIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

export default function CompareBar() {
  const { products } = useProducts();
  const router = useRouter();
  const { compareIds, removeFromCompare, clearCompare } = useCompare();
  const brandColorMap = useBrandColors();

  if (compareIds.length === 0) return null;

  const selectedProducts = compareIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);

  const handleCompare = () => {
    router.push(`/vergleich?ids=${compareIds.join(',')}`);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
      style={{ animation: 'slideUp 0.3s ease-out' }}
    >
      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div
        className="bg-white dark:bg-brand-dark border-t border-brand-border dark:border-white/10 shadow-[0_-4px_24px_rgba(0,0,0,0.1)]"
        style={{ paddingBottom: `env(safe-area-inset-bottom)` }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-4">
            {/* Produkt-Thumbnails */}
            <div className="flex items-center gap-3 flex-1 min-w-0 overflow-x-auto">
              {selectedProducts.map((product) => {
                if (!product) return null;
                const color = getBrandStyle(product.brand, brandColorMap).color;
                return (
                  <div key={product.id} className="flex items-center gap-2 flex-shrink-0">
                    {/* Farbiger Platzhalter */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${color}20`, border: `1.5px solid ${color}40` }}
                    >
                      <svg viewBox="0 0 24 18" fill="none" className="w-5 h-3.5" aria-hidden="true">
                        <rect x="2" y="5" width="20" height="11" rx="2" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1" />
                        <circle cx="12" cy="10.5" r="4" fill={color} fillOpacity="0.5" />
                        <circle cx="12" cy="10.5" r="2" fill={color} fillOpacity="0.7" />
                      </svg>
                    </div>
                    <span className="text-sm font-body font-medium text-brand-black dark:text-white hidden sm:block whitespace-nowrap max-w-[120px] truncate">
                      {product.name}
                    </span>
                    <span className="text-sm font-body font-medium text-brand-black dark:text-white sm:hidden whitespace-nowrap max-w-[80px] truncate">
                      {product.model}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFromCompare(product.id)}
                      className="p-0.5 rounded-full hover:bg-brand-bg dark:hover:bg-white/10 text-brand-muted dark:text-gray-400 hover:text-brand-black dark:hover:text-white transition-colors"
                      aria-label={`${product.name} aus Vergleich entfernen`}
                    >
                      <XIcon />
                    </button>
                  </div>
                );
              })}

              {/* Leere Slots */}
              {Array.from({ length: 3 - compareIds.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="w-10 h-10 rounded-lg border-2 border-dashed border-brand-border dark:border-white/10 flex-shrink-0 hidden sm:block"
                />
              ))}
            </div>

            {/* Aktionen */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={clearCompare}
                className="text-xs font-body text-brand-muted dark:text-gray-400 hover:text-brand-steel dark:hover:text-gray-300 transition-colors whitespace-nowrap hidden sm:block"
              >
                Alle entfernen
              </button>
              <button
                type="button"
                onClick={clearCompare}
                className="p-1.5 rounded-full hover:bg-brand-bg dark:hover:bg-white/10 text-brand-muted dark:text-gray-400 hover:text-brand-black dark:hover:text-white transition-colors sm:hidden"
                aria-label="Alle entfernen"
              >
                <XIcon />
              </button>
              <button
                type="button"
                onClick={handleCompare}
                disabled={compareIds.length < 2}
                className="px-5 py-2.5 bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Vergleichen ({compareIds.length})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

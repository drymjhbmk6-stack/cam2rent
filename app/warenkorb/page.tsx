'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/CartProvider';

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatEur(n: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}

export default function WarenkorbPage() {
  const { items, removeItem, cartTotal, itemCount } = useCart();
  const router = useRouter();

  if (itemCount === 0) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-16">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-white dark:bg-brand-dark rounded-full flex items-center justify-center mx-auto mb-6 shadow-card">
            <svg
              className="w-10 h-10 text-brand-muted dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
              />
            </svg>
          </div>
          <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-2">
            Dein Warenkorb ist leer
          </h1>
          <p className="text-brand-text dark:text-gray-300 text-sm mb-6">
            Entdecke unsere Action-Cams und konfiguriere deine Buchung.
          </p>
          <Link
            href="/kameras"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark dark:hover:bg-accent-blue/90 transition-colors"
          >
            Kameras entdecken
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/kameras"
            className="inline-flex items-center gap-1.5 text-sm text-brand-steel dark:text-gray-400 hover:text-brand-black dark:hover:text-white mb-3 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Weiter shoppen
          </Link>
          <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white">
            Warenkorb{' '}
            <span className="text-brand-muted dark:text-gray-500 font-body text-base">
              ({itemCount} {itemCount === 1 ? 'Artikel' : 'Artikel'})
            </span>
          </h1>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Cart items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div key={item.id} className="bg-white dark:bg-brand-dark rounded-card shadow-card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-heading font-semibold text-brand-black dark:text-white">
                      {item.productName}
                    </h2>
                    <p className="text-xs text-brand-muted dark:text-gray-500 mt-0.5">
                      {item.days} {item.days === 1 ? 'Tag' : 'Tage'}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-brand-muted dark:text-gray-500 hover:text-status-error transition-colors flex-shrink-0 p-1"
                    aria-label="Artikel entfernen"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div>
                    <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Mietstart</p>
                    <p className="text-sm font-medium text-brand-black dark:text-white">
                      {formatDate(item.rentalFrom)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Rückgabe</p>
                    <p className="text-sm font-medium text-brand-black dark:text-white">
                      {formatDate(item.rentalTo)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Miete</p>
                    <p className="text-sm font-medium text-brand-black dark:text-white">
                      {formatEur(item.priceRental)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Subtotal</p>
                    <p className="text-sm font-bold text-brand-black dark:text-white">
                      {formatEur(item.subtotal)}
                    </p>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {item.haftung !== 'none' && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-accent-blue-soft text-accent-blue font-medium">
                      {item.haftung === 'standard' ? 'Standard-Schutz' : 'Premium-Schutz'} (+{formatEur(item.priceHaftung)})
                    </span>
                  )}
                  {item.accessories.length > 0 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-brand-bg dark:bg-brand-black text-brand-steel dark:text-gray-400 font-medium">
                      +{item.accessories.length} Zubehör (+{formatEur(item.priceAccessories)})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-5 sticky top-24">
              <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
                Zusammenfassung
              </h2>

              <div className="space-y-2 mb-4">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-brand-text dark:text-gray-300 truncate pr-2">
                      {item.productName}
                    </span>
                    <span className="text-brand-black dark:text-white font-medium flex-shrink-0">
                      {formatEur(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-brand-border dark:border-white/10 pt-3 mb-1">
                <div className="flex justify-between">
                  <span className="font-heading font-semibold text-brand-black dark:text-white">
                    Zwischensumme
                  </span>
                  <span className="font-heading font-bold text-brand-black dark:text-white">
                    {formatEur(cartTotal)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-brand-muted dark:text-gray-500 mb-5">
                Versand wird im nächsten Schritt berechnet.
              </p>

              <button
                onClick={() => router.push('/checkout')}
                className="w-full py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark dark:hover:bg-accent-blue/90 transition-colors"
              >
                Weiter zum Checkout
              </button>

              {/* Trust */}
              <div className="mt-4 pt-4 border-t border-brand-border dark:border-white/10 flex items-center gap-2 justify-center text-xs text-brand-muted dark:text-gray-500">
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Sichere Zahlung via Stripe
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

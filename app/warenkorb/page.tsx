'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/CartProvider';
import { fmtDate, fmtEuro } from '@/lib/format-utils';
import { calcShipping, shippingConfig as defaultShippingConfig, type ShippingConfig } from '@/data/shipping';

export default function WarenkorbPage() {
  const { items, removeItem, cartTotal, itemCount } = useCart();
  const router = useRouter();
  const [showDateModal, setShowDateModal] = useState(false);

  // Dynamische Shipping-Config aus DB nachladen, damit der hier angezeigte
  // Versandpreis exakt dem entspricht, was im Checkout berechnet wird.
  // Fallback: Werte aus data/shipping.ts.
  const [dynShipping, setDynShipping] = useState<ShippingConfig>(defaultShippingConfig);
  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => {
        if (d?.shipping) setDynShipping(d.shipping);
      })
      .catch(() => {});
  }, []);

  // Default: Versand + Standard. Im Checkout kann der Kunde umstellen.
  const shipping = useMemo(
    () => calcShipping(cartTotal, 'standard', 'versand', dynShipping),
    [cartTotal, dynShipping],
  );
  const grandTotal = cartTotal + shipping.price;

  // Artikel nach Mietzeitraum gruppieren
  const periodGroups = useMemo(() => {
    const groups: Record<string, typeof items> = {};
    for (const item of items) {
      const key = `${item.rentalFrom}_${item.rentalTo}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).map(([key, groupItems]) => {
      const [from, to] = key.split('_');
      const groupTotal = groupItems.reduce((s, i) => s + i.subtotal, 0);
      return { from, to, items: groupItems, key, total: groupTotal };
    });
  }, [items]);
  const hasMultiplePeriods = periodGroups.length > 1;

  const handleCheckout = () => {
    if (hasMultiplePeriods) {
      setShowDateModal(true);
    } else {
      router.push('/checkout');
    }
  };

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
            {periodGroups.map((group, gi) => (
              <div key={group.key} className="space-y-4">
                {/* Gruppen-Header bei unterschiedlichen Zeitraeumen */}
                {hasMultiplePeriods && (
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-accent-blue/10 text-accent-blue text-xs font-heading font-bold rounded-full">
                      Buchung {gi + 1}
                    </span>
                    <span className="text-xs text-brand-muted dark:text-gray-500">
                      {fmtDate(group.from)} – {fmtDate(group.to)} · {group.items[0].days} {group.items[0].days === 1 ? 'Tag' : 'Tage'}
                    </span>
                  </div>
                )}
                {group.items.map((item) => (
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
                          {fmtDate(item.rentalFrom)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Rückgabe</p>
                        <p className="text-sm font-medium text-brand-black dark:text-white">
                          {fmtDate(item.rentalTo)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Miete</p>
                        <p className="text-sm font-medium text-brand-black dark:text-white">
                          {fmtEuro(item.priceRental)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Gesamt</p>
                        <p className="text-sm font-bold text-brand-black dark:text-white">
                          {fmtEuro(item.subtotal)}
                        </p>
                      </div>
                    </div>

                    {/* Zubehör + Set + Haftung */}
                    <div className="flex flex-wrap gap-1.5">
                      {item.haftung !== 'none' && (
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-accent-blue-soft text-accent-blue font-medium">
                          {item.haftung === 'standard' ? 'Standard-Schutz' : 'Premium-Schutz'}
                        </span>
                      )}
                      {item.accessories.map((accId) => (
                        <span key={accId} className="px-2 py-0.5 text-[10px] rounded-full bg-brand-bg dark:bg-white/5 text-brand-steel dark:text-gray-400">
                          {accId.replace(/-[a-z0-9]{6,}$/, '').split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </span>
                      ))}
                    </div>

                    {/* Versand-Info — nur wenn EIN Artikel im Cart, sonst */}
                    {/* uebernimmt die rechte Summary die einmalige Anzeige */}
                    {itemCount === 1 && (
                      <div className="mt-3 pt-3 border-t border-brand-border dark:border-white/10 flex justify-between items-center text-sm">
                        <span className="text-brand-text dark:text-gray-300">
                          + Hin- und Rückversand (Standard)
                        </span>
                        <span className="font-medium text-brand-black dark:text-white">
                          {shipping.isFree ? 'Gratis' : fmtEuro(shipping.price)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* Weitere Kamera hinzufuegen */}
            <Link
              href="/kameras"
              className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-brand-border dark:border-white/10 rounded-card text-sm font-heading font-semibold text-brand-steel dark:text-gray-400 hover:border-accent-blue hover:text-accent-blue transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Weitere Kamera hinzufuegen
            </Link>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-5 sticky top-24">
              <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
                Zusammenfassung
              </h2>

              <div className="space-y-2 mb-4">
                {hasMultiplePeriods ? (
                  periodGroups.map((group, gi) => (
                    <div key={group.key}>
                      <p className="text-[10px] font-heading font-bold text-brand-muted dark:text-gray-500 uppercase tracking-wider mb-1 mt-2 first:mt-0">
                        Buchung {gi + 1} · {fmtDate(group.from)} – {fmtDate(group.to)}
                      </p>
                      {group.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-brand-text dark:text-gray-300 truncate pr-2">
                            {item.productName}
                          </span>
                          <span className="text-brand-black dark:text-white font-medium flex-shrink-0">
                            {fmtEuro(item.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-brand-text dark:text-gray-300 truncate pr-2">
                        {item.productName}
                      </span>
                      <span className="text-brand-black dark:text-white font-medium flex-shrink-0">
                        {fmtEuro(item.subtotal)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-brand-border dark:border-white/10 pt-3 space-y-2 mb-3">
                <div className="flex justify-between items-baseline gap-2 text-sm">
                  <span className="text-brand-text dark:text-gray-300">Zwischensumme</span>
                  <span className="text-brand-black dark:text-white font-medium whitespace-nowrap flex-shrink-0">
                    {fmtEuro(cartTotal)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-2 text-sm">
                  <span className="text-brand-text dark:text-gray-300">
                    Hin- und Rückversand (Standard)
                  </span>
                  <span className="text-brand-black dark:text-white font-medium whitespace-nowrap flex-shrink-0">
                    {shipping.isFree ? 'Gratis' : fmtEuro(shipping.price)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-2 pt-2 border-t border-brand-border dark:border-white/10">
                  <span className="font-heading font-semibold text-brand-black dark:text-white">
                    Gesamt
                  </span>
                  <span className="font-heading font-bold text-brand-black dark:text-white whitespace-nowrap flex-shrink-0">
                    {fmtEuro(grandTotal)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-brand-muted dark:text-gray-500 mb-5">
                Versandart (Express oder Abholung) kann im Checkout geändert werden.
              </p>

              <button
                onClick={handleCheckout}
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

      {/* Modal: Unterschiedliche Mietzeitraeume */}
      {showDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6 sm:p-8 max-w-md w-full">
            <h3 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-2">
              {periodGroups.length} separate Buchungen
            </h3>
            <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-4 leading-relaxed">
              Deine Kameras haben unterschiedliche Mietzeiträume.
              Es werden <strong className="text-brand-black dark:text-white">{periodGroups.length} separate Buchungen</strong> erstellt:
            </p>
            <div className="space-y-2 mb-6">
              {periodGroups.map((group, gi) => (
                <div key={group.key} className="flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full bg-accent-blue/10 text-accent-blue text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {gi + 1}
                  </span>
                  <span className="text-brand-black dark:text-white font-medium">
                    {group.items.map((it) => it.productName).join(', ')}
                  </span>
                  <span className="text-brand-muted dark:text-gray-500 text-xs ml-auto flex-shrink-0">
                    {fmtDate(group.from)} – {fmtDate(group.to)}
                  </span>
                </div>
              ))}
            </div>
            <p className="font-body text-xs text-brand-muted dark:text-gray-500 mb-5">
              Du bezahlst am Ende trotzdem nur einmal.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => setShowDateModal(false)}
                className="flex-1 py-2.5 border border-brand-border dark:border-white/10 text-brand-black dark:text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-bg dark:hover:bg-white/5 transition-colors">
                Zurück zum Warenkorb
              </button>
              <button onClick={() => { setShowDateModal(false); router.push('/checkout'); }}
                className="flex-1 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors">
                Fortfahren →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

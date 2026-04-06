'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { accessories } from '@/data/accessories';
import type { RentalSet } from '@/data/sets';

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductAccessorySets() {
  const [sets, setSets] = useState<RentalSet[]>([]);
  const [openSetId, setOpenSetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sets?available=true')
      .then((r) => r.json())
      .then((d) => {
        if (d.sets) setSets(d.sets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const availableAccessories = accessories.filter((a) => a.available);

  function toggleSet(id: string) {
    setOpenSetId(openSetId === id ? null : id);
  }

  return (
    <div>
      <h2 className="font-heading font-bold text-xl sm:text-2xl text-brand-black dark:text-gray-100 mb-6">
        Passendes Zubehör & Sets
      </h2>

      <div className="grid md:grid-cols-2 gap-6">
        {/* ── Links: Sets (Akkordeon) ── */}
        <div>
          <h3 className="font-heading font-semibold text-sm text-brand-muted dark:text-gray-500 uppercase tracking-wider mb-3">
            Sets
          </h3>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {sets.map((set) => (
                <div
                  key={set.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-brand-border dark:border-gray-700 overflow-hidden"
                >
                  {/* Set header */}
                  <button
                    type="button"
                    onClick={() => toggleSet(set.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-brand-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-heading font-semibold text-sm text-brand-black dark:text-gray-100 truncate">
                        {set.name}
                      </span>
                      {set.badge && (
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${set.badgeColor || 'bg-accent-blue text-white'}`}>
                          {set.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-heading font-bold text-accent-blue">
                        {set.price > 0
                          ? `${set.price.toFixed(2).replace('.', ',')} € ${set.pricingMode === 'perDay' ? '/ Tag' : ''}`
                          : 'Preis auf Anfrage'}
                      </span>
                      <svg
                        className={`w-4 h-4 text-brand-muted transition-transform ${openSetId === set.id ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Set details (expanded) */}
                  {openSetId === set.id && (
                    <div className="px-4 pb-3 pt-1 border-t border-brand-border dark:border-gray-700">
                      {set.includedItems.length > 0 ? (
                        <ul className="space-y-1">
                          {set.includedItems.map((item, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-brand-text dark:text-gray-300">
                              <span className="w-1 h-1 rounded-full bg-accent-blue flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-brand-muted dark:text-gray-500">Keine Details verfügbar</p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {sets.length === 0 && (
                <p className="text-xs text-brand-muted dark:text-gray-500 py-2">Keine Sets verfügbar</p>
              )}
            </div>
          )}
        </div>

        {/* ── Rechts: Zubehör (Liste) ── */}
        <div>
          <h3 className="font-heading font-semibold text-sm text-brand-muted dark:text-gray-500 uppercase tracking-wider mb-3">
            Zubehör
          </h3>

          <div className="space-y-1.5">
            {availableAccessories.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-brand-border dark:border-gray-700"
              >
                <span className="font-heading font-semibold text-sm text-brand-black dark:text-gray-100">
                  {acc.name}
                </span>
                <span className="text-sm font-heading font-bold text-accent-blue flex-shrink-0">
                  {acc.price.toFixed(2).replace('.', ',')} € {acc.pricingMode === 'perDay' ? '/ Tag' : 'einmalig'}
                </span>
              </div>
            ))}

            {availableAccessories.length === 0 && (
              <p className="text-xs text-brand-muted dark:text-gray-500 py-2">Kein Zubehör verfügbar</p>
            )}
          </div>
        </div>
      </div>

      {/* Eigenes Set zusammenstellen */}
      <div className="mt-6 p-4 bg-gradient-to-r from-accent-blue-soft/50 to-accent-teal-soft/50 dark:from-accent-blue/10 dark:to-accent-teal/10 rounded-card border border-brand-border dark:border-gray-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-heading font-semibold text-brand-black dark:text-gray-100 mb-0.5">
              Eigenes Set zusammenstellen
            </h3>
            <p className="text-xs font-body text-brand-steel dark:text-gray-400">
              Kombiniere Kamera und Zubehör frei. Dein Set wird im Kundenkonto gespeichert.
            </p>
          </div>
          <Link
            href="/set-konfigurator"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors whitespace-nowrap"
          >
            Zum Konfigurator
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

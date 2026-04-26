'use client';

import { useEffect, useState } from 'react';

interface UgcItem {
  id: string;
  url: string;
  caption: string | null;
  authorName: string | null;
}

/**
 * Kundenmaterial-Galerie auf der Startseite — zeigt freigegebene UGC-Bilder
 * mit Web/Social-Consent. Komponente versteckt sich wenn keine Bilder da sind.
 */
export default function HomeUgc() {
  const [items, setItems] = useState<UgcItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<UgcItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/home-ugc')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        if (!cancelled) setItems(d.items ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || items.length < 3) return null;

  return (
    <section className="py-16 bg-white dark:bg-brand-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-white mb-2">
            So sieht&apos;s bei unseren Kunden aus
          </h2>
          <p className="text-brand-steel dark:text-gray-400 text-sm">
            Fotos und Videos echter Cam2Rent-Mieten — danke fürs Teilen!
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item)}
              className="relative aspect-square overflow-hidden rounded-lg bg-brand-bg dark:bg-brand-dark group"
              aria-label={item.caption ?? 'Kundenfoto'}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.caption ?? 'Kundenfoto'}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {item.authorName && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-white text-[11px] font-body truncate">{item.authorName}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {active && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setActive(null)}
        >
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={active.caption ?? 'Kundenfoto'}
              className="w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="mt-3 text-center text-white">
              {active.caption && <p className="font-body text-sm mb-1">„{active.caption}&ldquo;</p>}
              {active.authorName && <p className="text-xs text-white/60">— {active.authorName}</p>}
            </div>
            <button
              onClick={() => setActive(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center text-xl"
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

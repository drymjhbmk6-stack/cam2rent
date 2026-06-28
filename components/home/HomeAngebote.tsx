'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProducts } from '@/components/ProductsProvider';
import { fmtEuro } from '@/lib/format-utils';
import type { Angebot } from '@/data/angebote';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  });
}

/**
 * Werbe-Section auf der Startseite: zeigt die aktuell gueltigen Angebote
 * (Festpreis-Pakete) als Karten. Versteckt sich automatisch, wenn keine
 * aktiven Angebote vorliegen. Jede Karte verlinkt direkt in den
 * Buchungsflow der guenstigsten Kamera-Option (`?offer=`).
 */
export default function HomeAngebote() {
  const { products } = useProducts();
  const [angebote, setAngebote] = useState<Angebot[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/angebote')
      .then((r) => (r.ok ? r.json() : { angebote: [] }))
      .then((d) => {
        if (Array.isArray(d?.angebote)) setAngebote(d.angebote);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  // Nur Angebote mit auflöesbarer Kamera anzeigen.
  const cards = angebote
    .map((a) => {
      const cams = a.camera_options
        .map((c) => ({ opt: c, product: products.find((p) => p.id === c.product_id) }))
        .filter((x) => x.product);
      if (cams.length === 0) return null;
      const cheapest = cams.reduce((min, c) => (c.opt.price < min.opt.price ? c : min), cams[0]);
      const img = a.image_url || cheapest.product?.images?.[0] || null;
      return { a, cams, cheapest, img };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (cards.length === 0) return null;

  return (
    <section className="py-10 bg-brand-bg dark:bg-gray-800 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <span className="inline-block px-3 py-1 bg-accent-amber/15 text-accent-amber rounded-full text-xs font-heading font-bold uppercase tracking-wide mb-2">
              Zeitlich begrenzt
            </span>
            <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100">
              Aktuelle Angebote
            </h2>
            <p className="text-sm font-body text-brand-steel dark:text-gray-400 mt-1">
              Festpreis-Pakete aus Kamera und passendem Zubehör.
            </p>
          </div>
          <Link
            href="/angebote"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-heading font-semibold text-accent-blue hover:underline whitespace-nowrap flex-shrink-0"
          >
            Alle ansehen
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ a, cheapest, img }) => (
            <Link
              key={a.id}
              href={`/kameras/${cheapest.product!.slug}/buchen?offer=${encodeURIComponent(a.id)}`}
              className="group bg-white dark:bg-gray-900 rounded-card shadow-card overflow-hidden flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt={a.name}
                  className="w-full h-44 object-contain bg-brand-bg dark:bg-gray-800"
                />
              )}
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {a.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-heading font-semibold ${a.badge_color || 'bg-accent-blue text-white'}`}>
                      {a.badge}
                    </span>
                  )}
                </div>
                <h3 className="font-heading font-bold text-lg text-brand-black dark:text-gray-100 leading-tight">
                  {a.name}
                </h3>
                {a.description && (
                  <p className="text-sm font-body text-brand-steel dark:text-gray-400 mt-1 line-clamp-2">
                    {a.description}
                  </p>
                )}
                {a.valid_until && (
                  <p className="text-xs font-body text-brand-muted dark:text-gray-500 mt-2">
                    Gültig bis {fmtDate(a.valid_until)}
                    {a.pricing_mode === 'flat' && a.fixed_days ? ` · ${a.fixed_days} Tage` : ' · Preis pro Tag'}
                  </p>
                )}
                <div className="mt-auto pt-4 flex items-end justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="text-xs font-body text-brand-steel dark:text-gray-400">ab</span>
                    <span className="font-heading font-bold text-xl text-accent-blue">
                      {fmtEuro(cheapest.opt.price)}
                      {a.pricing_mode === 'perDay' ? <span className="text-sm font-semibold"> /Tag</span> : ''}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-heading font-semibold text-accent-blue group-hover:gap-2 transition-all">
                    Sichern
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                      <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 sm:hidden">
          <Link
            href="/angebote"
            className="inline-flex items-center gap-1 text-sm font-heading font-semibold text-accent-blue hover:underline"
          >
            Alle Angebote ansehen
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

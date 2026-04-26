'use client';

import Link from 'next/link';
import { useProducts } from '@/components/ProductsProvider';
import type { Product } from '@/data/products';

/**
 * "Frisch reingekommen / Bald verfügbar"-Block auf der Startseite.
 * - "Demnächst verfügbar": Produkte ohne Seriennummern (hasUnits=false)
 *   → Wartelisten-Kandidaten
 * - "Frisch im Shop": Erste 3 Produkte mit Units (Reihenfolge wie in admin_config)
 *
 * Komponente versteckt sich, wenn beide Blöcke leer waeren.
 */
export default function HomeFresh() {
  const { products } = useProducts();

  const upcoming: Product[] = products.filter((p) => p.hasUnits === false).slice(0, 3);
  const fresh: Product[] = products.filter((p) => p.hasUnits !== false).slice(0, 3);

  if (fresh.length === 0 && upcoming.length === 0) return null;

  return (
    <section className="py-12 bg-white dark:bg-brand-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {fresh.length > 0 && (
            <FreshBlock
              badge="✨ Frisch im Shop"
              title="Neue Kameras"
              description="Erstmal als Letztes ins Sortiment gekommen"
              accentClass="from-emerald-500/15 to-emerald-500/0 border-emerald-500/30"
              products={fresh}
            />
          )}
          {upcoming.length > 0 && (
            <FreshBlock
              badge="🔔 Demnächst verfügbar"
              title="Bald wieder da"
              description="Auf die Warteliste setzen — Benachrichtigung bei Verfügbarkeit"
              accentClass="from-cyan-500/15 to-cyan-500/0 border-cyan-500/30"
              products={upcoming}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function FreshBlock({
  badge,
  title,
  description,
  accentClass,
  products,
}: {
  badge: string;
  title: string;
  description: string;
  accentClass: string;
  products: Product[];
}) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${accentClass} p-5 sm:p-6 backdrop-blur-sm`}>
      <span className="inline-block text-xs font-heading font-bold uppercase tracking-wide text-brand-black dark:text-white mb-2">
        {badge}
      </span>
      <h3 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-1">{title}</h3>
      <p className="font-body text-xs text-brand-steel dark:text-gray-400 mb-4">{description}</p>

      <div className="space-y-2">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/kameras/${p.slug}`}
            className="flex items-center gap-3 p-2 rounded-lg bg-white/60 dark:bg-brand-dark/60 hover:bg-white dark:hover:bg-brand-dark transition-colors"
          >
            {p.images?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.images[0]}
                alt={p.name}
                className="w-12 h-12 object-cover rounded flex-shrink-0"
                loading="lazy"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-heading font-semibold text-sm text-brand-black dark:text-white truncate">
                {p.name}
              </p>
              <p className="font-body text-xs text-brand-steel dark:text-gray-400 truncate">
                {p.brand}
              </p>
            </div>
            <svg className="w-4 h-4 text-brand-steel flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

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
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Fallback fuer accessory_ids, die wir nicht aufloesen koennen (geloeschtes
 * Zubehoer). Kappt den auto-generierten Random-Suffix (`-<6-8 alphanum>`),
 * ersetzt Bindestriche durch Leerzeichen und macht Title Case.
 */
function humanizeAccessoryId(id: string): string {
  const trimmed = id.replace(/-[a-z0-9]{6,10}$/i, '');
  const words = (trimmed || id).split(/[-_]+/).filter(Boolean);
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

export default function AngebotePage() {
  const { products } = useProducts();
  const [angebote, setAngebote] = useState<Angebot[]>([]);
  const [accNames, setAccNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/angebote')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.angebote)) setAngebote(d.angebote);
        if (d?.accessory_names && typeof d.accessory_names === 'object') {
          setAccNames(d.accessory_names as Record<string, string>);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-gray-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100">
            Aktuelle Angebote
          </h1>
          <p className="text-sm font-body text-brand-steel dark:text-gray-400 mt-1">
            Zeitlich begrenzte Festpreis-Pakete aus Kamera und passendem Zubehör.
          </p>
        </div>

        {loading ? (
          <p className="font-body text-brand-steel dark:text-gray-400">Lädt…</p>
        ) : angebote.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-card shadow-card p-8 text-center">
            <p className="font-heading font-semibold text-brand-black dark:text-gray-100">
              Aktuell keine Angebote verfügbar
            </p>
            <p className="text-sm font-body text-brand-steel dark:text-gray-400 mt-1">
              Schau bald wieder vorbei — oder stöbere direkt in unseren{' '}
              <Link href="/kameras" className="text-accent-blue hover:underline">Kameras</Link>.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {angebote.map((a) => {
              const cams = a.camera_options
                .map((c) => ({ opt: c, product: products.find((p) => p.id === c.product_id) }))
                .filter((x) => x.product);
              if (cams.length === 0) return null;
              const fallbackImg = cams[0].product?.images?.[0] ?? null;
              const img = a.image_url || fallbackImg;
              return (
                <div key={a.id} className="bg-white dark:bg-gray-900 rounded-card shadow-card overflow-hidden flex flex-col">
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={a.name} className="w-full h-44 object-contain bg-brand-bg dark:bg-gray-800" />
                  )}
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h2 className="font-heading font-bold text-lg text-brand-black dark:text-gray-100">{a.name}</h2>
                      {a.badge && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-heading font-semibold ${a.badge_color || 'bg-accent-blue text-white'}`}>
                          {a.badge}
                        </span>
                      )}
                    </div>
                    {a.description && (
                      <p className="text-sm font-body text-brand-steel dark:text-gray-400 mb-2">{a.description}</p>
                    )}
                    {(a.valid_from || a.valid_until) && (
                      <p className="text-xs font-body text-brand-muted dark:text-gray-500 mb-3">
                        Gültig {a.valid_from ? `ab ${fmtDate(a.valid_from)}` : ''}{a.valid_from && a.valid_until ? ' ' : ''}{a.valid_until ? `bis ${fmtDate(a.valid_until)}` : ''}
                        {a.pricing_mode === 'flat' && a.fixed_days ? ` · Mietdauer ${a.fixed_days} Tage` : ' · Preis pro Tag'}
                      </p>
                    )}
                    <div className="mt-auto space-y-3">
                      {cams.map(({ opt, product }) => {
                        const accLines = opt.accessory_items.map((it) => {
                          const name = accNames[it.accessory_id] ?? humanizeAccessoryId(it.accessory_id);
                          return it.qty > 1 ? `${it.qty}× ${name}` : name;
                        });
                        return (
                          <Link
                            key={opt.product_id}
                            href={`/kameras/${product!.slug}/buchen?offer=${encodeURIComponent(a.id)}`}
                            className="block px-4 py-3 rounded-xl border border-brand-border dark:border-gray-700 hover:border-accent-blue hover:bg-accent-blue-soft/30 transition-colors"
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="font-heading font-semibold text-sm text-brand-black dark:text-gray-100">
                                {product!.name}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="font-heading font-bold text-sm text-accent-blue">
                                  {fmtEuro(opt.price)}{a.pricing_mode === 'perDay' ? ' /Tag' : ''}
                                </span>
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-accent-blue" aria-hidden="true">
                                  <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                                </svg>
                              </span>
                            </span>
                            {accLines.length > 0 && (
                              <span className="block text-xs font-body text-brand-steel dark:text-gray-400 mt-1">
                                Inkl.: {accLines.join(' · ')}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

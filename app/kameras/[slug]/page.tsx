import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { products, getPriceForDays, getMergedSpecs, type Product } from '@/data/products';
import { accessories } from '@/data/accessories';
import { RENTAL_SETS_STATIC } from '@/data/sets';
import ProductReviews from '@/components/ProductReviews';
import SpecIcon from '@/components/SpecIcon';
import AvailabilityCalendar from '@/components/AvailabilityCalendar';
import MarkdownContent from '@/components/MarkdownContent';

// ─── Static generation ──────────────────────────────────────────────────────

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = products.find((p) => p.slug === slug);
  if (!product) return {};
  return {
    title: `${product.name} mieten – Cam2Rent`,
    description: product.description,
  };
}

// ─── Brand config ────────────────────────────────────────────────────────────

const brandConfig: Record<
  Product['brand'],
  { bg: string; color: string; pill: string }
> = {
  GoPro: {
    bg: 'bg-accent-blue-soft',
    color: '#3b82f6',
    pill: 'bg-accent-blue-soft text-accent-blue',
  },
  DJI: {
    bg: 'bg-accent-teal-soft',
    color: '#0d9488',
    pill: 'bg-accent-teal-soft text-accent-teal',
  },
  Insta360: {
    bg: 'bg-accent-amber-soft',
    color: '#f59e0b',
    pill: 'bg-accent-amber-soft text-accent-amber',
  },
};

// ─── Camera SVG placeholder ──────────────────────────────────────────────────

function CameraPlaceholder({ brand, size = 'lg' }: { brand: Product['brand']; size?: 'lg' | 'sm' }) {
  const color = brandConfig[brand].color;
  const dim = size === 'lg' ? { w: 160, h: 120, vw: '0 0 160 120' } : { w: 48, h: 36, vw: '0 0 48 36' };

  return (
    <svg
      viewBox={dim.vw}
      fill="none"
      style={{ width: size === 'lg' ? 160 : 48, height: size === 'lg' ? 120 : 36 }}
      aria-hidden="true"
    >
      <rect
        x={size === 'lg' ? 12 : 3}
        y={size === 'lg' ? 20 : 7}
        width={size === 'lg' ? 136 : 42}
        height={size === 'lg' ? 82 : 22}
        rx={size === 'lg' ? 10 : 3}
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth={size === 'lg' ? 2.5 : 1.5}
      />
      <circle
        cx={size === 'lg' ? 80 : 24}
        cy={size === 'lg' ? 61 : 18}
        r={size === 'lg' ? 26 : 8}
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth={size === 'lg' ? 2.5 : 1.5}
      />
      <circle
        cx={size === 'lg' ? 80 : 24}
        cy={size === 'lg' ? 61 : 18}
        r={size === 'lg' ? 16 : 5}
        fill={color}
        fillOpacity="0.35"
      />
      <circle
        cx={size === 'lg' ? 80 : 24}
        cy={size === 'lg' ? 61 : 18}
        r={size === 'lg' ? 8 : 2.5}
        fill={color}
        fillOpacity="0.65"
      />
      <rect
        x={size === 'lg' ? 56 : 16}
        y={size === 'lg' ? 8 : 2}
        width={size === 'lg' ? 32 : 10}
        height={size === 'lg' ? 14 : 6}
        rx={size === 'lg' ? 4 : 1.5}
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth={size === 'lg' ? 2.5 : 1.5}
      />
      <circle
        cx={size === 'lg' ? 128 : 38}
        cy={size === 'lg' ? 32 : 11}
        r={size === 'lg' ? 5 : 1.5}
        fill={color}
        fillOpacity="0.5"
      />
    </svg>
  );
}

// Spec-Icons und PriceCard wurden in SpecIcon-Komponente bzw. getMergedSpecs ausgelagert

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function KameraDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = products.find((p) => p.slug === slug);

  if (!product) notFound();

  const brand = brandConfig[product.brand];

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-gray-950">
      {/* ── Breadcrumb ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-brand-border dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav aria-label="Brotkrume">
            <ol className="flex items-center gap-2 text-sm font-body flex-wrap">
              <li>
                <Link href="/" className="text-brand-steel dark:text-gray-400 hover:text-accent-blue transition-colors">
                  Startseite
                </Link>
              </li>
              <li aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-brand-muted" aria-hidden="true">
                  <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </li>
              <li>
                <Link href="/kameras" className="text-brand-steel dark:text-gray-400 hover:text-accent-blue transition-colors">
                  Kameras
                </Link>
              </li>
              <li aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-brand-muted" aria-hidden="true">
                  <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </li>
              <li>
                <span className="text-brand-black dark:text-gray-100 font-medium" aria-current="page">
                  {product.name}
                </span>
              </li>
            </ol>
          </nav>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="lg:grid lg:grid-cols-7 lg:gap-10">

          {/* ── Left: Images ── */}
          <div className="lg:col-span-4">
            {/* Main image */}
            <div
              className={`relative rounded-card overflow-hidden ${brand.bg} flex items-center justify-center`}
              style={{ aspectRatio: '4/3' }}
            >
              {/* Availability overlay if unavailable */}
              {!product.available && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
                  <span className="px-4 py-2 bg-status-error text-white font-heading font-bold text-sm rounded-full shadow-lg">
                    Aktuell ausgebucht
                  </span>
                </div>
              )}
              <CameraPlaceholder brand={product.brand} size="lg" />
              <p className="absolute bottom-4 left-0 right-0 text-center text-xs font-body text-brand-muted/60 select-none">
                Foto folgt
              </p>
            </div>

            {/* Thumbnail row (prepared for real images) */}
            <div className="mt-3 grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <button
                  key={i}
                  type="button"
                  className={`aspect-square rounded-xl overflow-hidden ${brand.bg} flex items-center justify-center border-2 transition-colors ${
                    i === 0 ? 'border-accent-blue' : 'border-transparent hover:border-brand-border'
                  }`}
                  aria-label={`Bild ${i + 1} anzeigen`}
                >
                  <CameraPlaceholder brand={product.brand} size="sm" />
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: Product info (sticky) ── */}
          <div className="mt-8 lg:mt-0 lg:col-span-3">
            <div className="lg:sticky lg:top-24 space-y-6">

              {/* Tags + Brand + Name */}
              <div>
                {/* Tags zuerst */}
                {product.tags.length > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    {product.tags.map((tag) => {
                      const tagMap = {
                        popular: { label: 'Beliebt', cls: 'bg-accent-blue text-white' },
                        new: { label: 'Neu', cls: 'bg-accent-teal text-white' },
                        deal: { label: 'Angebot', cls: 'bg-accent-amber text-white' },
                      };
                      return (
                        <span key={tag} className={`px-2.5 py-1 rounded-full text-xs font-heading font-semibold ${tagMap[tag].cls}`}>
                          {tagMap[tag].label}
                        </span>
                      );
                    })}
                  </div>
                )}
                {/* Brand Badge */}
                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-heading font-semibold uppercase tracking-wider ${brand.pill} mb-2`}>
                  {product.brand}
                </span>

                <h1 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black dark:text-gray-100 leading-tight">
                  {product.name}
                </h1>
                <div className="mt-2">
                  <MarkdownContent>{product.description}</MarkdownContent>
                </div>
              </div>

              {/* Availability + stock */}
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    product.available ? 'bg-status-success' : 'bg-status-error'
                  }`}
                  aria-hidden="true"
                />
                <span className={`text-sm font-body font-semibold ${product.available ? 'text-status-success' : 'text-status-error'}`}>
                  {product.available
                    ? `Verfügbar – noch ${product.stock} ${product.stock === 1 ? 'Exemplar' : 'Exemplare'}`
                    : 'Aktuell ausgebucht'}
                </span>
              </div>

              {/* Preis */}
              <div className="rounded-xl bg-accent-blue-soft border border-accent-blue/20 p-5 text-center">
                <p className="text-xs font-body font-semibold text-accent-blue uppercase tracking-wider mb-1">
                  Mietpreis
                </p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-xs font-body text-accent-blue/70">ab</span>
                  <span className="font-heading font-bold text-3xl text-accent-blue">
                    {getPriceForDays(product, 1).toFixed(2).replace('.', ',')} €
                  </span>
                  <span className="text-sm font-body text-accent-blue/70">/ Tag</span>
                </div>
                <p className="text-xs font-body text-accent-blue/60 mt-1">
                  Genauer Preis wird bei der Buchung nach Zeitraum berechnet
                </p>
              </div>

              {/* Kaution ODER Haftungsschutz (nie beides) */}
              <div className="rounded-xl bg-brand-bg dark:bg-gray-800 border border-brand-border dark:border-gray-700 p-4">
                {product.offersHaftungsoption ? (
                  /* Haftungsschutz-Info */
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={1.75} className="w-4 h-4" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-body font-semibold text-brand-black dark:text-gray-100">Haftungsschutz (optional)</p>
                      <p className="text-xs font-body text-brand-steel dark:text-gray-400 mb-2">Wählbar beim Buchungsabschluss</p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-body">
                          <span className="text-brand-steel">Standard – max. 150 € Eigenbeteiligung</span>
                          <span className="font-semibold text-brand-black">15 €</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-body">
                          <span className="text-brand-steel">Premium – keine Eigenbeteiligung</span>
                          <span className="font-semibold text-brand-black">25 €</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Kaution-Info */
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={1.75} className="w-4 h-4" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-body font-semibold text-brand-black dark:text-gray-100">Kaution</p>
                        <p className="text-xs font-body text-brand-steel dark:text-gray-400">Wird vorläufig reserviert und nach Rückgabe freigegeben</p>
                      </div>
                    </div>
                    <span className="font-heading font-bold text-brand-black text-sm whitespace-nowrap">
                      {product.deposit} €
                    </span>
                  </div>
                )}
              </div>

              {/* CTA */}
              {product.available ? (
                <Link
                  href={`/kameras/${product.slug}/buchen`}
                  className="block w-full text-center px-6 py-4 bg-brand-black dark:bg-accent-blue text-white font-heading font-bold text-base rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors shadow-md shadow-black/10"
                >
                  Jetzt mieten
                </Link>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    disabled
                    className="block w-full text-center px-6 py-4 bg-brand-border text-brand-muted font-heading font-bold text-base rounded-[10px] cursor-not-allowed"
                  >
                    Aktuell nicht verfügbar
                  </button>
                  <p className="text-center text-xs font-body text-brand-muted">
                    Möchtest du benachrichtigt werden?{' '}
                    <Link href={`/kameras`} className="text-accent-blue hover:underline">
                      Andere Kameras ansehen
                    </Link>
                  </p>
                </div>
              )}

              {/* Trust items */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  { icon: '🚚', text: 'Kostenloser Versand' },
                  { icon: '🔒', text: 'Sichere Zahlung' },
                  { icon: '↩️', text: 'Einfache Rückgabe' },
                ].map((item) => (
                  <div
                    key={item.text}
                    className="flex flex-col items-center text-center gap-1 p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-brand-border dark:border-gray-700"
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-xs font-body text-brand-steel dark:text-gray-400 leading-tight">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Specs section (dynamisch) ── */}
        <div className="mt-14">
          <h2 className="font-heading font-bold text-xl sm:text-2xl text-brand-black dark:text-gray-100 mb-6">
            Technische Daten
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {getMergedSpecs(product).map((spec) => (
              <div
                key={spec.id}
                className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-5 flex items-center gap-4"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${brand.bg}`}
                  style={{ color: brand.color }}
                >
                  <SpecIcon iconId={spec.icon} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-body text-brand-muted dark:text-gray-500 uppercase tracking-wider mb-0.5">
                    {spec.name}
                  </p>
                  <p className="font-heading font-semibold text-brand-black dark:text-gray-100 text-sm truncate">
                    {spec.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Zubehör & Sets ── */}
        <div className="mt-14">
          <h2 className="font-heading font-bold text-xl sm:text-2xl text-brand-black dark:text-gray-100 mb-6">
            Passendes Zubehör & Sets
          </h2>

          {/* Zubehör */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {accessories.filter((a) => a.available).map((acc) => (
              <div key={acc.id} className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-4 text-center">
                <p className="font-heading font-semibold text-sm text-brand-black dark:text-gray-100 mb-1">{acc.name}</p>
                <p className="text-xs text-brand-steel dark:text-gray-400 mb-2">{acc.description}</p>
                <p className="text-sm font-heading font-bold text-accent-blue">
                  {acc.price.toFixed(2).replace('.', ',')} € {acc.pricingMode === 'perDay' ? '/ Tag' : 'einmalig'}
                </p>
              </div>
            ))}
          </div>

          {/* Sets */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {RENTAL_SETS_STATIC.map((set) => (
              <div key={set.id} className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-heading font-semibold text-brand-black dark:text-gray-100">{set.name}</h3>
                  {set.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold text-white ${set.badgeColor || 'bg-accent-blue'}`}>
                      {set.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-brand-steel dark:text-gray-400 mb-3">{set.description}</p>
                <ul className="text-xs text-brand-text dark:text-gray-300 space-y-0.5 mb-3">
                  {set.includedItems.map((item, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-accent-blue flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/kameras/${product.slug}/buchen`}
                  className="inline-flex items-center text-xs font-heading font-semibold text-accent-blue hover:underline"
                >
                  Zum Buchungsflow
                </Link>
              </div>
            ))}
          </div>

          {/* Eigenes Set zusammenstellen */}
          <div className="mt-6 p-5 bg-gradient-to-r from-accent-blue-soft/50 to-accent-teal-soft/50 dark:from-accent-blue/10 dark:to-accent-teal/10 rounded-card border border-brand-border dark:border-gray-700">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-heading font-semibold text-brand-black dark:text-gray-100 mb-1">
                  Eigenes Set zusammenstellen
                </h3>
                <p className="text-sm font-body text-brand-steel dark:text-gray-400">
                  Kombiniere Kamera und Zubehör frei und spare bis zu 15 % auf Zubehör.
                </p>
              </div>
              <Link
                href="/set-konfigurator"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors whitespace-nowrap"
              >
                Zum Konfigurator
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* ── Verfügbarkeit ── */}
        <div className="mt-14">
          <h2 className="font-heading font-bold text-xl sm:text-2xl text-brand-black dark:text-gray-100 mb-6">
            Verfügbarkeit
          </h2>
          <div className="max-w-md">
            <AvailabilityCalendar productId={product.id} />
          </div>
        </div>

        {/* ── Back to overview ── */}
        <div className="mt-10 pt-8 border-t border-brand-border dark:border-gray-700">
          <Link
            href="/kameras"
            className="inline-flex items-center gap-2 text-sm font-body font-semibold text-accent-blue hover:text-blue-700 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 rotate-180" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
            Zurück zur Übersicht
          </Link>
        </div>
      </div>

      {/* ── Bewertungen ── */}
      <ProductReviews productId={product.id} />
    </div>
  );
}

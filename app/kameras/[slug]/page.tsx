import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { products as staticProducts, getPriceForDays, getMergedSpecs, type Product } from '@/data/products';
import { getProducts } from '@/lib/get-products';
import ProductReviews from '@/components/ProductReviews';
import SpecIcon from '@/components/SpecIcon';
import ProductBookingCalendar from '@/components/ProductBookingCalendar';
import ProductAccessorySets from '@/components/ProductAccessorySets';
import ProductImageGallery from '@/components/ProductImageGallery';
import MarkdownContent from '@/components/MarkdownContent';

// ─── Static generation ──────────────────────────────────────────────────────

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const products = await getProducts();
  const product = products.find((p) => p.slug === slug);
  if (!product) return {};
  return {
    title: `${product.name} mieten – Cam2Rent`,
    description: product.description,
  };
}

// ─── Brand config ────────────────────────────────────────────────────────────

const brandConfig: Record<
  string,
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function KameraDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const products = await getProducts();
  const product = products.find((p) => p.slug === slug);

  if (!product) notFound();

  const brand = brandConfig[product.brand] ?? { bg: 'bg-gray-100', color: '#6b7280', pill: 'bg-gray-100 text-gray-600' };

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
            <ProductImageGallery
              productId={product.id}
              brand={product.brand}
              available={product.available}
            />
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

              {/* Availability */}
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    product.available ? 'bg-status-success' : 'bg-status-error'
                  }`}
                  aria-hidden="true"
                />
                <span className={`text-sm font-body font-semibold ${product.available ? 'text-status-success' : 'text-status-error'}`}>
                  {product.available ? 'Verfügbar' : 'Aktuell ausgebucht'}
                </span>
              </div>

              {/* Preis */}
              <div className="rounded-xl bg-accent-blue-soft dark:bg-accent-blue/10 border border-accent-blue/20 px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-body font-semibold text-accent-blue uppercase tracking-wider">Mietpreis</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-body text-accent-blue/70 dark:text-blue-300/70">ab</span>
                  <span className="font-heading font-bold text-lg text-accent-blue dark:text-blue-300">
                    {getPriceForDays(product, 1).toFixed(2).replace('.', ',')} €
                  </span>
                  <span className="text-xs font-body text-accent-blue/70 dark:text-blue-300/70">/ Tag</span>
                </div>
              </div>

              {/* Kalender + Versand/Abholung */}
              <ProductBookingCalendar
                productId={product.id}
                productSlug={product.slug}
                available={product.available}
              />
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
          <ProductAccessorySets />
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

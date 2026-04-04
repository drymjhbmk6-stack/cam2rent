import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { products, getPriceForDays, type Product } from '@/data/products';
import ProductReviews from '@/components/ProductReviews';

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

// ─── Spec icons ───────────────────────────────────────────────────────────────

function ResolutionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  );
}

function FpsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
    </svg>
  );
}

function WaterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.444 5.333-6.667 9.111-6.667 11.333A6.667 6.667 0 0012 21a6.667 6.667 0 006.667-6.667C18.667 12.111 16.444 8.333 12 3z" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5h.375a.375.375 0 01.375.375v2.25a.375.375 0 01-.375.375H21m-4.5 0h-9a2.25 2.25 0 01-2.25-2.25v-1.5a2.25 2.25 0 012.25-2.25h9a2.25 2.25 0 012.25 2.25v1.5a2.25 2.25 0 01-2.25 2.25z" />
    </svg>
  );
}

function WeightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
    </svg>
  );
}

function StorageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-5 h-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

const specs: Array<{
  key: keyof Product['specs'];
  label: string;
  Icon: () => ReactElement;
}> = [
  { key: 'resolution', label: 'Auflösung', Icon: ResolutionIcon },
  { key: 'fps', label: 'Bildrate', Icon: FpsIcon },
  { key: 'waterproof', label: 'Wasserdicht', Icon: WaterIcon },
  { key: 'battery', label: 'Akku', Icon: BatteryIcon },
  { key: 'weight', label: 'Gewicht', Icon: WeightIcon },
  { key: 'storage', label: 'Speicher', Icon: StorageIcon },
];

// ─── Price card ───────────────────────────────────────────────────────────────

function PriceCard({
  label,
  price,
  sub,
  highlight,
}: {
  label: string;
  price: number;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex-1 rounded-xl p-4 border-2 text-center transition-all ${
        highlight
          ? 'border-accent-blue bg-accent-blue-soft'
          : 'border-brand-border bg-white'
      }`}
    >
      <p className={`text-xs font-body font-semibold uppercase tracking-wider mb-1 ${highlight ? 'text-accent-blue' : 'text-brand-steel'}`}>
        {label}
      </p>
      <p className={`font-heading font-bold text-xl ${highlight ? 'text-accent-blue' : 'text-brand-black'}`}>
        {price.toFixed(2).replace('.', ',')} €
      </p>
      <p className={`text-xs font-body mt-0.5 ${highlight ? 'text-accent-blue/70' : 'text-brand-muted'}`}>
        {sub}
      </p>
    </div>
  );
}

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
    <div className="min-h-screen bg-brand-bg">
      {/* ── Breadcrumb ── */}
      <div className="bg-white border-b border-brand-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav aria-label="Brotkrume">
            <ol className="flex items-center gap-2 text-sm font-body flex-wrap">
              <li>
                <Link href="/" className="text-brand-steel hover:text-accent-blue transition-colors">
                  Startseite
                </Link>
              </li>
              <li aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-brand-muted" aria-hidden="true">
                  <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </li>
              <li>
                <Link href="/kameras" className="text-brand-steel hover:text-accent-blue transition-colors">
                  Kameras
                </Link>
              </li>
              <li aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-brand-muted" aria-hidden="true">
                  <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </li>
              <li>
                <span className="text-brand-black font-medium" aria-current="page">
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

              {/* Brand + name + availability */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`inline-flex px-3 py-1 rounded-full text-xs font-heading font-semibold uppercase tracking-wider ${brand.pill}`}>
                    {product.brand}
                  </span>
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

                <h1 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black leading-tight">
                  {product.name}
                </h1>
                <p className="mt-2 font-body text-brand-steel leading-relaxed">
                  {product.description}
                </p>
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

              {/* Price cards – 1 Tag / 7 Tage / 30 Tage */}
              <div>
                <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider mb-3">
                  Mietpreise
                </p>
                <div className="flex gap-2.5">
                  <PriceCard
                    label="1 Tag"
                    price={getPriceForDays(product, 1)}
                    sub="Tagesmietpreis"
                    highlight
                  />
                  <PriceCard
                    label="7 Tage"
                    price={getPriceForDays(product, 7)}
                    sub="Wochenmietpreis"
                  />
                  <PriceCard
                    label="30 Tage"
                    price={getPriceForDays(product, 30)}
                    sub="Monatsmietpreis"
                  />
                </div>
                <p className="text-xs font-body text-brand-muted mt-2">
                  Exakter Preis wird bei der Buchung nach Zeitraum berechnet.
                </p>
              </div>

              {/* Kaution + Haftungsschutz info */}
              <div className="rounded-xl bg-brand-bg border border-brand-border p-4 space-y-3">
                {/* Kaution */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={1.75} className="w-4 h-4" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-body font-semibold text-brand-black">Kaution</p>
                      <p className="text-xs font-body text-brand-steel">Vorläufige Reservierung, wird nach Rückgabe freigegeben</p>
                    </div>
                  </div>
                  <span className="font-heading font-bold text-brand-black text-sm whitespace-nowrap">
                    {product.deposit} €
                  </span>
                </div>

                {/* Haftungsoptionen */}
                {product.offersHaftungsoption && (
                  <div className="border-t border-brand-border pt-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={1.75} className="w-4 h-4" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-body font-semibold text-brand-black">Haftungsschutz (optional)</p>
                        <p className="text-xs font-body text-brand-steel mb-2">Wählbar beim Buchungsabschluss</p>
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
                  </div>
                )}
              </div>

              {/* CTA */}
              {product.available ? (
                <Link
                  href={`/kameras/${product.slug}/buchen`}
                  className="block w-full text-center px-6 py-4 bg-brand-black text-white font-heading font-bold text-base rounded-[10px] hover:bg-brand-dark transition-colors shadow-md shadow-black/10"
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
                    className="flex flex-col items-center text-center gap-1 p-2.5 rounded-xl bg-white border border-brand-border"
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-xs font-body text-brand-steel leading-tight">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Specs section ── */}
        <div className="mt-14">
          <h2 className="font-heading font-bold text-xl sm:text-2xl text-brand-black mb-6">
            Technische Daten
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {specs.map(({ key, label, Icon }) => (
              <div
                key={key}
                className="bg-white rounded-card shadow-card p-5 flex items-center gap-4"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${brand.bg}`}
                  style={{ color: brand.color }}
                >
                  <Icon />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-body text-brand-muted uppercase tracking-wider mb-0.5">
                    {label}
                  </p>
                  <p className="font-heading font-semibold text-brand-black text-sm truncate">
                    {product.specs[key]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Back to overview ── */}
        <div className="mt-10 pt-8 border-t border-brand-border">
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

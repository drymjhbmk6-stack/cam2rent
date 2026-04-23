'use client';

import { useState, useCallback, useEffect } from 'react';
import type React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useCart } from '@/components/CartProvider';
import Link from 'next/link';
import { de } from 'date-fns/locale';
import { differenceInCalendarDays, format, addDays, subDays } from 'date-fns';
import { getPriceForDays, type Product } from '@/data/products';
import { useProducts } from '@/components/ProductsProvider';
import { getAccessoryPrice, type Accessory } from '@/data/accessories';
import type { RentalSet } from '@/data/sets';
import AvailabilityCalendar, { type CalendarRange } from '@/components/AvailabilityCalendar';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { shippingConfig, calcShipping, type ShippingMethod } from '@/data/shipping';
import { calcPriceFromKeyDays, calcPriceFromTable, calcHaftungTieredPrice, getEigenbeteiligung, type PriceConfig, type AdminProduct, type HaftungConfig } from '@/lib/price-config';
import SignatureStep, { type SignatureResult } from '@/components/booking/SignatureStep';
import { getStripePromise } from '@/lib/stripe-client';
import ExpressSignup from '@/components/checkout/ExpressSignup';

/** Inline type to replace react-day-picker's DateRange */
type DateRange = { from: Date; to?: Date };

const stripePromise = getStripePromise();

// ─── Haftungsoptionen ─────────────────────────────────────────────────────────

type HaftungId = 'none' | 'standard' | 'premium';

interface HaftungOption {
  id: HaftungId;
  name: string;
  basePrice: number;
  liability: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

function getHaftungsoptionen(eigenbeteiligung: number): HaftungOption[] {
  return [
    {
      id: 'none',
      name: 'Keine Haftungsbegrenzung',
      basePrice: 0,
      liability: 'Volle Haftung bis zum Wiederbeschaffungswert',
      description:
        'Du haftest bei Schäden, Verlust oder Totalschaden in voller Höhe des Wiederbeschaffungswertes.',
    },
    {
      id: 'standard',
      name: 'Standard-Haftungsoption',
      basePrice: 15,
      liability: `Max. ${eigenbeteiligung} € Eigenbeteiligung pro Schadensfall`,
      description:
        'Deckt Sturz-, Stoß-, Wasser- und Elektronikschäden bei ordnungsgemäßer Nutzung ab.',
      badge: 'Beliebt',
      badgeColor: 'bg-accent-blue text-white',
    },
    {
      id: 'premium',
      name: 'Premium-Haftungsoption',
      basePrice: 25,
      liability: 'Keine Eigenbeteiligung',
      description:
        'Volle Haftungsfreistellung bei bestimmungsgemäßer Nutzung – ohne Selbstbeteiligung.',
      badge: 'Vollschutz',
      badgeColor: 'bg-accent-teal text-white',
    },
  ];
}

// ─── Accessories ──────────────────────────────────────────────────────────────
// Data lives in data/accessories.ts — add / remove items there.
// Only available accessories are shown in the booking flow.

// Zubehör wird dynamisch aus DB geladen (siehe useEffect weiter unten)

/** SVG icons keyed by iconId. Add new entries when you add new iconIds. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AccessoryIcon({ iconId, className = 'w-5 h-5' }: { iconId: Accessory['iconId']; className?: string }) {
  switch (iconId) {
    case 'tripod':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      );
    case 'sd-card':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
        </svg>
      );
    case 'battery':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5h.375a.375.375 0 01.375.375v2.25a.375.375 0 01-.375.375H21m-4.5 0h-9a2.25 2.25 0 01-2.25-2.25v-1.5a2.25 2.25 0 012.25-2.25h9a2.25 2.25 0 012.25 2.25v1.5a2.25 2.25 0 01-2.25 2.25z" />
        </svg>
      );
    case 'charger':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      );
    case 'case':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      );
    case 'mount':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'light':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.311a7.5 7.5 0 01-3 0M12 3v1.5M6.75 6.75l-1.06 1.06M4.5 12H3m1.19 5.25l1.06-1.06M12 18v1.5m5.25-12.75l1.06-1.06M19.5 12H21m-1.19 5.25l-1.06-1.06" />
        </svg>
      );
    case 'mic':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
  }
}

// ─── Price breakdown ──────────────────────────────────────────────────────────

interface Breakdown {
  days: number;
  rentalPrice: number;
  accessoryPrice: number;
  haftungPrice: number; // flat fee
  shippingPrice: number;
  shippingIsFree: boolean;
  total: number;
}

function calcBreakdown(
  product: Product,
  from: Date,
  to: Date | undefined, // undefined = single day
  accessories: string[],
  dbAccessories: Accessory[],
  haftung: HaftungId,
  shippingMethod: ShippingMethod,
  deliveryMode: DeliveryMode,
  dynPrices?: PriceConfig | null
): Breakdown {
  // Inclusive day count: Mo→Mo = 1 Tag, Mo→Di = 2 Tage, Mo→So = 7 Tage
  const days = to && to.getTime() !== from.getTime()
    ? Math.max(1, differenceInCalendarDays(to, from) + 1)
    : 1;

  // Mietpreis: 30-Tage-Tabelle aus Admin bevorzugen, dann 6-Stufen, dann statisch
  const adminProduct = dynPrices && 'adminProducts' in dynPrices && dynPrices.adminProducts
    ? (dynPrices.adminProducts as Record<string, AdminProduct>)[product.id]
    : undefined;
  const rentalPrice = adminProduct
    ? calcPriceFromTable(adminProduct, days)
    : dynPrices?.products?.[product.id]
      ? calcPriceFromKeyDays(dynPrices.products[product.id], days)
      : getPriceForDays(product, days);

  const accessoryPrice = accessories.reduce((sum, id) => {
    const acc = dbAccessories.find((a) => a.id === id);
    return sum + (acc ? getAccessoryPrice(acc, days) : 0);
  }, 0);

  // Haftungspreis: gestaffelt nach Wochen
  const h = dynPrices?.haftung;
  const haftungPrice =
    haftung === 'standard'
      ? calcHaftungTieredPrice(h?.standard ?? 15, h?.standardIncrement ?? 5, days)
    : haftung === 'premium'
      ? calcHaftungTieredPrice(h?.premium ?? 25, h?.premiumIncrement ?? 10, days)
    : 0;

  const subtotal = rentalPrice + accessoryPrice + haftungPrice;
  const shippingCfg = dynPrices?.shipping ?? shippingConfig;
  const shipping = calcShipping(subtotal, shippingMethod, deliveryMode, shippingCfg);

  return {
    days,
    rentalPrice,
    accessoryPrice,
    haftungPrice,
    shippingPrice: shipping.price,
    shippingIsFree: shipping.isFree,
    total: subtotal + shipping.price,
  };
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const steps = [
    { n: 1, label: 'Versand' },
    { n: 2, label: 'Zubeh\u00f6r' },
    { n: 3, label: 'Haftung' },
    { n: 4, label: '\u00dcbersicht' },
    { n: 5, label: 'Mietvertrag' },
    { n: 6, label: 'Zahlung' },
  ];
  return (
    <div className="flex items-center" aria-label="Buchungsschritte">
      {steps.map((step, i) => (
        <div key={step.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-heading font-bold text-sm border-2 transition-all ${
                step.n < current
                  ? 'bg-status-success border-status-success text-white'
                  : step.n === current
                  ? 'bg-accent-blue border-accent-blue text-white'
                  : 'bg-white border-brand-border text-brand-muted'
              }`}
              aria-current={step.n === current ? 'step' : undefined}
            >
              {step.n < current ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              ) : (
                step.n
              )}
            </div>
            <span
              className={`text-xs font-body hidden sm:block whitespace-nowrap ${
                step.n === current ? 'text-accent-blue font-semibold' : 'text-brand-muted'
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-12 sm:w-20 h-0.5 mx-2 mb-4 transition-colors ${
                step.n < current ? 'bg-status-success' : 'bg-brand-border'
              }`}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Delivery mode ────────────────────────────────────────────────────────────

type DeliveryMode = 'abholung' | 'versand';


// ─── Sidebar price ────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',');
}

// ─── Payment step (must be inside <Elements>) ─────────────────────────────────

function PaymentStep({ total, onBack }: { total: number; onBack: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsLoading(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/buchung-bestaetigt`,
      },
    });

    // Only runs if redirect failed or payment was declined
    if (stripeError) {
      setError(stripeError.message ?? 'Ein Fehler ist aufgetreten.');
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="font-heading font-bold text-lg text-brand-black mb-1">Zahlung</h2>
      <p className="text-sm font-body text-brand-steel mb-6">
        Gib deine Zahlungsdaten ein. Deine Verbindung ist SSL-verschlüsselt.
      </p>

      <div className="mb-6">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error && (
        <div className="mb-5 p-3 bg-red-50 border border-status-error/50 rounded-xl text-sm font-body text-status-error">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="px-6 py-3 text-brand-steel font-heading font-semibold text-sm rounded-[10px] border border-brand-border hover:bg-brand-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Zurück
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || isLoading}
          className="flex items-center gap-2 px-8 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              Wird verarbeitet…
            </>
          ) : (
            <>
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              {fmt(total)} € jetzt bezahlen
            </>
          )}
        </button>
      </div>

      <p className="text-xs font-body text-brand-muted mt-5 flex items-center gap-1.5 justify-center">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true">
          <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
        </svg>
        Sichere Zahlung über Stripe – Deine Daten werden nie auf unseren Servern gespeichert.
      </p>

      <div className="mt-5 p-4 bg-brand-bg rounded-[10px] text-xs text-brand-muted space-y-1">
        <p><strong className="text-brand-steel">Stornierung:</strong> Kostenlos bis 7 Tage vor Mietstart · 50 % Gebühr 3–6 Tage vorher (nur per E-Mail) · keine Erstattung ≤ 2 Tage vorher.</p>
        <p>Gemäß § 312g Abs. 2 Nr. 9 BGB besteht für zeitgebundene Mietverträge kein gesetzliches Widerrufsrecht.</p>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuchenPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { addItem } = useCart();
  const { products } = useProducts();
  const product = products.find((p) => p.slug === slug);

  const searchParams = useSearchParams();
  const preFrom = searchParams.get('from');
  const preTo = searchParams.get('to');
  const preDelivery = searchParams.get('delivery');
  const hasPreselection = !!(preFrom && preTo);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(hasPreselection ? 2 : 1);
  const [returnToSummary, setReturnToSummary] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    preDelivery === 'abholung' ? 'abholung' : 'versand'
  );
  const [range, setRange] = useState<DateRange | undefined>(() => {
    if (preFrom && preTo) {
      const [fy, fm, fd] = preFrom.split('-').map(Number);
      const [ty, tm, td] = preTo.split('-').map(Number);
      if (fy && fm && fd && ty && tm && td) {
        return { from: new Date(fy, fm - 1, fd), to: new Date(ty, tm - 1, td) };
      }
    }
    return undefined;
  });
  const preselectedAccessories = searchParams.get('accessories');
  const [accessories, setAccessories] = useState<string[]>(() => {
    if (preselectedAccessories) {
      return preselectedAccessories.split(',').filter(Boolean);
    }
    return [];
  });
  const [haftung, setHaftung] = useState<HaftungId>('none');
  // Pflicht-Bestätigungen bei "Keine Haftungsbegrenzung"
  const [confirmLiability, setConfirmLiability] = useState(false);
  const [confirmRead, setConfirmRead] = useState(false);
  // Stripe Payment Intent
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('standard');
  // Stripe Payment Intent
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const [intentError, setIntentError] = useState<string | null>(null); void intentError;
  // Dynamische Preise aus Supabase (Fallback: statische Dateiwerte)
  const [dynPrices, setDynPrices] = useState<PriceConfig | null>(null);

  // Dynamisches Zubehör aus DB + Verfügbarkeit (muss vor accessories State stehen)
  const [dbAccessories, setDbAccessories] = useState<Accessory[]>([]);
  const [accAvailability, setAccAvailability] = useState<Record<string, { remaining: number; compatible: boolean }>>({});

  // Sets
  const [availableSets, setAvailableSets] = useState<RentalSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<RentalSet | null>(null);


  // Tax config
  const [taxMode, setTaxMode] = useState<'kleinunternehmer' | 'regelbesteuerung'>('kleinunternehmer');
  const [taxRate, setTaxRate] = useState(19);

  // Mietvertrag-Signatur
  const [contractSignature, setContractSignature] = useState<SignatureResult | null>(null);

  // Auth-Gate vor Mietvertrag — Kunde muss eingeloggt oder registriert sein
  const [showAuthGate, setShowAuthGate] = useState(false);

  // Falls Kunde sich während des Gates einloggt (z.B. via anderen Tab), schließen + weiter
  useEffect(() => {
    if (user && showAuthGate) {
      setShowAuthGate(false);
      setStep(5);
    }
  }, [user, showAuthGate]);

  useEffect(() => {
    fetch('/api/prices').then((r) => r.json()).then(setDynPrices).catch(() => {});
    fetch('/api/tax-config').then((r) => r.json()).then((d) => {
      setTaxMode(d.taxMode || 'kleinunternehmer');
      setTaxRate(d.taxRate || 19);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/sets?available=true')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.sets)) {
          const pid = product?.id;
          // Nur Sets anzeigen die für diese Kamera kompatibel sind
          const compatible = data.sets.filter((s: RentalSet & { product_ids?: string[] }) => {
            if (!s.product_ids?.length) return true; // Keine Einschränkung = alle Kameras
            return pid ? s.product_ids.includes(pid) : true;
          });
          setAvailableSets([...compatible].sort((a: RentalSet, b: RentalSet) => a.price - b.price));
        }
      })
      .catch(() => {});
  }, [product?.id]);

  // Zubehör aus DB laden
  useEffect(() => {
    fetch('/api/accessories')
      .then((r) => r.json())
      .then((data: { id: string; name: string; pricingMode: string; price: number; description?: string; group?: string; upgradeGroup?: string; isUpgradeBase?: boolean }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped: Accessory[] = data.map((a) => ({
            id: a.id,
            name: a.name,
            pricingMode: a.pricingMode as 'perDay' | 'flat',
            price: a.price,
            description: a.description ?? '',
            available: true,
            iconId: 'mount' as const,
            group: a.group,
            upgradeGroup: a.upgradeGroup,
            isUpgradeBase: a.isUpgradeBase,
          }));
          setDbAccessories(mapped);
        }
      })
      .catch(() => {});
  }, []);

  // Verfügbarkeit prüfen wenn Datum oder Liefermodus sich ändert
  useEffect(() => {
    if (!range?.from) return;
    const rentalFrom = format(range.from, 'yyyy-MM-dd');
    const rentalTo = format(range.to ?? range.from, 'yyyy-MM-dd');

    fetch(`/api/accessory-availability?from=${rentalFrom}&to=${rentalTo}&product_id=${product?.id}&delivery_mode=${deliveryMode}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.accessories) {
          const map: Record<string, { remaining: number; compatible: boolean }> = {};
          for (const a of data.accessories) {
            map[a.id] = { remaining: a.available_qty_remaining, compatible: a.compatible };
          }
          setAccAvailability(map);
          // Nicht mehr verfügbare Auswahlen entfernen. Set-qty wird dabei
          // mit abgezogen: wenn ein gewaehltes Set das Zubehoer bereits
          // komplett belegt, kann es nicht zusaetzlich einzeln gebucht werden.
          setAccessories((prev) => prev.filter((id) => {
            const a = map[id];
            if (!a) return true;
            if (!a.compatible) return false;
            const setQty = selectedSet?.accessory_items?.find((i) => i.accessory_id === id)?.qty ?? 0;
            return a.remaining - setQty > 0;
          }));
        }
      })
      .catch(() => {});
    // selectedSet absichtlich nicht als Dependency — Set-Wechsel cleart
    // accessories bereits via setAccessories([]) im Radio-Handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, deliveryMode, product?.id]);

  const toggleAccessory = useCallback((id: string) => {
    setAccessories((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }, []);

  // Upgrade-Gruppe: Waehlt eine Option aus und entfernt andere aus der gleichen Gruppe
  const selectUpgrade = useCallback((accId: string, group: string) => {
    setAccessories((prev) => {
      const groupIds = dbAccessories.filter((a) => a.upgradeGroup === group).map((a) => a.id);
      const without = prev.filter((id) => !groupIds.includes(id));
      // Base-Option = abwählen (inklusive), Upgrade-Option = hinzufügen
      const acc = dbAccessories.find((a) => a.id === accId);
      if (acc?.isUpgradeBase) return without;
      return [...without, accId];
    });
  }, [dbAccessories]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleProceedToPayment = async () => {
    if (!breakdown || !range?.from) return;
    setIsCreatingIntent(true);
    setIntentError(null);

    const rentalFrom = format(range.from, 'yyyy-MM-dd');
    const rentalTo = format(range.to ?? range.from, 'yyyy-MM-dd');

    try {
      // 1. Check real-time availability before creating payment intent
      const availRes = await fetch(
        `/api/check-availability?product_id=${encodeURIComponent(product!.id)}&from=${rentalFrom}&to=${rentalTo}`
      );
      const availData = await availRes.json();
      if (!availData.available) {
        throw new Error(
          availData.remainingStock === 0
            ? 'Diese Kamera ist im gewählten Zeitraum leider ausgebucht.'
            : `Nur noch ${availData.remainingStock} Exemplar(e) verfügbar – bitte wähle einen anderen Zeitraum.`
        );
      }

      // 2. Create Stripe PaymentIntent
      const res = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: Math.round(effectiveTotal * 100),
          metadata: {
            product_id: product!.id,
            product_name: product!.name,
            rental_from: rentalFrom,
            rental_to: rentalTo,
            days: String(breakdown.days),
            delivery_mode: deliveryMode,
            shipping_method: deliveryMode === 'versand' ? shippingMethod : 'abholung',
            shipping_price: String(breakdown.shippingPrice),
            haftung,
            accessories: selectedSet ? '' : accessories.join(','),
            deposit: String(product!.deposit),
            // Price breakdown for booking record
            price_rental: String(breakdown.rentalPrice),
            price_accessories: selectedSet ? String(setPrice) : String(breakdown.accessoryPrice),
            price_haftung: String(breakdown.haftungPrice),
            user_id: user?.id ?? '',
            customer_email: user?.email ?? '',
            customer_name: user?.user_metadata?.full_name ?? user?.email ?? '',
            // Set info
            set_id: selectedSet?.id ?? '',
            set_name: selectedSet?.name ?? '',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? 'Unbekannter Fehler');
      }
      setClientSecret(data.clientSecret);
      setStep(6);
    } catch (err) {
      setIntentError(err instanceof Error ? err.message : 'Fehler beim Verbinden mit der Zahlungsseite.');
    } finally {
      setIsCreatingIntent(false);
    }
  };

  // Handler für AvailabilityCalendar: String-Daten → DateRange konvertieren
  const handleCalendarRangeChange = useCallback((calRange: CalendarRange) => {
    if (!calRange.from) {
      setRange(undefined);
      return;
    }
    const [fy, fm, fd] = calRange.from.split('-').map(Number);
    const fromDate = new Date(fy, fm - 1, fd);
    if (calRange.to) {
      const [ty, tm, td] = calRange.to.split('-').map(Number);
      setRange({ from: fromDate, to: new Date(ty, tm - 1, td) });
    } else {
      setRange({ from: fromDate });
    }
  }, []);

  // Wie oft ist dieses Accessory bereits durch das gewaehlte Set belegt?
  // Wichtig fuer die Einzel-Zubehoer-Verfuegbarkeit: das Set nimmt Stueckzahlen
  // aus dem Lager heraus, die nicht zusaetzlich ueber die Checkboxen buchbar
  // sein duerfen.
  const getSetQty = useCallback((accId: string): number => {
    if (!selectedSet?.accessory_items) return 0;
    const item = selectedSet.accessory_items.find((i) => i.accessory_id === accId);
    return item?.qty ?? 0;
  }, [selectedSet]);

  // Set-Items filtern: Wenn ein Upgrade gewählt wurde, Base-Item ersetzen
  const getFilteredSetItems = useCallback((): string[] => {
    if (!selectedSet) return [];
    // Finde alle Base-Accessories deren Upgrade-Gruppe ein aktives Upgrade hat
    const replacedBaseNames = new Set<string>();
    for (const accId of accessories) {
      const acc = dbAccessories.find((a) => a.id === accId);
      if (!acc?.upgradeGroup) continue;
      // Dieses Accessory ist ein Upgrade → finde die Base der gleichen Gruppe
      const baseAcc = dbAccessories.find(
        (a) => a.upgradeGroup === acc.upgradeGroup && a.isUpgradeBase
      );
      if (baseAcc) replacedBaseNames.add(baseAcc.name);
    }
    // Set-Items filtern: Base-Name raus wenn durch Upgrade ersetzt
    return selectedSet.includedItems.filter((item) => !replacedBaseNames.has(item));
  }, [selectedSet, accessories, dbAccessories]);

  if (!product) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="text-center">
          <p className="font-heading font-bold text-brand-black text-xl mb-4">Kamera nicht gefunden</p>
          <Link href="/kameras" className="text-accent-blue hover:underline font-body">
            Zurück zur Übersicht
          </Link>
        </div>
      </div>
    );
  }

  // breakdown exists as soon as a start date is picked (to=undefined → 1 Tag)
  const breakdown = range?.from
    ? calcBreakdown(product, range.from, range.to, accessories, dbAccessories, haftung, shippingMethod, deliveryMode, dynPrices)
    : null;

  // Haftungsoptionen dynamisch (Eigenbeteiligung je nach Produktkategorie)
  const haftungConfig = dynPrices?.haftung as HaftungConfig | undefined;
  const eigenbeteiligung = haftungConfig
    ? getEigenbeteiligung(haftungConfig, product.category)
    : 200;
  const haftungsoptionen = getHaftungsoptionen(eigenbeteiligung);

  // Set price is calculated separately and added on top of the base breakdown
  const setPrice = selectedSet && breakdown
    ? selectedSet.pricingMode === 'perDay'
      ? selectedSet.price * breakdown.days
      : selectedSet.price
    : 0;

  // Effective total including set price
  const effectiveTotal = breakdown ? breakdown.total + setPrice : 0;

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* ── Header ── */}
      <div className="bg-white border-b border-brand-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Breadcrumb */}
          <nav aria-label="Brotkrume" className="mb-5">
            <ol className="flex items-center gap-2 text-sm font-body flex-wrap">
              {[
                { href: '/', label: 'Startseite' },
                { href: '/kameras', label: 'Kameras' },
                { href: `/kameras/${product.slug}`, label: product.name },
              ].map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-2">
                  <Link href={crumb.href} className="text-brand-steel hover:text-accent-blue transition-colors">
                    {crumb.label}
                  </Link>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-brand-muted" aria-hidden="true">
                    <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                </li>
              ))}
              <li>
                <span className="text-brand-black font-medium" aria-current="page">Buchen</span>
              </li>
            </ol>
          </nav>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-heading font-bold text-xl sm:text-2xl text-brand-black">
                {product.name} mieten
              </h1>
              <p className="text-sm font-body text-brand-steel mt-0.5">
                ab {product.pricePerDay} € / Tag
              </p>
            </div>
            <StepIndicator current={step} />
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className={`${step >= 4 ? '' : 'lg:grid lg:grid-cols-[1fr_300px] lg:gap-8'}`}>

          {/* ── Main card ── */}
          <div className="bg-white rounded-card shadow-card p-6 sm:p-8">

            {/* ════ STEP 1: Abholung / Versand + Datum ════ */}
            {step === 1 && (
              <div>
                <h2 className="font-heading font-bold text-lg text-brand-black mb-1">
                  Übergabe & Zeitraum
                </h2>
                <p className="text-sm font-body text-brand-steel mb-6">
                  Wähle zuerst die Übergabeart, dann die reinen Miettage.
                </p>

                {/* ── Lieferung — aufklappbar wie Checkout ── */}
                <div className="space-y-3 mb-6">
                  {/* Versand */}
                  <label className={`block rounded-xl border-2 cursor-pointer transition-all overflow-hidden ${
                    deliveryMode === 'versand' ? 'border-accent-blue' : 'border-brand-border hover:border-brand-muted'
                  }`}>
                    <div className={`flex items-start gap-3 p-4 ${deliveryMode === 'versand' ? 'bg-accent-blue-soft/30' : ''}`}>
                      <input type="radio" name="deliveryMode" value="versand" checked={deliveryMode === 'versand'}
                        onChange={() => { setDeliveryMode('versand'); setRange(undefined); }} className="mt-0.5 accent-accent-blue" />
                      <div>
                        <p className="font-heading font-semibold text-sm text-brand-black">Versand</p>
                        <p className="text-xs text-brand-steel mt-0.5">Wir liefern zu dir nach Hause</p>
                      </div>
                    </div>
                    {deliveryMode === 'versand' && (
                      <div className="px-4 pb-4 pt-2 border-t border-brand-border/50" onClick={(e) => e.preventDefault()}>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { id: 'standard' as ShippingMethod, label: 'Standard', sub: '3–5 Werktage', price: dynPrices?.shipping?.standardPrice ?? shippingConfig.standardPrice },
                            { id: 'express' as ShippingMethod, label: 'Express', sub: 'Nächster Werktag', price: dynPrices?.shipping?.expressPrice ?? shippingConfig.expressPrice },
                          ] as const).map((opt) => (
                            <label
                              key={opt.id}
                              onClick={(e) => e.stopPropagation()}
                              className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                                shippingMethod === opt.id ? 'border-accent-blue bg-accent-blue/5' : 'border-brand-border'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input type="radio" name="shippingMethod" value={opt.id} checked={shippingMethod === opt.id}
                                  onChange={() => setShippingMethod(opt.id)} className="accent-accent-blue flex-shrink-0" />
                                <span className="font-heading font-semibold text-sm text-brand-black">{opt.label}</span>
                              </div>
                              <div className="flex items-center justify-between pl-6">
                                <span className="text-xs text-brand-muted">{opt.sub}</span>
                                <span className="text-sm font-semibold text-brand-black">{opt.price.toFixed(2).replace('.', ',')} €</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </label>

                  {/* Abholung */}
                  <label className={`block rounded-xl border-2 cursor-pointer transition-all overflow-hidden ${
                    deliveryMode === 'abholung' ? 'border-accent-blue' : 'border-brand-border hover:border-brand-muted'
                  }`}>
                    <div className={`flex items-start gap-3 p-4 ${deliveryMode === 'abholung' ? 'bg-accent-blue-soft/30' : ''}`}>
                      <input type="radio" name="deliveryMode" value="abholung" checked={deliveryMode === 'abholung'}
                        onChange={() => { setDeliveryMode('abholung'); setRange(undefined); }} className="mt-0.5 accent-accent-blue" />
                      <div>
                        <p className="font-heading font-semibold text-sm text-brand-black">Selbst abholen</p>
                        <p className="text-xs text-brand-steel mt-0.5">Du holst die Kamera bei uns ab und bringst sie zurück</p>
                      </div>
                    </div>
                    {deliveryMode === 'abholung' && (
                      <div className="px-4 pb-4 pt-2 border-t border-brand-border/50" onClick={(e) => e.preventDefault()}>
                        <div className="bg-brand-bg rounded-lg p-3">
                          <p className="font-body font-semibold text-sm text-brand-black">cam2rent</p>
                          <p className="text-xs text-brand-steel mt-1">Heimsbrunner Str. 12, 12349 Berlin</p>
                          <p className="text-xs text-brand-muted mt-2">Abholung nach Terminvereinbarung.</p>
                        </div>
                      </div>
                    )}
                  </label>
                </div>

                {/* Info hint */}
                <div className={`flex items-start gap-2.5 p-3 rounded-xl mb-6 text-xs font-body ${
                  deliveryMode === 'abholung'
                    ? 'bg-accent-teal-soft text-accent-teal'
                    : 'bg-accent-blue-soft text-accent-blue'
                }`}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                  {deliveryMode === 'abholung' ? (
                    <span>
                      Wähle unten deine <strong>reinen Miettage</strong>. Abholung und Rückgabe werden automatisch auf den Tag <strong>davor bzw. danach</strong> gesetzt.
                    </span>
                  ) : (
                    <span>
                      Wähle deine <strong>reinen Miettage</strong>. Versand und Rücksendung werden separat koordiniert.
                    </span>
                  )}
                </div>

                {/* ── Kalender (Verfügbarkeit + Auswahl) ── */}
                <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider mb-3">
                  Miettage wählen
                </p>
                {product?.id && (
                  <AvailabilityCalendar
                    productId={product.id}
                    deliveryMode={deliveryMode}
                    initialFrom={preFrom}
                    initialTo={preTo}
                    onRangeChange={handleCalendarRangeChange}
                  />
                )}

                {/* ── Range preview ── */}
                {range?.from && (
                  <div className="mt-6 rounded-xl border border-brand-border overflow-hidden">
                    {/* Logistics header for Abholung */}
                    {deliveryMode === 'abholung' && (
                      <div className="bg-accent-teal-soft px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-accent-teal flex-shrink-0" aria-hidden="true">
                            <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
                          </svg>
                          <span className="text-xs font-heading font-semibold text-accent-teal uppercase tracking-wider">
                            Abholung
                          </span>
                          <span className="font-heading font-bold text-sm text-accent-teal">
                            {format(subDays(range.from, 1), 'EEE, dd. MMM yyyy', { locale: de })}
                          </span>
                        </div>
                        <span className="text-xs font-body text-accent-teal/80">Einen Tag vorher</span>
                      </div>
                    )}

                    {/* Rental period */}
                    <div className="bg-brand-bg px-4 py-3">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <p className="text-xs font-body text-brand-muted uppercase tracking-wider mb-1">
                            Mietbeginn
                          </p>
                          <p className="font-heading font-semibold text-brand-black">
                            {format(range.from, 'EEE, dd. MMM yyyy', { locale: de })}
                          </p>
                        </div>
                        {range.to && range.to.getTime() !== range.from.getTime() ? (
                          <>
                            <span className="text-brand-muted" aria-hidden="true">→</span>
                            <div>
                              <p className="text-xs font-body text-brand-muted uppercase tracking-wider mb-1">
                                Mietende
                              </p>
                              <p className="font-heading font-semibold text-brand-black">
                                {format(range.to, 'EEE, dd. MMM yyyy', { locale: de })}
                              </p>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs font-body text-brand-muted italic">
                            Nur 1 Tag – oder weiteren Tag wählen
                          </p>
                        )}
                        {/* Days pill + price – always visible once from is set */}
                        {breakdown && (
                          <div className="ml-auto flex items-center gap-3">
                            <span className="px-3 py-1.5 bg-accent-blue-soft text-accent-blue font-heading font-semibold text-sm rounded-full">
                              {breakdown.days} {breakdown.days === 1 ? 'Tag' : 'Tage'}
                            </span>
                            <span className="font-heading font-bold text-brand-black">
                              {fmt(breakdown.rentalPrice)} €
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Logistics footer for Abholung */}
                    {deliveryMode === 'abholung' && (range.to ?? range.from) && (
                      <div className="bg-accent-teal-soft px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-accent-teal flex-shrink-0" aria-hidden="true">
                            <path fillRule="evenodd" d="M7.22 14.22a.75.75 0 011.06 0L10 15.94l1.72-1.72a.75.75 0 111.06 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 010-1.06zM10 3a.75.75 0 01.75.75v9.5a.75.75 0 01-1.5 0v-9.5A.75.75 0 0110 3z" clipRule="evenodd" />
                          </svg>
                          <span className="text-xs font-heading font-semibold text-accent-teal uppercase tracking-wider">
                            Rückgabe
                          </span>
                          <span className="font-heading font-bold text-sm text-accent-teal">
                            {format(addDays(range.to ?? range.from, 1), 'EEE, dd. MMM yyyy', { locale: de })}
                          </span>
                        </div>
                        <span className="text-xs font-body text-accent-teal/80">Einen Tag danach</span>
                      </div>
                    )}

                    {/* Versand hint */}
                    {deliveryMode === 'versand' && range.from && (
                      <div className="bg-accent-blue-soft/50 px-4 py-2.5">
                        <p className="text-xs font-body text-accent-blue">
                          Versand und Rücksendung werden nach Buchungsabschluss koordiniert.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    disabled={!range?.from}
                    onClick={() => { if (returnToSummary) { setStep(4); setReturnToSummary(false); } else setStep(2); }}
                    className="px-8 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Weiter: Zubehör
                  </button>
                </div>
              </div>
            )}

            {/* ════ STEP 2: Accessories only ════ */}
            {step === 2 && (
              <div>
                <button type="button" onClick={() => setStep(1)} className="text-sm font-body text-accent-blue hover:underline mb-4 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  Zurück zu Versand & Datum
                </button>
                <h2 className="font-heading font-bold text-lg text-brand-black mb-1">
                  Zubehör
                </h2>
                <p className="text-sm font-body text-brand-steel mb-6">
                  Alles optional. Füge hinzu was du brauchst.
                </p>


                {/* ── Set selection ── */}
                {availableSets.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider mb-2">
                      Wähle dein Set (Pflicht)
                    </p>
                    <div className="rounded-xl border border-brand-border overflow-hidden divide-y divide-brand-border">

                      {availableSets.map((set) => {
                        const isSelected = selectedSet?.id === set.id;
                        const price = breakdown
                          ? set.pricingMode === 'perDay' ? set.price * breakdown.days : set.price
                          : set.price;
                        // Verfügbarkeit: Nur Lagerbestand prüfen, nicht Kompatibilität
                        // (Sets sind bereits per product_ids für diese Kamera gefiltert)
                        const setItems: { accessory_id: string; qty: number }[] = (set as unknown as { accessory_items?: { accessory_id: string; qty: number }[] }).accessory_items ?? [];
                        const setUnavailable = setItems.length > 0 && setItems.some((item) => {
                          const av = accAvailability[item.accessory_id];
                          return av && av.remaining < item.qty;
                        });
                        if (setUnavailable) return null;
                        return (
                          <div key={set.id} className={`transition-colors ${isSelected ? 'bg-accent-blue-soft/30' : 'bg-white dark:bg-gray-900'}`}>
                            <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                              <input type="radio" name="rentalSet" checked={isSelected} onChange={() => { setSelectedSet(set); setAccessories([]); }} className="sr-only" />
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-accent-blue' : 'border-brand-border'}`}>
                                {isSelected && <div className="w-2 h-2 rounded-full bg-accent-blue" />}
                              </div>
                              {set.image_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={set.image_url} alt={set.name} className="w-16 h-12 object-contain rounded-lg bg-white border border-brand-border flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-heading font-semibold text-sm text-brand-black">{set.name}</span>
                                  {set.badge && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-heading font-semibold ${set.badgeColor}`}>{set.badge}</span>
                                  )}
                                </div>
                                {set.includedItems.length > 0 && (
                                  <p className="text-xs text-brand-muted mt-0.5">{set.includedItems.join(' · ')}</p>
                                )}
                              </div>
                              <span className="font-heading font-semibold text-sm text-accent-blue flex-shrink-0">+{fmt(price)} €</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Upgrade-Gruppen (Radio-Buttons) */}
                {(() => {
                  const upgradeGroups = [...new Set(dbAccessories.filter((a) => a.upgradeGroup).map((a) => a.upgradeGroup!))];
                  const days = breakdown?.days ?? 0;
                  return upgradeGroups.map((group) => {
                    const groupAccs = dbAccessories.filter((a) => a.upgradeGroup === group);
                    if (groupAccs.length === 0) return null;
                    const baseAcc = groupAccs.find((a) => a.isUpgradeBase);
                    const basePrice = baseAcc ? getAccessoryPrice(baseAcc, days) : 0;
                    // Welche Option ist gewählt? Schaue ob eine Upgrade-Option in accessories ist
                    const selectedId = groupAccs.find((a) => accessories.includes(a.id))?.id ?? baseAcc?.id ?? null;
                    return (
                      <div key={group} className="mb-6">
                        <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider mb-2">{group}</p>
                        <div className="rounded-xl border border-brand-border dark:border-gray-700 overflow-hidden divide-y divide-brand-border dark:divide-gray-700">
                          {groupAccs.filter((acc) => {
                            const avail = accAvailability[acc.id];
                            return !avail || avail.compatible;
                          }).map((acc) => {
                            const isSelected = selectedId === acc.id || (acc.isUpgradeBase && !groupAccs.some((a) => !a.isUpgradeBase && accessories.includes(a.id)));
                            const avail = accAvailability[acc.id];
                            const isAvailable = !avail || (avail.remaining > 0 && avail.compatible);
                            const disabled = !isAvailable && !acc.isUpgradeBase;
                            const upgradePrice = getAccessoryPrice(acc, days) - basePrice;
                            return (
                              <label key={acc.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed bg-brand-bg dark:bg-gray-800' : isSelected ? 'bg-accent-blue-soft/30 cursor-pointer' : 'bg-white dark:bg-gray-900 hover:bg-brand-bg dark:hover:bg-gray-800 cursor-pointer'}`}>
                                <input type="radio" name={`upgrade-${group}`} checked={isSelected} disabled={disabled}
                                  onChange={() => !disabled && selectUpgrade(acc.id, group)} className="sr-only" />
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-accent-blue' : 'border-brand-border'}`}>
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-accent-blue" />}
                                </div>
                                <span className={`font-heading font-semibold text-sm flex-1 ${disabled ? 'text-brand-muted' : 'text-brand-black dark:text-gray-100'}`}>{acc.name}</span>
                                {acc.isUpgradeBase ? (
                                  <span className="text-xs font-heading font-semibold text-status-success">inklusive</span>
                                ) : !disabled ? (
                                  <span className="font-heading font-semibold text-sm text-accent-blue">
                                    +{fmt(upgradePrice)} €
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}

                {/* Normales Zubehör (Checkboxen) — nach Kategorie gruppiert */}
                {(() => {
                  const filtered = dbAccessories.filter((acc) => {
                    if (acc.upgradeGroup) return false;
                    const avail = accAvailability[acc.id];
                    if (avail && !avail.compatible) return false;
                    return true;
                  });
                  const catMap = new Map<string, typeof filtered>();
                  for (const acc of filtered) {
                    const cat = acc.group || 'sonstiges';
                    if (!catMap.has(cat)) catMap.set(cat, []);
                    catMap.get(cat)!.push(acc);
                  }
                  const categories = [...catMap.entries()];
                  if (categories.length === 0) return null;
                  return categories.map(([cat, catAccs]) => (
                <div key={cat} className="mb-6">
                  <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider mb-2">
                    {cat}
                  </p>
                  <div className="rounded-xl border border-brand-border dark:border-gray-700 overflow-hidden divide-y divide-brand-border dark:divide-gray-700">
                    {catAccs.map((acc) => {
                      const checked = accessories.includes(acc.id);
                      const days = breakdown?.days ?? 0;
                      const avail = accAvailability[acc.id];
                      const setQty = getSetQty(acc.id);
                      // Effektive Restmenge: API-Restmenge abzueglich der durch das
                      // gewaehlte Set bereits belegten Stueckzahl.
                      const effectiveRemaining = (avail?.remaining ?? Number.POSITIVE_INFINITY) - setQty;
                      const blockedBySet = setQty > 0 && effectiveRemaining <= 0;
                      const isBookedOut = !!avail && effectiveRemaining <= 0;
                      const disabled = isBookedOut;
                      return (
                        <label key={acc.id} className={`flex flex-col px-4 py-2.5 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed bg-brand-bg dark:bg-gray-800' : checked ? 'bg-accent-blue-soft/30 cursor-pointer' : 'bg-white dark:bg-gray-900 hover:bg-brand-bg dark:hover:bg-gray-800 cursor-pointer'}`}>
                          <div className="flex items-center gap-3">
                            <input type="checkbox" checked={checked} onChange={() => !disabled && toggleAccessory(acc.id)} disabled={disabled} className="sr-only" />
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${disabled ? 'border-brand-muted bg-brand-bg' : checked ? 'border-accent-blue bg-accent-blue' : 'border-brand-border bg-white'}`}>
                              {checked && !disabled && (
                                <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <span className={`font-heading font-semibold text-sm flex-1 ${disabled ? 'text-brand-muted' : 'text-brand-black dark:text-gray-100'}`}>{acc.name}</span>
                            {!disabled && (
                              <span className="font-heading font-semibold text-sm text-accent-blue flex-shrink-0">
                                +{fmt(getAccessoryPrice(acc, days))} €{acc.pricingMode === 'perDay' ? ' pro Tag' : ''}
                              </span>
                            )}
                          </div>
                          {isBookedOut && (
                            <span className="text-xs text-status-error mt-1 ml-7">
                              {blockedBySet
                                ? `Bereits ${setQty}× im gewählten Set enthalten — Bestand ausgeschöpft`
                                : 'Für diesen Zeitraum nicht verfügbar'}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
                  ));
                })()}

                <div className="mt-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-6 py-3 text-brand-steel font-heading font-semibold text-sm rounded-[10px] border border-brand-border hover:bg-brand-bg transition-colors"
                  >
                    ← Versand & Datum
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (returnToSummary) { setStep(4); setReturnToSummary(false); } else setStep(3); }}
                    disabled={availableSets.length > 0 && !selectedSet}
                    className="px-8 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Weiter: Haftung
                  </button>
                  {availableSets.length > 0 && !selectedSet && (
                    <p className="text-xs text-status-error mt-2 text-right">Bitte wähle ein Set aus.</p>
                  )}
                </div>
              </div>
            )}

            {/* ════ STEP 3: Haftung only ════ */}
            {step === 3 && (
              <div>
                <button type="button" onClick={() => setStep(2)} className="text-sm font-body text-accent-blue hover:underline mb-4 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  Zurück zu Zubehör
                </button>
                <h2 className="font-heading font-bold text-lg text-brand-black mb-1">
                  Haftungsschutz
                </h2>
                <p className="text-sm font-body text-brand-steel mb-6">
                  Wähle deinen Haftungsschutz für die Mietdauer.
                </p>

                {product.offersHaftungsoption ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider">
                        Haftungsschutz
                      </p>
                      <span className="text-xs font-body text-brand-muted">(Pauschal pro Buchung)</span>
                    </div>
                    <div className="space-y-3">
                      {haftungsoptionen.map((opt) => {
                        const selected = haftung === opt.id;
                        return (
                          <div key={opt.id} className="flex flex-col">
                          <label
                            className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              selected
                                ? 'border-accent-blue bg-accent-blue-soft/30'
                                : 'border-brand-border bg-white hover:border-brand-muted'
                            }`}
                          >
                            <input
                              type="radio"
                              name="haftung"
                              value={opt.id}
                              checked={selected}
                              onChange={() => {
                                setHaftung(opt.id);
                                // Bestätigungen zurücksetzen bei Optionswechsel
                                setConfirmLiability(false);
                                setConfirmRead(false);
                              }}
                              className="sr-only"
                              aria-label={opt.name}
                            />
                            {/* Radio indicator */}
                            <div
                              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                selected ? 'border-accent-blue' : 'border-brand-border bg-white'
                              }`}
                              aria-hidden="true"
                            >
                              {selected && (
                                <div className="w-2.5 h-2.5 rounded-full bg-accent-blue" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <p className="font-heading font-semibold text-sm text-brand-black">
                                  {opt.name}
                                </p>
                                {opt.badge && (
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-heading font-semibold ${opt.badgeColor}`}>
                                    {opt.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-body text-brand-steel mb-1">
                                {opt.description}
                              </p>
                              <p className={`text-xs font-body font-semibold ${selected ? 'text-accent-blue' : 'text-brand-muted'}`}>
                                Eigenbeteiligung: {opt.liability.replace('Max. ', '').replace(' Eigenbeteiligung', '')}
                              </p>
                            </div>

                            <div className="text-right flex-shrink-0">
                              {(() => {
                                const h = dynPrices?.haftung;
                                const days = breakdown?.days ?? 1;
                                const p = opt.id === 'standard'
                                  ? calcHaftungTieredPrice(h?.standard ?? 15, h?.standardIncrement ?? 5, days)
                                  : opt.id === 'premium'
                                  ? calcHaftungTieredPrice(h?.premium ?? 25, h?.premiumIncrement ?? 10, days)
                                  : 0;
                                return p === 0
                                  ? <p className="font-heading font-bold text-sm text-brand-muted">0 €</p>
                                  : <p className="font-heading font-bold text-sm text-brand-black">+{p} €</p>;
                              })()}
                              <p className="text-xs font-body text-brand-muted">
                                {(breakdown?.days ?? 1) <= 7 ? 'erste Woche' : `${Math.ceil((breakdown?.days ?? 1) / 7)} Wochen`}
                              </p>
                            </div>
                          </label>
                          {/* Bestätigungen direkt unter "Keine Haftungsbegrenzung" */}
                          {opt.id === 'none' && haftung === 'none' && (
                          <div className="rounded-xl border-2 border-status-error/50 bg-red-50 p-4 -mt-2 rounded-t-none border-t-0">
                        {/* Warning header */}
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-8 h-8 rounded-full bg-status-error/10 flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-status-error" aria-hidden="true">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-heading font-bold text-sm text-status-error">
                              Pflichtbestätigung erforderlich
                            </p>
                            <p className="text-xs font-body text-red-600">
                              Ohne Haftungsschutz trägst du das volle Risiko. Bitte bestätige beide Punkte.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {/* Checkbox 1: Volle Haftung */}
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={confirmLiability}
                              onChange={() => setConfirmLiability(!confirmLiability)}
                              className="sr-only"
                              aria-label="Ich akzeptiere die volle Haftung"
                            />
                            <div
                              className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                confirmLiability
                                  ? 'border-status-error bg-status-error'
                                  : 'border-status-error/50 bg-white group-hover:border-status-error'
                              }`}
                              aria-hidden="true"
                            >
                              {confirmLiability && (
                                <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <p className="text-sm font-body text-red-800 leading-snug">
                              Ich bin mir bewusst, dass ich im Schadensfall (Beschädigung, Verlust oder Diebstahl) persönlich{' '}
                              <span className="font-semibold">bis zum vollen Wiederbeschaffungswert</span>{' '}
                              der Kamera hafte.
                            </p>
                          </label>

                          {/* Checkbox 2: Haftungsbedingungen gelesen */}
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={confirmRead}
                              onChange={() => setConfirmRead(!confirmRead)}
                              className="sr-only"
                              aria-label="Ich habe die Haftungsbedingungen gelesen"
                            />
                            <div
                              className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                confirmRead
                                  ? 'border-status-error bg-status-error'
                                  : 'border-status-error/50 bg-white group-hover:border-status-error'
                              }`}
                              aria-hidden="true"
                            >
                              {confirmRead && (
                                <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <p className="text-sm font-body text-red-800 leading-snug">
                              Ich habe die{' '}
                              <Link
                                href="/agb#haftung"
                                target="_blank"
                                className="font-semibold underline hover:text-status-error transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Haftungsbedingungen von Cam2Rent
                              </Link>{' '}
                              gelesen und erkenne sie an.
                            </p>
                          </label>
                        </div>

                        {/* Progress indicator */}
                        {(!confirmLiability || !confirmRead) && (
                          <p className="mt-3 text-xs font-body text-status-error flex items-center gap-1.5">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true">
                              <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm4.75-.75a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" clipRule="evenodd" />
                            </svg>
                            {!confirmLiability && !confirmRead
                              ? 'Beide Bestätigungen erforderlich um fortzufahren.'
                              : !confirmLiability
                              ? 'Bitte erste Bestätigung setzen.'
                              : 'Bitte Haftungsbedingungen bestätigen.'}
                          </p>
                        )}
                      </div>
                          )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Link to full Haftungsbedingungen (always visible) */}
                    <p className="text-xs font-body text-brand-muted mt-3">
                      Vollständige{' '}
                      <Link href="/agb#haftung" target="_blank" className="text-accent-blue hover:underline">
                        Haftungsbedingungen
                      </Link>{' '}
                      anzeigen
                    </p>
                  </div>
                ) : (
                  /* Kaution-only: product does not offer Haftungsoption */
                  <div className="rounded-xl border-2 border-accent-amber/50 bg-accent-amber-soft p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-full bg-accent-amber/20 flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-accent-amber" aria-hidden="true">
                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-heading font-bold text-sm text-amber-900">
                          Kaution erforderlich
                        </p>
                        <p className="text-xs font-body text-amber-800">
                          Für dieses Produkt wird eine Kaution erhoben.
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-body text-amber-900 mb-4">
                      Es wird eine Kaution in Höhe von{' '}
                      <span className="font-heading font-bold">{product.deposit} €</span>{' '}
                      auf deiner Zahlungsmethode reserviert. Die Kaution wird nach schadensfreier Rückgabe automatisch freigegeben.
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={confirmLiability}
                        onChange={() => setConfirmLiability(!confirmLiability)}
                        className="sr-only"
                        aria-label="Ich bestätige die Kaution"
                      />
                      <div
                        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          confirmLiability
                            ? 'border-accent-amber bg-accent-amber'
                            : 'border-amber-600/50 bg-white group-hover:border-accent-amber'
                        }`}
                        aria-hidden="true"
                      >
                        {confirmLiability && (
                          <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <p className="text-sm font-body text-amber-900 leading-snug">
                        Ich akzeptiere die Kaution von <span className="font-semibold">{product.deposit} €</span> und habe die{' '}
                        <Link
                          href="/agb#haftung"
                          target="_blank"
                          className="font-semibold underline hover:text-accent-amber transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Haftungsbedingungen
                        </Link>{' '}
                        gelesen.
                      </p>
                    </label>
                  </div>
                )}

                <div className="mt-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-6 py-3 text-brand-steel font-heading font-semibold text-sm rounded-[10px] border border-brand-border hover:bg-brand-bg transition-colors"
                  >
                    ← Zubehör
                  </button>
                  <button
                    type="button"
                    disabled={
                      product.offersHaftungsoption
                        ? haftung === 'none' && (!confirmLiability || !confirmRead)
                        : !confirmLiability
                    }
                    onClick={() => { setStep(4); setReturnToSummary(false); }}
                    className="px-8 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Weiter: Zusammenfassung
                  </button>
                </div>
              </div>
            )}

            {/* ════ STEP 6: Stripe Payment ════ */}
            {step === 6 && clientSecret && breakdown && (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  locale: 'de',
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#3b82f6',
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                      borderRadius: '10px',
                      spacingUnit: '4px',
                    },
                  },
                }}
              >
                <PaymentStep
                  total={effectiveTotal}
                  onBack={() => {
                    setStep(5);
                    setClientSecret(null);
                    setIntentError(null);
                  }}
                />
              </Elements>
            )}

            {/* ════ STEP 4: Summary ════ */}
            {step === 4 && breakdown && range?.from && (
              <div>
                <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">
                  Zusammenfassung
                </h2>
                <p className="text-sm font-body text-brand-steel dark:text-gray-400 mb-6">
                  Prüfe deine Buchung und lege sie in den Warenkorb.
                </p>

                {/* Block 1: Zeitraum & Versand */}
                <div className="rounded-xl border border-brand-border overflow-hidden mb-5">
                  <div className="flex justify-between items-center px-4 py-2 bg-brand-bg/50 dark:bg-white/5 border-b border-brand-border">
                    <span className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Zeitraum & Versand</span>
                    <button type="button" onClick={() => { setReturnToSummary(true); setStep(1); }} className="text-xs font-heading font-semibold text-accent-blue hover:underline">Ändern →</button>
                  </div>
                  {/* Abholung top row */}
                  {deliveryMode === 'abholung' && (
                    <div className="bg-accent-teal-soft px-4 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-heading font-semibold text-accent-teal uppercase tracking-wider">
                        Abholung
                      </span>
                      <span className="font-heading font-bold text-sm text-accent-teal">
                        {format(subDays(range.from, 1), 'EEE, dd. MMM yyyy', { locale: de })}
                      </span>
                    </div>
                  )}

                  {/* Rental period */}
                  <div className="bg-brand-bg px-4 py-3">
                    <p className="font-heading font-semibold text-brand-black">{product.name}</p>
                    <p className="text-sm font-body text-brand-steel mt-0.5">
                      {breakdown.days === 1
                        ? `Miete: ${format(range.from, 'dd. MMM yyyy', { locale: de })} • 1 Tag`
                        : `Miete: ${format(range.from, 'dd. MMM', { locale: de })} – ${format(range.to!, 'dd. MMM yyyy', { locale: de })} • ${breakdown.days} Tage`}
                    </p>
                    <p className="text-xs font-body text-brand-muted mt-1">
                      {deliveryMode === 'abholung' ? 'Selbst abholen & zurückbringen' : 'Lieferung per Versand'}
                    </p>
                  </div>

                  {/* Abholung bottom row */}
                  {deliveryMode === 'abholung' && (
                    <div className="bg-accent-teal-soft px-4 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-heading font-semibold text-accent-teal uppercase tracking-wider">
                        Rückgabe
                      </span>
                      <span className="font-heading font-bold text-sm text-accent-teal">
                        {format(addDays(range.to ?? range.from, 1), 'EEE, dd. MMM yyyy', { locale: de })}
                      </span>
                    </div>
                  )}

                  {/* Versand hint */}
                  {deliveryMode === 'versand' && (
                    <div className="bg-accent-blue-soft/50 px-4 py-2.5">
                      <p className="text-xs font-body text-accent-blue">
                        Versand & Rücksendung werden nach Buchungsabschluss koordiniert.
                      </p>
                    </div>
                  )}
                </div>

                {/* Price breakdown */}
                <div className="space-y-2.5 mb-5">
                  <div className="flex justify-between items-center text-sm font-body">
                    <span className="text-brand-steel">
                      Miete ({breakdown.days} {breakdown.days === 1 ? 'Tag' : 'Tage'})
                    </span>
                    <span className="font-semibold text-brand-black">
                      {fmt(breakdown.rentalPrice)} €
                    </span>
                  </div>

                  {selectedSet && (
                    <div className="flex justify-between items-center text-sm font-body">
                      <span className="text-brand-steel">
                        {selectedSet.name}
                        {selectedSet.pricingMode === 'perDay' && selectedSet.price > 0 && (
                          <span className="text-xs text-brand-muted ml-1">
                            ({fmt(selectedSet.price)} € × {breakdown.days} {breakdown.days === 1 ? 'Tag' : 'Tage'})
                          </span>
                        )}
                      </span>
                      <span className="font-semibold text-brand-black">
                        {fmt(setPrice)} €
                      </span>
                    </div>
                  )}
                  {breakdown.accessoryPrice > 0 && (
                    <div className="flex justify-between items-center text-sm font-body">
                      <span className="text-brand-steel">
                        Zubehör{accessories.length > 0 ? ` (${accessories.length} ${accessories.length === 1 ? 'Artikel' : 'Artikel'})` : ''}
                      </span>
                      <span className="font-semibold text-brand-black">
                        {fmt(breakdown.accessoryPrice)} €
                      </span>
                    </div>
                  )}

                  {breakdown.haftungPrice > 0 && (
                    <div className="flex justify-between items-center text-sm font-body">
                      <span className="text-brand-steel">
                        {haftungsoptionen.find((h) => h.id === haftung)?.name}
                      </span>
                      <span className="font-semibold text-brand-black">
                        {breakdown.haftungPrice} €
                      </span>
                    </div>
                  )}

                  {deliveryMode === 'versand' && (
                    <div className="flex justify-between items-center text-sm font-body">
                      <span className="text-brand-steel flex items-center gap-1.5">
                        Versand
                        <span className="text-xs px-1.5 py-0.5 rounded bg-brand-bg text-brand-muted font-heading">
                          {shippingMethod === 'express' ? 'Express' : 'Standard'}
                        </span>
                      </span>
                      {breakdown.shippingIsFree ? (
                        <span className="font-semibold text-status-success text-sm">Kostenlos</span>
                      ) : (
                        <span className="font-semibold text-brand-black">
                          {fmt(breakdown.shippingPrice)} €
                        </span>
                      )}
                    </div>
                  )}

                  {taxMode === 'regelbesteuerung' ? (
                    <div className="flex justify-between items-center text-sm font-body border-t border-brand-border pt-2.5">
                      <span className="text-brand-steel">Enthaltene MwSt. ({taxRate}%)</span>
                      <span className="text-brand-steel">
                        {fmt(effectiveTotal - effectiveTotal / (1 + taxRate / 100))} €
                      </span>
                    </div>
                  ) : (
                    <div className="border-t border-brand-border pt-2.5">
                      <span className="text-xs text-brand-muted">Gem. §19 UStG keine MwSt.</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t-2 border-brand-black pt-2.5">
                    <span className="font-heading font-bold text-brand-black">Gesamt</span>
                    <span className="font-heading font-bold text-xl text-brand-black">
                      {fmt(effectiveTotal)} €
                    </span>
                  </div>
                </div>

                {/* Block 3: Haftungsschutz */}
                {breakdown.haftungPrice > 0 && product.offersHaftungsoption && (
                  <div className="mb-5 bg-brand-bg dark:bg-white/5 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider">
                        Haftungsschutz
                      </p>
                      <button type="button" onClick={() => { setReturnToSummary(true); setStep(3); }} className="text-xs font-heading font-semibold text-accent-blue hover:underline">Ändern →</button>
                    </div>
                    {(() => {
                      const opt = haftungsoptionen.find((h) => h.id === haftung)!;
                      return (
                        <div className="flex items-start gap-2.5">
                          <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 flex-shrink-0 mt-0.5 ${haftung === 'none' ? 'text-brand-muted' : 'text-status-success'}`} aria-hidden="true">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-sm font-body font-semibold text-brand-black">{opt.name}</p>
                            <p className="text-xs font-body text-brand-steel mt-0.5">{opt.liability}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Selected set or individual accessories */}
                {/* Block 2: Set & Zubehör */}
                {selectedSet ? (
                  <div className="mb-5 bg-brand-bg dark:bg-white/5 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider">
                        Set & Zubehör
                      </p>
                      <button type="button" onClick={() => { setReturnToSummary(true); setStep(2); }} className="text-xs font-heading font-semibold text-accent-blue hover:underline">Ändern →</button>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-heading font-semibold text-sm text-brand-black">{selectedSet.name}</p>
                      {selectedSet.badge && (
                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-heading font-semibold ${selectedSet.badgeColor}`}>
                          {selectedSet.badge}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {getFilteredSetItems().map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm font-body text-brand-steel">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-status-success flex-shrink-0" aria-hidden="true">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : accessories.length > 0 && (
                  <div className="mb-5 bg-brand-bg rounded-xl p-4">
                    <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider mb-2">
                      Gewähltes Zubehör
                    </p>
                    <ul className="space-y-2">
                      {accessories.map((id) => {
                        const acc = dbAccessories.find((a) => a.id === id)!;
                        const accPrice = getAccessoryPrice(acc, breakdown.days);
                        return (
                          <li key={id} className="flex items-center justify-between gap-2 text-sm font-body">
                            <div className="flex items-center gap-2 text-brand-text">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-status-success flex-shrink-0" aria-hidden="true">
                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                              </svg>
                              <span>{acc.name}</span>
                              <span className="text-brand-muted text-xs">
                                {acc.pricingMode === 'flat'
                                  ? 'einmalig'
                                  : `× ${breakdown.days} ${breakdown.days === 1 ? 'Tag' : 'Tage'}`}
                              </span>
                            </div>
                            <span className="font-semibold text-brand-black">{fmt(accPrice)} €</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="mt-8">
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) {
                        setShowAuthGate(true);
                      } else {
                        setStep(5);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {user ? 'Weiter: Mietvertrag' : 'Weiter: Anmelden & Mietvertrag'}
                  </button>
                  {!user && (
                    <p className="mt-3 text-xs font-body text-brand-muted text-center">
                      Für den Mietvertrag benötigen wir dein Konto — Anmeldung oder Registrierung im nächsten Schritt.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ════ STEP 5: Mietvertrag & Unterschrift ════ */}
            {step === 5 && breakdown && range?.from && (
              <div>
                {contractSignature ? (
                  /* Bereits unterschrieben — In den Warenkorb */
                  <div>
                    <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-start gap-3">
                      <svg className="w-5 h-5 text-status-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-heading font-semibold text-green-800 dark:text-green-300">Mietvertrag unterschrieben</p>
                        <p className="text-xs font-body text-green-700 dark:text-green-400 mt-0.5">
                          Unterschrieben von {contractSignature.signerName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setStep(4)}
                        className="px-6 py-3 text-brand-steel font-heading font-semibold text-sm rounded-[10px] border border-brand-border hover:bg-brand-bg transition-colors"
                      >
                        Zurück
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!breakdown || !range?.from || !product) return;
                          // Signatur in sessionStorage speichern für confirm-booking
                          try {
                            sessionStorage.setItem('cam2rent_contract_signature', JSON.stringify(contractSignature));
                          } catch { /* sessionStorage nicht verfügbar */ }
                          addItem({
                            id: crypto.randomUUID(),
                            productId: product.id,
                            productName: product.name,
                            productSlug: product.slug,
                            rentalFrom: format(range.from, 'yyyy-MM-dd'),
                            rentalTo: format(range.to ?? range.from, 'yyyy-MM-dd'),
                            days: breakdown.days,
                            accessories: selectedSet ? [] : accessories,
                            haftung,
                            priceRental: breakdown.rentalPrice,
                            priceAccessories: selectedSet ? setPrice : breakdown.accessoryPrice,
                            priceHaftung: breakdown.haftungPrice,
                            subtotal: breakdown.rentalPrice + (selectedSet ? setPrice : breakdown.accessoryPrice) + breakdown.haftungPrice,
                            deposit: product.deposit,
                          });
                          router.push('/warenkorb');
                        }}
                        className="flex items-center gap-2 px-8 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                        </svg>
                        In den Warenkorb — {fmt(effectiveTotal)} €
                      </button>
                    </div>
                  </div>
                ) : (
                  <SignatureStep
                    customerName={user?.user_metadata?.full_name ?? user?.email ?? ''}
                    customerEmail={user?.email ?? ''}
                    productName={product.name}
                    accessories={selectedSet
                      ? getFilteredSetItems()
                      : accessories.map((id) => dbAccessories.find((a) => a.id === id)?.name ?? id)}
                    rentalFrom={format(range.from, 'dd.MM.yyyy', { locale: de })}
                    rentalTo={format(range.to ?? range.from, 'dd.MM.yyyy', { locale: de })}
                    rentalDays={breakdown.days}
                    priceTotal={effectiveTotal}
                    deposit={product.deposit}
                    onSigned={(data) => setContractSignature(data)}
                    onBack={() => setStep(4)}
                  />
                )}
              </div>
            )}
          </div>

          {/* ── Sidebar (nur auf Steps 1-3, nicht auf Zusammenfassung/Vertrag) ── */}
          <div className={`mt-6 lg:mt-0 lg:sticky lg:top-24 lg:self-start flex flex-col gap-4 ${step >= 4 ? 'hidden' : ''}`}>
            <div className="bg-white rounded-card shadow-card p-5">
              <h3 className="font-heading font-semibold text-base text-brand-black mb-4">
                Deine Buchung
              </h3>

              {/* Product */}
              <div className="flex items-center gap-3 pb-4 border-b border-brand-border">
                <div className="w-12 h-12 rounded-xl bg-accent-blue-soft flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 80 60" fill="none" className="w-8 h-6" aria-hidden="true">
                    <rect x="8" y="18" width="64" height="36" rx="6" fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="2" />
                    <circle cx="40" cy="36" r="13" fill="#3b82f6" fillOpacity="0.25" stroke="#3b82f6" strokeWidth="2" />
                    <circle cx="40" cy="36" r="7" fill="#3b82f6" fillOpacity="0.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-heading font-semibold text-sm text-brand-black truncate">{product.name}</p>
                  <p className="text-xs font-body text-brand-steel">{product.brand}</p>
                </div>
              </div>

              {/* Delivery mode chip */}
              <div className="py-3 border-b border-brand-border">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-heading font-semibold ${
                    deliveryMode === 'abholung'
                      ? 'bg-accent-teal-soft text-accent-teal'
                      : 'bg-accent-blue-soft text-accent-blue'
                  }`}>
                    {deliveryMode === 'abholung' ? (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                        <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm8-3.5a.75.75 0 01.75.75v3.19l2.28 2.28a.75.75 0 11-1.06 1.06l-2.5-2.5a.75.75 0 01-.22-.53V5.25A.75.75 0 018 4.5z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                        <path d="M1 3.5A1.5 1.5 0 012.5 2h11A1.5 1.5 0 0115 3.5V5h-2.5V3.5A.5.5 0 0012 3H4a.5.5 0 00-.5.5V5H1V3.5z" />
                        <path fillRule="evenodd" d="M1 6h14v6.5A1.5 1.5 0 0113.5 14h-11A1.5 1.5 0 011 12.5V6zm2.5 2a.5.5 0 000 1h5a.5.5 0 000-1h-5z" clipRule="evenodd" />
                      </svg>
                    )}
                    {deliveryMode === 'abholung' ? 'Selbst abholen' : 'Versand'}
                  </span>
                </div>
              </div>

              {/* Dates */}
              <div className="py-4 border-b border-brand-border space-y-2">
                {/* Abholung: show pickup date */}
                {deliveryMode === 'abholung' && range?.from && (
                  <div className="flex justify-between text-xs font-body">
                    <span className="text-accent-teal font-semibold">Abholung</span>
                    <span className="font-medium text-accent-teal">
                      {format(subDays(range.from, 1), 'dd. MMM yyyy', { locale: de })}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-body">
                  <span className="text-brand-steel">Mietbeginn</span>
                  <span className="font-medium text-brand-black">
                    {range?.from ? format(range.from, 'dd. MMM yyyy', { locale: de }) : '–'}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-body">
                  <span className="text-brand-steel">Mietende</span>
                  <span className="font-medium text-brand-black">
                    {range?.from
                      ? format(range.to ?? range.from, 'dd. MMM yyyy', { locale: de })
                      : '–'}
                  </span>
                </div>

                {/* Abholung: show return date */}
                {deliveryMode === 'abholung' && range?.from && (
                  <div className="flex justify-between text-xs font-body">
                    <span className="text-accent-teal font-semibold">Rückgabe</span>
                    <span className="font-medium text-accent-teal">
                      {format(addDays(range.to ?? range.from, 1), 'dd. MMM yyyy', { locale: de })}
                    </span>
                  </div>
                )}

                {breakdown && (
                  <div className="flex justify-between text-sm font-body pt-1">
                    <span className="text-brand-steel">Miettage</span>
                    <span className="font-medium text-brand-black">
                      {breakdown.days} {breakdown.days === 1 ? 'Tag' : 'Tage'}
                    </span>
                  </div>
                )}
              </div>

              {/* Prices */}
              <div className="pt-4 space-y-1.5">
                {breakdown ? (
                  <>
                    <div className="flex justify-between text-sm font-body">
                      <span className="text-brand-steel">Miete</span>
                      <span className="text-brand-black">{fmt(breakdown.rentalPrice)} €</span>
                    </div>
                    {selectedSet && (
                      <div className="flex justify-between text-sm font-body">
                        <span className="text-brand-steel truncate pr-2">
                          {selectedSet.name}
                          {selectedSet.pricingMode === 'perDay' && selectedSet.price > 0 && (
                            <span className="text-xs text-brand-muted ml-1">
                              ({fmt(selectedSet.price)} € × {breakdown.days} {breakdown.days === 1 ? 'Tag' : 'Tage'})
                            </span>
                          )}
                        </span>
                        <span className="text-brand-black flex-shrink-0">{fmt(setPrice)} €</span>
                      </div>
                    )}
                    {breakdown.accessoryPrice > 0 && (
                      <div className="flex justify-between text-sm font-body">
                        <span className="text-brand-steel">
                          Zubehör{accessories.length > 0 ? ` (${accessories.length})` : ''}
                        </span>
                        <span className="text-brand-black">{fmt(breakdown.accessoryPrice)} €</span>
                      </div>
                    )}
                    {breakdown.haftungPrice > 0 && (
                      <div className="flex justify-between text-sm font-body">
                        <span className="text-brand-steel">
                          {haftungsoptionen.find((h) => h.id === haftung)?.name ?? 'Haftungsschutz'}
                        </span>
                        <span className="text-brand-black">{breakdown.haftungPrice} €</span>
                      </div>
                    )}
                    {deliveryMode === 'versand' && (
                      <div className="flex justify-between text-sm font-body">
                        <span className="text-brand-steel">Versand</span>
                        {breakdown.shippingIsFree ? (
                          <span className="text-status-success font-semibold text-xs">Kostenlos</span>
                        ) : (
                          <span className="text-brand-black">{fmt(breakdown.shippingPrice)} €</span>
                        )}
                      </div>
                    )}
                    <div className="border-t border-brand-border pt-3 mt-2 flex justify-between items-center">
                      <span className="font-heading font-bold text-brand-black">Gesamt</span>
                      <span className="font-heading font-bold text-lg text-brand-black">
                        {fmt(effectiveTotal)} €
                      </span>
                    </div>
                    <p className="text-xs font-body text-brand-muted pt-1">
                      Kaution {product.deposit} € wird separat reserviert
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-body text-brand-muted text-center py-4">
                    Wähle einen Zeitraum um den Preis zu sehen.
                  </p>
                )}
              </div>

              {/* Haftungsoption chip */}
              {step >= 3 && (
                <div className="mt-4 pt-4 border-t border-brand-border">
                  <p className="text-xs font-body text-brand-muted mb-1.5">Haftungsschutz</p>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-heading font-semibold ${
                    haftung === 'premium'
                      ? 'bg-accent-teal-soft text-accent-teal'
                      : haftung === 'standard'
                      ? 'bg-accent-blue-soft text-accent-blue'
                      : 'bg-brand-bg text-brand-muted'
                  }`}>
                    {haftung === 'none' ? 'Keine Begrenzung' : haftungsoptionen.find((h) => h.id === haftung)?.name}
                  </span>
                </div>
              )}
            </div>

            {/* Im Paket enthalten — Sidebar */}
            {selectedSet && step >= 2 && (
              <div className="mt-4 bg-white rounded-card shadow-card p-5">
                <p className="text-xs font-body font-semibold text-brand-steel uppercase tracking-wider mb-3">
                  Im Paket enthalten
                </p>
                <p className="text-sm font-heading font-semibold text-brand-black mb-3">{selectedSet.name}</p>
                <div className="space-y-1.5">
                  {(() => {
                    const counts: Record<string, number> = {};
                    const filteredItems = getFilteredSetItems();
                    for (const item of filteredItems) counts[item] = (counts[item] ?? 0) + 1;
                    for (const accId of accessories) {
                      const acc = dbAccessories.find((a) => a.id === accId);
                      if (acc) counts[acc.name] = (counts[acc.name] ?? 0) + 1;
                    }
                    return Object.entries(counts).map(([name, qty]) => (
                      <div key={name} className="flex items-center gap-2">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-status-success flex-shrink-0">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-body text-brand-black">{qty > 1 ? `${qty}x ` : ''}{name}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auth-Gate Modal — vor dem Mietvertrag anmelden/registrieren */}
      {showAuthGate && !user && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Anmelden oder registrieren"
        >
          <div className="relative w-full max-w-lg my-8">
            <button
              type="button"
              onClick={() => setShowAuthGate(false)}
              className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-white dark:bg-brand-dark shadow-lg flex items-center justify-center text-brand-steel hover:text-brand-black dark:hover:text-white transition-colors"
              aria-label="Schließen"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-accent-blue-soft flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white leading-tight">
                    Letzter Schritt vor dem Mietvertrag
                  </h2>
                  <p className="text-sm font-body text-brand-steel dark:text-gray-400 mt-0.5">
                    Melde dich an oder registriere dich, um den Vertrag zu unterschreiben.
                  </p>
                </div>
              </div>
              <p className="text-xs font-body text-brand-muted dark:text-gray-500">
                Der Mietvertrag wird in deinem Konto gespeichert, damit du ihn jederzeit abrufen kannst. Deine Buchung bleibt währenddessen erhalten.
              </p>
            </div>

            <ExpressSignup
              onAuthenticated={() => {
                setShowAuthGate(false);
                setStep(5);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

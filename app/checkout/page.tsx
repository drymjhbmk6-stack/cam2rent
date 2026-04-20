'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { getStripePromise } from '@/lib/stripe-client';
import { useCart } from '@/components/CartProvider';
import { useAuth } from '@/components/AuthProvider';
import { createAuthBrowserClient } from '@/lib/supabase-auth';
import { calcDiscount, type Coupon } from '@/data/coupons';
import { calcShipping, shippingConfig } from '@/data/shipping';
import type { ShippingMethod } from '@/data/shipping';
import type { ShippingPriceConfig, DurationDiscount, LoyaltyDiscount, ProductDiscount } from '@/lib/price-config';
import { calcDurationDiscount, calcLoyaltyDiscount, getActiveProductDiscount } from '@/lib/price-config';
import { useAccessories } from '@/components/AccessoriesProvider';
import { getAccessoryPrice } from '@/data/accessories';
import { BUSINESS } from '@/lib/business-config';

const stripePromise = getStripePromise();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}

// extractVat entfernt — wird in der neuen Zusammenfassung nicht mehr gebraucht

type DeliveryMode = 'versand' | 'abholung';

// ─── Payment form (inside <Elements>) ─────────────────────────────────────────

function PaymentForm({
  total,
  onBack,
  cartItems,
  customerName,
  customerEmail,
  userId,
  deliveryMode,
  shippingMethod,
  shippingPrice,
  discountAmount,
  couponCode,
  productDiscount,
  durationDiscount,
  loyaltyDiscount,
  referralCode,
  street,
  zip,
  city,
}: {
  total: number;
  onBack: () => void;
  cartItems: ReturnType<typeof useCart>['items'];
  customerName: string;
  customerEmail: string;
  userId?: string;
  deliveryMode: DeliveryMode;
  shippingMethod: ShippingMethod;
  shippingPrice: number;
  discountAmount: number;
  couponCode: string;
  productDiscount: number;
  durationDiscount: number;
  loyaltyDiscount: number;
  referralCode: string;
  street: string;
  zip: string;
  city: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsLoading(true);
    setError(null);

    // Save checkout context to sessionStorage so confirm page can read it
    // Vertragssignatur aus separatem Key einbetten (falls vorhanden)
    let contractSignature: unknown = undefined;
    try {
      const sigRaw = sessionStorage.getItem('cam2rent_contract_signature');
      if (sigRaw) contractSignature = JSON.parse(sigRaw);
    } catch { /* ignore */ }

    sessionStorage.setItem(
      'cam2rent_checkout_context',
      JSON.stringify({
        items: cartItems,
        customerName,
        customerEmail,
        userId: userId ?? null,
        deliveryMode,
        shippingMethod,
        shippingPrice,
        discountAmount,
        couponCode,
        productDiscount,
        durationDiscount,
        loyaltyDiscount,
        referralCode,
        street,
        zip,
        city,
        contractSignature,
      })
    );

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/buchung-bestaetigt?from=cart`,
      },
    });

    if (stripeError) {
      setError(stripeError.message ?? 'Ein Fehler ist aufgetreten.');
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-6">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-status-error">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="px-6 py-3 text-brand-steel dark:text-gray-400 font-heading font-semibold text-sm rounded-btn border border-brand-border dark:border-white/10 hover:bg-brand-bg dark:hover:bg-white/5 dark:bg-brand-black transition-colors disabled:opacity-40"
        >
          Zurück
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || isLoading}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Wird verarbeitet…
            </>
          ) : (
            <>
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
              {fmt(total)} jetzt bezahlen
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-brand-muted dark:text-gray-500 mt-4 flex items-center gap-1.5 justify-center">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 flex-shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
            clipRule="evenodd"
          />
        </svg>
        Sichere Zahlung über Stripe – SSL-verschlüsselt
      </p>

      <div className="mt-5 p-4 bg-brand-bg dark:bg-brand-black rounded-[10px] text-xs text-brand-muted dark:text-gray-500 space-y-1">
        <p><strong className="text-brand-steel dark:text-gray-400">Stornierung:</strong> Kostenlos bis 7 Tage vor Mietstart · 50 % Gebühr 3–6 Tage vorher (nur per E-Mail) · keine Erstattung ≤ 2 Tage vorher.</p>
        <p>Gemäß § 312g Abs. 2 Nr. 9 BGB besteht für zeitgebundene Mietverträge kein gesetzliches Widerrufsrecht.</p>
      </div>
    </form>
  );
}

// ─── Main checkout page ────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const { accessories: ALL_ACCESSORIES } = useAccessories();
  const router = useRouter();
  const { items, cartTotal, itemCount, clearCart, hydrated } = useCart();
  const { user } = useAuth();

  // Step: 'details' | 'payment'
  const [step, setStep] = useState<'details' | 'payment'>('details');

  // Customer data
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');

  // Shipping
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('versand');
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('standard');
  const [dynShipping, setDynShipping] = useState<ShippingPriceConfig>(shippingConfig);

  // Auto-discounts config (fetched from /api/prices)
  const [durationDiscounts, setDurationDiscounts] = useState<DurationDiscount[]>([]);
  const [loyaltyDiscounts, setLoyaltyDiscounts] = useState<LoyaltyDiscount[]>([]);
  const [productDiscounts, setProductDiscounts] = useState<ProductDiscount[]>([]);
  const [userBookingCount, setUserBookingCount] = useState(0);

  // Tax config
  const [taxMode, setTaxMode] = useState<'kleinunternehmer' | 'regelbesteuerung'>('kleinunternehmer');
  const [, setTaxRate] = useState(19);

  useEffect(() => {
    fetch('/api/prices')
      .then((r) => r.json())
      .then((d) => {
        if (d.shipping) setDynShipping(d.shipping);
        if (d.durationDiscounts) setDurationDiscounts(d.durationDiscounts);
        if (d.loyaltyDiscounts) setLoyaltyDiscounts(d.loyaltyDiscounts);
        if (d.productDiscounts) setProductDiscounts(d.productDiscounts);
      })
      .catch(() => {});
    fetch('/api/tax-config')
      .then((r) => r.json())
      .then((d) => {
        setTaxMode(d.taxMode || 'kleinunternehmer');
        setTaxRate(d.taxRate || 19);
      })
      .catch(() => {});
  }, []);

  // Fetch user booking count + verification status
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) { setIsVerified(null); return; }
    const supabase = createAuthBrowserClient();
    supabase
      .from('profiles')
      .select('booking_count, verification_status')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.booking_count) setUserBookingCount(data.booking_count);
        setIsVerified(data?.verification_status === 'verified');
      });
  }, [user]);

  // Referral code from sessionStorage
  const [referralCode] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('cam2rent_referral_code') ?? '';
    }
    return '';
  });

  // Coupon
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // Stripe
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [intentError, setIntentError] = useState('');

  // Pre-fill from profile
  useEffect(() => {
    if (!user) return;
    const supabase = createAuthBrowserClient();
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) {
          const parts = data.full_name.trim().split(' ');
          setFirstName(parts[0] ?? '');
          setLastName(parts.slice(1).join(' ') ?? '');
        } else if (user.user_metadata?.full_name) {
          const parts = (user.user_metadata.full_name as string).trim().split(' ');
          setFirstName(parts[0] ?? '');
          setLastName(parts.slice(1).join(' ') ?? '');
        }
        if (data?.phone) setPhone(data.phone);
        if (data?.address_street) setStreet(data.address_street);
        if (data?.address_zip) setZip(data.address_zip);
        if (data?.address_city) setCity(data.address_city);
      });
    if (user.email) setEmail(user.email);
  }, [user]);

  // Redirect if cart empty (erst nach Hydratisierung prüfen)
  useEffect(() => {
    if (hydrated && itemCount === 0) router.replace('/warenkorb');
  }, [hydrated, itemCount, router]);

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
      return { from, to, items: groupItems, key };
    });
  }, [items]);
  const hasMultiplePeriods = periodGroups.length > 1;

  // ── Auto-discount calculations ──────────────────────────────────────────────

  // Product discount: per-item discount on rental price (e.g. Black Friday 25% off)
  const productDiscountAmount = items.reduce((sum, item) => {
    const match = getActiveProductDiscount(item.productId, productDiscounts);
    if (!match) return sum;
    return sum + Math.round(item.priceRental * match.discount_percent) / 100;
  }, 0);
  // productDiscountLabel für zukünftige Nutzung
  void productDiscountAmount;

  // Duration discount: based on max rental days across all items
  const maxDays = items.reduce((m, it) => Math.max(m, it.days), 0);
  const durationMatch = calcDurationDiscount(maxDays, durationDiscounts);
  const durationDiscountAmount = durationMatch
    ? Math.round((cartTotal - productDiscountAmount) * durationMatch.discount_percent) / 100
    : 0;

  // Loyalty discount: applied on remainder after product + duration discount
  const afterPrevDiscounts = cartTotal - productDiscountAmount - durationDiscountAmount;
  const loyaltyMatch = user ? calcLoyaltyDiscount(userBookingCount, loyaltyDiscounts) : null;
  const loyaltyDiscountAmount = loyaltyMatch
    ? Math.round(afterPrevDiscounts * loyaltyMatch.discount_percent) / 100
    : 0;

  const afterAutoDiscounts = cartTotal - productDiscountAmount - durationDiscountAmount - loyaltyDiscountAmount;

  // ── Coupon discount (on remainder after auto-discounts) ───────────────────

  // Calculate the coupon base amount depending on target_type
  const couponBase = (() => {
    if (!appliedCoupon) return 0;

    // Single accessory
    if (appliedCoupon.target_type === 'accessory' && appliedCoupon.target_id) {
      return items.reduce((sum, item) => {
        if (!item.accessories.includes(appliedCoupon.target_id!)) return sum;
        const acc = ALL_ACCESSORIES.find((a) => a.id === appliedCoupon.target_id);
        return acc ? sum + getAccessoryPrice(acc, item.days) : sum;
      }, 0);
    }

    // Accessory group: sum cost of all accessories in the group across all cart items
    if (appliedCoupon.target_type === 'group' && appliedCoupon.target_group_id) {
      return items.reduce((sum, item) => {
        return sum + item.accessories.reduce((s, accId) => {
          const acc = ALL_ACCESSORIES.find((a) => a.id === accId && a.group === appliedCoupon.target_group_id);
          return acc ? s + getAccessoryPrice(acc, item.days) : s;
        }, 0);
      }, 0);
    }

    // Default: remainder after auto-discounts
    return afterAutoDiscounts;
  })();

  // True if coupon targets a specific item/group but nothing applicable is in the cart
  const couponNotApplicable =
    (appliedCoupon?.target_type === 'accessory' || appliedCoupon?.target_type === 'group') &&
    couponBase === 0;

  const couponDiscountAmount = appliedCoupon && !couponNotApplicable
    ? calcDiscount(appliedCoupon, couponBase)
    : 0;

  // "Nicht kombinierbar" — Gutschein deaktiviert Kunden-Rabatte (nicht Produktrabatte)
  const isNotCombinable = appliedCoupon?.not_combinable && couponDiscountAmount > 0;
  const effectiveProductDiscount = productDiscountAmount; // Produktrabatte gelten immer
  const effectiveDurationDiscount = isNotCombinable ? 0 : durationDiscountAmount;
  const effectiveLoyaltyDiscount = isNotCombinable ? 0 : loyaltyDiscountAmount;

  const totalDiscount = effectiveProductDiscount + effectiveDurationDiscount + effectiveLoyaltyDiscount + couponDiscountAmount;
  const discountedSubtotal = cartTotal - totalDiscount;
  // Versand wird auf ORIGINAL-Warenwert geprüft (vor Rabatten) — kundenfreundlich
  const shippingOnOriginal = calcShipping(cartTotal, shippingMethod, deliveryMode, dynShipping);
  const finalShipping = shippingOnOriginal.price;
  const total = discountedSubtotal + finalShipping;

  const handleApplyCoupon = async () => {
    setCouponError('');
    setCouponLoading(true);
    try {
      const res = await fetch('/api/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput, cartTotal: afterAutoDiscounts, userEmail: email }),
      });
      const data = await res.json();
      if (res.ok && data.coupon) {
        setAppliedCoupon(data.coupon as Coupon);
        setCouponInput('');
      } else {
        setCouponError(data.error ?? 'Ungültiger Gutschein-Code.');
      }
    } catch {
      setCouponError('Netzwerkfehler. Bitte versuche es erneut.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleProceedToPayment = async () => {
    if (!firstName || !email) {
      setIntentError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }
    if (deliveryMode === 'versand' && (!street || !zip || !city)) {
      setIntentError('Bitte gib deine Lieferadresse ein.');
      return;
    }

    setIsCreatingIntent(true);
    setIntentError('');

    try {
      const customerName = `${firstName} ${lastName}`.trim();
      const res = await fetch('/api/checkout-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: Math.round(total * 100),
          customerName,
          customerEmail: email,
          userId: user?.id,
          checkoutContext: {
            items,
            customerName,
            customerEmail: email,
            userId: user?.id ?? null,
            deliveryMode,
            shippingMethod,
            shippingPrice: finalShipping,
            discountAmount: couponDiscountAmount,
            couponCode: appliedCoupon?.code ?? '',
            productDiscount: effectiveProductDiscount,
            durationDiscount: effectiveDurationDiscount,
            loyaltyDiscount: effectiveLoyaltyDiscount,
            referralCode: referralCode ?? '',
            street,
            zip,
            city,
            earlyServiceConsentAt: (requiresEarlyServiceConsent && acceptsEarlyService) ? new Date().toISOString() : null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? 'Fehler beim Initialisieren der Zahlung.');
      }
      setClientSecret(data.clientSecret);
      setStep('payment');
    } catch (err) {
      setIntentError(
        err instanceof Error ? err.message : 'Zahlung konnte nicht gestartet werden.'
      );
    } finally {
      setIsCreatingIntent(false);
    }
  };

  // Unverified: Buchung ohne Zahlung anlegen
  const [pendingSuccess, setPendingSuccess] = useState<string | null>(null);
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [acceptsWithdrawal, setAcceptsWithdrawal] = useState(false);
  const [acceptsEarlyService, setAcceptsEarlyService] = useState(false);

  // Prüft ob eine Buchung vor Ablauf der 14-tägigen Widerrufsfrist beginnt.
  // § 356 Abs. 4 BGB greift nur in diesem Fall — sonst ist die Zustimmung
  // rechtlich nicht notwendig (normaler Widerruf bis zur Leistungserbringung).
  const earliestRentalFrom = useMemo(() => {
    if (!items.length) return null;
    const sorted = [...items].map((i) => i.rentalFrom).sort();
    return sorted[0];
  }, [items]);
  const requiresEarlyServiceConsent = useMemo(() => {
    if (!earliestRentalFrom) return false;
    const from = new Date(earliestRentalFrom);
    if (isNaN(from.getTime())) return false;
    const now = new Date();
    const diffMs = from.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays < 14;
  }, [earliestRentalFrom]);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [shipStreet, setShipStreet] = useState('');
  const [shipZip, setShipZip] = useState('');
  const [shipCity, setShipCity] = useState('');
  const handlePendingBooking = async () => {
    if (!user) {
      setIntentError('Bitte melde dich an, um eine Buchung anzufragen.');
      return;
    }
    if (!firstName || !email) {
      setIntentError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }
    if (deliveryMode === 'versand' && (!street || !zip || !city)) {
      setIntentError('Bitte gib deine Lieferadresse ein.');
      return;
    }

    setIsCreatingIntent(true);
    setIntentError('');

    try {
      const customerName = `${firstName} ${lastName}`.trim();
      const res = await fetch('/api/create-pending-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          customerName,
          customerEmail: email,
          userId: user.id,
          deliveryMode,
          shippingMethod,
          shippingPrice: finalShipping,
          discountAmount: couponDiscountAmount,
          couponCode: appliedCoupon?.code ?? '',
          durationDiscount: effectiveDurationDiscount,
          loyaltyDiscount: effectiveLoyaltyDiscount,
          earlyServiceConsentAt: (requiresEarlyServiceConsent && acceptsEarlyService) ? new Date().toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Buchung konnte nicht erstellt werden.');
      }
      setPendingSuccess(data.booking_id);
      clearCart();
    } catch (err) {
      setIntentError(
        err instanceof Error ? err.message : 'Buchung konnte nicht erstellt werden.'
      );
    } finally {
      setIsCreatingIntent(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-base';
  const labelClass = 'block text-sm font-body font-medium text-brand-black dark:text-white mb-1';

  if (itemCount === 0) return null;

  // Nicht eingeloggt: Eigene Seite mit Login/Registrierung
  if (!user) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4">
        <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8 text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
            Konto erforderlich
          </h1>
          <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-6">
            Um eine Buchung durchzuführen, benötigen wir ein Kundenkonto.
            So können wir deinen Ausweis prüfen und dir deine Buchungen zuordnen.
          </p>
          <div className="flex flex-col gap-3">
            <a href="/login?redirect=/checkout" className="w-full py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn text-center hover:bg-brand-dark dark:hover:bg-blue-700 transition-colors">
              Anmelden
            </a>
            <a href="/registrierung" className="w-full py-3 border-2 border-brand-black dark:border-white text-brand-black dark:text-white font-heading font-semibold text-sm rounded-btn text-center hover:bg-brand-bg dark:hover:bg-white/5 transition-colors">
              Neues Konto erstellen
            </a>
          </div>
          <p className="text-xs text-brand-muted dark:text-gray-500 mt-6">
            Dein Warenkorb bleibt gespeichert.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/warenkorb"
            className="inline-flex items-center gap-1.5 text-sm text-brand-steel dark:text-gray-400 hover:text-brand-black dark:text-white mb-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zurück zum Warenkorb
          </Link>
          <h1 className="font-heading font-bold text-xl sm:text-2xl text-brand-black dark:text-white">Zusammenfassung & Checkout</h1>
        </div>

        <div className="max-w-2xl mx-auto space-y-5">
            {step === 'details' ? (
              <>
                {/* Warenkorb-Zusammenfassung */}
                <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-5">
                  <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
                    {hasMultiplePeriods ? `Deine Bestellungen (${periodGroups.length})` : 'Deine Bestellung'}
                  </h2>
                  <div className="space-y-3">
                    {periodGroups.map((group, gi) => (
                      <div key={group.key}>
                        {hasMultiplePeriods && (
                          <div className="flex items-center gap-2 mb-2 mt-1 first:mt-0">
                            <span className="px-2 py-0.5 bg-accent-blue/10 text-accent-blue text-[10px] font-heading font-bold rounded-full">
                              Buchung {gi + 1}
                            </span>
                            <span className="text-[10px] text-brand-muted dark:text-gray-500">
                              {group.from} bis {group.to}
                            </span>
                          </div>
                        )}
                        {group.items.map((item, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 pb-3 border-b border-brand-border/50 dark:border-white/5 last:border-0 last:pb-0">
                            <div className="min-w-0">
                              <p className="font-heading font-semibold text-sm text-brand-black dark:text-white">{item.productName}</p>
                              <p className="text-xs text-brand-muted dark:text-gray-500 mt-0.5">
                                {item.days} {item.days === 1 ? 'Tag' : 'Tage'} · {item.rentalFrom} bis {item.rentalTo}
                              </p>
                              {item.accessories.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {item.accessories.map((accId) => (
                                    <span key={accId} className="px-1.5 py-0.5 bg-brand-bg dark:bg-white/5 rounded text-[10px] text-brand-steel dark:text-gray-400">
                                      {accId.replace(/-[a-z0-9]{6,}$/, '').split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="font-heading font-semibold text-sm text-brand-black dark:text-white flex-shrink-0">{fmt(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Preisaufstellung */}
                  <div className="mt-4 pt-3 border-t border-brand-border dark:border-white/10 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-brand-steel dark:text-gray-400">Zwischensumme</span>
                      <span className="text-brand-black dark:text-white">{fmt(cartTotal)}</span>
                    </div>
                    {finalShipping > 0 ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-steel dark:text-gray-400">Versand ({shippingMethod === 'express' ? 'Express' : 'Standard'})</span>
                        <span className="text-brand-black dark:text-white">{fmt(finalShipping)}</span>
                      </div>
                    ) : deliveryMode === 'versand' ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-steel dark:text-gray-400">Versand</span>
                        <span className="text-status-success font-semibold">Kostenlos</span>
                      </div>
                    ) : null}
                    {totalDiscount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-steel dark:text-gray-400">Rabatt</span>
                        <span className="text-status-success font-semibold">-{fmt(totalDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-brand-border dark:border-white/10">
                      <span className="font-heading font-bold text-brand-black dark:text-white">Gesamt</span>
                      <span className="font-heading font-bold text-lg text-brand-black dark:text-white">{fmt(total)}</span>
                    </div>
                    {taxMode === 'kleinunternehmer' && (
                      <p className="text-[10px] text-brand-muted dark:text-gray-500">Gem. §19 UStG keine MwSt.</p>
                    )}
                  </div>
                </div>

                {/* Customer data */}
                <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
                  <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
                    Kontaktdaten
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Vorname *</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className={inputClass}
                        placeholder="Max"
                        required
                        autoComplete="given-name"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Nachname</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className={inputClass}
                        placeholder="Mustermann"
                        autoComplete="family-name"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>E-Mail *</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputClass}
                        placeholder="max@email.de"
                        required
                        autoComplete="email"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Telefon</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={inputClass}
                        placeholder="+49 170 1234567"
                        autoComplete="tel"
                      />
                    </div>

                    {/* Adresse — immer sichtbar */}
                    <div>
                      <label className={labelClass}>Strasse und Hausnummer *</label>
                      <input type="text" value={street} onChange={(e) => setStreet(e.target.value)}
                        className={inputClass} placeholder="Musterstrasse 42" autoComplete="street-address" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>PLZ *</label>
                        <input type="text" value={zip} onChange={(e) => setZip(e.target.value)}
                          className={inputClass} placeholder="12345" autoComplete="postal-code" maxLength={5} />
                      </div>
                      <div>
                        <label className={labelClass}>Stadt *</label>
                        <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                          className={inputClass} placeholder="Berlin" autoComplete="address-level2" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping — aufklappbar */}
                <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
                  <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
                    Lieferung
                  </h2>

                  {/* Versand */}
                  <label
                    className={`block rounded-[10px] border-2 cursor-pointer transition-all mb-3 overflow-hidden ${
                      deliveryMode === 'versand'
                        ? 'border-accent-blue'
                        : 'border-brand-border dark:border-white/10 hover:border-brand-steel'
                    }`}
                  >
                    <div className={`flex items-start gap-3 p-4 ${deliveryMode === 'versand' ? 'bg-accent-blue-soft dark:bg-accent-blue/10' : ''}`}>
                      <input type="radio" name="deliveryMode" value="versand" checked={deliveryMode === 'versand'}
                        onChange={() => setDeliveryMode('versand')} className="mt-0.5 accent-accent-blue" />
                      <div>
                        <p className="font-body font-semibold text-brand-black dark:text-white text-sm">Versand</p>
                        <p className="text-xs text-brand-steel dark:text-gray-400 mt-0.5">Wir liefern zu dir nach Hause</p>
                      </div>
                    </div>

                    {/* Aufklappbar: Versandart + Adresse */}
                    {deliveryMode === 'versand' && (
                      <div className="px-4 pb-4 pt-2 border-t border-brand-border/50 dark:border-white/5" onClick={(e) => e.preventDefault()}>
                        {/* Versandart */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          {([
                            { id: 'standard' as ShippingMethod, label: 'Standard', sub: '3–5 Werktage', price: dynShipping.standardPrice },
                            { id: 'express' as ShippingMethod, label: 'Express', sub: 'Nächster Werktag', price: dynShipping.expressPrice },
                          ] as const).map((opt) => {
                            const isFree = opt.id === 'standard' && cartTotal >= dynShipping.freeShippingThreshold;
                            return (
                              <label key={opt.id}
                                className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${
                                  shippingMethod === opt.id
                                    ? 'border-accent-blue bg-accent-blue/5'
                                    : 'border-brand-border dark:border-white/10'
                                }`}>
                                <div className="flex items-center gap-2">
                                  <input type="radio" name="shippingMethod" value={opt.id} checked={shippingMethod === opt.id}
                                    onChange={() => setShippingMethod(opt.id)} className="accent-accent-blue" />
                                  <span className="font-body font-semibold text-sm text-brand-black dark:text-white">{opt.label}</span>
                                </div>
                                <p className="text-xs text-brand-muted mt-1 ml-6">{opt.sub}</p>
                                <p className="text-sm font-semibold mt-1 ml-6">
                                  {isFree ? <span className="text-status-success">Gratis</span> : <span className="text-brand-black dark:text-white">{fmt(opt.price)}</span>}
                                </p>
                              </label>
                            );
                          })}
                        </div>

                        {/* Lieferanschrift */}
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={sameAsBilling} onChange={(e) => setSameAsBilling(e.target.checked)}
                            className="w-4 h-4 rounded border-brand-border accent-accent-blue" />
                          <span className="text-sm font-body text-brand-black dark:text-white">Lieferanschrift ist gleich Rechnungsanschrift</span>
                        </label>

                        {!sameAsBilling && (
                          <div className="space-y-3 mt-3 pt-3 border-t border-brand-border/50 dark:border-white/5">
                            <p className="text-xs font-heading font-semibold text-brand-muted dark:text-gray-500 uppercase tracking-wider">Abweichende Lieferanschrift</p>
                            <div>
                              <label className={labelClass}>Strasse *</label>
                              <input type="text" value={shipStreet} onChange={(e) => setShipStreet(e.target.value)}
                                className={inputClass} placeholder="Lieferstrasse 1" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={labelClass}>PLZ *</label>
                                <input type="text" value={shipZip} onChange={(e) => setShipZip(e.target.value)}
                                  className={inputClass} placeholder="12345" maxLength={5} />
                              </div>
                              <div>
                                <label className={labelClass}>Stadt *</label>
                                <input type="text" value={shipCity} onChange={(e) => setShipCity(e.target.value)}
                                  className={inputClass} placeholder="Berlin" />
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </label>

                  {/* Abholung */}
                  <label
                    className={`block rounded-[10px] border-2 cursor-pointer transition-all overflow-hidden ${
                      deliveryMode === 'abholung'
                        ? 'border-accent-blue'
                        : 'border-brand-border dark:border-white/10 hover:border-brand-steel'
                    }`}
                  >
                    <div className={`flex items-start gap-3 p-4 ${deliveryMode === 'abholung' ? 'bg-accent-blue-soft dark:bg-accent-blue/10' : ''}`}>
                      <input type="radio" name="deliveryMode" value="abholung" checked={deliveryMode === 'abholung'}
                        onChange={() => setDeliveryMode('abholung')} className="mt-0.5 accent-accent-blue" />
                      <div>
                        <p className="font-body font-semibold text-brand-black dark:text-white text-sm">Selbst abholen</p>
                        <p className="text-xs text-brand-steel dark:text-gray-400 mt-0.5">Du holst die Kamera bei uns ab</p>
                      </div>
                    </div>

                    {/* Aufklappbar: Abholadresse */}
                    {deliveryMode === 'abholung' && (
                      <div className="px-4 pb-4 pt-2 border-t border-brand-border/50 dark:border-white/5" onClick={(e) => e.preventDefault()}>
                        <p className="text-xs font-heading font-semibold text-brand-muted dark:text-gray-500 uppercase tracking-wider mb-2">Abholadresse</p>
                        <div className="bg-brand-bg dark:bg-brand-black rounded-lg p-3">
                          <p className="font-body font-semibold text-sm text-brand-black dark:text-white">{BUSINESS.name || 'cam2rent'}</p>
                          <p className="text-xs text-brand-steel dark:text-gray-400 mt-1">
                            {BUSINESS.street}<br />
                            {BUSINESS.zip} {BUSINESS.city}
                          </p>
                          <p className="text-xs text-brand-muted dark:text-gray-500 mt-2">
                            Abholung nach Terminvereinbarung per E-Mail oder WhatsApp.
                          </p>
                        </div>
                      </div>
                    )}
                  </label>
                </div>

                {/* Coupon */}
                <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
                  <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
                    Gutschein-Code
                  </h2>

                  {appliedCoupon ? (
                    <div>
                      {couponNotApplicable ? (
                        /* Accessory coupon but item not in cart */
                        <div className="flex items-center justify-between p-4 rounded-[10px] bg-amber-50 border border-amber-200">
                          <div>
                            <p className="text-sm font-semibold text-amber-700">
                              {appliedCoupon.code} — nicht anwendbar
                            </p>
                            <p className="text-xs text-amber-600 mt-0.5">
                              Dieser Code gilt nur für{' '}
                              <strong>
                                {appliedCoupon.target_name ??
                                  appliedCoupon.target_id ??
                                  appliedCoupon.target_group_id}
                              </strong>
                              , {appliedCoupon.target_type === 'group'
                                ? 'die du nicht im Warenkorb hast.'
                                : 'das du nicht im Warenkorb hast.'}
                            </p>
                          </div>
                          <button
                            onClick={() => setAppliedCoupon(null)}
                            className="text-amber-500 hover:text-amber-700 transition-colors text-sm ml-3 flex-shrink-0"
                          >
                            Entfernen
                          </button>
                        </div>
                      ) : (
                        /* Coupon applied successfully */
                        <div className="flex items-center justify-between p-4 rounded-[10px] bg-green-50 border border-green-200">
                          <div>
                            <p className="text-sm font-semibold text-status-success">
                              {appliedCoupon.code} angewendet
                            </p>
                            <p className="text-xs text-brand-steel dark:text-gray-400 mt-0.5">
                              {appliedCoupon.description}
                              {appliedCoupon.target_type === 'accessory' && (
                                <span> auf {appliedCoupon.target_name}</span>
                              )}{' '}
                              (−{fmt(couponDiscountAmount)})
                            </p>
                          </div>
                          <button
                            onClick={() => setAppliedCoupon(null)}
                            className="text-brand-muted dark:text-gray-500 hover:text-status-error transition-colors text-sm ml-3 flex-shrink-0"
                          >
                            Entfernen
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                        className={`flex-1 ${inputClass}`}
                        placeholder="SUMMER25"
                      />
                      <button
                        onClick={handleApplyCoupon}
                        disabled={couponLoading}
                        className="px-4 py-3 border border-brand-border dark:border-white/10 text-brand-black dark:text-white font-body font-medium text-sm rounded-[10px] hover:bg-brand-bg dark:hover:bg-white/5 dark:bg-brand-black transition-colors flex-shrink-0 disabled:opacity-50"
                      >
                        {couponLoading ? '…' : 'Einlösen'}
                      </button>
                    </div>
                  )}
                  {couponError && (
                    <p className="text-xs text-status-error mt-2">{couponError}</p>
                  )}
                </div>

                {/* Pending Booking Erfolg */}
                {pendingSuccess && (
                  <div className="p-5 rounded-[10px] bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
                    <div className="w-12 h-12 rounded-full bg-status-success/10 flex items-center justify-center mx-auto mb-3">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-status-success">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">Buchung eingereicht!</h3>
                    <p className="text-sm font-body text-brand-steel dark:text-gray-400 mb-2">
                      Deine Buchung <strong>{pendingSuccess}</strong> wartet auf Freigabe.
                    </p>
                    <p className="text-xs font-body text-brand-muted dark:text-gray-500">
                      Wir prüfen deinen Ausweis und senden dir einen Zahlungslink per Email.
                    </p>
                    <a href="/konto/buchungen" className="inline-block mt-4 px-6 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn">
                      Meine Buchungen
                    </a>
                  </div>
                )}

                {/* Error */}
                {intentError && (
                  <div className="p-4 rounded-[10px] bg-red-50 border border-red-200 text-status-error text-sm">
                    {intentError}
                  </div>
                )}

                {/* AGB + Widerrufsrecht Checkboxen */}
                {!pendingSuccess && (
                  <div className="space-y-3 mb-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={acceptsTerms} onChange={(e) => setAcceptsTerms(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded border-brand-border accent-accent-blue flex-shrink-0" />
                      <span className="text-xs font-body text-brand-steel dark:text-gray-400 leading-relaxed">
                        Ich habe die <a href="/agb" target="_blank" className="text-accent-blue underline">AGB</a>,{' '}
                        <a href="/datenschutz" target="_blank" className="text-accent-blue underline">Datenschutzerklärung</a> und{' '}
                        <a href="/haftungsbedingungen" target="_blank" className="text-accent-blue underline">Haftungsbedingungen</a> gelesen und akzeptiere diese.
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={acceptsWithdrawal} onChange={(e) => setAcceptsWithdrawal(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded border-brand-border accent-accent-blue flex-shrink-0" />
                      <span className="text-xs font-body text-brand-steel dark:text-gray-400 leading-relaxed">
                        Mir ist bekannt, dass bei zeitgebundenen Freizeitdienstleistungen gemäß{' '}
                        <a href="/widerruf" target="_blank" className="text-accent-blue underline">§ 312g Abs. 2 Nr. 9 BGB</a>{' '}
                        kein Widerrufsrecht besteht.
                      </span>
                    </label>
                    {requiresEarlyServiceConsent && (
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={acceptsEarlyService} onChange={(e) => setAcceptsEarlyService(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded border-brand-border accent-accent-blue flex-shrink-0" />
                        <span className="text-xs font-body text-brand-steel dark:text-gray-400 leading-relaxed">
                          Ich verlange ausdrücklich, dass cam2rent vor Ablauf der 14-tägigen Widerrufsfrist mit der Ausführung der Dienstleistung (Versand/Bereitstellung der Mietgeräte) beginnt. Mir ist bekannt, dass mein Widerrufsrecht mit vollständiger Vertragserfüllung durch cam2rent erlischt (§ 356 Abs. 4 BGB).
                        </span>
                      </label>
                    )}
                  </div>
                )}

                {/* Verifiziert: Normale Zahlung */}
                {!pendingSuccess && isVerified && (
                  <button
                    onClick={handleProceedToPayment}
                    disabled={isCreatingIntent || !acceptsTerms || !acceptsWithdrawal || (requiresEarlyServiceConsent && !acceptsEarlyService)}
                    className="w-full py-4 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isCreatingIntent ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Wird geladen…
                      </>
                    ) : (
                      `Weiter zur Zahlung → ${fmt(total)}`
                    )}
                  </button>
                )}

                {/* Nicht verifiziert: Buchung anfragen */}
                {!pendingSuccess && isVerified === false && (
                  <div>
                    <div className="p-3 rounded-[10px] bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs font-body text-blue-700 dark:text-blue-300 mb-3">
                      Da dies deine erste Buchung ist, prüfen wir kurz deinen Ausweis. Du erhältst danach einen Zahlungslink per Email.
                    </div>
                    <button
                      onClick={handlePendingBooking}
                      disabled={isCreatingIntent || !acceptsTerms || !acceptsWithdrawal || (requiresEarlyServiceConsent && !acceptsEarlyService)}
                      className="w-full py-4 bg-accent-blue text-white font-heading font-semibold rounded-btn hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {isCreatingIntent ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Wird erstellt…
                        </>
                      ) : (
                        `Buchung anfragen → ${fmt(total)}`
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Payment step */
              <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
                <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-1">
                  Zahlung
                </h2>
                <p className="text-sm text-brand-steel dark:text-gray-400 mb-6">
                  Gib deine Zahlungsdaten ein. Deine Verbindung ist
                  SSL-verschlüsselt.
                </p>

                {clientSecret && (
                  <Elements
                    stripe={stripePromise}
                    options={{
                      clientSecret,
                      appearance: {
                        theme: 'stripe',
                        variables: {
                          fontFamily: 'DM Sans, sans-serif',
                          colorPrimary: '#3b82f6',
                          borderRadius: '10px',
                        },
                      },
                    }}
                  >
                    <PaymentForm
                      total={total}
                      onBack={() => setStep('details')}
                      cartItems={items}
                      customerName={`${firstName} ${lastName}`.trim()}
                      customerEmail={email}
                      userId={user?.id}
                      deliveryMode={deliveryMode}
                      shippingMethod={shippingMethod}
                      shippingPrice={finalShipping}
                      discountAmount={couponDiscountAmount}
                      couponCode={appliedCoupon?.code ?? ''}
                      productDiscount={effectiveProductDiscount}
                      durationDiscount={effectiveDurationDiscount}
                      loyaltyDiscount={effectiveLoyaltyDiscount}
                      referralCode={referralCode}
                      street={street}
                      zip={zip}
                      city={city}
                    />
                  </Elements>
                )}
              </div>
            )}
          </div>

      </div>
    </div>
  );
}

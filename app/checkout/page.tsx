'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
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

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}

function extractVat(gross: number, rate = 19) {
  const net = gross / (1 + rate / 100);
  const vat = gross - net;
  return { net, vat };
}

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
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-brand-black text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40"
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
  const { items, cartTotal, itemCount } = useCart();
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
  const [taxRate, setTaxRate] = useState(19);

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

  // Fetch user booking count for loyalty discounts
  useEffect(() => {
    if (!user) return;
    const supabase = createAuthBrowserClient();
    supabase
      .from('profiles')
      .select('booking_count')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.booking_count) setUserBookingCount(data.booking_count);
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

  // Redirect if cart empty
  useEffect(() => {
    if (itemCount === 0) router.replace('/warenkorb');
  }, [itemCount, router]);

  // ── Auto-discount calculations ──────────────────────────────────────────────

  // Product discount: per-item discount on rental price (e.g. Black Friday 25% off)
  const productDiscountAmount = items.reduce((sum, item) => {
    const match = getActiveProductDiscount(item.productId, productDiscounts);
    if (!match) return sum;
    return sum + Math.round(item.priceRental * match.discount_percent) / 100;
  }, 0);
  const productDiscountLabel = (() => {
    // Find the first active product discount to show its name
    for (const item of items) {
      const match = getActiveProductDiscount(item.productId, productDiscounts);
      if (match) return match.name || 'Produktrabatt';
    }
    return null;
  })();

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
  const { net, vat } = extractVat(total, taxRate);

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

  const inputClass =
    'w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-sm';
  const labelClass = 'block text-sm font-body font-medium text-brand-black dark:text-white mb-1';

  if (itemCount === 0) return null;

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
          <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white">Checkout</h1>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Forms */}
          <div className="lg:col-span-2 space-y-5">
            {step === 'details' ? (
              <>
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
                  </div>
                </div>

                {/* Shipping */}
                <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
                  <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
                    Lieferung
                  </h2>

                  <div className="grid sm:grid-cols-2 gap-3 mb-4">
                    {(
                      [
                        {
                          id: 'versand' as DeliveryMode,
                          label: 'Versand',
                          sub: 'Wir liefern zu dir nach Hause',
                        },
                        {
                          id: 'abholung' as DeliveryMode,
                          label: 'Selbst abholen',
                          sub: 'Du holst die Kamera bei uns ab',
                        },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-start gap-3 p-4 rounded-[10px] border-2 cursor-pointer transition-colors ${
                          deliveryMode === opt.id
                            ? 'border-accent-blue bg-accent-blue-soft dark:bg-accent-blue/10'
                            : 'border-brand-border dark:border-white/10 hover:border-brand-steel'
                        }`}
                      >
                        <input
                          type="radio"
                          name="deliveryMode"
                          value={opt.id}
                          checked={deliveryMode === opt.id}
                          onChange={() => setDeliveryMode(opt.id)}
                          className="mt-0.5 accent-accent-blue"
                        />
                        <div>
                          <p className="font-body font-semibold text-brand-black dark:text-white text-sm">
                            {opt.label}
                          </p>
                          <p className="text-xs text-brand-steel dark:text-gray-400 mt-0.5">{opt.sub}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {deliveryMode === 'versand' && (
                    <>
                      {/* Shipping method */}
                      <div className="grid sm:grid-cols-2 gap-3 mb-5">
                        {(
                          [
                            {
                              id: 'standard' as ShippingMethod,
                              label: 'Standardversand',
                              sub: '3–5 Werktage',
                              price: dynShipping.standardPrice,
                            },
                            {
                              id: 'express' as ShippingMethod,
                              label: 'Expressversand',
                              sub: 'Nächster Werktag',
                              price: dynShipping.expressPrice,
                            },
                          ] as const
                        ).map((opt) => {
                          const isFreeStandard =
                            opt.id === 'standard' &&
                            cartTotal >= dynShipping.freeShippingThreshold;
                          return (
                            <label
                              key={opt.id}
                              className={`flex items-start justify-between gap-3 p-4 rounded-[10px] border-2 cursor-pointer transition-colors ${
                                shippingMethod === opt.id
                                  ? 'border-accent-blue bg-accent-blue-soft dark:bg-accent-blue/10'
                                  : 'border-brand-border dark:border-white/10 hover:border-brand-steel'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="radio"
                                  name="shippingMethod"
                                  value={opt.id}
                                  checked={shippingMethod === opt.id}
                                  onChange={() => setShippingMethod(opt.id)}
                                  className="mt-0.5 accent-accent-blue"
                                />
                                <div>
                                  <p className="font-body font-semibold text-brand-black dark:text-white text-sm">
                                    {opt.label}
                                  </p>
                                  <p className="text-xs text-brand-steel dark:text-gray-400">{opt.sub}</p>
                                  {opt.id === 'express' && (
                                    <p className="text-xs text-brand-muted dark:text-gray-500 mt-0.5">Immer kostenpflichtig</p>
                                  )}
                                </div>
                              </div>
                              <span className="text-sm font-semibold flex-shrink-0">
                                {isFreeStandard ? (
                                  <span className="text-status-success">Gratis</span>
                                ) : (
                                  <span className="text-brand-black dark:text-white">{fmt(opt.price)}</span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Shipping address */}
                      <div className="space-y-3">
                        <div>
                          <label className={labelClass}>Straße und Hausnummer *</label>
                          <input
                            type="text"
                            value={street}
                            onChange={(e) => setStreet(e.target.value)}
                            className={inputClass}
                            placeholder="Musterstraße 42"
                            autoComplete="street-address"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelClass}>PLZ *</label>
                            <input
                              type="text"
                              value={zip}
                              onChange={(e) => setZip(e.target.value)}
                              className={inputClass}
                              placeholder="12345"
                              autoComplete="postal-code"
                              maxLength={5}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Stadt *</label>
                            <input
                              type="text"
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              className={inputClass}
                              placeholder="Berlin"
                              autoComplete="address-level2"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
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

                {/* Error */}
                {intentError && (
                  <div className="p-4 rounded-[10px] bg-red-50 border border-red-200 text-status-error text-sm">
                    {intentError}
                  </div>
                )}

                <button
                  onClick={handleProceedToPayment}
                  disabled={isCreatingIntent}
                  className="w-full py-4 bg-brand-black text-white font-heading font-semibold rounded-btn hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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

          {/* Right: Order summary */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-5 sticky top-24">
              <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
                Bestellung
              </h2>

              {/* Items */}
              <div className="space-y-3 mb-4">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div>
                      <p className="font-medium text-brand-black dark:text-white">{item.productName}</p>
                      <p className="text-xs text-brand-muted dark:text-gray-500">
                        {item.days} {item.days === 1 ? 'Tag' : 'Tage'}
                      </p>
                    </div>
                    <span className="font-medium text-brand-black dark:text-white flex-shrink-0 ml-2">
                      {fmt(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Price breakdown */}
              <div className="border-t border-brand-border dark:border-white/10 pt-3 space-y-2 text-sm">
                <div className="flex justify-between text-brand-text dark:text-gray-300">
                  <span>Zwischensumme</span>
                  <span>{fmt(cartTotal)}</span>
                </div>

                {effectiveProductDiscount > 0 && (
                  <div className="flex justify-between text-status-success">
                    <span>{productDiscountLabel ?? 'Produktrabatt'}</span>
                    <span>{'\u2212'}{fmt(effectiveProductDiscount)}</span>
                  </div>
                )}

                {effectiveDurationDiscount > 0 && (
                  <div className="flex justify-between text-status-success">
                    <span>{durationMatch?.label ?? 'Mengenrabatt'}</span>
                    <span>−{fmt(effectiveDurationDiscount)}</span>
                  </div>
                )}

                {effectiveLoyaltyDiscount > 0 && (
                  <div className="flex justify-between text-status-success">
                    <span>{loyaltyMatch?.label ?? 'Treuerabatt'}</span>
                    <span>−{fmt(effectiveLoyaltyDiscount)}</span>
                  </div>
                )}

                {isNotCombinable && (durationDiscountAmount > 0 || loyaltyDiscountAmount > 0) && (
                  <p className="text-xs text-brand-muted dark:text-gray-500 italic">
                    Gutschein nicht mit anderen Rabatten kombinierbar
                  </p>
                )}

                {couponDiscountAmount > 0 && (
                  <div className="flex justify-between text-status-success">
                    <span>Gutschein ({appliedCoupon?.code})</span>
                    <span>−{fmt(couponDiscountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-brand-text dark:text-gray-300">
                  <span>
                    {deliveryMode === 'abholung'
                      ? 'Abholung'
                      : shippingOnOriginal.isFree
                      ? 'Versand (kostenlos)'
                      : `Versand (${shippingMethod === 'express' ? 'Express' : 'Standard'})`}
                  </span>
                  <span>
                    {finalShipping === 0 ? (
                      <span className="text-status-success">Gratis</span>
                    ) : (
                      fmt(finalShipping)
                    )}
                  </span>
                </div>

                <div className="border-t border-brand-border dark:border-white/10 pt-2 mt-2">
                  <div className="flex justify-between font-heading font-bold text-brand-black dark:text-white text-base">
                    <span>Gesamt</span>
                    <span>{fmt(total)}</span>
                  </div>

                  {/* MwSt. */}
                  {taxMode === 'regelbesteuerung' ? (
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex justify-between text-xs text-brand-muted dark:text-gray-500">
                        <span>darin Nettobetrag</span>
                        <span>{fmt(net)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-brand-muted dark:text-gray-500">
                        <span>darin MwSt. ({taxRate}%)</span>
                        <span>{fmt(vat)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1.5">
                      <span className="text-xs text-brand-muted dark:text-gray-500">Gem. §19 UStG keine MwSt.</span>
                    </div>
                  )}
                </div>

                {cartTotal < dynShipping.freeShippingThreshold &&
                  deliveryMode === 'versand' && (
                    <p className="text-xs text-accent-teal bg-accent-teal-soft rounded-[8px] px-3 py-2 mt-2">
                      Noch{' '}
                      {fmt(dynShipping.freeShippingThreshold - cartTotal)}{' '}
                      bis zum kostenlosen Versand!
                    </p>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

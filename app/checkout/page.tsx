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
import type { ShippingPriceConfig, DurationDiscount, LoyaltyDiscount, EarlyBirdDiscount, ProductDiscount } from '@/lib/price-config';
import { calcDurationDiscount, calcLoyaltyDiscount, calcEarlyBirdDiscount, weeksUntil, getDiscountMatchesForItem, calcItemDiscountTotal, calcCartLevelDiscount, getWinningCartLevelDiscount, hasActiveNotCombinableDiscount, getActiveSpecialDiscountPercent } from '@/lib/price-config';
import { useAccessories } from '@/components/AccessoriesProvider';
import { getAccessoryPrice } from '@/data/accessories';
import { BUSINESS } from '@/lib/business-config';
import ExpressSignup from '@/components/checkout/ExpressSignup';
import SignatureStep, { type SignatureResult } from '@/components/booking/SignatureStep';

// stripePromise wird je User initialisiert (Tester-Konto bekommt Test-Stripe-
// Publishable-Key) — siehe getStripePromise mit userId-Parameter weiter unten.

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
  earlyBirdDiscount,
  loyaltyDiscount,
  referralCode,
  street,
  zip,
  city,
  billingName,
  billingStreet,
  billingZip,
  billingCity,
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
  earlyBirdDiscount: number;
  loyaltyDiscount: number;
  referralCode: string;
  street: string;
  zip: string;
  city: string;
  billingName: string;
  billingStreet: string;
  billingZip: string;
  billingCity: string;
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

    try {
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
          earlyBirdDiscount,
          loyaltyDiscount,
          referralCode,
          street,
          zip,
          city,
          billingName,
          billingStreet,
          billingZip,
          billingCity,
          contractSignature,
        })
      );

      // Elements-Validierung vor Stripe-Submit. Faengt clientseitig fehlende
      // Pflichtfelder (z.B. Karten-Inhaber, ungueltige Karte) ab, bevor wir
      // Stripe ueberhaupt anfragen — sonst kann Stripe.js mit einem
      // unerwarteten Fehler hochlaufen und in die Error-Boundary kippen.
      const submitResult = await elements.submit();
      if (submitResult?.error) {
        setError(submitResult.error.message ?? 'Bitte vervollständige deine Zahlungsdaten.');
        setIsLoading(false);
        return;
      }

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
    } catch (unexpectedErr) {
      // Defensive: niemals die Error-Boundary mit unerwarteten Stripe-Fehlern
      // ausloesen. Stattdessen Fehlertext anzeigen und User retry-ermoeglichen.
      console.error('[checkout] Unexpected error in handleSubmit:', unexpectedErr);
      const msg = unexpectedErr instanceof Error ? unexpectedErr.message : 'Unerwarteter Fehler.';
      setError(`Zahlung konnte nicht gestartet werden: ${msg}`);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-6">
        <PaymentElement
          options={{
            // accordion zeigt alle aktivierten Zahlungsmethoden vertikal
            // gestapelt — Kunde sieht PayPal, Karte, Klarna, Apple/Google
            // Pay, Amazon Pay etc. auf einen Blick und waehlt per Radio.
            // 'tabs' hatte alles ueber zwei Spalten verteilt und den Rest
            // unter einem Mehr-Dropdown versteckt.
            layout: {
              type: 'accordion',
              defaultCollapsed: false,
              radios: 'always',
              spacedAccordionItems: true,
            },
          }}
        />
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
  const { items, cartTotal, itemCount, hydrated } = useCart();
  const { user } = useAuth();

  // Stripe-Promise wird pro User erzeugt — Tester bekommt den Test-Publishable-
  // Key zurueck, damit Test-Karten gegen Test-Stripe funktionieren.
  const stripePromise = useMemo(
    () => getStripePromise({ userId: user?.id }),
    [user?.id],
  );

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

  // Abweichende Rechnungsadresse (optional, pro Buchung)
  const [billingDiffers, setBillingDiffers] = useState(false);
  const [billingName, setBillingName] = useState('');
  const [billingStreet, setBillingStreet] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [billingCity, setBillingCity] = useState('');

  // Shipping
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('versand');
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('standard');
  const [shippingPrefillDone, setShippingPrefillDone] = useState(false);
  const [dynShipping, setDynShipping] = useState<ShippingPriceConfig>(shippingConfig);

  // Versandart aus dem Cart vorbefuellen, sobald Items hydrated sind. So
  // landet der Kunde im Checkout nicht mit "Versand" als Default, obwohl er
  // auf der Buchen-Seite "Abholung" gewaehlt hat. Nur einmal vorbefuellen —
  // danach respektieren wir Aenderungen, die der User hier vornimmt.
  useEffect(() => {
    if (!hydrated || shippingPrefillDone || items.length === 0) return;
    const allAbholung = items.every((it) => it.deliveryMode === 'abholung');
    const versandItems = items.filter((it) => (it.deliveryMode ?? 'versand') === 'versand');
    if (allAbholung) {
      setDeliveryMode('abholung');
    } else if (versandItems.length > 0 && versandItems.every((it) => it.shippingMethod === 'express')) {
      setShippingMethod('express');
    }
    setShippingPrefillDone(true);
  }, [hydrated, items, shippingPrefillDone]);

  // Auto-discounts config (fetched from /api/prices)
  const [durationDiscounts, setDurationDiscounts] = useState<DurationDiscount[]>([]);
  const [loyaltyDiscounts, setLoyaltyDiscounts] = useState<LoyaltyDiscount[]>([]);
  const [earlyBirdDiscounts, setEarlyBirdDiscounts] = useState<EarlyBirdDiscount[]>([]);
  const [productDiscounts, setProductDiscounts] = useState<ProductDiscount[]>([]);
  const [userBookingCount, setUserBookingCount] = useState(0);
  // Sonderkondition (individueller Kunden-Rabatt) — Anzeige; maßgeblich ist der
  // serverseitig aufgelöste Wert in checkout-intent/confirm-cart.
  const [specialPercent, setSpecialPercent] = useState(0);

  // Tax config
  const [taxMode, setTaxMode] = useState<'kleinunternehmer' | 'regelbesteuerung'>('kleinunternehmer');
  const [, setTaxRate] = useState(19);

  useEffect(() => {
    fetch('/api/prices', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.shipping) setDynShipping(d.shipping);
        if (d.durationDiscounts) setDurationDiscounts(d.durationDiscounts);
        if (d.loyaltyDiscounts) setLoyaltyDiscounts(d.loyaltyDiscounts);
        if (d.earlyBirdDiscounts) setEarlyBirdDiscounts(d.earlyBirdDiscounts);
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

  // Checkout-Config (Feature-Flags) — wird einmal geladen
  const [checkoutCfg, setCheckoutCfg] = useState<{
    expressSignupEnabled: boolean;
    verificationDeferred: boolean;
    maxRentalValueForExpressSignup: number | null;
    minHoursBeforeRentalStart: number | null;
  } | null>(null);
  useEffect(() => {
    fetch('/api/checkout-config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCheckoutCfg(d);
      })
      .catch(() => {});
  }, []);

  // Express-Signup-Sichtbarkeit losgelöst von `user`-State steuern, sonst
  // unmounted die Komponente sobald `signInWithPassword` den User setzt und
  // der Ausweis-Upload-Step verschwindet, bevor er gerendert wurde.
  const [showExpressSignup, setShowExpressSignup] = useState(false);
  useEffect(() => {
    if (!user && checkoutCfg?.expressSignupEnabled && !showExpressSignup) {
      setShowExpressSignup(true);
    }
  }, [user, checkoutCfg, showExpressSignup]);

  // Fetch user booking count + verification status
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) { setIsVerified(null); return; }
    const supabase = createAuthBrowserClient();
    supabase
      .from('profiles')
      .select('booking_count, verification_status, special_discount_percent, special_discount_valid_until')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.booking_count) setUserBookingCount(data.booking_count);
        setIsVerified(data?.verification_status === 'verified');
        setSpecialPercent(
          getActiveSpecialDiscountPercent({
            percent: (data as { special_discount_percent?: number | null } | null)?.special_discount_percent ?? null,
            validUntil: (data as { special_discount_valid_until?: string | null } | null)?.special_discount_valid_until ?? null,
          }),
        );
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
        // Lieferadresse: abweichende Standard-Lieferadresse (delivery_*) hat
        // Vorrang vor der Hauptadresse — sie ist die gewuenschte Default-Lieferung.
        setStreet(data?.delivery_street || data?.address_street || '');
        setZip(data?.delivery_zip || data?.address_zip || '');
        setCity(data?.delivery_city || data?.address_city || '');
        // Abweichende Rechnungsadresse aus dem Profil vorbefuellen.
        if (data?.billing_street || data?.billing_city) {
          setBillingDiffers(true);
          setBillingName(data?.billing_name ?? '');
          setBillingStreet(data?.billing_street ?? '');
          setBillingZip(data?.billing_zip ?? '');
          setBillingCity(data?.billing_city ?? '');
        }
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

  // Product discount: per-item, mit Stacking. Mehrere Aktionen koennen
  // gleichzeitig greifen — pro Pot (Mietpreis vs. Zubehoer) gewinnt die
  // hoechste, Pots stacken. Cap auf Item-Gesamtpreis.
  const itemDiscountAmount = items.reduce((sum, item) => {
    const matches = getDiscountMatchesForItem(
      item.productId,
      item.priceRental,
      item.priceAccessories,
      item.accessories ?? [],
      productDiscounts,
    );
    return sum + calcItemDiscountTotal(matches, item.priceRental, item.priceAccessories);
  }, 0);
  // Cart-Level-Rabatt (Aktionen mit applies_to_cart=true) — gilt auf den
  // Gesamtbetrag aller Items minus Item-Rabatte. Hoechster gewinnt (kein
  // Stacking, weil sonst >100 % moeglich waere).
  // Originalpreis der rabattierbaren Positionen = Miete + Zubehör. Der
  // Haftungsschutz (in cartTotal enthalten) darf NICHT rabattiert werden —
  // analog zum Einzel-Buchungsflow (calcBreakdown: Basis = Miete + Zubehör,
  // Haftung/Versand außen vor).
  const cartProductTotal = items.reduce((s, it) => s + it.priceRental + it.priceAccessories, 0);
  const cartTotalNetItems = cartProductTotal - itemDiscountAmount;
  const cartLevelDiscountAmount = calcCartLevelDiscount(cartTotalNetItems, productDiscounts);

  // Sonderkondition (Kunden-Rabatt) ERSETZT alle anderen Auto-Rabatte: greift
  // sie, gelten Aktion/Mengen-/Frühbucher-/Treuerabatt NICHT (exklusiv). Sie
  // wird additiv auf den Originalpreis (Miete + Zubehör, OHNE Haftung)
  // gerechnet. Coupon danach.
  const specialActive = specialPercent > 0;
  const specialDiscountAmount = specialActive ? Math.round(cartProductTotal * specialPercent) / 100 : 0;

  const productDiscountAmount = specialActive ? 0 : itemDiscountAmount + cartLevelDiscountAmount;

  // Name der greifenden Aktion (z.B. "Sommer25") — für die Beschriftung der
  // Rabatt-Zeile in der Rechnung. Item-Level-Match bevorzugt (höchster Betrag),
  // sonst die tatsächlich greifende Cart-Level-Aktion.
  let productDiscountLabel: string | null = null;
  if (!specialActive && productDiscountAmount > 0) {
    let bestItem: { name: string; amount: number } | null = null;
    for (const item of items) {
      const ms = getDiscountMatchesForItem(
        item.productId,
        item.priceRental,
        item.priceAccessories,
        item.accessories ?? [],
        productDiscounts,
      );
      for (const m of ms) {
        if (m.discount.name && (!bestItem || m.amount > bestItem.amount)) {
          bestItem = { name: m.discount.name, amount: m.amount };
        }
      }
    }
    productDiscountLabel = bestItem
      ? bestItem.name
      : (getWinningCartLevelDiscount(cartTotalNetItems, productDiscounts)?.name ?? null);
  }

  // Wenn eine greifende Aktion `not_combinable=true` hat, werden Mietdauer-
  // und Stammkunden-Rabatte deaktiviert — der Admin hat die Aktion als
  // exklusiv markiert (z.B. 50%-Aktion soll genau 50% bedeuten, nicht mehr).
  const actionBlocksAutoDiscounts = hasActiveNotCombinableDiscount(
    cartTotalNetItems,
    itemDiscountAmount,
    cartLevelDiscountAmount,
    productDiscounts,
  );

  // Auto-Rabatte stapeln ADDITIV auf den Originalpreis (Miete + Zubehör, OHNE
  // Haftung): jeder Prozentsatz wird auf cartProductTotal gerechnet und
  // summiert, z.B. Aktion 25% + Frühbucher 5% + Mengen 10% = 40% vom
  // Produktpreis. Eine `not_combinable`-Aktion blockt weiterhin alle
  // Auto-Rabatte.

  // Duration discount: based on max rental days across all items
  const maxDays = items.reduce((m, it) => Math.max(m, it.days), 0);
  const durationMatch = calcDurationDiscount(maxDays, durationDiscounts);
  const durationDiscountAmount = !actionBlocksAutoDiscounts && !specialActive && durationMatch
    ? Math.round(cartProductTotal * durationMatch.discount_percent) / 100
    : 0;

  // Frühbucherrabatt: kleinster Vorlauf aller Positionen (konservativ),
  // additiv auf den Originalpreis.
  const earlyBirdWeeks = items.reduce(
    (min, it) => Math.min(min, weeksUntil(it.rentalFrom)),
    items.length ? Infinity : 0,
  );
  const earlyBirdMatch = !actionBlocksAutoDiscounts && !specialActive && Number.isFinite(earlyBirdWeeks)
    ? calcEarlyBirdDiscount(earlyBirdWeeks, earlyBirdDiscounts)
    : null;
  const earlyBirdDiscountAmount = earlyBirdMatch
    ? Math.round(cartProductTotal * earlyBirdMatch.discount_percent) / 100
    : 0;

  // Loyalty discount: additiv auf den Originalpreis (Miete + Zubehör)
  const loyaltyMatch = !actionBlocksAutoDiscounts && !specialActive && user
    ? calcLoyaltyDiscount(userBookingCount, loyaltyDiscounts)
    : null;
  const loyaltyDiscountAmount = loyaltyMatch
    ? Math.round(cartProductTotal * loyaltyMatch.discount_percent) / 100
    : 0;

  // Safety-Cap: Summe der Auto-Rabatte darf den Produktpreis (Miete + Zubehör)
  // nicht übersteigen — der Haftungsschutz bleibt immer voll bestehen
  // (additive Prozente könnten sonst >100% ergeben). Coupon danach auf Rest.
  const autoDiscountRaw = productDiscountAmount + durationDiscountAmount + earlyBirdDiscountAmount + loyaltyDiscountAmount + specialDiscountAmount;
  const autoDiscountCapped = Math.min(autoDiscountRaw, cartProductTotal);
  const afterAutoDiscounts = Math.max(0, cartTotal - autoDiscountCapped);

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
  const effectiveEarlyBirdDiscount = isNotCombinable ? 0 : earlyBirdDiscountAmount;
  const effectiveLoyaltyDiscount = isNotCombinable ? 0 : loyaltyDiscountAmount;

  // Additive Auto-Rabatte + Coupon, gedeckelt auf den Originalpreis (Summe der
  // Prozente könnte sonst >100% ergeben → negativer Betrag).
  // Sonderkondition gilt immer (wie Produktrabatt), unabhängig vom Coupon-Flag.
  const totalDiscount = Math.min(
    effectiveProductDiscount + effectiveDurationDiscount + effectiveEarlyBirdDiscount + effectiveLoyaltyDiscount + specialDiscountAmount + couponDiscountAmount,
    cartTotal,
  );
  const discountedSubtotal = cartTotal - totalDiscount;
  // Versand wird auf ORIGINAL-Warenwert geprüft (vor Rabatten) — kundenfreundlich
  const shippingOnOriginal = calcShipping(cartTotal, shippingMethod, deliveryMode, dynShipping);
  const finalShipping = shippingOnOriginal.price;
  const total = discountedSubtotal + finalShipping;

  // Haftung wird in der Bestellaufstellung separat ausgewiesen, damit Kunden
  // die Rechnung leichter nachvollziehen koennen. priceHaftung steckt schon
  // in item.subtotal (und damit in cartTotal) — wir ziehen es fuer die
  // Anzeige pro Item + Zwischensumme wieder raus und zeigen es als eigene
  // Zeile unter dem Rabatt. Das Gesamt aendert sich dadurch nicht.
  const haftungTotal = useMemo(
    () => items.reduce((s, it) => s + (it.priceHaftung || 0), 0),
    [items],
  );
  const subtotalWithoutHaftung = cartTotal - haftungTotal;

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
            productDiscountLabel: productDiscountLabel ?? '',
            durationDiscount: effectiveDurationDiscount,
            earlyBirdDiscount: effectiveEarlyBirdDiscount,
            loyaltyDiscount: effectiveLoyaltyDiscount,
            referralCode: referralCode ?? '',
            street,
            zip,
            city,
            billingName: billingDiffers ? billingName : '',
            billingStreet: billingDiffers ? billingStreet : '',
            billingZip: billingDiffers ? billingZip : '',
            billingCity: billingDiffers ? billingCity : '',
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

  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [acceptsWithdrawal, setAcceptsWithdrawal] = useState(false);
  const [acceptsEarlyService, setAcceptsEarlyService] = useState(false);

  // ── Mietvertrag-Unterschrift (Pflicht vor der Zahlung) ──────────────────────
  // Im Warenkorb-Checkout fehlte bisher die Vertragsunterschrift komplett — eine
  // Buchung konnte ohne unterschriebenen Mietvertrag bezahlt werden. Jetzt muss
  // der Kunde hier unterschreiben (analog Step 5 im Direkt-Buchungsflow). Eine
  // Signatur aus dem Direkt-Flow (sessionStorage) wird uebernommen.
  const [contractSignature, setContractSignature] = useState<SignatureResult | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('cam2rent_contract_signature');
      if (raw) {
        const parsed = JSON.parse(raw) as SignatureResult;
        if (parsed?.agreedToTerms && parsed?.signerName) setContractSignature(parsed);
      }
    } catch { /* ignore */ }
  }, []);
  // Zusammengefasste Mietgegenstaende ueber alle Warenkorb-Positionen fuer die
  // Vertrags-Vorschau (das rechtsverbindliche PDF wird pro Buchung serverseitig
  // in confirm-cart aus den echten Daten erzeugt).
  const contractSummary = useMemo(() => {
    const productNames = Array.from(new Set(items.map((i) => i.productName))).join(', ');
    const accNames = Array.from(new Set(
      items.flatMap((i) => (i.accessories ?? []).map(
        (accId) => ALL_ACCESSORIES.find((a) => a.id === accId)?.name ?? accId,
      )),
    ));
    const froms = items.map((i) => i.rentalFrom).filter(Boolean).sort();
    const tos = items.map((i) => i.rentalTo).filter(Boolean).sort();
    const maxDays = items.reduce((m, i) => Math.max(m, i.days || 0), 0);
    const depositSum = items.reduce((s, i) => s + (i.deposit || 0), 0);
    const toDE = (iso?: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return d ? `${d}.${m}.${y}` : iso;
    };
    return {
      productName: productNames,
      accessories: accNames,
      rentalFrom: toDE(froms[0]),
      rentalTo: toDE(tos[tos.length - 1]),
      rentalDays: maxDays,
      deposit: depositSum,
    };
  }, [items, ALL_ACCESSORIES]);

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

  const inputClass =
    'w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-base';
  const labelClass = 'block text-sm font-body font-medium text-brand-black dark:text-white mb-1';

  if (itemCount === 0) return null;

  // Express-Signup wird angezeigt, sobald wir auf der Seite landen ohne Login
  // (Flag-gesteuert). Bleibt sichtbar bis ExpressSignup `onAuthenticated`
  // feuert — d.h. inkl. Ausweis-Upload-Step. Erst dann fällt der Flow zurück
  // zur normalen Checkout-Maske.
  if (showExpressSignup) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black py-8">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/warenkorb"
            className="inline-flex items-center gap-1.5 text-sm text-brand-steel dark:text-gray-400 hover:text-brand-black dark:hover:text-white mb-5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zurück zum Warenkorb
          </Link>
          <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-1">
            Schnell-Registrierung
          </h1>
          <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-5">
            Konto anlegen, Ausweis hochladen, weiter zur Zahlung — in zwei Minuten erledigt.
          </p>
          <ExpressSignup requireUpload onAuthenticated={() => setShowExpressSignup(false)} />
        </div>
      </div>
    );
  }

  // Nicht eingeloggt: ohne Express-Flag → "Konto erforderlich"-Fallback
  if (!user) {
    if (checkoutCfg?.expressSignupEnabled) {
      // Edge-Fall: Flag an, aber Effekt hat showExpressSignup noch nicht gesetzt
      // (sehr kurzer Render-Frame). Lass uns nichts anzeigen, der Effekt
      // springt gleich an.
      return null;
    }

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
                            <span className="font-heading font-semibold text-sm text-brand-black dark:text-white flex-shrink-0">{fmt(item.subtotal - (item.priceHaftung || 0))}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Preisaufstellung */}
                  <div className="mt-4 pt-3 border-t border-brand-border dark:border-white/10 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-brand-steel dark:text-gray-400">Zwischensumme</span>
                      <span className="text-brand-black dark:text-white">{fmt(subtotalWithoutHaftung)}</span>
                    </div>
                    {totalDiscount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-steel dark:text-gray-400">Rabatt</span>
                        <span className="text-status-success font-semibold">-{fmt(totalDiscount)}</span>
                      </div>
                    )}
                    {specialActive && (
                      <div className="flex justify-between text-xs">
                        <span className="text-brand-steel dark:text-gray-400">↳ inkl. Sonderkondition ({specialPercent} %)</span>
                        <span className="text-status-success">-{fmt(specialDiscountAmount)}</span>
                      </div>
                    )}
                    {haftungTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-steel dark:text-gray-400">Haftungsschutz</span>
                        <span className="text-brand-black dark:text-white">{fmt(haftungTotal)}</span>
                      </div>
                    )}
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

                    {/* Abweichende Rechnungsadresse */}
                    <div className="pt-2 border-t border-brand-border dark:border-white/10">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={billingDiffers}
                          onChange={(e) => setBillingDiffers(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-brand-border text-accent-blue focus:ring-accent-blue"
                        />
                        <span>
                          <span className="block text-sm font-body font-medium text-brand-black dark:text-white">Abweichende Rechnungsadresse</span>
                          <span className="block text-xs text-brand-muted dark:text-gray-500">Aktivieren, wenn die Rechnung an eine andere Adresse (z.&nbsp;B. Firma) gehen soll.</span>
                        </span>
                      </label>

                      {billingDiffers && (
                        <div className="mt-4 space-y-3">
                          <div>
                            <label className={labelClass}>Name / Firma</label>
                            <input type="text" value={billingName} onChange={(e) => setBillingName(e.target.value)}
                              className={inputClass} placeholder="Mustermann GmbH" autoComplete="off" />
                          </div>
                          <div>
                            <label className={labelClass}>Strasse und Hausnummer</label>
                            <input type="text" value={billingStreet} onChange={(e) => setBillingStreet(e.target.value)}
                              className={inputClass} placeholder="Musterstrasse 42" autoComplete="off" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={labelClass}>PLZ</label>
                              <input type="text" value={billingZip} onChange={(e) => setBillingZip(e.target.value)}
                                className={inputClass} placeholder="12345" autoComplete="off" maxLength={5} />
                            </div>
                            <div>
                              <label className={labelClass}>Stadt</label>
                              <input type="text" value={billingCity} onChange={(e) => setBillingCity(e.target.value)}
                                className={inputClass} placeholder="Berlin" autoComplete="off" />
                            </div>
                          </div>
                        </div>
                      )}
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

                {/* Error */}
                {intentError && (
                  <div className="p-4 rounded-[10px] bg-red-50 border border-red-200 text-status-error text-sm">
                    {intentError}
                  </div>
                )}

                {/* Mietvertrag unterschreiben (Pflicht vor der Zahlung) */}
                {(
                  <div className="mb-4">
                    {contractSignature ? (
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-[10px] flex items-start gap-3">
                        <svg className="w-5 h-5 text-status-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-heading font-semibold text-green-800 dark:text-green-300">Mietvertrag unterschrieben</p>
                          <p className="text-xs font-body text-green-700 dark:text-green-400 mt-0.5">
                            Unterschrieben von {contractSignature.signerName}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowSignModal(true)}
                          className="text-xs font-heading font-semibold text-green-700 dark:text-green-400 underline flex-shrink-0"
                        >
                          Ändern
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-[10px]">
                        <p className="text-sm font-heading font-semibold text-amber-800 dark:text-amber-300 mb-1">Mietvertrag unterschreiben</p>
                        <p className="text-xs font-body text-amber-700 dark:text-amber-400 mb-3 leading-relaxed">
                          Vor der Zahlung musst du den Mietvertrag digital unterschreiben.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowSignModal(true)}
                          className="w-full py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Jetzt unterschreiben
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* AGB + Widerrufsrecht Checkboxen */}
                {(
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
                {isVerified && (
                  <button
                    onClick={handleProceedToPayment}
                    disabled={isCreatingIntent || !contractSignature || !acceptsTerms || !acceptsWithdrawal || (requiresEarlyServiceConsent && !acceptsEarlyService)}
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

                {/* Nicht verifiziert: Neukunden zahlen sofort. Der Ausweis wird
                    nach der Zahlung hochgeladen und vor dem Versand geprueft —
                    kein Zahlungslink-Umweg mehr. */}
                {isVerified === false && (
                  <div>
                    <div className="p-3 rounded-[10px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs font-body text-amber-800 dark:text-amber-300 mb-3 flex gap-2">
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      <span>
                        <strong>Wichtig:</strong> Nach der Zahlung senden wir dir einen Link zum Ausweis-Upload. Ohne gueltigen Ausweis koennen wir die Kamera nicht versenden.
                      </span>
                    </div>
                    <button
                      onClick={handleProceedToPayment}
                      disabled={isCreatingIntent || !contractSignature || !acceptsTerms || !acceptsWithdrawal || (requiresEarlyServiceConsent && !acceptsEarlyService)}
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
                      earlyBirdDiscount={effectiveEarlyBirdDiscount}
                      loyaltyDiscount={effectiveLoyaltyDiscount}
                      referralCode={referralCode}
                      street={street}
                      zip={zip}
                      city={city}
                      billingName={billingDiffers ? billingName : ''}
                      billingStreet={billingDiffers ? billingStreet : ''}
                      billingZip={billingDiffers ? billingZip : ''}
                      billingCity={billingDiffers ? billingCity : ''}
                    />
                  </Elements>
                )}
              </div>
            )}
          </div>

      </div>

      {/* Mietvertrag-Unterschrift-Modal */}
      {showSignModal && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={() => setShowSignModal(false)}
        >
          <div
            className="bg-white dark:bg-brand-dark w-full sm:max-w-2xl sm:rounded-card shadow-card my-0 sm:my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-brand-border dark:border-white/10 sticky top-0 bg-white dark:bg-brand-dark z-10">
              <h3 className="font-heading font-semibold text-brand-black dark:text-white">Mietvertrag unterschreiben</h3>
              <button
                type="button"
                onClick={() => setShowSignModal(false)}
                aria-label="Schließen"
                className="text-brand-steel dark:text-gray-400 hover:text-brand-black dark:hover:text-white text-2xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <SignatureStep
                customerName={`${firstName} ${lastName}`.trim() || user?.user_metadata?.full_name || user?.email || ''}
                customerEmail={email || user?.email || ''}
                productName={contractSummary.productName}
                accessories={contractSummary.accessories}
                rentalFrom={contractSummary.rentalFrom}
                rentalTo={contractSummary.rentalTo}
                rentalDays={contractSummary.rentalDays}
                priceTotal={total}
                deposit={contractSummary.deposit}
                onSigned={(data) => {
                  setContractSignature(data);
                  try { sessionStorage.setItem('cam2rent_contract_signature', JSON.stringify(data)); } catch { /* ignore */ }
                  setShowSignModal(false);
                }}
                onBack={() => setShowSignModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

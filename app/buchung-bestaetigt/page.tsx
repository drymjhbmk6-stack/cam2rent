'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/components/CartProvider';
import { useAuth } from '@/components/AuthProvider';
import { createAuthBrowserClient } from '@/lib/supabase-auth';

// ─── Single-item flow (from /kameras/[slug]/buchen) ──────────────────────────

function SingleBookingConfirmed({
  paymentIntentId,
}: {
  paymentIntentId: string;
}) {
  const [bookingId, setBookingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/confirm-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_intent_id: paymentIntentId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.booking_id) setBookingId(data.booking_id);
      })
      .catch(() => {});
  }, [paymentIntentId]);

  return <SuccessCard bookingIds={bookingId ? [bookingId] : null} />;
}

// ─── Cart flow (from /checkout) ───────────────────────────────────────────────

function CartBookingConfirmed({
  paymentIntentId,
}: {
  paymentIntentId: string;
}) {
  const { items, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const [bookingIds, setBookingIds] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (confirmed) return;
    if (authLoading) return; // warten bis Auth-Status bekannt ist

    // Read checkout context saved before payment
    let context: Record<string, unknown> | null = null;
    try {
      const raw = sessionStorage.getItem('cam2rent_checkout_context');
      if (raw) context = JSON.parse(raw);
    } catch {}

    // Adresse aus Profil holen und Buchung bestätigen
    async function confirm() {
      let shippingAddress: string | null = null;
      if (user && context?.deliveryMode === 'versand') {
        const supabase = createAuthBrowserClient();
        const { data: profile } = await supabase
          .from('profiles')
          .select('address_street, address_zip, address_city')
          .eq('id', user.id)
          .maybeSingle();
        if (profile?.address_street) {
          shippingAddress = [
            profile.address_street,
            [profile.address_zip, profile.address_city].filter(Boolean).join(' '),
          ].filter(Boolean).join(', ');
        }
      }
      return shippingAddress;
    }

    // Use cart items from context (more reliable than live cart)
    const cartItems =
      (context?.items as typeof items) ?? items;

    if (!cartItems.length) return;

    setConfirmed(true);

    confirm().then((shippingAddress) => {
      fetch('/api/confirm-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          items: cartItems,
          customerName: context?.customerName ?? '',
          customerEmail: context?.customerEmail ?? '',
          userId: context?.userId ?? null,
          deliveryMode: context?.deliveryMode ?? 'versand',
          shippingMethod: context?.shippingMethod ?? 'standard',
          shippingPrice: context?.shippingPrice ?? 0,
          discountAmount: context?.discountAmount ?? 0,
          couponCode: context?.couponCode ?? '',
          productDiscount: context?.productDiscount ?? 0,
          durationDiscount: context?.durationDiscount ?? 0,
          loyaltyDiscount: context?.loyaltyDiscount ?? 0,
          referralCode: context?.referralCode ?? '',
          shippingAddress,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.booking_ids) {
            setBookingIds(data.booking_ids);
            clearCart();
            sessionStorage.removeItem('cam2rent_checkout_context');
          }
        })
        .catch(() => {});
    });
  }, [paymentIntentId, confirmed, items, clearCart, user, authLoading]);

  return <SuccessCard bookingIds={bookingIds} />;
}

// ─── Shared success card ──────────────────────────────────────────────────────

function SuccessCard({ bookingIds }: { bookingIds: string[] | null }) {
  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-lg w-full text-center">
        {/* Success icon */}
        <div className="w-20 h-20 rounded-full bg-status-success/10 flex items-center justify-center mx-auto mb-6">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-10 h-10 text-status-success"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-2">
          Buchung bestätigt!
        </h1>
        <p className="font-body text-brand-steel dark:text-gray-400 mb-8">
          Deine Zahlung war erfolgreich. Du erhältst in Kürze eine
          Bestätigungs-E-Mail mit allen Details.
        </p>

        {/* Booking IDs */}
        <div className="bg-brand-bg dark:bg-brand-black rounded-xl p-4 mb-8">
          <p className="text-xs font-body text-brand-muted dark:text-gray-500 mb-1">
            Buchungsnummer{bookingIds && bookingIds.length > 1 ? 'n' : ''}
          </p>
          {bookingIds ? (
            <div className="space-y-1">
              {bookingIds.map((id) => (
                <p key={id} className="font-heading font-bold text-lg text-brand-black dark:text-white">
                  {id}
                </p>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center">
              <div className="w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
              <p className="font-heading font-semibold text-sm text-brand-steel dark:text-gray-400">
                Wird vergeben…
              </p>
            </div>
          )}
        </div>

        {/* What happens next */}
        <div className="text-left bg-accent-blue-soft/30 dark:bg-accent-blue/10 rounded-xl p-4 mb-8">
          <p className="text-xs font-heading font-semibold text-accent-blue uppercase tracking-wider mb-3">
            Wie geht es weiter?
          </p>
          <ul className="space-y-2.5">
            {[
              'Du erhältst eine Bestätigungs-E-Mail',
              'Wir bereiten deine Kamera vor',
              'Du wirst über Versand oder Abholtermin informiert',
              'Viel Spaß mit deiner Action-Cam!',
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-sm font-body text-brand-steel dark:text-gray-400"
              >
                <span className="w-5 h-5 rounded-full bg-accent-blue text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-heading font-bold">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/konto/buchungen"
            className="px-6 py-3 border border-brand-border dark:border-white/10 text-brand-black dark:text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-bg dark:hover:bg-brand-black transition-colors"
          >
            Meine Buchungen
          </Link>
          <Link
            href="/kameras"
            className="px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors"
          >
            Weitere Kameras ansehen
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Failed payment ───────────────────────────────────────────────────────────

function PaymentFailed() {
  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-lg w-full text-center">
        <div className="w-20 h-20 rounded-full bg-status-error/10 flex items-center justify-center mx-auto mb-6">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-10 h-10 text-status-error"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-2">
          Zahlung nicht abgeschlossen
        </h1>
        <p className="font-body text-brand-steel dark:text-gray-400 mb-8">
          Die Zahlung wurde abgebrochen oder ist fehlgeschlagen. Es wurde nichts
          abgebucht.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/warenkorb"
            className="px-6 py-3 border border-brand-border dark:border-white/10 text-brand-black dark:text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-bg dark:hover:bg-brand-black transition-colors"
          >
            Zurück zum Warenkorb
          </Link>
          <Link
            href="/kameras"
            className="px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors"
          >
            Kameras ansehen
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Page (detects cart vs. single flow) ─────────────────────────────────────

function BookingConfirmedContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('redirect_status');
  const paymentIntentId = searchParams.get('payment_intent');
  const fromCart = searchParams.get('from') === 'cart';

  if (status !== 'succeeded' || !paymentIntentId) {
    return <PaymentFailed />;
  }

  if (fromCart) {
    return <CartBookingConfirmed paymentIntentId={paymentIntentId} />;
  }

  return <SingleBookingConfirmed paymentIntentId={paymentIntentId} />;
}

export default function BookingConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <BookingConfirmedContent />
    </Suspense>
  );
}

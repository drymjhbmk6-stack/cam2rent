'use client';

import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/components/CartProvider';
import { useAuth } from '@/components/AuthProvider';

// ─── Signaturdaten aus sessionStorage lesen ──────────────────────────────────

function readContractSignature() {
  try {
    const raw = sessionStorage.getItem('cam2rent_contract_signature');
    if (!raw) return undefined;
    const sig = JSON.parse(raw);
    if (!sig?.agreedToTerms) return undefined;
    return sig;
  } catch {
    return undefined;
  }
}

function clearContractSignature() {
  try { sessionStorage.removeItem('cam2rent_contract_signature'); } catch {}
}

// ─── Single-item flow (from /kameras/[slug]/buchen) ──────────────────────────

function SingleBookingConfirmed({
  paymentIntentId,
  initialStatus,
}: {
  paymentIntentId: string;
  initialStatus: string | null;
}) {
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const contractSignature = readContractSignature();
    let cancelled = false;

    async function runConfirm(): Promise<{ found: boolean; processing?: boolean; errMsg?: string }> {
      try {
        const r = await fetch('/api/confirm-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_intent_id: paymentIntentId,
            contractSignature,
          }),
        });
        const data = await r.json();
        if (data.booking_id) {
          if (!cancelled) {
            setBookingId(data.booking_id);
            clearContractSignature();
          }
          return { found: true };
        }
        if (data.processing) {
          return { found: false, processing: true, errMsg: data.message ?? 'Zahlung wird verarbeitet. Du bekommst gleich eine Bestaetigung.' };
        }
        return { found: false, errMsg: typeof data.error === 'string' ? data.error : 'Unbekannter Fehler' };
      } catch {
        return { found: false, errMsg: 'Verbindungsfehler. Deine Buchung läuft trotzdem im Hintergrund.' };
      }
    }

    (async () => {
      const first = await runConfirm();
      if (cancelled) return;
      if (first.found) {
        setConfirmed(true);
        return;
      }
      // Stripe-Redirect-Status 'failed' + Server hat (noch) keine Buchung:
      // Webhook ist eventuell noch unterwegs. Einmaliger Retry nach 1.5 s.
      if (initialStatus === 'failed') {
        await new Promise((res) => setTimeout(res, 1500));
        if (cancelled) return;
        const second = await runConfirm();
        if (cancelled) return;
        if (!second.found) {
          if (second.errMsg) setError(second.errMsg);
        }
        setConfirmed(true);
        return;
      }
      if (first.errMsg) setError(first.errMsg);
      setConfirmed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentIntentId, initialStatus]);

  // Echter Failed-Case: Stripe-Redirect meldete 'failed' UND der Server hat
  // (auch nach Retry) keine Buchung gefunden → klare Fehler-Seite.
  if (confirmed && !bookingId && initialStatus === 'failed') {
    return <PaymentFailed />;
  }

  // Neutraler Lade-Screen, solange wir bei 'failed' noch pruefen — sonst sieht
  // der Kunde fuer 1-2 s "Buchung bestaetigt" + Spinner.
  if (!confirmed && initialStatus === 'failed' && !bookingId) {
    return <CheckingStatus />;
  }

  return <SuccessCard bookingIds={bookingId ? [bookingId] : null} error={error} />;
}

// ─── Cart flow (from /checkout) ───────────────────────────────────────────────

function CartBookingConfirmed({
  paymentIntentId,
  initialStatus,
}: {
  paymentIntentId: string;
  initialStatus: string | null;
}) {
  const { items, clearCart } = useCart();
  const { loading: authLoading } = useAuth();
  const [bookingIds, setBookingIds] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [retried, setRetried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-Entry-Guard: useEffect kann durch handleConfirm-Identitaetswechsel
  // (clearCart aendert items, authLoading flippt) ein zweites Mal feuern,
  // bevor setConfirmed(true) propagiert ist. Verhindert Doppel-confirm-cart
  // → Doppel-Mails (siehe CLAUDE.md → "Doppelte Buchungsmails").
  const inFlightRef = useRef(false);

  const handleConfirm = useCallback(async (): Promise<{ found: boolean; errMsg?: string }> => {
    // Read checkout context saved before payment
    let context: Record<string, unknown> | null = null;
    try {
      const raw = sessionStorage.getItem('cam2rent_checkout_context');
      if (raw) context = JSON.parse(raw);
    } catch {}

    // Per-Order-Adressen aus dem Checkout-Context (im Checkout eingegeben).
    // Leer -> confirm-cart faellt server-seitig auf die Profil-Adresse zurueck.
    const ctxStreet = (context?.street as string) ?? '';
    const ctxZip = (context?.zip as string) ?? '';
    const ctxCity = (context?.city as string) ?? '';
    const shippingAddress =
      context?.deliveryMode === 'versand' && ctxStreet
        ? [ctxStreet, [ctxZip, ctxCity].filter(Boolean).join(' ')].filter(Boolean).join(', ')
        : null;

    const ctxBillStreet = (context?.billingStreet as string) ?? '';
    const ctxBillZip = (context?.billingZip as string) ?? '';
    const ctxBillCity = (context?.billingCity as string) ?? '';
    const invoiceAddress = ctxBillStreet
      ? [ctxBillStreet, [ctxBillZip, ctxBillCity].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : null;
    const invoiceName = invoiceAddress ? ((context?.billingName as string) ?? null) : null;

    // Use cart items from context (more reliable than live cart)
    const cartItems =
      (context?.items as typeof items) ?? items;

    // Vertragssignatur: zuerst aus separatem Key, dann Fallback aus Checkout-Context
    const contractSignature = readContractSignature()
      ?? (context?.contractSignature as ReturnType<typeof readContractSignature>);

    try {
      const res = await fetch('/api/confirm-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          items: cartItems.length ? cartItems : [],
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
          invoiceName,
          invoiceAddress,
          contractSignature,
        }),
      });
      const data = await res.json();

      if (data.booking_ids) {
        setBookingIds(data.booking_ids);
        clearCart();
        sessionStorage.removeItem('cam2rent_checkout_context');
        clearContractSignature();
        return { found: true };
      }
      if (data.processing) {
        // Async-Zahlung (PayPal, Klarna, SEPA) — Webhook traegt Buchung nach.
        // Cart leeren wir hier NICHT — falls Buchung doch nicht durchkommt,
        // soll der Kunde sie nochmal abschicken koennen.
        return { found: false, errMsg: data.message ?? 'Zahlung wird verarbeitet. Du bekommst gleich eine Bestaetigung.' };
      }
      if (data.error) {
        return { found: false, errMsg: typeof data.error === 'string' ? data.error : 'Unbekannter Fehler' };
      }
      return { found: false };
    } catch {
      return { found: false, errMsg: 'Verbindungsfehler. Deine Buchung läuft trotzdem im Hintergrund.' };
    }
  }, [paymentIntentId, items, clearCart]);

  useEffect(() => {
    if (confirmed) return;
    if (authLoading) return;
    // Re-Entry-Guard (siehe inFlightRef-Kommentar oben). Verhindert dass ein
    // zweites useEffect-Feuer den Server ein zweites Mal anruft, bevor der
    // erste Call setConfirmed(true) propagiert hat.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const first = await handleConfirm();
        if (cancelled) return;
        if (first.found) {
          setConfirmed(true);
          return;
        }
        // Stripe-Redirect-Status 'failed' + Server hat (noch) keine Buchung:
        // Webhook ist eventuell noch unterwegs. Einmaliger Retry nach 1.5 s.
        if (initialStatus === 'failed' && !retried) {
          setRetried(true);
          await new Promise((res) => setTimeout(res, 1500));
          if (cancelled) return;
          const second = await handleConfirm();
          if (cancelled) return;
          if (!second.found && second.errMsg) setError(second.errMsg);
          setConfirmed(true);
          return;
        }
        if (first.errMsg) setError(first.errMsg);
        setConfirmed(true);
      } finally {
        inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [confirmed, authLoading, handleConfirm, initialStatus, retried]);

  // Echter Failed-Case: Stripe-Redirect meldete 'failed' UND der Server hat
  // (auch nach Retry) keine Buchung gefunden → klare Fehler-Seite.
  if (confirmed && !bookingIds && initialStatus === 'failed') {
    return <PaymentFailed />;
  }

  // Neutraler Lade-Screen, solange wir bei 'failed' noch pruefen.
  if (!confirmed && initialStatus === 'failed' && !bookingIds) {
    return <CheckingStatus />;
  }

  return <SuccessCard bookingIds={bookingIds} error={error} />;
}

// ─── Shared success card ──────────────────────────────────────────────────────

function SuccessCard({
  bookingIds,
  error,
}: {
  bookingIds: string[] | null;
  error: string | null;
}) {
  // Nach 12 s ohne booking-IDs zeigen wir einen Fallback-Hinweis statt
  // endlosem Spinner — die Buchung selbst läuft im Hintergrund weiter.
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (bookingIds || error) return;
    const t = setTimeout(() => setLongWait(true), 12_000);
    return () => clearTimeout(t);
  }, [bookingIds, error]);

  const showFallback = !bookingIds && (longWait || error);

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
          Buchung best&auml;tigt!
        </h1>
        <p className="font-body text-brand-steel dark:text-gray-400 mb-8">
          Deine Zahlung war erfolgreich. Du erh&auml;ltst in K&uuml;rze eine
          Best&auml;tigungs-E-Mail mit allen Details.
        </p>

        {/* Buchungsnummer */}
        <div className="bg-brand-bg dark:bg-brand-black rounded-xl p-4 mb-8">
          <p className="text-xs font-body text-brand-muted dark:text-gray-500 mb-1">
            Deine Buchungsnummer
          </p>
          {bookingIds ? (
            <div className="space-y-1">
              {bookingIds.map((id) => (
                <p key={id} className="font-heading font-bold text-lg text-brand-black dark:text-white tracking-wide">
                  {id}
                </p>
              ))}
            </div>
          ) : showFallback ? (
            <p className="font-body text-sm text-brand-steel dark:text-gray-400">
              Du findest sie gleich unter <Link href="/konto/buchungen" className="text-accent-blue underline">Meine Buchungen</Link>.
            </p>
          ) : (
            <div className="flex items-center gap-2 justify-center">
              <div className="w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
              <p className="font-heading font-semibold text-sm text-brand-steel dark:text-gray-400">
                Wird vergeben…
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-8 p-4 bg-status-warning/10 border border-status-warning/30 rounded-xl text-left">
            <p className="text-xs font-body text-status-warning">
              Hinweis: {error} Falls deine Zahlung erfolgreich war, ist die Buchung trotzdem
              gespeichert — du siehst sie unter &bdquo;Meine Buchungen&ldquo;.
            </p>
          </div>
        )}

        {/* Deine Kamera ist bald unterwegs */}
        <div className="text-left bg-accent-blue-soft/30 dark:bg-accent-blue/10 rounded-xl p-5 mb-8">
          <p className="text-sm font-heading font-bold text-accent-blue mb-4">
            Deine Kamera ist bald unterwegs!
          </p>
          <ul className="space-y-3">
            {[
              'Check dein Postfach — deine Best\u00e4tigung ist schon unterwegs',
              'Wir packen deine Kamera sorgf\u00e4ltig ein',
              'Du erh\u00e4ltst eine Versandbest\u00e4tigung mit Tracking-Link',
              'Kamera auspacken und Abenteuer starten!',
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm font-body text-brand-black/80 dark:text-gray-300"
              >
                <span className="w-6 h-6 rounded-full bg-accent-blue text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-heading font-bold">
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

// ─── Neutral checking status (waiting on webhook race) ─────────────────────────

function CheckingStatus() {
  return (
    <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-8 sm:p-12 max-w-md w-full text-center">
        <div className="flex items-center justify-center mb-6">
          <div className="w-12 h-12 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
        </div>
        <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-2">
          Zahlung wird gepr&uuml;ft&hellip;
        </h1>
        <p className="font-body text-sm text-brand-steel dark:text-gray-400">
          Einen Moment, wir gleichen den Zahlungsstatus mit der Bank ab.
        </p>
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
        <p className="font-body text-brand-steel dark:text-gray-400 mb-4">
          Die Zahlung wurde abgebrochen oder ist fehlgeschlagen. Es wurde nichts
          abgebucht.
        </p>
        <div className="mb-8 p-4 rounded-xl bg-status-warning/10 border border-status-warning/30 text-left">
          <p className="text-xs font-body text-status-warning leading-relaxed">
            <strong>Wurde trotzdem abgebucht?</strong> Bei PayPal und anderen
            Sofort&uuml;berweisungen kann es kurz dauern, bis die Buchung im
            System sichtbar ist. Schau in <Link href="/konto/buchungen" className="underline font-semibold">Meine Buchungen</Link> nach &mdash;
            falls dort nichts erscheint, melde dich bitte ueber die
            Kontaktseite.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/konto/buchungen"
            className="px-6 py-3 border border-brand-border dark:border-white/10 text-brand-black dark:text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-bg dark:hover:bg-brand-black transition-colors"
          >
            Meine Buchungen
          </Link>
          <Link
            href="/warenkorb"
            className="px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-[10px] hover:bg-brand-dark transition-colors"
          >
            Zur&uuml;ck zum Warenkorb
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

  // Ohne payment_intent kann der Server nichts pruefen → echte Failed-Seite.
  // Bei 'failed' fragen wir trotzdem den Server: Webhook und Charge sind
  // gelegentlich schon durch, waehrend der Browser-Redirect failed meldet
  // (typisch bei 3DS-Karten). confirm-cart/confirm-booking sind idempotent
  // und antworten mit booking_id wenn die Buchung tatsaechlich existiert.
  if (!paymentIntentId) {
    return <PaymentFailed />;
  }

  if (fromCart) {
    return <CartBookingConfirmed paymentIntentId={paymentIntentId} initialStatus={status} />;
  }

  return <SingleBookingConfirmed paymentIntentId={paymentIntentId} initialStatus={status} />;
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

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '@/components/AuthProvider';
import { getStripePromise } from '@/lib/stripe-client';

type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

function brandLabel(brand: string): string {
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  };
  return map[brand] ?? (brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Karte');
}

// ─── Formular zum Hinterlegen (inside <Elements>) ─────────────────────────────
function AddCardForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const submitRes = await elements.submit();
      if (submitRes?.error) {
        setError(submitRes.error.message ?? 'Bitte prüfe deine Kartendaten.');
        setBusy(false);
        return;
      }
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/konto/zahlungsmittel?added=1`,
        },
        redirect: 'if_required',
      });
      if (stripeError) {
        setError(stripeError.message ?? 'Karte konnte nicht gespeichert werden.');
        setBusy(false);
        return;
      }
      if (setupIntent?.status === 'succeeded' || setupIntent?.status === 'processing') {
        onDone();
        return;
      }
      // Sonst (requires_action mit Redirect) übernimmt Stripe die Weiterleitung.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unerwarteter Fehler.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: { type: 'tabs' } }} />
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-[10px] text-sm text-status-error">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={!stripe || !elements || busy}
          className="px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {busy ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Wird gespeichert…
            </>
          ) : 'Karte speichern'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-5 py-3 text-brand-steel dark:text-gray-400 font-heading font-semibold text-sm rounded-btn border border-brand-border dark:border-white/10 hover:bg-brand-bg dark:hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          Abbrechen
        </button>
      </div>
      <p className="text-xs text-brand-muted dark:text-gray-500">
        Deine Kartendaten werden ausschließlich verschlüsselt bei unserem
        Zahlungsdienstleister Stripe gespeichert – niemals bei cam2rent.
      </p>
    </form>
  );
}

export default function ZahlungsmittelPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [prepBusy, setPrepBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const stripePromise = useMemo(
    () => getStripePromise({ userId: user?.id ?? null }),
    [user?.id],
  );

  const loadCards = useCallback(async () => {
    try {
      const res = await fetch('/api/zahlungsmittel');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fehler beim Laden.');
      setCards(Array.isArray(data.cards) ? data.cards : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zahlungsmittel konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login?redirect=/konto/zahlungsmittel'); return; }
    // Rückkehr nach 3DS-Redirect
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('added') === '1') {
        setSuccess('Zahlungsmittel gespeichert.');
        window.history.replaceState(null, '', '/konto/zahlungsmittel');
      }
    } catch { /* ignore */ }
    loadCards();
  }, [authLoading, user, router, loadCards]);

  const startAdd = async () => {
    setError(null);
    setSuccess(null);
    setPrepBusy(true);
    try {
      const res = await fetch('/api/zahlungsmittel/setup-intent', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.clientSecret) throw new Error(data.error ?? 'Fehler beim Vorbereiten.');
      setSetupSecret(data.clientSecret);
      setAdding(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Konnte nicht gestartet werden.');
    } finally {
      setPrepBusy(false);
    }
  };

  const cancelAdd = () => {
    setAdding(false);
    setSetupSecret(null);
  };

  const finishAdd = () => {
    setAdding(false);
    setSetupSecret(null);
    setSuccess('Zahlungsmittel gespeichert.');
    setLoading(true);
    loadCards();
  };

  const removeCard = async (id: string) => {
    if (!confirm('Dieses Zahlungsmittel wirklich entfernen?')) return;
    setDeletingId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/zahlungsmittel', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fehler beim Entfernen.');
      setCards((prev) => prev.filter((c) => c.id !== id));
      setSuccess('Zahlungsmittel entfernt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zahlungsmittel konnte nicht entfernt werden.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white">Zahlungsmittel</h1>
        <p className="text-sm text-brand-steel dark:text-gray-400 mt-1">
          Hinterlege eine Karte, um bei deiner nächsten Buchung schneller zu zahlen –
          die gespeicherte Karte ist im Checkout bereits vorausgewählt.
        </p>
      </div>

      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-card text-sm text-status-success">
          {success}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-card text-sm text-status-error">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
        <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
          Gespeicherte Karten
        </h2>

        {loading ? (
          <div className="py-8">
            <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : cards.length === 0 ? (
          <p className="text-sm text-brand-steel dark:text-gray-400 py-2">
            Noch keine Karte hinterlegt.
          </p>
        ) : (
          <ul className="space-y-3">
            {cards.map((card) => (
              <li
                key={card.id}
                className="flex items-center justify-between gap-4 p-4 border border-brand-border dark:border-white/10 rounded-[10px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex items-center justify-center w-11 h-8 rounded-[6px] bg-brand-bg dark:bg-brand-black text-xs font-heading font-semibold text-brand-steel dark:text-gray-300 flex-shrink-0">
                    {brandLabel(card.brand).slice(0, 4)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-body font-medium text-brand-black dark:text-white truncate">
                      {brandLabel(card.brand)} •••• {card.last4}
                    </p>
                    <p className="text-xs text-brand-muted dark:text-gray-500">
                      Gültig bis {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeCard(card.id)}
                  disabled={deletingId === card.id}
                  className="text-sm font-heading font-semibold text-status-error hover:underline disabled:opacity-50 flex-shrink-0"
                >
                  {deletingId === card.id ? 'Entfernen…' : 'Entfernen'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
        <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-4">
          Neue Karte hinterlegen
        </h2>

        {!adding ? (
          <button
            onClick={startAdd}
            disabled={prepBusy}
            className="px-6 py-3 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {prepBusy ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Wird vorbereitet…
              </>
            ) : '+ Karte hinzufügen'}
          </button>
        ) : setupSecret ? (
          <Elements
            key={setupSecret}
            stripe={stripePromise}
            options={{
              clientSecret: setupSecret,
              locale: 'de',
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
            <AddCardForm onDone={finishAdd} onCancel={cancelAdd} />
          </Elements>
        ) : null}
      </div>
    </div>
  );
}

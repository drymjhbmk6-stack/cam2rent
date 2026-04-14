'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getCancellationInfo } from '@/data/cancellation';
import { useProducts } from '@/components/ProductsProvider';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { fmtDate, formatCurrency } from '@/lib/format-utils';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// Geschäftsdaten (Client-Komponente kann BUSINESS nicht importieren)
const KONTAKT_EMAIL = 'kontakt@cam2rent.de';

interface Booking {
  id: string;
  product_id: string;
  product_name: string;
  rental_from: string;
  rental_to: string;
  days: number;
  price_total: number;
  status: 'confirmed' | 'shipped' | 'completed' | 'cancelled';
  delivery_mode: string;
  haftung: string;
  created_at: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  return_label_url: string | null;
  contract_signed: boolean | null;
  contract_signed_at: string | null;
  original_rental_to: string | null;
  extended_at: string | null;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Aktiv', className: 'bg-green-100 text-green-700' },
  shipped: { label: 'Unterwegs', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Abgeschlossen', className: 'bg-brand-bg dark:bg-brand-black text-brand-steel dark:text-gray-400' },
  cancelled: { label: 'Storniert', className: 'bg-red-100 text-red-600' },
  damaged: { label: 'Schaden gemeldet', className: 'bg-orange-100 text-orange-700' },
};

// ─── Cancel modal ────────────────────────────────────────────────────────────

interface CancelModalProps {
  booking: Booking;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}

function CancelModal({ booking, onConfirm, onClose, loading }: CancelModalProps) {
  const cancelInfo = getCancellationInfo(booking.rental_from, booking.status);
  const refundAmount = booking.price_total * (cancelInfo.refundPercentage / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-2xl w-full max-w-md p-6">
        <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">Buchung stornieren?</h2>
        <p className="text-sm text-brand-text dark:text-gray-300 mb-4">
          {booking.product_name} · {fmtDate(booking.rental_from)} – {fmtDate(booking.rental_to)}
        </p>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-5">
          <p className="text-sm font-semibold mb-1 text-green-700">{cancelInfo.label}</p>
          <p className="text-xs text-brand-text dark:text-gray-300 mb-2">{cancelInfo.description}</p>
          <p className="text-sm font-bold text-green-700">Rückerstattung: {formatCurrency(refundAmount)}</p>
        </div>
        <p className="text-xs text-brand-muted dark:text-gray-500 mb-5">Diese Aktion kann nicht rückgängig gemacht werden. Du erhältst eine Bestätigungsmail.</p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 px-4 py-2.5 border border-brand-border dark:border-white/10 rounded-btn text-sm font-heading font-semibold text-brand-black dark:text-white hover:bg-brand-bg dark:hover:bg-white/5 dark:bg-brand-black transition-colors disabled:opacity-50">
            Abbrechen
          </button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-btn text-sm font-heading font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Jetzt stornieren
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Extend modal ────────────────────────────────────────────────────────────

interface ExtendModalProps {
  booking: Booking;
  onClose: () => void;
  onSuccess: (newRentalTo: string, newDays: number, newTotal: number) => void;
}

// Inner payment form (must be inside <Elements>)
function ExtendPaymentForm({ booking, newDate, priceInfo }: {
  booking: Booking;
  newDate: string;
  priceInfo: { clientSecret: string; priceDifference: number; additionalDays: number; newDays: number };
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setFormError('');

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setFormError(submitError.message || 'Zahlungsfehler.');
      setPaying(false);
      return;
    }

    // Save extension context so we can confirm after redirect
    sessionStorage.setItem('cam2rent_extension', JSON.stringify({
      bookingId: booking.id,
      newRentalTo: newDate,
    }));

    // Stripe will redirect to return_url after payment
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/konto/buchungen?extend_confirm=1`,
      },
    });

    // Only reached if redirect fails (e.g. card error without redirect)
    if (confirmError) {
      setFormError(confirmError.message || 'Zahlung fehlgeschlagen.');
      sessionStorage.removeItem('cam2rent_extension');
    }
    setPaying(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      {formError && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{formError}</div>
      )}
      <div className="mb-4">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      <button
        type="submit"
        disabled={!stripe || paying}
        className="w-full py-2.5 bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {paying && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        {paying ? 'Wird verarbeitet...' : `Jetzt verlängern für ${formatCurrency(priceInfo.priceDifference)}`}
      </button>
    </form>
  );
}

function ExtendModal({ booking, onClose }: Omit<ExtendModalProps, 'onSuccess'>) {
  const [newDate, setNewDate] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [priceInfo, setPriceInfo] = useState<{ clientSecret: string; priceDifference: number; additionalDays: number; newDays: number } | null>(null);
  const [error, setError] = useState('');

  const minDate = (() => {
    const d = new Date(booking.rental_to);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const handleCalculate = async () => {
    if (!newDate) return;
    setCalculating(true);
    setError('');
    setPriceInfo(null);

    try {
      const res = await fetch('/api/extend-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, newRentalTo: newDate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Fehler bei der Berechnung.'); return; }
      setPriceInfo({
        clientSecret: data.clientSecret,
        priceDifference: data.priceDifference,
        additionalDays: data.additionalDays,
        newDays: data.newDays,
      });
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-2xl w-full max-w-md p-6">
        <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">Buchung verlängern</h2>
        <p className="text-sm text-brand-text dark:text-gray-300 mb-4">
          {booking.product_name} · Aktuell bis {fmtDate(booking.rental_to)}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        <div className="mb-4">
          <label className="text-xs font-heading font-semibold text-brand-black dark:text-white mb-1.5 block">
            Neues Rückgabedatum
          </label>
          <input
            type="date"
            min={minDate}
            value={newDate}
            onChange={(e) => { setNewDate(e.target.value); setPriceInfo(null); }}
            className="w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-dark text-brand-black dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-sm"
          />
        </div>

        {!priceInfo && (
          <button
            onClick={handleCalculate}
            disabled={!newDate || calculating}
            className="w-full py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-3"
          >
            {calculating ? 'Wird berechnet...' : 'Preis berechnen'}
          </button>
        )}

        {priceInfo && (
          <div className="mb-4">
            <div className="bg-accent-blue-soft dark:bg-accent-blue/10 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-brand-text dark:text-gray-300">Zusätzliche Tage</span>
                <span className="font-semibold text-brand-black dark:text-white">+{priceInfo.additionalDays} Tag{priceInfo.additionalDays !== 1 ? 'e' : ''}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-brand-text dark:text-gray-300">Neue Gesamtdauer</span>
                <span className="font-semibold text-brand-black dark:text-white">{priceInfo.newDays} Tage</span>
              </div>
              <div className="border-t border-blue-200 my-2" />
              <div className="flex justify-between text-sm">
                <span className="font-heading font-semibold text-brand-black dark:text-white">Aufpreis</span>
                <span className="font-heading font-bold text-accent-blue">{formatCurrency(priceInfo.priceDifference)}</span>
              </div>
            </div>

            <Elements
              stripe={stripePromise}
              options={{ clientSecret: priceInfo.clientSecret, appearance: { theme: 'stripe' } }}
            >
              <ExtendPaymentForm
                booking={booking}
                newDate={newDate}
                priceInfo={priceInfo}
              />
            </Elements>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-brand-steel dark:text-gray-400 hover:text-brand-black dark:text-white transition-colors mt-2"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ─── Sign contract modal ─────────────────────────────────────────────────────

interface SignModalProps {
  booking: Booking;
  onClose: () => void;
  onSuccess: () => void;
}

function SignContractModal({ booking, onClose, onSuccess }: SignModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Canvas drawing
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    setHasDrawn(false);
  };

  const handleSubmit = async () => {
    if (!hasDrawn || !signerName.trim() || !accepted) return;
    setSubmitting(true);
    setError('');

    try {
      const signatureDataUrl = canvasRef.current!.toDataURL('image/png');

      const res = await fetch('/api/contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          signatureDataUrl,
          customerName: signerName.trim(),
          agreedToTerms: true,
          signatureMethod: 'canvas',
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Unterschrift fehlgeschlagen.');
        return;
      }

      setSuccess(true);
      setTimeout(() => onSuccess(), 1500);
    } catch {
      setError('Netzwerkfehler.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white dark:bg-brand-dark rounded-card shadow-2xl w-full max-w-md p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-heading font-semibold text-brand-black dark:text-white">Mietvertrag unterschrieben!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">Mietvertrag unterschreiben</h2>
        <p className="text-sm text-brand-text dark:text-gray-300 mb-4">
          {booking.product_name} · {fmtDate(booking.rental_from)} – {fmtDate(booking.rental_to)}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        {/* Contract summary */}
        <div className="bg-brand-bg dark:bg-brand-black rounded-lg p-4 mb-4 text-xs text-brand-text dark:text-gray-300 space-y-1.5 max-h-48 overflow-y-auto">
          <p className="font-heading font-semibold text-brand-black dark:text-white text-sm mb-2">Mietbedingungen (Zusammenfassung)</p>
          <p>• Der Mietgegenstand ist Eigentum des Vermieters. Weitervermietung ist untersagt.</p>
          <p>• Die Kamera ist sorgsam zu behandeln und vor Wasser, Stößen und Überhitzung zu schützen.</p>
          <p>• Der Mieter haftet für alle Schäden während des Mietzeitraums.</p>
          <p>• Mängel innerhalb von 24 Stunden nach Empfang melden.</p>
          <p>• Bei verspäteter Rückgabe: Tagespreis + 5,00 EUR Bearbeitungsgebühr pro Tag.</p>
          <p>• Stornierung: 100% bei 7+ Tagen, 50% bei 3-7 Tagen, 0% bei weniger als 3 Tagen vor Mietbeginn.</p>
          <p>• Vorautorisierung wird bei ordnungsgemäßer Rückgabe freigegeben.</p>
          <p>• Deutsches Recht. Gerichtsstand: Berlin.</p>
          <p className="text-brand-muted dark:text-gray-500 mt-2">Der vollständige Vertragstext wurde beim Buchungsvorgang angezeigt.</p>
        </div>

        {/* Signer name */}
        <div className="mb-3">
          <label className="text-xs font-heading font-semibold text-brand-black dark:text-white mb-1.5 block">Vollständiger Name</label>
          <input
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Vor- und Nachname"
            className="w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-dark text-brand-black dark:text-white placeholder-brand-muted dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition-colors text-sm"
          />
        </div>

        {/* Signature pad */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-heading font-semibold text-brand-black dark:text-white">Unterschrift</label>
            {hasDrawn && (
              <button onClick={clearCanvas} className="text-xs text-accent-blue hover:underline">Löschen</button>
            )}
          </div>
          <canvas
            ref={canvasRef}
            width={400}
            height={150}
            className="w-full border border-brand-border dark:border-white/10 rounded-[10px] bg-white dark:bg-brand-dark cursor-crosshair touch-none"
            style={{ height: 120 }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          {!hasDrawn && (
            <p className="text-xs text-brand-muted dark:text-gray-500 mt-1">Unterschreibe hier mit der Maus oder dem Finger.</p>
          )}
        </div>

        {/* Accept checkbox */}
        <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-brand-border dark:border-white/10 text-accent-blue focus:ring-accent-blue"
          />
          <span className="text-xs text-brand-text dark:text-gray-300">
            Ich akzeptiere die Mietbedingungen und bestätige die Richtigkeit meiner Angaben.
          </span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-brand-border dark:border-white/10 rounded-btn text-sm font-heading font-semibold text-brand-black dark:text-white hover:bg-brand-bg dark:hover:bg-white/5 dark:bg-brand-black transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={!hasDrawn || !signerName.trim() || !accepted || submitting}
            className="flex-1 px-4 py-2.5 bg-brand-black dark:bg-accent-blue text-white rounded-btn text-sm font-heading font-semibold hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Unterschreiben
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BuchungenPage() {
  const { products: allProducts } = useProducts();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [extendTarget, setExtendTarget] = useState<Booking | null>(null);
  const [signTarget, setSignTarget] = useState<Booking | null>(null);
  const [extensionSuccess, setExtensionSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    fetch(`/api/meine-buchungen?user_id=${user.id}`)
      .then((r) => r.json())
      .then((data) => { setBookings(data.bookings ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  // Handle Stripe redirect after extension payment
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    const params = new URLSearchParams(window.location.search);
    const isExtendConfirm = params.get('extend_confirm');
    const paymentIntentId = params.get('payment_intent');
    const redirectStatus = params.get('redirect_status');

    if (!isExtendConfirm || !paymentIntentId || redirectStatus !== 'succeeded') return;

    const extensionData = sessionStorage.getItem('cam2rent_extension');
    if (!extensionData) return;

    const { bookingId, newRentalTo } = JSON.parse(extensionData);
    sessionStorage.removeItem('cam2rent_extension');

    // Confirm extension on server
    fetch('/api/confirm-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, paymentIntentId, newRentalTo }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setExtensionSuccess(true);
          // Reload bookings to show updated data
          fetch(`/api/meine-buchungen?user_id=${user.id}`)
            .then((r) => r.json())
            .then((d) => setBookings(d.bookings ?? []));
          setTimeout(() => setExtensionSuccess(false), 5000);
        }
      })
      .catch(() => {});

    // Clean URL params
    router.replace('/konto/buchungen', { scroll: false });
  }, [user, router]);

  async function handleCancelConfirm() {
    if (!cancelTarget) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await fetch('/api/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: cancelTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) { setCancelError(data.error ?? 'Stornierung fehlgeschlagen.'); setCancelLoading(false); return; }
      setBookings((prev) => prev.map((b) => b.id === cancelTarget.id ? { ...b, status: 'cancelled' } : b));
      setCancelTarget(null);
    } catch { setCancelError('Netzwerkfehler.'); } finally { setCancelLoading(false); }
  }

  function handleSignSuccess() {
    if (!signTarget) return;
    setBookings((prev) =>
      prev.map((b) =>
        b.id === signTarget.id
          ? { ...b, contract_signed: true, contract_signed_at: new Date().toISOString() }
          : b
      )
    );
    setSignTarget(null);
  }

  // Can extend: active booking, rental not ended
  function canExtend(booking: Booking) {
    return ['confirmed', 'shipped'].includes(booking.status) && booking.rental_to >= new Date().toISOString().split('T')[0];
  }

  // Can sign contract: active booking, not yet signed
  function canSign(booking: Booking) {
    return ['confirmed', 'shipped'].includes(booking.status) && !booking.contract_signed;
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-12 flex justify-center">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {cancelTarget && (
        <CancelModal booking={cancelTarget} onConfirm={handleCancelConfirm} onClose={() => { setCancelTarget(null); setCancelError(null); }} loading={cancelLoading} />
      )}
      {extendTarget && (
        <ExtendModal booking={extendTarget} onClose={() => setExtendTarget(null)} />
      )}
      {signTarget && (
        <SignContractModal booking={signTarget} onClose={() => setSignTarget(null)} onSuccess={handleSignSuccess} />
      )}

      <div className="space-y-6">
        <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6">
          <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white mb-1">Meine Buchungen</h1>
          <p className="text-brand-text dark:text-gray-300 text-sm">Alle deine Buchungen auf einen Blick.</p>
        </div>

        {extensionSuccess && (
          <div className="p-4 rounded-[10px] bg-green-50 border border-green-200 text-status-success text-sm font-semibold">
            Buchung erfolgreich verlängert!
          </div>
        )}

        {cancelError && (
          <div className="bg-red-50 border border-red-200 rounded-card p-4 text-sm text-red-700">{cancelError}</div>
        )}

        {bookings.length === 0 ? (
          <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-10 text-center">
            <div className="w-16 h-16 bg-brand-bg dark:bg-brand-black rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-brand-muted dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="font-heading font-semibold text-brand-black dark:text-white mb-2">Noch keine Buchungen</h2>
            <p className="text-brand-text dark:text-gray-300 text-sm mb-6 max-w-sm mx-auto">Deine zukünftigen Buchungen erscheinen hier automatisch, sobald du eingeloggt buchst.</p>
            <Link href="/kameras" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-semibold text-sm rounded-btn hover:bg-brand-dark transition-colors">
              Kameras entdecken
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const status = statusConfig[booking.status] ?? statusConfig.confirmed;
              const cancelInfo = getCancellationInfo(booking.rental_from, booking.status);

              return (
                <div key={booking.id} className="bg-white dark:bg-brand-dark rounded-card shadow-card p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-heading font-semibold text-brand-black dark:text-white">{booking.product_name}</h3>
                      <p className="text-xs text-brand-muted dark:text-gray-500 mt-0.5">
                        Buchung {booking.id}
                        {booking.extended_at && (
                          <span className="ml-2 text-accent-blue">· Verlängert</span>
                        )}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 text-xs font-body font-semibold px-2.5 py-1 rounded-full ${status.className}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div>
                      <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Mietstart</p>
                      <p className="text-sm font-medium text-brand-black dark:text-white">{fmtDate(booking.rental_from)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Rückgabe</p>
                      <p className="text-sm font-medium text-brand-black dark:text-white">{fmtDate(booking.rental_to)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Miettage</p>
                      <p className="text-sm font-medium text-brand-black dark:text-white">{booking.days} {booking.days === 1 ? 'Tag' : 'Tage'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-brand-muted dark:text-gray-500 mb-0.5">Gesamt</p>
                      <p className="text-sm font-bold text-brand-black dark:text-white">{formatCurrency(booking.price_total)}</p>
                    </div>
                  </div>

                  {/* Extension info */}
                  {booking.extended_at && booking.original_rental_to && (
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2.5">
                      <svg className="w-4 h-4 text-accent-blue flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-xs">
                        <span className="font-semibold text-blue-800">Verlängert</span>
                        <span className="text-blue-700">
                          {' '}— Ursprünglich bis {fmtDate(booking.original_rental_to)}, jetzt bis {fmtDate(booking.rental_to)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Contract status */}
                  {booking.contract_signed && (
                    <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs font-semibold text-green-700">
                        Mietvertrag unterschrieben{booking.contract_signed_at ? ` am ${fmtDate(booking.contract_signed_at)}` : ''}
                      </span>
                    </div>
                  )}

                  {/* Return label */}
                  {booking.status === 'shipped' && booking.return_label_url && (
                    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                      <span className="text-lg leading-none">📦</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-heading font-semibold text-amber-800 mb-0.5">Rücksendeetikett verfügbar</p>
                        <p className="text-xs text-amber-700 mb-1.5">Lege das Etikett beim Rückversand ins Paket oder klebe es außen drauf.</p>
                        <a href={`/api/konto/return-label/${booking.id}`} download className="inline-flex items-center gap-1.5 text-xs font-heading font-semibold text-amber-800 bg-white dark:bg-brand-dark border border-amber-300 px-3 py-1.5 rounded-btn hover:bg-amber-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                          Rücksendeetikett herunterladen (PDF)
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Tracking info */}
                  {booking.status === 'shipped' && booking.tracking_number && (
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
                      <span className="text-lg leading-none">📦</span>
                      <div className="min-w-0">
                        <p className="text-xs font-heading font-semibold text-blue-800 mb-0.5">Deine Kamera ist unterwegs!</p>
                        <p className="text-xs text-blue-700 mb-1">Tracking-Nummer: <span className="font-mono font-semibold">{booking.tracking_number}</span></p>
                        {booking.tracking_url && (
                          <a href={booking.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-accent-blue hover:underline">
                            Sendung verfolgen →
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-border dark:border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-brand-muted dark:text-gray-500">{booking.delivery_mode === 'versand' ? '📦 Versand' : '🤝 Abholung'}</span>
                      <span className="text-brand-border">·</span>
                      <span className="text-xs text-brand-muted dark:text-gray-500 capitalize">
                        Haftung: {booking.haftung === 'none' ? 'Basis' : booking.haftung === 'standard' ? 'Standard' : 'Premium'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Invoice */}
                      <a href={`/api/invoice/${booking.id}`} download className="flex items-center gap-1.5 text-xs font-heading font-semibold text-accent-blue hover:underline">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                        Rechnung
                      </a>

                      {/* Contract download — nur wenn unterschrieben */}
                      {booking.contract_signed && (
                        <a href={`/api/rental-contract/${booking.id}`} download className="flex items-center gap-1.5 text-xs font-heading font-semibold text-brand-black dark:text-white hover:underline">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          Mietvertrag
                        </a>
                      )}

                      {/* Sign contract */}
                      {canSign(booking) && (
                        <button onClick={() => setSignTarget(booking)} className="flex items-center gap-1.5 text-xs font-heading font-semibold text-accent-teal hover:underline">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          Unterschreiben
                        </button>
                      )}

                      {/* Extend booking */}
                      {canExtend(booking) && (
                        <button onClick={() => setExtendTarget(booking)} className="flex items-center gap-1.5 text-xs font-heading font-semibold text-accent-blue hover:underline">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Verlängern
                        </button>
                      )}

                      {/* Rebook — für abgeschlossene und stornierte Buchungen */}
                      {(booking.status === 'completed' || booking.status === 'cancelled') && booking.product_id && (() => {
                        const prod = allProducts.find((p) => p.id === booking.product_id);
                        const slug = prod?.slug ?? booking.product_id;
                        return (
                          <Link href={`/kameras/${slug}/buchen`} className="flex items-center gap-1.5 text-xs font-heading font-semibold text-accent-blue hover:underline">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Erneut buchen
                          </Link>
                        );
                      })()}

                      {/* Damage report */}
                      {(booking.status === 'shipped' || booking.status === 'completed') && (
                        <Link href="/konto/reklamation" className="flex items-center gap-1.5 text-xs font-heading font-semibold text-orange-600 hover:underline">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                          Schaden melden
                        </Link>
                      )}

                      {/* Cancel */}
                      {cancelInfo.eligibility === 'allowed' && (
                        <button onClick={() => { setCancelError(null); setCancelTarget(booking); }} className="flex items-center gap-1.5 text-xs font-heading font-semibold text-red-600 hover:underline">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          Stornieren
                        </button>
                      )}

                      {/* Email cancel */}
                      {cancelInfo.eligibility === 'email_only' && (
                        <a href={`mailto:${KONTAKT_EMAIL}?subject=Stornierung%20${booking.id}`} className="flex items-center gap-1.5 text-xs font-heading font-semibold text-orange-600 hover:underline">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          Per E-Mail stornieren (50 % Gebühr)
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

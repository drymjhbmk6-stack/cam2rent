'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SignatureStep, { type SignatureResult } from '@/components/booking/SignatureStep';

interface BookingData {
  id: string;
  customer_name: string;
  customer_email: string;
  product_name: string;
  accessories: string[];
  rental_from: string;
  rental_to: string;
  days: number;
  price_total: number;
  deposit: number;
  contract_signed: boolean;
}

export default function VertragUnterschreibenPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/booking/${bookingId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.booking) {
          setBooking(data.booking);
        }
      })
      .catch(() => setError('Buchung nicht gefunden.'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  async function handleSigned(result: SignatureResult) {
    if (!result.agreedToTerms) return;
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/admin/sign-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          signatureDataUrl: result.signatureDataUrl,
          signatureMethod: result.signatureMethod,
          signerName: result.signerName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler');

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
        Buchung wird geladen...
      </div>
    );
  }

  if (!booking) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#ef4444' }}>
        {error || 'Buchung nicht gefunden.'}
      </div>
    );
  }

  if (booking.contract_signed || success) {
    return (
      <div style={{ padding: '40px 16px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#10b98120',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
        }}>
          <svg width="32" height="32" fill="none" stroke="#10b981" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', marginBottom: 8 }}>
          Vertrag unterschrieben!
        </h1>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
          Der Mietvertrag für Buchung {bookingId} wurde erfolgreich signiert.
          {booking.customer_email && ' Eine Kopie wird per E-Mail versendet.'}
        </p>
        <button
          onClick={() => router.push(`/admin/buchungen/${bookingId}`)}
          style={{
            padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: '#06b6d4', color: 'white', border: 'none', cursor: 'pointer',
          }}
        >
          Zurück zur Buchung
        </button>
      </div>
    );
  }

  const fmtD = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('T')[0].split('-');
    return `${d}.${m}.${y}`;
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto' }}>
      <button
        onClick={() => router.back()}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: '#06b6d4', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 600, marginBottom: 20, padding: 0,
        }}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Zurück
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', marginBottom: 4 }}>
        Vertrag unterschreiben
      </h1>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
        Buchung {bookingId} — {booking.product_name}
      </p>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
          background: '#ef444420', border: '1px solid #ef444440', color: '#ef4444', fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {saving ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid #06b6d4', borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          Vertrag wird gespeichert...
          <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <SignatureStep
          customerName={booking.customer_name}
          customerEmail={booking.customer_email || ''}
          productName={booking.product_name}
          accessories={Array.isArray(booking.accessories) ? booking.accessories : []}
          rentalFrom={fmtD(booking.rental_from)}
          rentalTo={fmtD(booking.rental_to)}
          rentalDays={booking.days}
          priceTotal={booking.price_total}
          deposit={booking.deposit || 0}
          onSigned={handleSigned}
          onBack={() => router.back()}
        />
      )}
    </div>
  );
}

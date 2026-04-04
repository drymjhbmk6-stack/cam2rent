'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Booking {
  id: string;
  product_name: string;
  rental_from: string;
  rental_to: string;
  days: number;
  price_total: number;
  deposit: number;
  status: string;
  delivery_mode: string;
  shipping_method: string | null;
  customer_name: string | null;
  customer_email: string | null;
  tracking_number: string | null;
  created_at: string;
  deposit_intent_id: string | null;
  deposit_status: string;
  suspicious: boolean;
  suspicious_reasons: string[];
  customer_blacklisted: boolean;
  original_rental_to: string | null;
  extended_at: string | null;
  contract_signed: boolean | null;
  contract_signed_at: string | null;
}

type StatusFilter = 'all' | 'confirmed' | 'shipped' | 'completed' | 'cancelled' | 'damaged';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Bestätigt', className: 'bg-amber-100 text-amber-700' },
  shipped: { label: 'Versendet', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Abgeschlossen', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Storniert', className: 'bg-red-100 text-red-700' },
  damaged: { label: 'Beschädigt', className: 'bg-orange-100 text-orange-700' },
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtEuro(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

export default function AdminBuchungenPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    booking: Booking | null;
    newStatus: string;
    label: string;
  }>({ open: false, booking: null, newStatus: '', label: '' });

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/alle-buchungen?limit=200');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBookings(data.bookings ?? []);
    } catch {
      setError('Buchungen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  function openConfirm(booking: Booking, newStatus: string, label: string) {
    setConfirmModal({ open: true, booking, newStatus, label });
  }

  function closeConfirm() {
    setConfirmModal({ open: false, booking: null, newStatus: '', label: '' });
  }

  async function handleStatusChange() {
    if (!confirmModal.booking) return;
    const { booking, newStatus } = confirmModal;
    closeConfirm();
    setUpdatingId(booking.id);
    try {
      const res = await fetch('/api/admin/update-booking-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, status: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error ?? 'Fehler beim Aktualisieren.');
        return;
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, status: newStatus } : b))
      );
    } catch {
      alert('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleReleaseDeposit(bookingId: string) {
    if (!confirm('Kaution wirklich freigeben? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
    try {
      const res = await fetch('/api/admin/deposit/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error ?? 'Fehler beim Freigeben der Kaution.');
        return;
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, deposit_status: 'released' } : b))
      );
    } catch {
      alert('Netzwerkfehler. Bitte erneut versuchen.');
    }
  }

  const counts = {
    all: bookings.length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    shipped: bookings.filter((b) => b.status === 'shipped').length,
    completed: bookings.filter((b) => b.status === 'completed').length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
    damaged: bookings.filter((b) => b.status === 'damaged').length,
  };

  const filtered =
    filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  const TABS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: `Alle (${counts.all})` },
    { value: 'confirmed', label: `Bestätigt (${counts.confirmed})` },
    { value: 'shipped', label: `Versendet (${counts.shipped})` },
    { value: 'completed', label: `Abgeschlossen (${counts.completed})` },
    { value: 'damaged', label: `Beschädigt (${counts.damaged})` },
    { value: 'cancelled', label: `Storniert (${counts.cancelled})` },
  ];

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-heading font-bold text-2xl text-brand-black">Buchungsübersicht</h1>
          <p className="text-sm font-body text-brand-muted mt-1">
            Alle Buchungen verwalten und Status aktualisieren
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 text-sm font-heading font-semibold rounded-btn transition-colors ${
                filter === tab.value
                  ? 'bg-brand-black text-white'
                  : 'bg-white text-brand-steel border border-brand-border hover:bg-brand-bg'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-brand-muted font-body">Lädt…</div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-body">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-brand-border p-12 text-center">
            <p className="text-brand-muted font-body">Keine Buchungen in dieser Kategorie.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-brand-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-bg">
                    <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Buchung</th>
                    <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Kamera</th>
                    <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Zeitraum</th>
                    <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Kunde</th>
                    <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Betrag</th>
                    <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Lieferung</th>
                    <th className="text-left px-5 py-3 text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((booking) => (
                    <tr
                      key={booking.id}
                      className={`border-b border-brand-border last:border-0 transition-colors ${
                        updatingId === booking.id ? 'opacity-50' : 'hover:bg-brand-bg/50'
                      }`}
                    >
                      <td className="px-5 py-4">
                        <p className="font-heading font-semibold text-sm text-brand-black">{booking.id}</p>
                        <p className="text-xs font-body text-brand-muted mt-0.5">
                          {fmtDateTime(booking.created_at)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-body text-sm text-brand-black">{booking.product_name}</p>
                        <p className="text-xs font-body text-brand-muted">{booking.days} Tag{booking.days !== 1 ? 'e' : ''}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-body text-sm text-brand-black whitespace-nowrap">
                          {fmtDate(booking.rental_from)} – {fmtDate(booking.rental_to)}
                        </p>
                        {booking.extended_at && (
                          <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#3b82f6' }}>
                            VERLÄNGERT{booking.original_rental_to ? ` (orig. bis ${fmtDate(booking.original_rental_to)})` : ''}
                          </p>
                        )}
                        {booking.contract_signed && (
                          <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#10b981' }}>
                            VERTRAG UNTERSCHRIEBEN
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <p className="font-body text-sm text-brand-black">{booking.customer_name || '–'}</p>
                          {booking.customer_blacklisted && (
                            <span title="Gesperrter Kunde" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600">
                              GESPERRT
                            </span>
                          )}
                          {booking.suspicious && (
                            <span
                              title={booking.suspicious_reasons?.join(', ') || 'Verdächtig'}
                              className="cursor-help"
                            >
                              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            </span>
                          )}
                        </div>
                        {booking.customer_email && (
                          <a
                            href={`mailto:${booking.customer_email}`}
                            className="text-xs font-body text-accent-blue hover:underline"
                          >
                            {booking.customer_email}
                          </a>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-heading font-semibold text-sm text-brand-black whitespace-nowrap">
                          {fmtEuro(booking.price_total)}
                        </p>
                        {booking.deposit > 0 && (
                          <p className="text-xs font-body text-brand-muted">
                            +{fmtEuro(booking.deposit)} Kaution
                            {booking.deposit_status === 'held' && (
                              <span className="ml-1 text-amber-600" title="Kaution gehalten">⏳</span>
                            )}
                            {booking.deposit_status === 'released' && (
                              <span className="ml-1 text-green-600" title="Kaution freigegeben">✓</span>
                            )}
                            {booking.deposit_status === 'captured' && (
                              <span className="ml-1 text-red-600" title="Kaution eingezogen">✗</span>
                            )}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-body text-sm text-brand-black">
                          {booking.delivery_mode === 'versand' ? 'Versand' : 'Abholung'}
                        </p>
                        {booking.shipping_method && (
                          <p className="text-xs font-body text-brand-muted">
                            {booking.shipping_method === 'express' ? 'Express' : 'Standard'}
                          </p>
                        )}
                        {booking.tracking_number && (
                          <p className="text-xs font-body text-brand-muted mt-0.5">
                            #{booking.tracking_number}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={booking.status} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <ActionButtons
                          booking={booking}
                          onAction={openConfirm}
                          disabled={updatingId === booking.id}
                          onReleaseDeposit={handleReleaseDeposit}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bestätigungs-Modal */}
      {confirmModal.open && confirmModal.booking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h2 className="font-heading font-bold text-lg text-brand-black mb-2">
              Status ändern
            </h2>
            <p className="text-sm font-body text-brand-steel mb-1">
              <span className="font-semibold">{confirmModal.booking.id}</span> —{' '}
              {confirmModal.booking.product_name}
            </p>
            <p className="text-sm font-body text-brand-muted mb-6">
              Neuer Status:{' '}
              <span className="font-semibold text-brand-black">{confirmModal.label}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={closeConfirm}
                className="flex-1 py-2.5 text-sm font-heading font-semibold text-brand-steel border border-brand-border rounded-btn hover:bg-brand-bg transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleStatusChange}
                className="flex-1 py-2.5 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors"
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-heading font-semibold ${s.className}`}>
      {s.label}
    </span>
  );
}

function ActionButtons({
  booking,
  onReleaseDeposit,
}: {
  booking: Booking;
  onAction: (b: Booking, status: string, label: string) => void;
  disabled: boolean;
  onReleaseDeposit?: (bookingId: string) => void;
}) {
  const buttons: React.ReactNode[] = [];

  if (booking.status === 'confirmed' && booking.delivery_mode === 'abholung') {
    buttons.push(
      <Link
        key="retoure"
        href="/admin/retouren"
        className="px-3 py-1.5 bg-green-600 text-white text-xs font-heading font-semibold rounded-btn hover:bg-green-700 transition-colors whitespace-nowrap"
      >
        Rückgabe prüfen
      </Link>
    );
  }

  if (booking.status === 'shipped') {
    buttons.push(
      <Link
        key="retoure"
        href="/admin/retouren"
        className="px-3 py-1.5 bg-green-600 text-white text-xs font-heading font-semibold rounded-btn hover:bg-green-700 transition-colors whitespace-nowrap"
      >
        Rückgabe prüfen
      </Link>
    );
  }

  if (booking.status === 'damaged') {
    buttons.push(
      <Link
        key="schaden"
        href="/admin/schaeden"
        className="px-3 py-1.5 bg-orange-500 text-white text-xs font-heading font-semibold rounded-btn hover:bg-orange-600 transition-colors whitespace-nowrap"
      >
        Schaden ansehen
      </Link>
    );
  }

  if (booking.status === 'confirmed' && booking.delivery_mode === 'versand') {
    buttons.push(
      <Link
        key="versand"
        href="/admin/versand"
        className="px-3 py-1.5 bg-brand-black text-white text-xs font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors whitespace-nowrap"
      >
        → Versand
      </Link>
    );
  }

  // Kaution freigeben bei completed Buchungen mit aktivem Hold
  if (booking.status === 'completed' && booking.deposit_status === 'held' && booking.deposit_intent_id && onReleaseDeposit) {
    buttons.push(
      <button
        key="deposit"
        onClick={() => onReleaseDeposit(booking.id)}
        className="px-3 py-1.5 bg-cyan-600 text-white text-xs font-heading font-semibold rounded-btn hover:bg-cyan-700 transition-colors whitespace-nowrap"
      >
        Kaution freigeben
      </button>
    );
  }

  return buttons.length > 0 ? <div className="flex gap-2">{buttons}</div> : null;
}

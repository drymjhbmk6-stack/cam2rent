'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDate, fmtDateTime, fmtEuro } from '@/lib/format-utils';

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
  user_id: string | null;
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
type DateFilter = 'all' | 'today' | 'week' | 'month';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending_verification: { label: 'Warte auf Freigabe', color: '#f59e0b', bg: '#f59e0b14' },
  awaiting_payment: { label: 'Warte auf Zahlung', color: '#8b5cf6', bg: '#8b5cf614' },
  confirmed: { label: 'Bestätigt', color: '#06b6d4', bg: '#06b6d414' },
  shipped: { label: 'Versendet', color: '#10b981', bg: '#10b98114' },
  picked_up: { label: 'Abgeholt', color: '#10b981', bg: '#10b98114' },
  returned: { label: 'Retourniert', color: '#8b5cf6', bg: '#8b5cf614' },
  completed: { label: 'Abgeschlossen', color: '#64748b', bg: '#64748b14' },
  cancelled: { label: 'Storniert', color: '#ef4444', bg: '#ef444414' },
  damaged: { label: 'Beschädigt', color: '#f97316', bg: '#f9731614' },
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function AdminBuchungenPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [search, setSearch] = useState('');
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
      const res = await fetch('/api/admin/alle-buchungen?limit=500');
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

  // Filtered bookings
  const filtered = useMemo(() => {
    let result = bookings;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((b) => b.status === statusFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let cutoff: Date;
      switch (dateFilter) {
        case 'today': cutoff = startOfDay(now); break;
        case 'week': cutoff = startOfWeek(now); break;
        case 'month': cutoff = startOfMonth(now); break;
        default: cutoff = new Date(0);
      }
      result = result.filter((b) => new Date(b.created_at) >= cutoff);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (b) =>
          b.id.toLowerCase().includes(q) ||
          (b.customer_name?.toLowerCase().includes(q) ?? false) ||
          (b.customer_email?.toLowerCase().includes(q) ?? false) ||
          (b.product_name?.toLowerCase().includes(q) ?? false)
      );
    }

    return result;
  }, [bookings, statusFilter, dateFilter, search]);

  const counts = {
    all: bookings.length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    shipped: bookings.filter((b) => b.status === 'shipped').length,
    completed: bookings.filter((b) => b.status === 'completed').length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
    damaged: bookings.filter((b) => b.status === 'damaged').length,
  };

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: `Alle (${counts.all})` },
    { value: 'confirmed', label: `Bestätigt (${counts.confirmed})` },
    { value: 'shipped', label: `Versendet (${counts.shipped})` },
    { value: 'completed', label: `Abgeschlossen (${counts.completed})` },
    { value: 'damaged', label: `Beschädigt (${counts.damaged})` },
    { value: 'cancelled', label: `Storniert (${counts.cancelled})` },
  ];

  const DATE_TABS: { value: DateFilter; label: string }[] = [
    { value: 'all', label: 'Alle' },
    { value: 'today', label: 'Heute' },
    { value: 'week', label: 'Diese Woche' },
    { value: 'month', label: 'Dieser Monat' },
  ];

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AdminBackLink label="Zurück" />
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-heading font-bold text-xl sm:text-2xl text-brand-black">Buchungen</h1>
            <p className="text-xs sm:text-sm font-body text-brand-muted mt-1">
              Alle Buchungen verwalten und Status aktualisieren
            </p>
          </div>
          <Link
            href="/admin/buchungen/neu"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-heading font-semibold transition-colors flex-shrink-0"
            style={{ background: '#06b6d4', color: 'white' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Neue Buchung
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-brand-border p-3 sm:p-4 mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          {/* Status tabs */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {STATUS_TABS.map((tab) => {
              const sc = STATUS_CONFIG[tab.value];
              const isActive = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-heading font-semibold rounded-btn transition-colors"
                  style={
                    isActive
                      ? sc
                        ? { backgroundColor: sc.bg, color: sc.color, border: `1px solid ${sc.color}40` }
                        : { backgroundColor: '#0f172a', color: '#fff' }
                      : { backgroundColor: 'transparent', color: '#64748b', border: '1px solid #e2e8f0' }
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Date filter + Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2">
              {DATE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setDateFilter(tab.value)}
                  className={`px-3 py-1.5 text-xs font-heading font-semibold rounded-btn transition-colors ${
                    dateFilter === tab.value
                      ? 'bg-brand-black text-white'
                      : 'bg-brand-bg text-brand-muted hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex-1 sm:max-w-xs">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Buchungsnr., Kunde, Produkt..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm font-body border border-brand-border rounded-btn bg-white text-brand-black placeholder-brand-muted focus:outline-none focus:ring-2 focus:ring-accent-blue"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-brand-muted font-body">Lädt...</div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-body">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-brand-border p-12 text-center">
            <p className="text-brand-muted font-body">
              {search ? 'Keine Buchungen gefunden.' : 'Keine Buchungen in dieser Kategorie.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-brand-border overflow-hidden">
            <div className="px-3 sm:px-5 py-3 border-b border-brand-border bg-brand-bg">
              <p className="text-xs font-heading font-semibold text-brand-muted">
                {filtered.length} Buchung{filtered.length !== 1 ? 'en' : ''}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-bg">
                    <th className="text-left px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Nr.</th>
                    <th className="text-left px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Kunde</th>
                    <th className="text-left px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider hidden md:table-cell">Produkt</th>
                    <th className="text-left px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider hidden lg:table-cell">Zeitraum</th>
                    <th className="text-left px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Status</th>
                    <th className="text-left px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Betrag</th>
                    <th className="text-left px-3 sm:px-5 py-3 text-[10px] sm:text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider hidden lg:table-cell">Erstellt</th>
                    <th className="px-3 sm:px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((booking) => (
                    <tr
                      key={booking.id}
                      onClick={() => router.push(`/admin/buchungen/${booking.id}`)}
                      className={`border-b border-brand-border last:border-0 transition-colors cursor-pointer ${
                        updatingId === booking.id ? 'opacity-50' : 'hover:bg-brand-bg/50'
                      }`}
                    >
                      <td className="px-3 sm:px-5 py-3 sm:py-4">
                        <p className="font-heading font-semibold text-xs sm:text-sm text-accent-blue">{booking.id}</p>
                      </td>
                      <td className="px-3 sm:px-5 py-3 sm:py-4">
                        <div className="flex items-center gap-1.5">
                          <p className="font-body text-xs sm:text-sm text-brand-black">{booking.customer_name || '–'}</p>
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
                          <p className="text-xs font-body text-brand-muted mt-0.5 truncate max-w-[180px]">
                            {booking.customer_email}
                          </p>
                        )}
                      </td>
                      <td className="px-3 sm:px-5 py-3 sm:py-4 hidden md:table-cell">
                        <p className="font-body text-sm text-brand-black truncate max-w-[200px]">{booking.product_name}</p>
                        <p className="text-xs font-body text-brand-muted">{booking.days} Tag{booking.days !== 1 ? 'e' : ''}</p>
                      </td>
                      <td className="px-3 sm:px-5 py-3 sm:py-4 hidden lg:table-cell">
                        <p className="font-body text-sm text-brand-black whitespace-nowrap">
                          {fmtDate(booking.rental_from)} – {fmtDate(booking.rental_to)}
                        </p>
                        {booking.extended_at && (
                          <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#3b82f6' }}>
                            VERLÄNGERT
                          </p>
                        )}
                      </td>
                      <td className="px-3 sm:px-5 py-3 sm:py-4">
                        <StatusBadge status={booking.status} />
                      </td>
                      <td className="px-3 sm:px-5 py-3 sm:py-4">
                        <p className="font-heading font-semibold text-xs sm:text-sm text-brand-black whitespace-nowrap">
                          {fmtEuro(booking.price_total)}
                        </p>
                      </td>
                      <td className="px-3 sm:px-5 py-3 sm:py-4 hidden lg:table-cell">
                        <p className="font-body text-sm text-brand-muted whitespace-nowrap">
                          {fmtDateTime(booking.created_at)}
                        </p>
                      </td>
                      <td className="px-3 sm:px-5 py-3 sm:py-4 text-right" onClick={(e) => e.stopPropagation()}>
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
  const sc = STATUS_CONFIG[status] ?? { label: status, color: '#94a3b8', bg: '#94a3b814' };
  return (
    <span
      className="inline-flex px-2.5 py-1 rounded-full text-xs font-heading font-semibold"
      style={{ color: sc.color, backgroundColor: sc.bg, border: `1px solid ${sc.color}30` }}
    >
      {sc.label}
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
        Rückgabe
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
        Rückgabe
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
        Schaden
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
        Versand
      </Link>
    );
  }

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

  return buttons.length > 0 ? <div className="flex gap-2 flex-wrap">{buttons}</div> : null;
}

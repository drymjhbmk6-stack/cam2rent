'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDate } from '@/lib/format-utils';

interface ReturnBooking {
  id: string;
  product_name: string;
  product_id: string;
  customer_name: string | null;
  customer_email: string | null;
  rental_from: string;
  rental_to: string;
  days: number;
  status: string;
  delivery_mode: string;
  deposit: number;
  return_condition: string | null;
  returned_at: string | null;
  return_notes: string | null;
  tracking_return: string | null;
}

const CONDITION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  gut: { label: 'Gut', color: '#10b981', bg: '#10b98122' },
  gebrauchsspuren: { label: 'Gebrauchsspuren', color: '#f59e0b', bg: '#f59e0b22' },
  beschaedigt: { label: 'Beschädigt', color: '#ef4444', bg: '#ef444422' },
};

function isOverdue(rentalTo: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(rentalTo) < today;
}

function daysUntilReturn(rentalTo: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(rentalTo);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function AdminRetourenPage() {
  const [bookings, setBookings] = useState<ReturnBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'completed'>('pending');

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/alle-buchungen?limit=500');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBookings(data.bookings || []);
    } catch {
      console.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }

  const pendingReturns = bookings
    .filter((b) => b.status === 'shipped' || (b.status === 'confirmed' && b.delivery_mode === 'abholung'))
    .sort((a, b) => new Date(a.rental_to).getTime() - new Date(b.rental_to).getTime());

  const completedReturns = bookings
    .filter((b) => b.status === 'completed' || b.status === 'damaged')
    .sort((a, b) => new Date(b.returned_at || b.rental_to).getTime() - new Date(a.returned_at || a.rental_to).getTime());

  const displayed = tab === 'pending' ? pendingReturns : completedReturns;

  return (
    <div className="min-h-screen" style={{ padding: '20px 16px' }}>
      <AdminBackLink label="Zurück" />
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading font-bold text-2xl" style={{ color: '#e2e8f0' }}>
          Retouren & Rückgaben
        </h1>
        <p className="text-sm font-body mt-1" style={{ color: '#64748b' }}>
          Ausstehende und abgeschlossene Rückgaben verwalten
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {[
          { label: 'Ausstehend', value: pendingReturns.length, color: '#06b6d4' },
          { label: 'Überfällig', value: pendingReturns.filter((b) => isOverdue(b.rental_to)).length, color: '#ef4444' },
          { label: 'Heute fällig', value: pendingReturns.filter((b) => daysUntilReturn(b.rental_to) === 0).length, color: '#f59e0b' },
          { label: 'Abgeschlossen', value: completedReturns.length, color: '#10b981' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{stat.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ background: '#111827', borderRadius: 12, padding: 4, display: 'inline-flex' }}>
        {[
          { value: 'pending' as const, label: `Ausstehend (${pendingReturns.length})` },
          { value: 'completed' as const, label: `Abgeschlossen (${completedReturns.length})` },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            style={{
              padding: '10px 16px', borderRadius: 10, fontSize: 13,
              fontWeight: tab === t.value ? 600 : 400,
              background: tab === t.value ? '#1e293b' : 'transparent',
              color: tab === t.value ? '#22d3ee' : '#64748b',
              border: 'none', cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16" style={{ color: '#64748b' }}>Lädt...</div>
      ) : displayed.length === 0 ? (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            {tab === 'pending' ? 'Keine ausstehenden Rückgaben.' : 'Keine abgeschlossenen Rückgaben.'}
          </p>
        </div>
      ) : (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  {['Buchung', 'Kamera', 'Kunde', 'Rückgabe bis', tab === 'completed' ? 'Zustand' : 'Status', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((booking, idx) => {
                  const overdue = isOverdue(booking.rental_to);
                  const daysLeft = daysUntilReturn(booking.rental_to);
                  const cond = booking.return_condition ? CONDITION_CONFIG[booking.return_condition] : null;

                  return (
                    <tr
                      key={booking.id}
                      style={{ borderBottom: idx < displayed.length - 1 ? '1px solid #1e293b' : 'none' }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace' }}>{booking.id}</p>
                        <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{booking.days} Tage</p>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, color: '#e2e8f0' }}>{booking.product_name}</p>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, color: '#e2e8f0' }}>{booking.customer_name || '–'}</p>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: overdue && tab === 'pending' ? '#ef4444' : '#e2e8f0' }}>
                          {fmtDate(booking.rental_to)}
                        </p>
                        {tab === 'pending' && (
                          <p style={{ fontSize: 11, color: overdue ? '#ef4444' : daysLeft <= 1 ? '#f59e0b' : '#64748b', marginTop: 2 }}>
                            {overdue ? `${Math.abs(daysLeft)} Tag${Math.abs(daysLeft) !== 1 ? 'e' : ''} überfällig` : daysLeft === 0 ? 'Heute fällig' : `in ${daysLeft} Tag${daysLeft !== 1 ? 'en' : ''}`}
                          </p>
                        )}
                        {tab === 'completed' && booking.returned_at && (
                          <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Zurück am {fmtDate(booking.returned_at)}
                          </p>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {tab === 'completed' && cond ? (
                          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: cond.bg, color: cond.color }}>
                            {cond.label}
                          </span>
                        ) : tab === 'pending' ? (
                          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: overdue ? '#ef444422' : '#06b6d422', color: overdue ? '#ef4444' : '#06b6d4' }}>
                            {overdue ? 'Überfällig' : 'Ausstehend'}
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: '#64748b' }}>–</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {tab === 'pending' && (
                          <Link
                            href={`/admin/retouren/${booking.id}/pruefen`}
                            style={{ display: 'inline-block', padding: '8px 16px', background: '#10b981', color: 'white', textDecoration: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                          >
                            Rückgabe prüfen
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

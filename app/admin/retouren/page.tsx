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
  /** Override pro Buchung (NULL = aus rental_to + buffer berechnen). */
  return_due_date_override?: string | null;
  ship_date_override?: string | null;
}

const CONDITION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  gut: { label: 'Gut', color: '#10b981', bg: '#10b98122' },
  gebrauchsspuren: { label: 'Gebrauchsspuren', color: '#f59e0b', bg: '#f59e0b22' },
  beschaedigt: { label: 'Beschädigt', color: '#ef4444', bg: '#ef444422' },
};

// Default-Puffertage (überschrieben durch admin_settings.booking_buffer_days):
// Versand braucht 3 Tage Retoure-Spielraum, Abholung 1 Tag.
const DEFAULT_BUFFER = { versand_after: 3, abholung_after: 1 };

interface BufferAfter { versand_after: number; abholung_after: number }

/**
 * Liefert das tatsächliche Rückgabe-Soll-Datum.
 * Override hat Vorrang. Sonst: rental_to + buffer (Versand 3 / Abholung 1).
 */
function returnDueDate(
  rentalTo: string,
  deliveryMode: string,
  buf: BufferAfter,
  override?: string | null,
): Date {
  if (override) {
    const m = override.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }
  const d = new Date(rentalTo);
  d.setHours(0, 0, 0, 0);
  const add = deliveryMode === 'versand' ? buf.versand_after : buf.abholung_after;
  d.setDate(d.getDate() + add);
  return d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function isOverdue(dueDate: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function daysUntilReturn(dueDate: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AdminRetourenPage() {
  const [bookings, setBookings] = useState<ReturnBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'completed'>('pending');
  // Puffertage aus admin_settings — bestimmt das tatsächliche Rückgabe-
  // Soll-Datum (rental_to + versand_after/abholung_after).
  const [buf, setBuf] = useState<BufferAfter>(DEFAULT_BUFFER);

  useEffect(() => {
    fetchBookings();
    loadBuffer();
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

  async function loadBuffer() {
    try {
      const res = await fetch('/api/admin/settings?key=booking_buffer_days');
      if (!res.ok) return;
      const { value } = await res.json();
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (parsed && typeof parsed === 'object') {
        setBuf({
          versand_after: Number(parsed.versand_after ?? DEFAULT_BUFFER.versand_after),
          abholung_after: Number(parsed.abholung_after ?? DEFAULT_BUFFER.abholung_after),
        });
      }
    } catch {
      // Setting nicht ladbar → Defaults bleiben
    }
  }

  const pendingReturns = bookings
    .filter((b) => b.status === 'shipped' || b.status === 'delivered' || b.status === 'picked_up')
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
          { label: 'Überfällig', value: pendingReturns.filter((b) => isOverdue(returnDueDate(b.rental_to, b.delivery_mode, buf, b.return_due_date_override))).length, color: '#ef4444' },
          { label: 'Heute fällig', value: pendingReturns.filter((b) => daysUntilReturn(returnDueDate(b.rental_to, b.delivery_mode, buf, b.return_due_date_override)) === 0).length, color: '#f59e0b' },
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
                  const dueDate = returnDueDate(booking.rental_to, booking.delivery_mode, buf, booking.return_due_date_override);
                  const overdue = isOverdue(dueDate);
                  const daysLeft = daysUntilReturn(dueDate);
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
                        <ReturnDueCell
                          booking={booking}
                          dueDate={dueDate}
                          overdue={overdue}
                          daysLeft={daysLeft}
                          tab={tab}
                          buf={buf}
                          onSaved={fetchBookings}
                        />
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

// ─── Inline-Edit für das Rückgabe-Soll-Datum pro Buchung ─────────────────────

function ReturnDueCell({
  booking, dueDate, overdue, daysLeft, tab, buf, onSaved,
}: {
  booking: ReturnBooking;
  dueDate: Date;
  overdue: boolean;
  daysLeft: number;
  tab: 'pending' | 'completed';
  buf: BufferAfter;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(booking.return_due_date_override?.slice(0, 10) ?? isoDate(dueDate));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isOverridden = !!booking.return_due_date_override;

  // Default-Vorschlag wenn kein Override
  const defaultDateISO = isoDate(returnDueDate(booking.rental_to, booking.delivery_mode, buf, null));

  async function save() {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/admin/booking/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_due_date_override: value || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error ?? 'Speichern fehlgeschlagen.');
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setErr('Netzwerkfehler.');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/admin/booking/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_due_date_override: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error ?? 'Zurücksetzen fehlgeschlagen.');
        return;
      }
      setValue(defaultDateISO);
      setEditing(false);
      onSaved();
    } catch {
      setErr('Netzwerkfehler.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          style={{
            padding: '6px 8px', borderRadius: 6, border: '1px solid #334155',
            background: '#0f172a', color: '#e2e8f0', fontSize: 13, width: 150,
          }}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{ padding: '4px 10px', borderRadius: 6, background: '#06b6d4', color: 'white', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
          >
            {saving ? '…' : 'Speichern'}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setErr(''); setValue(booking.return_due_date_override?.slice(0, 10) ?? defaultDateISO); }}
            disabled={saving}
            style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', color: '#64748b', border: '1px solid #334155', fontSize: 11, cursor: 'pointer' }}
          >
            Abbrechen
          </button>
          {isOverridden && (
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontSize: 11, cursor: 'pointer' }}
              title="Auf Standard-Puffer zurücksetzen"
            >
              ↺ Standard
            </button>
          )}
        </div>
        {err && <p style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>{err}</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: overdue && tab === 'pending' ? '#ef4444' : '#e2e8f0' }}>
          {fmtDate(dueDate.toISOString())}
        </p>
        {isOverridden && (
          <span title="Manuell überschrieben" style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            manuell
          </span>
        )}
        {tab === 'pending' && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Rückgabe-Datum ändern"
            style={{ marginLeft: 4, padding: '0 4px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}
          >
            ✏
          </button>
        )}
      </div>
      {tab === 'pending' && (
        <>
          <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Miete bis {fmtDate(booking.rental_to)} · {booking.delivery_mode === 'versand' ? 'Versand' : 'Abholung'}
          </p>
          {(() => {
            // Farb-Staffelung der Dringlichkeit:
            //   überfällig / heute fällig → rot
            //   in 1–3 Tagen → amber
            //   in 4–7 Tagen → cyan
            //   >7 Tage → grau (Termin noch weit weg)
            let color = '#64748b';
            if (overdue || daysLeft === 0) color = '#ef4444';
            else if (daysLeft <= 3) color = '#f59e0b';
            else if (daysLeft <= 7) color = '#22d3ee';
            const label = overdue
              ? `${Math.abs(daysLeft)} Tag${Math.abs(daysLeft) !== 1 ? 'e' : ''} überfällig`
              : daysLeft === 0
                ? 'Heute fällig'
                : `in ${daysLeft} Tag${daysLeft !== 1 ? 'en' : ''}`;
            return (
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 4,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: `${color}22`,
                  color,
                  border: `1px solid ${color}40`,
                }}
              >
                {label}
              </span>
            );
          })()}
        </>
      )}
      {tab === 'completed' && booking.returned_at && (
        <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          Zurück am {fmtDate(booking.returned_at)}
        </p>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface BookingDetail {
  id: string;
  product_id: string;
  product_name: string;
  user_id: string | null;
  rental_from: string;
  rental_to: string;
  days: number;
  delivery_mode: string;
  shipping_method: string | null;
  shipping_price: number | null;
  shipping_address: string | null;
  haftung: string | null;
  accessories: string[] | null;
  price_rental: number;
  price_accessories: number;
  price_haftung: number;
  price_total: number;
  deposit: number;
  deposit_status: string;
  deposit_intent_id: string | null;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  return_condition: string | null;
  return_notes: string | null;
  returned_at: string | null;
  created_at: string;
  original_rental_to: string | null;
  extended_at: string | null;
  contract_signed: boolean | null;
  contract_signed_at: string | null;
  suspicious: boolean;
  suspicious_reasons: string[];
}

interface CustomerProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  blacklisted: boolean;
  verification_status: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  confirmed: { label: 'Bestätigt', color: '#06b6d4', bg: '#06b6d414' },
  shipped: { label: 'Versendet', color: '#10b981', bg: '#10b98114' },
  completed: { label: 'Abgeschlossen', color: '#64748b', bg: '#64748b14' },
  cancelled: { label: 'Storniert', color: '#ef4444', bg: '#ef444414' },
  damaged: { label: 'Beschädigt', color: '#f97316', bg: '#f9731614' },
};

const ALL_STATUSES = ['confirmed', 'shipped', 'completed', 'cancelled', 'damaged'];

function fmtDate(iso: string) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}.${m}.${y}`;
}

function fmtDateTime(iso: string) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtEuro(n: number | null | undefined) {
  if (n == null) return '0,00 €';
  return n.toFixed(2).replace('.', ',') + ' €';
}

export default function BuchungDetailPage() {
  const params = useParams();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  useEffect(() => {
    fetchBooking();
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchBooking() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}`);
      if (!res.ok) throw new Error('Nicht gefunden');
      const data = await res.json();
      setBooking(data.booking);
      setCustomer(data.customer ?? null);
      setNewStatus(data.booking.status);
    } catch {
      setError('Buchung konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate() {
    if (!booking || newStatus === booking.status) return;
    if (!confirm(`Status wirklich auf "${STATUS_CONFIG[newStatus]?.label || newStatus}" ändern?`)) return;
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error ?? 'Fehler beim Aktualisieren.');
        return;
      }
      setBooking((prev) => prev ? { ...prev, status: newStatus } : prev);
    } catch {
      alert('Netzwerkfehler.');
    } finally {
      setStatusUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <p className="text-brand-muted font-body">Lädt...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-brand-bg">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Link href="/admin/buchungen" className="text-sm font-heading text-accent-blue hover:underline mb-4 inline-block">
            ← Zurück zur Übersicht
          </Link>
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-body">
            {error || 'Buchung nicht gefunden.'}
          </div>
        </div>
      </div>
    );
  }

  const sc = STATUS_CONFIG[booking.status] ?? { label: booking.status, color: '#94a3b8', bg: '#94a3b814' };

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <Link
              href="/admin/buchungen"
              className="text-sm font-heading text-accent-blue hover:underline mb-2 inline-flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Zurück zur Übersicht
            </Link>
            <div className="flex items-center gap-3 mt-1">
              <h1 className="font-heading font-bold text-2xl text-brand-black">{booking.id}</h1>
              <span
                className="inline-flex px-3 py-1 rounded-full text-xs font-heading font-semibold"
                style={{ color: sc.color, backgroundColor: sc.bg, border: `1px solid ${sc.color}30` }}
              >
                {sc.label}
              </span>
            </div>
            <p className="text-sm font-body text-brand-muted mt-1">
              Erstellt am {fmtDateTime(booking.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {customer && (
              <Link
                href={`/admin/kunden`}
                className="px-4 py-2 text-sm font-heading font-semibold border border-brand-border rounded-btn hover:bg-brand-bg transition-colors text-brand-steel"
              >
                Kundenprofil
              </Link>
            )}
            <Link
              href="/admin/schaeden"
              className="px-4 py-2 text-sm font-heading font-semibold bg-orange-500 text-white rounded-btn hover:bg-orange-600 transition-colors"
            >
              Schadensbericht
            </Link>
          </div>
        </div>

        {/* Suspicious warning */}
        {booking.suspicious && (
          <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-heading font-semibold text-amber-800">Verdächtige Buchung</p>
              {booking.suspicious_reasons?.length > 0 && (
                <p className="text-xs font-body text-amber-700 mt-0.5">
                  {booking.suspicious_reasons.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Buchungsdaten */}
            <Section title="Buchungsdaten">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Produkt" value={booking.product_name} />
                <InfoRow label="Mietdauer" value={`${booking.days} Tag${booking.days !== 1 ? 'e' : ''}`} />
                <InfoRow label="Von" value={fmtDate(booking.rental_from)} />
                <InfoRow label="Bis" value={fmtDate(booking.rental_to)} />
                {booking.extended_at && (
                  <InfoRow
                    label="Verlängert"
                    value={`Ursprünglich bis ${booking.original_rental_to ? fmtDate(booking.original_rental_to) : '–'}`}
                    highlight
                  />
                )}
                {booking.contract_signed && (
                  <InfoRow
                    label="Vertrag"
                    value={`Unterschrieben am ${booking.contract_signed_at ? fmtDateTime(booking.contract_signed_at) : '–'}`}
                  />
                )}
                <InfoRow label="Lieferart" value={booking.delivery_mode === 'versand' ? 'Versand' : 'Abholung'} />
                {booking.shipping_method && (
                  <InfoRow label="Versandart" value={booking.shipping_method === 'express' ? 'Express' : 'Standard'} />
                )}
              </div>

              {/* Preisaufstellung */}
              <div className="mt-5 pt-5 border-t border-brand-border">
                <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-3">Preisaufstellung</p>
                <div className="space-y-2">
                  <PriceRow label="Miete" amount={booking.price_rental} />
                  {booking.price_accessories > 0 && (
                    <PriceRow label="Zubehör" amount={booking.price_accessories} />
                  )}
                  {booking.price_haftung > 0 && (
                    <PriceRow label="Haftungsreduzierung" amount={booking.price_haftung} />
                  )}
                  {(booking.shipping_price ?? 0) > 0 && (
                    <PriceRow label="Versand" amount={booking.shipping_price!} />
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-brand-border">
                    <span className="font-heading font-bold text-sm text-brand-black">Gesamt</span>
                    <span className="font-heading font-bold text-sm text-brand-black">{fmtEuro(booking.price_total)}</span>
                  </div>
                </div>
              </div>

              {/* Kaution */}
              {booking.deposit > 0 && (
                <div className="mt-4 pt-4 border-t border-brand-border">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-body text-brand-steel">Kaution:</span>
                    <span className="font-heading font-semibold text-sm text-brand-black">{fmtEuro(booking.deposit)}</span>
                    <DepositBadge status={booking.deposit_status} />
                  </div>
                </div>
              )}

              {/* Zubehör */}
              {booking.accessories && booking.accessories.length > 0 && (
                <div className="mt-4 pt-4 border-t border-brand-border">
                  <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-2">Zubehör</p>
                  <div className="flex flex-wrap gap-2">
                    {booking.accessories.map((a, i) => (
                      <span key={i} className="px-2.5 py-1 bg-brand-bg rounded-full text-xs font-body text-brand-steel">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Haftung */}
              {booking.haftung && (
                <div className="mt-4 pt-4 border-t border-brand-border">
                  <InfoRow label="Haftungsoption" value={booking.haftung} />
                </div>
              )}
            </Section>

            {/* Versanddaten */}
            <Section title="Versanddaten">
              {booking.delivery_mode === 'versand' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoRow label="Trackingnummer" value={booking.tracking_number || '–'} />
                  {booking.tracking_url && (
                    <div>
                      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Tracking-Link</p>
                      <a
                        href={booking.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-body text-accent-blue hover:underline break-all"
                      >
                        Link öffnen
                      </a>
                    </div>
                  )}
                  <InfoRow label="Versandt am" value={booking.shipped_at ? fmtDateTime(booking.shipped_at) : '–'} />
                  {booking.shipping_address && (
                    <div className="sm:col-span-2">
                      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Lieferadresse</p>
                      <p className="text-sm font-body text-brand-black whitespace-pre-line">{booking.shipping_address}</p>
                    </div>
                  )}
                  <InfoRow label="Rückgabe" value={booking.returned_at ? fmtDateTime(booking.returned_at) : 'Noch nicht zurück'} />
                  {booking.return_condition && (
                    <InfoRow label="Zustand bei Rückgabe" value={booking.return_condition} />
                  )}
                  {booking.return_notes && (
                    <div className="sm:col-span-2">
                      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Rückgabe-Notizen</p>
                      <p className="text-sm font-body text-brand-black">{booking.return_notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm font-body text-brand-muted">Abholung — kein Versand.</p>
              )}
            </Section>

            {/* Statusverlauf */}
            <Section title="Statusverlauf">
              <div className="space-y-4">
                <TimelineItem
                  label="Buchung erstellt"
                  date={fmtDateTime(booking.created_at)}
                  status="confirmed"
                  active
                />
                {booking.shipped_at && (
                  <TimelineItem
                    label="Versendet"
                    date={fmtDateTime(booking.shipped_at)}
                    status="shipped"
                    active
                  />
                )}
                {booking.extended_at && (
                  <TimelineItem
                    label="Verlängert"
                    date={fmtDateTime(booking.extended_at)}
                    status="confirmed"
                    active
                  />
                )}
                {booking.returned_at && (
                  <TimelineItem
                    label="Zurückgegeben"
                    date={fmtDateTime(booking.returned_at)}
                    status="completed"
                    active
                  />
                )}
                {booking.status === 'completed' && !booking.returned_at && (
                  <TimelineItem
                    label="Abgeschlossen"
                    date=""
                    status="completed"
                    active
                  />
                )}
                {booking.status === 'cancelled' && (
                  <TimelineItem
                    label="Storniert"
                    date=""
                    status="cancelled"
                    active
                  />
                )}
                {booking.status === 'damaged' && (
                  <TimelineItem
                    label="Beschädigt gemeldet"
                    date=""
                    status="damaged"
                    active
                  />
                )}
              </div>
            </Section>
          </div>

          {/* Right column: 1/3 */}
          <div className="space-y-6">
            {/* Kundendaten */}
            <Section title="Kundendaten">
              <div className="space-y-3">
                <InfoRow label="Name" value={booking.customer_name || customer?.full_name || '–'} />
                {(booking.customer_email || customer?.email) && (
                  <div>
                    <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">E-Mail</p>
                    <a
                      href={`mailto:${booking.customer_email || customer?.email}`}
                      className="text-sm font-body text-accent-blue hover:underline"
                    >
                      {booking.customer_email || customer?.email}
                    </a>
                  </div>
                )}
                {customer?.phone && (
                  <InfoRow label="Telefon" value={customer.phone} />
                )}
                {customer?.address_street && (
                  <div>
                    <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Adresse</p>
                    <p className="text-sm font-body text-brand-black">
                      {customer.address_street}<br />
                      {customer.address_zip} {customer.address_city}
                    </p>
                  </div>
                )}
                {customer?.blacklisted && (
                  <div className="mt-2">
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-heading font-semibold bg-red-100 text-red-600">
                      GESPERRT
                    </span>
                  </div>
                )}
              </div>
            </Section>

            {/* Aktionen */}
            <Section title="Aktionen">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider block mb-2">
                    Status ändern
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="flex-1 text-sm font-body border border-brand-border rounded-btn px-3 py-2 bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-accent-blue"
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_CONFIG[s]?.label || s}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleStatusUpdate}
                      disabled={statusUpdating || newStatus === booking.status}
                      className="px-4 py-2 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {statusUpdating ? '...' : 'Speichern'}
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-brand-border space-y-2">
                  {booking.delivery_mode === 'versand' && booking.status === 'confirmed' && (
                    <Link
                      href="/admin/versand"
                      className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors"
                    >
                      Zum Versand
                    </Link>
                  )}
                  {(booking.status === 'shipped' || (booking.status === 'confirmed' && booking.delivery_mode === 'abholung')) && (
                    <Link
                      href="/admin/retouren"
                      className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-green-600 text-white rounded-btn hover:bg-green-700 transition-colors"
                    >
                      Rückgabe prüfen
                    </Link>
                  )}
                  <Link
                    href="/admin/schaeden"
                    className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-orange-500 text-white rounded-btn hover:bg-orange-600 transition-colors"
                  >
                    Schadensbericht erstellen
                  </Link>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-brand-border p-5">
      <h2 className="font-heading font-bold text-base text-brand-black mb-4">{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-body ${highlight ? 'text-blue-600 font-semibold' : 'text-brand-black'}`}>{value}</p>
    </div>
  );
}

function PriceRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm font-body text-brand-steel">{label}</span>
      <span className="text-sm font-body text-brand-black">{fmtEuro(amount)}</span>
    </div>
  );
}

function DepositBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    held: { label: 'Gehalten', color: '#f59e0b', bg: '#f59e0b14' },
    released: { label: 'Freigegeben', color: '#10b981', bg: '#10b98114' },
    captured: { label: 'Eingezogen', color: '#ef4444', bg: '#ef444414' },
  };
  const s = map[status] ?? { label: status || '–', color: '#94a3b8', bg: '#94a3b814' };
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-heading font-semibold"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

function TimelineItem({ label, date, status, active }: { label: string; date: string; status: string; active: boolean }) {
  const sc = STATUS_CONFIG[status] ?? { color: '#94a3b8' };
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div
          className="w-3 h-3 rounded-full mt-0.5"
          style={{ backgroundColor: active ? sc.color : '#e2e8f0' }}
        />
        <div className="w-0.5 h-full bg-gray-200 min-h-[16px]" />
      </div>
      <div className="pb-2">
        <p className="text-sm font-heading font-semibold text-brand-black">{label}</p>
        {date && <p className="text-xs font-body text-brand-muted">{date}</p>}
      </div>
    </div>
  );
}

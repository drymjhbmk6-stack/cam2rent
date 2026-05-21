'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtEuro } from '@/lib/format-utils';

interface Customer {
  id: string;
  full_name: string;
  email: string;
}

interface CustomerBooking {
  id: string;
  product_name: string;
  created_at: string;
  items: { name: string; qty: number }[];
}

interface SaleLine {
  name: string;
  qty: string;
  unit_price: string;
}

function parseNum(v: string): number {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function VerkaufNeu() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState('');

  const [lines, setLines] = useState<SaleLine[]>([{ name: '', qty: '1', unit_price: '' }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ bookingId: string; paymentUrl?: string; emailSent: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/admin/kunden')
      .then((r) => r.json())
      .then((d) => {
        const list: Customer[] = (d.customers ?? []).map((c: Customer) => ({
          id: c.id,
          full_name: c.full_name,
          email: c.email,
        }));
        list.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
        setCustomers(list);
      })
      .catch(() => setCustomers([]));
  }, []);

  function selectCustomer(id: string) {
    setCustomerId(id);
    setBookings([]);
    setSelectedBookingId('');
    const c = customers.find((x) => x.id === id);
    if (c) {
      setCustomerName(c.full_name);
      setCustomerEmail(c.email);
    }
    if (!id) return;
    setBookingsLoading(true);
    fetch(`/api/admin/verkauf?customer_id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => setBookings(d.bookings ?? []))
      .catch(() => setBookings([]))
      .finally(() => setBookingsLoading(false));
  }

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId);

  function addLine(name = '', qty = 1) {
    setLines((prev) => [...prev, { name, qty: String(qty), unit_price: '' }]);
  }
  function updateLine(idx: number, patch: Partial<SaleLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  const total = useMemo(
    () => lines.reduce((s, l) => s + parseNum(l.unit_price) * Math.max(1, parseNum(l.qty)), 0),
    [lines],
  );

  const validLines = lines.filter((l) => l.name.trim() && parseNum(l.unit_price) > 0);
  const canSubmit =
    !!customerEmail.trim() && validLines.length > 0 && total > 0 && !submitting;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/verkauf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerEmail,
          userId: customerId || null,
          sourceBookingId: selectedBookingId || null,
          items: validLines.map((l) => ({
            name: l.name.trim(),
            qty: Math.max(1, Math.floor(parseNum(l.qty))),
            unit_price: parseNum(l.unit_price),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Verkauf konnte nicht angelegt werden.');
      setDone({ bookingId: data.bookingId, paymentUrl: data.paymentUrl, emailSent: !!data.emailSent });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Erfolgsansicht ────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <AdminBackLink href="/admin/verkauf" />
        <div className="mt-4 rounded-xl bg-emerald-900/20 border border-emerald-800 p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Verkauf angelegt</h1>
          <p className="text-slate-300 mb-1">Verkauf-Nr. {done.bookingId}</p>
          <p className="text-sm text-slate-400 mb-6">
            {done.emailSent
              ? 'Die Rechnung mit Zahlungslink wurde an den Kunden geschickt.'
              : 'Hinweis: Der E-Mail-Versand ist fehlgeschlagen — Zahlungslink ggf. erneut senden.'}
          </p>
          {done.paymentUrl && (
            <p className="text-xs text-slate-500 break-all mb-6">
              Zahlungslink: <a href={done.paymentUrl} className="text-cyan-400 underline" target="_blank" rel="noopener noreferrer">{done.paymentUrl}</a>
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <Link href="/admin/verkauf" className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 border border-slate-700">
              Zur Verkaufsliste
            </Link>
            <button
              type="button"
              onClick={() => {
                setDone(null);
                setLines([{ name: '', qty: '1', unit_price: '' }]);
                setSelectedBookingId('');
              }}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-500"
            >
              Weiteren Verkauf anlegen
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inputCls =
    'w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-base text-white placeholder-slate-600 focus:outline-none focus:border-cyan-600';
  const cardCls = 'rounded-xl bg-slate-900/50 border border-slate-800 p-5';
  const labelCls = 'text-xs uppercase tracking-wider text-slate-500 mb-1.5 block';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <AdminBackLink href="/admin/verkauf" />

      <h1 className="text-2xl font-bold text-white mb-1 mt-4">Neuer Verkauf</h1>
      <p className="text-sm text-slate-400 mb-6">
        Zubehör (z.B. Speicherkarte) an einen Kunden verkaufen. Der Kunde erhält Rechnung
        und Stripe-Zahlungslink per E-Mail.
      </p>

      <div className="space-y-5">
        {/* 1. Kunde */}
        <div className={cardCls}>
          <h2 className="font-semibold text-white mb-3">1. Kunde</h2>
          <label className={labelCls}>Kunde aus der Datenbank</label>
          <select
            value={customerId}
            onChange={(e) => selectCustomer(e.target.value)}
            className={inputCls}
          >
            <option value="">— Kunde wählen —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || '(ohne Namen)'} — {c.email}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className={labelCls}>Name</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={inputCls}
                placeholder="Name des Kunden"
              />
            </div>
            <div>
              <label className={labelCls}>E-Mail</label>
              <input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className={inputCls}
                placeholder="kunde@example.de"
                inputMode="email"
              />
            </div>
          </div>
        </div>

        {/* 2. Artikel aus Bestellung */}
        <div className={cardCls}>
          <h2 className="font-semibold text-white mb-1">2. Artikel aus einer Bestellung</h2>
          <p className="text-xs text-slate-500 mb-3">
            Optional — wähle eine frühere Buchung des Kunden, um Artikel direkt zu übernehmen.
          </p>
          {!customerId && <p className="text-sm text-slate-500">Zuerst einen Kunden wählen.</p>}
          {customerId && bookingsLoading && <p className="text-sm text-slate-500">Lade Buchungen…</p>}
          {customerId && !bookingsLoading && bookings.length === 0 && (
            <p className="text-sm text-slate-500">Keine Buchungen für diesen Kunden gefunden.</p>
          )}
          {customerId && bookings.length > 0 && (
            <>
              <select
                value={selectedBookingId}
                onChange={(e) => setSelectedBookingId(e.target.value)}
                className={inputCls}
              >
                <option value="">— Buchung wählen —</option>
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} — {b.product_name}
                  </option>
                ))}
              </select>
              {selectedBooking && (
                <div className="mt-3 space-y-1.5">
                  {selectedBooking.items.length === 0 && (
                    <p className="text-sm text-slate-500">Diese Buchung hat keine übernehmbaren Artikel.</p>
                  )}
                  {selectedBooking.items.map((it, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => addLine(it.name, it.qty)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-200 hover:border-cyan-600 flex items-center justify-between"
                    >
                      <span>{it.name}{it.qty > 1 ? ` (×${it.qty})` : ''}</span>
                      <span className="text-cyan-400 text-xs">+ übernehmen</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 3. Verkaufspositionen */}
        <div className={cardCls}>
          <h2 className="font-semibold text-white mb-3">3. Verkaufspositionen</h2>
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <input
                  value={line.name}
                  onChange={(e) => updateLine(idx, { name: e.target.value })}
                  className={`${inputCls} flex-1`}
                  placeholder="Artikel (z.B. SD-Karte 128 GB)"
                />
                <input
                  value={line.qty}
                  onChange={(e) => updateLine(idx, { qty: e.target.value.replace(/[^0-9]/g, '') })}
                  className={`${inputCls} w-16 text-center`}
                  inputMode="numeric"
                  placeholder="1"
                  aria-label="Menge"
                />
                <div className="relative w-28">
                  <input
                    value={line.unit_price}
                    onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                    className={`${inputCls} pr-7 text-right`}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label="Einzelpreis"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">€</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  disabled={lines.length === 1}
                  className="px-2 py-2 rounded-lg text-slate-500 hover:text-red-400 disabled:opacity-30"
                  aria-label="Position entfernen"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => addLine()}
            className="mt-3 text-sm text-cyan-400 hover:text-cyan-300"
          >
            + Freie Position hinzufügen
          </button>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Gesamtbetrag</span>
            <span className="text-xl font-bold text-white">{fmtEuro(total)}</span>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/20 border border-red-800 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="w-full py-3 rounded-lg bg-cyan-600 text-white font-semibold hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Wird angelegt…' : 'Rechnung schicken'}
        </button>
        <p className="text-xs text-slate-500 text-center">
          Der Kunde erhält eine Rechnung als PDF sowie einen Stripe-Zahlungslink
          (Kreditkarte / PayPal) per E-Mail.
        </p>
      </div>
    </div>
  );
}

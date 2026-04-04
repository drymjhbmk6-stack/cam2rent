'use client';

import { useEffect, useState } from 'react';
import { accessories as STATIC_ACC } from '@/data/accessories';

interface Booking {
  id: string;
  product_id: string;
  product_name: string;
  rental_from: string;
  rental_to: string;
  days: number;
  customer_name: string | null;
  customer_email: string | null;
  shipping_method: string | null;
  shipping_address: string | null;
  status: 'confirmed' | 'shipped';
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  accessories: string[];
  haftung: string;
  price_total: number;
  deposit: number;
  label_url?: string | null;
  return_label_url?: string | null;
}

interface ShippingMethod {
  id: number;
  name: string;
  carrier: string;
  min_weight: string;
  max_weight: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function daysDiff(isoDate: string): number {
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

/** Frühester Versandtermin: rental_from minus Vorlaufzeit */
function shipDeadline(rental_from: string, shipping_method: string | null): string {
  const d = new Date(rental_from);
  d.setDate(d.getDate() - (shipping_method === 'express' ? 1 : 2));
  return d.toISOString().split('T')[0];
}

type Urgency = 'ok' | 'soon' | 'urgent' | 'overdue';

function shipStatus(rental_from: string, shipping_method: string | null): { label: string; urgency: Urgency } {
  const diff = daysDiff(shipDeadline(rental_from, shipping_method));
  if (diff < 0) return { label: `${-diff} Tag(e) überfällig!`, urgency: 'overdue' };
  if (diff === 0) return { label: 'Heute versenden!', urgency: 'urgent' };
  if (diff === 1) return { label: 'Morgen versenden', urgency: 'soon' };
  return { label: `In ${diff} Tagen versenden`, urgency: 'ok' };
}

function returnStatus(rental_to: string): { label: string; urgency: Urgency } {
  const diff = daysDiff(rental_to);
  if (diff < 0) return { label: `${-diff} Tag(e) überfällig`, urgency: 'overdue' };
  if (diff === 0) return { label: 'Rückgabe heute', urgency: 'urgent' };
  if (diff === 1) return { label: 'Rückgabe morgen', urgency: 'soon' };
  return { label: `Rückgabe in ${diff} Tagen`, urgency: 'ok' };
}

const URGENCY_CHIP: Record<Urgency, string> = {
  overdue: 'bg-red-100 text-red-700 border border-red-200',
  urgent: 'bg-amber-100 text-amber-700 border border-amber-200',
  soon: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  ok: 'bg-green-50 text-green-700 border border-green-100',
};

function accName(id: string): string {
  return STATIC_ACC.find((a) => a.id === id)?.name ?? id;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminVersandPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'versenden' | 'unterwegs' | 'rueckgabe'>('versenden');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Ship modal state
  const [shipModal, setShipModal] = useState<Booking | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState<'DHL' | 'DPD'>('DHL');
  const [shipping, setShipping] = useState(false);
  const [shipError, setShipError] = useState('');

  // Return modal state
  const [returnModal, setReturnModal] = useState<Booking | null>(null);
  const [condition, setCondition] = useState<'gut' | 'gebrauchsspuren' | 'beschaedigt'>('gut');
  const [returnNotes, setReturnNotes] = useState('');
  const [returning, setReturning] = useState(false);

  // Sendcloud label modal
  const [labelModal, setLabelModal] = useState<Booking | null>(null);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [labelForm, setLabelForm] = useState({ name: '', address: '', city: '', postalCode: '', email: '', methodId: 0, weightKg: 0.5 });
  const [labelCreating, setLabelCreating] = useState(false);
  const [labelResult, setLabelResult] = useState<{ labelUrl: string | null; returnLabelUrl: string | null; returnError?: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/versand-buchungen');
      const d = await r.json();
      setBookings(d.bookings ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  // ── Tab data ──────────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const zuVersenden = bookings.filter((b) => b.status === 'confirmed');
  const unterwegs = bookings.filter((b) => b.status === 'shipped' && new Date(b.rental_to) >= today);
  const rueckgabe = bookings.filter((b) => b.status === 'shipped' && new Date(b.rental_to) < today);

  // ── Ship booking ──────────────────────────────────────────────────────────
  async function handleShip() {
    if (!shipModal || !trackingNumber.trim()) return;
    setShipping(true);
    setShipError('');
    try {
      const res = await fetch('/api/admin/ship-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: shipModal.id, trackingNumber: trackingNumber.trim(), carrier }),
      });
      const d = await res.json();
      if (!res.ok) { setShipError(d.error ?? 'Fehler'); return; }
      setBookings((prev) => prev.map((b) => b.id === shipModal.id
        ? { ...b, status: 'shipped', tracking_number: trackingNumber.trim(), tracking_url: d.trackingUrl, shipped_at: new Date().toISOString() }
        : b
      ));
      setShipModal(null);
      setExpandedId(null);
    } catch { setShipError('Netzwerkfehler.'); }
    finally { setShipping(false); }
  }

  // ── Sendcloud label ───────────────────────────────────────────────────────
  async function openLabelModal(b: Booking) {
    setLabelModal(b);
    setLabelResult(null);

    // Adresse parsen: gespeichert als "Straße 12, 12345 Stadt"
    let parsedStreet = '';
    let parsedZip = '';
    let parsedCity = '';
    if (b.shipping_address) {
      const parts = b.shipping_address.split(',');
      parsedStreet = parts[0]?.trim() ?? '';
      const rest = parts[1]?.trim() ?? '';
      const zipCity = rest.match(/^(\d{5})\s+(.+)$/);
      if (zipCity) {
        parsedZip = zipCity[1];
        parsedCity = zipCity[2];
      }
    }

    setLabelForm({
      name: b.customer_name ?? '',
      address: parsedStreet,
      city: parsedCity,
      postalCode: parsedZip,
      email: b.customer_email ?? '',
      methodId: shippingMethods[0]?.id ?? 0,
      weightKg: 0.5,
    });
    if (shippingMethods.length === 0) {
      setMethodsLoading(true);
      try {
        const r = await fetch('/api/admin/sendcloud?action=methods');
        const d = await r.json();
        setShippingMethods(d.methods ?? []);
        setLabelForm((f) => ({ ...f, methodId: d.methods?.[0]?.id ?? 0 }));
      } catch { /* silent */ }
      finally { setMethodsLoading(false); }
    }
  }

  async function handleCreateLabel() {
    if (!labelModal) return;
    setLabelCreating(true);
    try {
      const res = await fetch('/api/admin/sendcloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: labelModal.id,
          shippingMethodId: labelForm.methodId,
          customer: { name: labelForm.name, address: labelForm.address, city: labelForm.city, postalCode: labelForm.postalCode, email: labelForm.email },
          weightKg: labelForm.weightKg,
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(`Fehler: ${d.error}`); return; }
      setLabelResult({ labelUrl: d.labelUrl, returnLabelUrl: d.returnLabelUrl, returnError: d.returnError });
      setBookings((prev) => prev.map((b) => b.id === labelModal.id
        ? { ...b, tracking_number: d.trackingNumber, label_url: d.labelUrl, return_label_url: d.returnLabelUrl }
        : b
      ));
    } catch { alert('Netzwerkfehler.'); }
    finally { setLabelCreating(false); }
  }

  // ── Return booking ────────────────────────────────────────────────────────
  async function handleReturn() {
    if (!returnModal) return;
    setReturning(true);
    try {
      const res = await fetch('/api/admin/return-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: returnModal.id, condition, notes: returnNotes }),
      });
      if (!res.ok) { alert('Fehler beim Abschließen.'); return; }
      setBookings((prev) => prev.filter((b) => b.id !== returnModal.id));
      setReturnModal(null);
      setExpandedId(null);
    } catch { alert('Netzwerkfehler.'); }
    finally { setReturning(false); }
  }

  const tabs = [
    { key: 'versenden', label: 'Zu versenden', count: zuVersenden.length, warn: zuVersenden.some((b) => shipStatus(b.rental_from, b.shipping_method).urgency === 'overdue' || shipStatus(b.rental_from, b.shipping_method).urgency === 'urgent') },
    { key: 'unterwegs', label: 'Unterwegs', count: unterwegs.length, warn: false },
    { key: 'rueckgabe', label: 'Rückgabe prüfen', count: rueckgabe.length, warn: rueckgabe.length > 0 },
  ] as const;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-heading font-bold text-2xl text-brand-black">Fulfillment</h1>
          <p className="text-sm font-body text-brand-muted mt-0.5">Versand vorbereiten, verfolgen und Rückgaben abschließen</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className={`rounded-xl border p-5 ${zuVersenden.length > 0 && tabs[0].warn ? 'bg-amber-50 border-amber-200' : 'bg-white border-brand-border'}`}>
            <p className="text-xs font-body text-brand-muted uppercase tracking-wider mb-1">Zu versenden</p>
            <p className={`font-heading font-bold text-3xl ${tabs[0].warn ? 'text-amber-600' : 'text-brand-black'}`}>{zuVersenden.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-brand-border p-5">
            <p className="text-xs font-body text-brand-muted uppercase tracking-wider mb-1">Unterwegs</p>
            <p className="font-heading font-bold text-3xl text-accent-blue">{unterwegs.length}</p>
          </div>
          <div className={`rounded-xl border p-5 ${rueckgabe.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-brand-border'}`}>
            <p className="text-xs font-body text-brand-muted uppercase tracking-wider mb-1">Rückgabe prüfen</p>
            <p className={`font-heading font-bold text-3xl ${rueckgabe.length > 0 ? 'text-red-600' : 'text-brand-black'}`}>{rueckgabe.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setExpandedId(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-heading font-semibold rounded-btn transition-colors ${tab === t.key ? 'bg-brand-black text-white' : 'bg-white text-brand-steel border border-brand-border hover:bg-brand-bg'}`}>
              {t.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-white/20 text-white' : t.warn ? 'bg-red-100 text-red-600' : 'bg-brand-bg text-brand-muted'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-brand-muted font-body">Lädt…</div>
        ) : (
          <>
            {/* ── TAB: Zu versenden ─────────────────────────────────────── */}
            {tab === 'versenden' && (
              <div className="space-y-3">
                {zuVersenden.length === 0 && <EmptyState text="Keine Aufträge ausstehend." />}
                {zuVersenden
                  .sort((a, b) => shipDeadline(a.rental_from, a.shipping_method).localeCompare(shipDeadline(b.rental_from, b.shipping_method)))
                  .map((b) => {
                    const { label, urgency } = shipStatus(b.rental_from, b.shipping_method);
                    const isOpen = expandedId === b.id;
                    const accs = Array.isArray(b.accessories) ? b.accessories : [];
                    return (
                      <div key={b.id} className="bg-white rounded-xl border border-brand-border overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 gap-3 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-heading font-semibold shrink-0 ${URGENCY_CHIP[urgency]}`}>
                              {label}
                            </span>
                            <div className="min-w-0">
                              <p className="font-heading font-semibold text-sm text-brand-black truncate">{b.product_name}</p>
                              <p className="text-xs font-body text-brand-muted">{b.customer_name || '–'} · Mietbeginn: {fmtDate(b.rental_from)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs font-body text-brand-muted hidden sm:block">{b.id}</span>
                            <button onClick={() => setExpandedId(isOpen ? null : b.id)}
                              className="text-sm font-heading font-semibold text-brand-muted hover:text-brand-black px-2">
                              {isOpen ? '▲' : '▼'}
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="border-t border-brand-border bg-brand-bg px-5 py-5 space-y-4">
                            {/* Packliste */}
                            <div>
                              <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-2">Packliste</p>
                              <div className="bg-white rounded-xl border border-brand-border overflow-hidden">
                                <PackRow label={b.product_name} sub="Kamera" strong />
                                {accs.map((id) => <PackRow key={id} label={accName(id)} sub="Zubehör" />)}
                                <PackRow label="Rücksendeetikett / DHL-Beileger" sub="Im Paket beilegen" />
                                <PackRow label="Lieferschein (Kopie)" sub="Ins Paket legen" />
                              </div>
                            </div>

                            {/* Kunde & Adresse */}
                            <div className="bg-white rounded-xl border border-brand-border p-4">
                              <p className="text-xs font-heading font-semibold text-brand-muted mb-2">Kundendaten</p>
                              <p className="font-semibold text-sm text-brand-black">{b.customer_name || '—'}</p>
                              {b.customer_email && <p className="text-sm text-brand-steel">{b.customer_email}</p>}
                              {b.shipping_address && (
                                <p className="text-sm text-brand-steel mt-1 whitespace-pre-line">{b.shipping_address}</p>
                              )}
                              <p className="text-xs text-brand-muted mt-1">
                                {b.shipping_method === 'express' ? '⚡ Express-Versand' : '📦 Standard-Versand'}
                                {' · '}Mietbeginn: {fmtDate(b.rental_from)} bis {fmtDate(b.rental_to)}
                              </p>
                            </div>

                            {/* Aktionen */}
                            <div className="flex flex-wrap gap-2">
                              <a href={`/admin/versand/${b.id}/drucken`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-brand-border rounded-btn text-sm font-heading font-semibold text-brand-black hover:bg-brand-bg transition-colors">
                                🖨 Lieferschein drucken
                              </a>
                              {b.label_url ? (
                                <a href={`/api/admin/label/${b.id}`} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 px-4 py-2 bg-green-50 border border-green-300 rounded-btn text-sm font-heading font-semibold text-green-700 hover:bg-green-100 transition-colors">
                                  📄 Versandetikett herunterladen
                                </a>
                              ) : (
                                <button onClick={() => openLabelModal(b)}
                                  className="flex items-center gap-1.5 px-4 py-2 bg-yellow-50 border border-yellow-300 rounded-btn text-sm font-heading font-semibold text-yellow-800 hover:bg-yellow-100 transition-colors">
                                  📦 Sendcloud-Etikett erstellen
                                </button>
                              )}
                              <button onClick={() => { setShipModal(b); setTrackingNumber(b.tracking_number ?? ''); setCarrier('DHL'); setShipError(''); }}
                                className="flex-1 sm:flex-none px-5 py-2 bg-brand-black text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors">
                                ✓ Als versendet markieren
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* ── TAB: Unterwegs ───────────────────────────────────────── */}
            {tab === 'unterwegs' && (
              <div className="space-y-3">
                {unterwegs.length === 0 && <EmptyState text="Keine Pakete unterwegs." />}
                {unterwegs
                  .sort((a, b) => a.rental_to.localeCompare(b.rental_to))
                  .map((b) => {
                    const { label, urgency } = returnStatus(b.rental_to);
                    return (
                      <div key={b.id} className="bg-white rounded-xl border border-brand-border px-5 py-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-heading font-semibold shrink-0 ${URGENCY_CHIP[urgency]}`}>
                              {label}
                            </span>
                            <div className="min-w-0">
                              <p className="font-heading font-semibold text-sm text-brand-black truncate">{b.product_name}</p>
                              <p className="text-xs font-body text-brand-muted">{b.customer_name || '–'} · Rückgabe: {fmtDate(b.rental_to)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 flex-wrap">
                            {b.tracking_url ? (
                              <a href={b.tracking_url} target="_blank" rel="noopener noreferrer"
                                className="text-sm font-heading font-semibold text-accent-blue hover:underline">
                                {b.tracking_number} ↗
                              </a>
                            ) : b.tracking_number ? (
                              <span className="text-sm font-body text-brand-black">{b.tracking_number}</span>
                            ) : null}
                            {b.label_url ? (
                              <a href={`/api/admin/label/${b.id}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-heading font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-btn hover:bg-green-100 transition-colors">
                                📄 Versandetikett
                              </a>
                            ) : (
                              <button onClick={() => openLabelModal(b)}
                                className="text-xs font-heading font-semibold text-yellow-800 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-btn hover:bg-yellow-100 transition-colors">
                                📦 Etikett erstellen
                              </button>
                            )}
                            {b.return_label_url && (
                              <a href={`/api/admin/return-label/${b.id}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-heading font-semibold text-brand-steel bg-brand-bg border border-brand-border px-2.5 py-1 rounded-btn hover:bg-white transition-colors">
                                ↩ Rücksendeetikett
                              </a>
                            )}
                            <span className="text-xs font-body text-brand-muted">{b.id}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* ── TAB: Rückgabe prüfen ─────────────────────────────────── */}
            {tab === 'rueckgabe' && (
              <div className="space-y-3">
                {rueckgabe.length === 0 && <EmptyState text="Keine überfälligen Rückgaben." />}
                {rueckgabe
                  .sort((a, b) => a.rental_to.localeCompare(b.rental_to))
                  .map((b) => {
                    const isOpen = expandedId === b.id;
                    const accs = Array.isArray(b.accessories) ? b.accessories : [];
                    return (
                      <div key={b.id} className="bg-white rounded-xl border-2 border-red-200 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 gap-3 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="px-2.5 py-1 rounded-full text-xs font-heading font-semibold bg-red-100 text-red-700 border border-red-200 shrink-0">
                              Rückgabe fällig seit {fmtDate(b.rental_to)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-heading font-semibold text-sm text-brand-black truncate">{b.product_name}</p>
                              <p className="text-xs font-body text-brand-muted">{b.customer_name || '–'} · {b.id}</p>
                            </div>
                          </div>
                          <button onClick={() => setExpandedId(isOpen ? null : b.id)}
                            className="text-sm font-heading font-semibold text-brand-muted hover:text-brand-black px-2 shrink-0">
                            {isOpen ? '▲ Schließen' : '▼ Rückgabe prüfen'}
                          </button>
                        </div>

                        {isOpen && (
                          <div className="border-t border-red-100 bg-red-50/30 px-5 py-5 space-y-4">
                            {/* Artikel-Checkliste */}
                            <div>
                              <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-2">Rückgabe prüfen</p>
                              <div className="bg-white rounded-xl border border-brand-border overflow-hidden">
                                <ReturnCheckRow label={b.product_name} sub="Kamera vorhanden & geprüft" />
                                {accs.map((id) => <ReturnCheckRow key={id} label={accName(id)} sub="Zubehör vorhanden" />)}
                              </div>
                            </div>

                            {/* Zustand + Abschließen-Button */}
                            <div className="bg-white rounded-xl border border-brand-border p-4 space-y-3">
                              <p className="text-xs font-heading font-semibold text-brand-muted">Zustand der Rückgabe</p>
                              <div className="flex gap-2 flex-wrap">
                                {([
                                  { value: 'gut', label: '✓ Gut / Wie erwartet' },
                                  { value: 'gebrauchsspuren', label: '~ Leichte Gebrauchsspuren' },
                                  { value: 'beschaedigt', label: '⚠ Beschädigt' },
                                ] as const).map((opt) => (
                                  <label key={opt.value} className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer text-sm font-heading font-semibold transition-colors ${condition === opt.value ? 'border-brand-black bg-brand-bg' : 'border-brand-border hover:border-brand-muted'}`}>
                                    <input type="radio" name={`cond-${b.id}`} value={opt.value} checked={condition === opt.value}
                                      onChange={() => setCondition(opt.value)} className="sr-only" />
                                    {opt.label}
                                  </label>
                                ))}
                              </div>
                              <div>
                                <label className="text-xs font-heading font-semibold text-brand-muted block mb-1.5">Notizen (optional)</label>
                                <textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)}
                                  placeholder="z.B. kleine Delle am Gehäuse, SD-Karte fehlt…"
                                  rows={2}
                                  className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue resize-none" />
                              </div>
                              <p className="text-xs text-brand-muted font-body">
                                ⟳ Beim Abschließen wird der Lagerbestand von Kamera und Zubehör automatisch erhöht.
                              </p>
                              <button onClick={() => setReturnModal(b)}
                                className="w-full py-3 bg-brand-black text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors">
                                Rückgabe abschließen & Lagerbestand aktualisieren
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Ship Modal ──────────────────────────────────────────────────── */}
      {shipModal && (
        <Modal onClose={() => setShipModal(null)} title="Versand bestätigen">
          <p className="text-sm font-body text-brand-muted mb-6">
            {shipModal.product_name} · {fmtDate(shipModal.rental_from)} – {fmtDate(shipModal.rental_to)}
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-heading font-semibold text-brand-black mb-2">Paketdienstleister</label>
              <div className="flex gap-3">
                {(['DHL', 'DPD'] as const).map((c) => (
                  <button key={c} onClick={() => setCarrier(c)}
                    className={`flex-1 py-2.5 text-sm font-heading font-semibold rounded-btn border transition-colors ${carrier === c ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-steel border-brand-border hover:bg-brand-bg'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-heading font-semibold text-brand-black mb-2">Tracking-Nummer</label>
              <input type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder={carrier === 'DHL' ? 'z.B. 00340434172822390523' : 'z.B. 01234567890123'}
                className="w-full px-4 py-3 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
            </div>
            {shipError && <p className="text-sm text-red-600 font-body">{shipError}</p>}
            <p className="text-xs font-body text-brand-muted bg-brand-bg rounded-lg p-3">
              Der Kunde erhält eine E-Mail mit der Tracking-Nummer.
            </p>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShipModal(null)} disabled={shipping}
              className="flex-1 py-3 text-sm font-heading font-semibold text-brand-steel border border-brand-border rounded-btn hover:bg-brand-bg transition-colors disabled:opacity-40">
              Abbrechen
            </button>
            <button onClick={handleShip} disabled={!trackingNumber.trim() || shipping}
              className="flex-1 py-3 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40">
              {shipping ? 'Wird gespeichert…' : 'Versendet bestätigen'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Sendcloud Label Modal ───────────────────────────────────────── */}
      {labelModal && (
        <Modal onClose={() => { setLabelModal(null); setLabelResult(null); }} title="Sendcloud-Etikett erstellen">
          {labelResult ? (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm font-body text-green-700">
                Etiketten wurden erfolgreich erstellt!
              </div>
              {labelResult.labelUrl && labelModal && (
                <a href={`/api/admin/label/${labelModal.id}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-brand-black text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors">
                  📄 Versandetikett herunterladen
                </a>
              )}
              {labelResult.returnLabelUrl && labelModal ? (
                <a href={`/api/admin/return-label/${labelModal.id}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-white border border-brand-border text-sm font-heading font-semibold text-brand-black rounded-btn hover:bg-brand-bg transition-colors">
                  📦 Rücksendeetikett herunterladen
                </a>
              ) : labelResult.returnError ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-body text-red-700">
                  <strong>Rücksendeetikett fehlgeschlagen:</strong> {labelResult.returnError}
                </div>
              ) : null}
              <button onClick={() => { setLabelModal(null); setLabelResult(null); }}
                className="w-full py-3 text-sm font-heading font-semibold text-brand-steel border border-brand-border rounded-btn hover:bg-brand-bg transition-colors">
                Schließen
              </button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Name *</label>
                  <input type="text" value={labelForm.name} onChange={(e) => setLabelForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Vor- und Nachname"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Straße + Hausnummer *</label>
                  <input type="text" value={labelForm.address} onChange={(e) => setLabelForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="Musterstraße 12"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">PLZ *</label>
                  <input type="text" value={labelForm.postalCode} onChange={(e) => setLabelForm((f) => ({ ...f, postalCode: e.target.value }))}
                    placeholder="12345"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Stadt *</label>
                  <input type="text" value={labelForm.city} onChange={(e) => setLabelForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Berlin"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">E-Mail</label>
                  <input type="email" value={labelForm.email} onChange={(e) => setLabelForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="kunde@beispiel.de"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Gewicht (kg)</label>
                  <input type="number" step="0.1" min="0.1" value={labelForm.weightKg} onChange={(e) => setLabelForm((f) => ({ ...f, weightKg: parseFloat(e.target.value) || 0.5 }))}
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Versandmethode *</label>
                  {methodsLoading ? (
                    <div className="px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body text-brand-muted">Lädt…</div>
                  ) : (
                    <select value={labelForm.methodId} onChange={(e) => setLabelForm((f) => ({ ...f, methodId: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                      {shippingMethods.length === 0
                        ? <option value={0}>Keine Methoden geladen</option>
                        : shippingMethods.map((m) => (
                            <option key={m.id} value={m.id}>{m.carrier} – {m.name}</option>
                          ))
                      }
                    </select>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setLabelModal(null)} disabled={labelCreating}
                  className="flex-1 py-3 text-sm font-heading font-semibold text-brand-steel border border-brand-border rounded-btn hover:bg-brand-bg transition-colors disabled:opacity-40">
                  Abbrechen
                </button>
                <button onClick={handleCreateLabel}
                  disabled={labelCreating || !labelForm.name.trim() || !labelForm.address.trim() || !labelForm.postalCode.trim() || !labelForm.city.trim() || !labelForm.methodId}
                  className="flex-1 py-3 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40">
                  {labelCreating ? 'Erstelle Etiketten…' : 'Etiketten erstellen'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Return Confirm Modal ─────────────────────────────────────────── */}
      {returnModal && (
        <Modal onClose={() => setReturnModal(null)} title="Rückgabe abschließen">
          <p className="text-sm font-body text-brand-muted mb-4">
            Buchung <strong>{returnModal.id}</strong> wird als abgeschlossen markiert.<br />
            Lagerbestand für Kamera und Zubehör wird automatisch erhöht.
          </p>
          {condition === 'beschaedigt' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm font-body text-red-700">
              Du hast &bdquo;Beschädigt&ldquo; ausgewählt. Bitte unbedingt Notizen ausfüllen und ggf. Fotos anfertigen.
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setReturnModal(null)} disabled={returning}
              className="flex-1 py-3 text-sm font-heading font-semibold text-brand-steel border border-brand-border rounded-btn hover:bg-brand-bg transition-colors disabled:opacity-40">
              Abbrechen
            </button>
            <button onClick={handleReturn} disabled={returning}
              className="flex-1 py-3 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40">
              {returning ? 'Schließe ab…' : 'Jetzt abschließen'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Small Components ─────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-xl border border-brand-border p-12 text-center">
      <p className="text-brand-muted font-body">{text}</p>
    </div>
  );
}

function PackRow({ label, sub, strong }: { label: string; sub: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border last:border-0">
      <div>
        <p className={`text-sm ${strong ? 'font-heading font-bold text-brand-black' : 'font-body text-brand-black'}`}>{label}</p>
        <p className="text-xs font-body text-brand-muted">{sub}</p>
      </div>
      <div className="flex gap-4">
        <div className="w-6 h-6 border-2 border-brand-border rounded flex items-center justify-center text-brand-muted text-xs">☐</div>
        <div className="w-6 h-6 border-2 border-brand-border rounded flex items-center justify-center text-brand-muted text-xs">☐</div>
      </div>
    </div>
  );
}

function ReturnCheckRow({ label, sub }: { label: string; sub: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-brand-border last:border-0 transition-colors ${checked ? 'bg-green-50' : 'bg-white'}`}>
      <button onClick={() => setChecked(!checked)}
        className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-green-600 border-green-600 text-white' : 'border-brand-border'}`}>
        {checked ? '✓' : ''}
      </button>
      <div>
        <p className={`text-sm font-body ${checked ? 'line-through text-brand-muted' : 'text-brand-black'}`}>{label}</p>
        <p className="text-xs font-body text-brand-muted">{sub}</p>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h2 className="font-heading font-bold text-lg text-brand-black mb-1">{title}</h2>
        {children}
      </div>
    </div>
  );
}

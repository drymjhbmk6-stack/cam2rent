'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDate } from '@/lib/format-utils';

/**
 * Versand & Rueckgabe — kombinierte Page fuer den gesamten Fulfillment-
 * Lebenszyklus einer Buchung.
 *
 * 4 Tabs:
 *   1. Zu versenden     — confirmed | preparing_shipment | awaiting_pickup
 *   2. Unterwegs        — shipped (Paket beim Kunden, noch nicht ueberfaellig)
 *   3. Rueckgabe pruefen — shipped+ueberfaellig | delivered | picked_up | returned
 *   4. Abgeschlossen    — completed | damaged
 *
 * Layout: schlanke Tabelle (Retouren-Layout) mit kontextabhaengiger Datums-
 * Spalte und Aktion-Button. Pack-Workflow lebt weiterhin auf der Sub-Page
 * /admin/versand/[id]/packen (von hier verlinkt). Sendcloud-Etikett-
 * Erstellung ist direkt in diese Page integriert (Modal, dunkles Theme).
 */

interface FulfillmentBooking {
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
  tracking_number: string | null;
  tracking_url?: string | null;
  shipping_method: string | null;
  shipping_address?: string | null;
  /** Sendcloud-Etikett: gesetzt, sobald erstellt — sonst null. */
  label_url?: string | null;
  return_label_url?: string | null;
  /** Override pro Buchung (NULL = aus rental_to + buffer berechnen). */
  return_due_date_override?: string | null;
  ship_date_override?: string | null;
}

interface ShippingMethod { id: number; name: string; carrier: string }
interface LabelForm { name: string; address: string; city: string; postalCode: string; email: string; methodId: number; weightKg: number }
interface LabelResult { labelUrl: string | null; returnLabelUrl: string | null; returnError?: string }

const CONDITION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  gut: { label: 'Gut', color: '#10b981', bg: '#10b98122' },
  gebrauchsspuren: { label: 'Gebrauchsspuren', color: '#f59e0b', bg: '#f59e0b22' },
  beschaedigt: { label: 'Beschädigt', color: '#ef4444', bg: '#ef444422' },
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Bestätigt',
  preparing_shipment: 'Wird vorbereitet',
  awaiting_pickup: 'Wartet auf Abholung',
  shipped: 'Versendet',
  delivered: 'Zugestellt',
  picked_up: 'Abgeholt',
  returned: 'Retourniert',
  completed: 'Abgeschlossen',
  damaged: 'Beschädigt',
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: '#06b6d4',
  preparing_shipment: '#f59e0b',
  awaiting_pickup: '#14b8a6',
  shipped: '#10b981',
  delivered: '#22c55e',
  picked_up: '#10b981',
  returned: '#8b5cf6',
  completed: '#64748b',
  damaged: '#f97316',
};

// Default-Puffer (überschrieben durch admin_settings.booking_buffer_days).
// versand_after = Versand-Retoure-Puffer (3 Tage), abholung_after = Abholung-
// Rückgabe-Puffer (1 Tag). versand_before/abholung_before bestimmt den
// ship_date (Versand- bzw. Übergabe-Tag vor Mietbeginn).
const DEFAULT_BUFFER = { versand_before: 2, versand_after: 3, abholung_before: 0, abholung_after: 1 };
interface Buffer { versand_before: number; versand_after: number; abholung_before: number; abholung_after: number }

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function parseISODate(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

function returnDueDate(rentalTo: string, deliveryMode: string, buf: Buffer, override?: string | null): Date {
  if (override) return parseISODate(override);
  const d = parseISODate(rentalTo);
  d.setDate(d.getDate() + (deliveryMode === 'versand' ? buf.versand_after : buf.abholung_after));
  return d;
}

function shipDate(rentalFrom: string, deliveryMode: string, buf: Buffer, override?: string | null): Date {
  if (override) return parseISODate(override);
  const d = parseISODate(rentalFrom);
  d.setDate(d.getDate() - (deliveryMode === 'versand' ? buf.versand_before : buf.abholung_before));
  return d;
}

function isOverdue(due: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function daysUntil(due: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

type Tab = 'versenden' | 'unterwegs' | 'rueckgabe' | 'abgeschlossen';

export default function AdminVersandRueckgabePage() {
  const [bookings, setBookings] = useState<FulfillmentBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('versenden');
  const [buf, setBuf] = useState<Buffer>(DEFAULT_BUFFER);

  // Sendcloud-Etikett-Modal nur fuer das HIN-Etikett. Das Retour-Etikett
  // wird via separates Upload-Modal manuell hochgeladen (JPG/PNG/PDF) —
  // siehe POST /api/admin/return-label/[id]. Server konvertiert beim Upload
  // auf A5 Hochformat und legt das fertige PDF in Supabase-Storage ab.
  const [labelModal, setLabelModal] = useState<FulfillmentBooking | null>(null);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [labelForm, setLabelForm] = useState<LabelForm>({ name: '', address: '', city: '', postalCode: '', email: '', methodId: 0, weightKg: 0.5 });
  const [labelCreating, setLabelCreating] = useState(false);
  const [labelResult, setLabelResult] = useState<LabelResult | null>(null);

  // Retour-Etikett-Upload-Modal: File-Picker, Server konvertiert zu A5.
  const [returnUploadModal, setReturnUploadModal] = useState<FulfillmentBooking | null>(null);
  const [returnUploadFile, setReturnUploadFile] = useState<File | null>(null);
  const [returnUploading, setReturnUploading] = useState(false);
  const [returnUploadError, setReturnUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetchBookings();
    loadBuffer();
  }, []);

  function openReturnUploadModal(b: FulfillmentBooking) {
    setReturnUploadModal(b);
    setReturnUploadFile(null);
    setReturnUploadError(null);
  }

  async function handleReturnUpload() {
    if (!returnUploadModal || !returnUploadFile || returnUploading) return;
    setReturnUploading(true);
    setReturnUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', returnUploadFile);
      const res = await fetch(`/api/admin/return-label/${returnUploadModal.id}`, {
        method: 'POST',
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReturnUploadError(d.error ?? 'Upload fehlgeschlagen.');
        return;
      }
      const bookingId = returnUploadModal.id;
      const dbUrl = d.returnLabelUrl as string;
      setBookings((prev) => prev.map((b) => b.id === bookingId
        ? { ...b, return_label_url: dbUrl }
        : b
      ));
      setReturnUploadModal(null);
      setReturnUploadFile(null);
    } catch {
      setReturnUploadError('Netzwerkfehler.');
    } finally {
      setReturnUploading(false);
    }
  }

  async function openLabelModal(b: FulfillmentBooking) {
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

    // Pack-Gewicht (falls bereits gepackt) als Vorbefuellung — siehe
    // Pack-Workflow + bookings.pack_weight_kg.
    let prefillWeight = 0.5;
    try {
      const wr = await fetch(`/api/admin/booking/${b.id}`);
      if (wr.ok) {
        const { booking: wb } = await wr.json();
        const w = wb?.pack_weight_kg ?? wb?.pack_weight_estimate_kg;
        if (typeof w === 'number' && w > 0) prefillWeight = w;
      }
    } catch { /* Default 0.5 kg */ }

    setLabelForm({
      name: b.customer_name ?? '',
      address: parsedStreet,
      city: parsedCity,
      postalCode: parsedZip,
      email: b.customer_email ?? '',
      methodId: shippingMethods[0]?.id ?? 0,
      weightKg: prefillWeight,
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
      setLabelResult({ labelUrl: d.labelUrl, returnLabelUrl: null });
      setBookings((prev) => prev.map((b) => b.id === labelModal.id
        ? { ...b, tracking_number: d.trackingNumber ?? b.tracking_number, label_url: d.labelUrl }
        : b
      ));
    } catch { alert('Netzwerkfehler.'); }
    finally { setLabelCreating(false); }
  }

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
          versand_before: Number(parsed.versand_before ?? DEFAULT_BUFFER.versand_before),
          versand_after: Number(parsed.versand_after ?? DEFAULT_BUFFER.versand_after),
          abholung_before: Number(parsed.abholung_before ?? DEFAULT_BUFFER.abholung_before),
          abholung_after: Number(parsed.abholung_after ?? DEFAULT_BUFFER.abholung_after),
        });
      }
    } catch {
      // Setting nicht ladbar → Defaults bleiben
    }
  }

  // ── Tab-Filter ─────────────────────────────────────────────────────────────
  const versenden = bookings
    .filter((b) => b.status === 'confirmed' || b.status === 'preparing_shipment' || b.status === 'awaiting_pickup')
    .sort((a, b) => shipDate(a.rental_from, a.delivery_mode, buf, a.ship_date_override).getTime() - shipDate(b.rental_from, b.delivery_mode, buf, b.ship_date_override).getTime());

  const unterwegs = bookings
    .filter((b) => b.status === 'shipped' && !isOverdue(returnDueDate(b.rental_to, b.delivery_mode, buf, b.return_due_date_override)))
    .sort((a, b) => parseISODate(a.rental_to).getTime() - parseISODate(b.rental_to).getTime());

  const rueckgabe = bookings
    .filter((b) => {
      // Alles was zurueck soll: shipped+ueberfaellig, delivered (zugestellt), picked_up (abgeholt), returned
      if (b.status === 'delivered' || b.status === 'picked_up' || b.status === 'returned') return true;
      if (b.status === 'shipped' && isOverdue(returnDueDate(b.rental_to, b.delivery_mode, buf, b.return_due_date_override))) return true;
      return false;
    })
    .sort((a, b) => returnDueDate(a.rental_to, a.delivery_mode, buf, a.return_due_date_override).getTime() - returnDueDate(b.rental_to, b.delivery_mode, buf, b.return_due_date_override).getTime());

  const abgeschlossen = bookings
    .filter((b) => b.status === 'completed' || b.status === 'damaged')
    .sort((a, b) => new Date(b.returned_at || b.rental_to).getTime() - new Date(a.returned_at || a.rental_to).getTime());

  // Ueberfaellige Versand-Auftraege (heute oder vorbei) — fuer KPI-Karte
  const versendenUeberfaellig = versenden.filter((b) => {
    const sd = shipDate(b.rental_from, b.delivery_mode, buf, b.ship_date_override);
    return daysUntil(sd) <= 0;
  });

  const displayed: FulfillmentBooking[] =
    tab === 'versenden' ? versenden
    : tab === 'unterwegs' ? unterwegs
    : tab === 'rueckgabe' ? rueckgabe
    : abgeschlossen;

  // ── Spalten-Konfig je Tab ──────────────────────────────────────────────────
  const dateColLabel =
    tab === 'versenden' ? 'Versand / Übergabe bis'
    : tab === 'unterwegs' ? 'Rückgabe erwartet'
    : tab === 'rueckgabe' ? 'Rückgabe bis'
    : 'Zurück am';

  return (
    <div className="min-h-screen" style={{ padding: '20px 16px' }}>
      <AdminBackLink label="Zurück" />
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading font-bold text-2xl" style={{ color: '#e2e8f0' }}>
          Versand & Rückgabe
        </h1>
        <p className="text-sm font-body mt-1" style={{ color: '#64748b' }}>
          Pakete vorbereiten, Tracking verfolgen und Rückgaben abschließen
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {[
          { label: 'Zu versenden', value: versenden.length, color: versendenUeberfaellig.length > 0 ? '#f59e0b' : '#06b6d4' },
          { label: 'Unterwegs', value: unterwegs.length, color: '#10b981' },
          { label: 'Rückgabe prüfen', value: rueckgabe.length, color: rueckgabe.length > 0 ? '#ef4444' : '#64748b' },
          { label: 'Abgeschlossen', value: abgeschlossen.length, color: '#64748b' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{stat.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 flex-wrap" style={{ background: '#111827', borderRadius: 12, padding: 4, display: 'inline-flex' }}>
        {([
          { value: 'versenden' as const, label: `Zu versenden (${versenden.length})` },
          { value: 'unterwegs' as const, label: `Unterwegs (${unterwegs.length})` },
          { value: 'rueckgabe' as const, label: `Rückgabe prüfen (${rueckgabe.length})` },
          { value: 'abgeschlossen' as const, label: `Abgeschlossen (${abgeschlossen.length})` },
        ]).map((t) => (
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

      {/* Tabelle */}
      {loading ? (
        <div className="text-center py-16" style={{ color: '#64748b' }}>Lädt…</div>
      ) : displayed.length === 0 ? (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
          <p style={{ color: '#64748b', fontSize: 14 }}>{emptyText(tab)}</p>
        </div>
      ) : (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  {['Buchung', 'Kamera', 'Kunde', dateColLabel, tab === 'abgeschlossen' ? 'Zustand' : 'Status', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((booking, idx) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    tab={tab}
                    buf={buf}
                    last={idx === displayed.length - 1}
                    onSaved={fetchBookings}
                    onOpenLabel={openLabelModal}
                    onOpenReturnUpload={openReturnUploadModal}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sendcloud-Etikett-Modal (dunkel) ───────────────────────────── */}
      {labelModal && (
        <LabelModal
          booking={labelModal}
          form={labelForm}
          setForm={setLabelForm}
          methods={shippingMethods}
          methodsLoading={methodsLoading}
          creating={labelCreating}
          result={labelResult}
          onCreate={handleCreateLabel}
          onClose={() => { setLabelModal(null); setLabelResult(null); }}
        />
      )}

      {/* ── Retour-Etikett-Upload-Modal ─────────────────────────────────── */}
      {returnUploadModal && (
        <ReturnUploadModal
          booking={returnUploadModal}
          file={returnUploadFile}
          setFile={setReturnUploadFile}
          uploading={returnUploading}
          error={returnUploadError}
          onUpload={handleReturnUpload}
          onClose={() => {
            setReturnUploadModal(null);
            setReturnUploadFile(null);
            setReturnUploadError(null);
          }}
        />
      )}
    </div>
  );
}

function emptyText(tab: Tab): string {
  switch (tab) {
    case 'versenden': return 'Keine Aufträge zum Versenden oder Übergeben.';
    case 'unterwegs': return 'Aktuell keine Pakete unterwegs.';
    case 'rueckgabe': return 'Keine Rückgaben ausstehend.';
    case 'abgeschlossen': return 'Keine abgeschlossenen Buchungen.';
  }
}

// ─── Eine Tabellen-Zeile ─────────────────────────────────────────────────────

function BookingRow({
  booking, tab, buf, last, onSaved, onOpenLabel, onOpenReturnUpload,
}: {
  booking: FulfillmentBooking;
  tab: Tab;
  buf: Buffer;
  last: boolean;
  onSaved: () => void;
  onOpenLabel: (b: FulfillmentBooking) => void;
  onOpenReturnUpload: (b: FulfillmentBooking) => void;
}) {
  const cond = booking.return_condition ? CONDITION_CONFIG[booking.return_condition] : null;
  const statusLabel = STATUS_LABEL[booking.status] ?? booking.status;
  const statusColor = STATUS_COLOR[booking.status] ?? '#64748b';

  return (
    <tr style={{ borderBottom: last ? 'none' : '1px solid #1e293b' }}>
      <td style={{ padding: '14px 16px' }}>
        <Link
          href={`/admin/buchungen/${booking.id}`}
          style={{ fontSize: 13, fontWeight: 600, color: '#22d3ee', fontFamily: 'monospace', textDecoration: 'none' }}
        >
          {booking.id}
        </Link>
        <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{booking.days} Tag{booking.days !== 1 ? 'e' : ''}</p>
      </td>
      <td style={{ padding: '14px 16px' }}>
        <p style={{ fontSize: 13, color: '#e2e8f0' }}>{booking.product_name}</p>
      </td>
      <td style={{ padding: '14px 16px' }}>
        <p style={{ fontSize: 13, color: '#e2e8f0' }}>{booking.customer_name || '–'}</p>
      </td>
      <td style={{ padding: '14px 16px', minWidth: 200 }}>
        {tab === 'versenden' && <ShipDateCell booking={booking} buf={buf} />}
        {tab === 'unterwegs' && <UnterwegsCell booking={booking} buf={buf} />}
        {tab === 'rueckgabe' && <ReturnDueCell booking={booking} buf={buf} onSaved={onSaved} />}
        {tab === 'abgeschlossen' && booking.returned_at && (
          <>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{fmtDate(booking.returned_at)}</p>
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Miete bis {fmtDate(booking.rental_to)}</p>
          </>
        )}
      </td>
      <td style={{ padding: '14px 16px' }}>
        {tab === 'abgeschlossen' && cond ? (
          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: cond.bg, color: cond.color }}>
            {cond.label}
          </span>
        ) : (
          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}40` }}>
            {statusLabel}
          </span>
        )}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
        <ActionButton booking={booking} tab={tab} onOpenLabel={onOpenLabel} onOpenReturnUpload={onOpenReturnUpload} />
      </td>
    </tr>
  );
}

// ─── Datums-Zellen je Tab ────────────────────────────────────────────────────

function ShipDateCell({ booking, buf }: { booking: FulfillmentBooking; buf: Buffer }) {
  const sd = shipDate(booking.rental_from, booking.delivery_mode, buf, booking.ship_date_override);
  const dl = daysUntil(sd);
  const overdue = dl < 0;
  const isOverridden = !!booking.ship_date_override;

  let color = '#64748b';
  let label = `in ${dl} Tag${dl !== 1 ? 'en' : ''}`;
  if (overdue) { color = '#ef4444'; label = `${Math.abs(dl)} Tag${Math.abs(dl) !== 1 ? 'e' : ''} überfällig`; }
  else if (dl === 0) { color = '#ef4444'; label = 'Heute fällig'; }
  else if (dl <= 2) color = '#f59e0b';
  else if (dl <= 5) color = '#22d3ee';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: overdue || dl === 0 ? '#ef4444' : '#e2e8f0' }}>
          {fmtDate(sd.toISOString())}
        </p>
        {isOverridden && (
          <span title="Manuell überschrieben" style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            manuell
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
        Mietbeginn {fmtDate(booking.rental_from)} · {booking.delivery_mode === 'versand' ? 'Versand' : 'Abholung'}
      </p>
      <span
        style={{
          display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}40`,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function UnterwegsCell({ booking, buf }: { booking: FulfillmentBooking; buf: Buffer }) {
  const due = returnDueDate(booking.rental_to, booking.delivery_mode, buf, booking.return_due_date_override);
  const dl = daysUntil(due);
  let color = '#64748b';
  let label = `Rückgabe in ${dl} Tag${dl !== 1 ? 'en' : ''}`;
  if (dl === 0) { color = '#ef4444'; label = 'Heute zurück'; }
  else if (dl <= 2) color = '#f59e0b';
  else if (dl <= 5) color = '#22d3ee';

  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{fmtDate(due.toISOString())}</p>
      <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
        Miete bis {fmtDate(booking.rental_to)} · {booking.delivery_mode === 'versand' ? 'Versand' : 'Abholung'}
      </p>
      {booking.tracking_number && (
        <p style={{ fontSize: 11, color: '#22d3ee', marginTop: 2, fontFamily: 'monospace' }}>
          📦 {booking.tracking_number}
        </p>
      )}
      <span
        style={{
          display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}40`,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Aktion-Button je nach Status + Lieferart ────────────────────────────────

function ActionButton({
  booking, tab, onOpenLabel, onOpenReturnUpload,
}: {
  booking: FulfillmentBooking;
  tab: Tab;
  onOpenLabel: (b: FulfillmentBooking) => void;
  onOpenReturnUpload: (b: FulfillmentBooking) => void;
}) {
  const base = {
    display: 'inline-block', padding: '8px 16px', textDecoration: 'none',
    borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' as const,
  };
  const small = { ...base, padding: '8px 12px' };

  if (tab === 'versenden') {
    if (booking.delivery_mode === 'versand') {
      // Etikett-Stack: links Hin (Sendcloud) + Retour (manuell hochgeladen),
      // mittig Drucken-Button (nur wenn beide da), rechts Packen. Alle
      // Etikett-Links laufen durch den /admin/pdf-viewer — sonst fehlt in
      // der iOS-PWA der Zurueck-Button.
      const labelBtn = booking.label_url ? (
        <a
          href={`/admin/pdf-viewer?u=${encodeURIComponent(`/api/admin/label/${booking.id}`)}&t=${encodeURIComponent('Versandetikett (A5)')}`}
          style={{ ...small, background: '#10b98122', color: '#10b981', border: '1px solid #10b98140' }}
          title="Versandetikett anzeigen"
        >
          📄 Etikett
        </a>
      ) : (
        <button
          type="button"
          onClick={() => onOpenLabel(booking)}
          style={{ ...small, background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b40', cursor: 'pointer' }}
          title="Versandetikett erstellen"
        >
          🏷 Etikett
        </button>
      );

      const returnBtn = booking.return_label_url ? (
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <a
            href={`/admin/pdf-viewer?u=${encodeURIComponent(`/api/admin/return-label/${booking.id}`)}&t=${encodeURIComponent('Retourlabel (A5)')}`}
            style={{ ...small, background: '#06b6d422', color: '#22d3ee', border: '1px solid #06b6d440' }}
            title="Retourlabel anzeigen"
          >
            ↩ Retourlabel
          </a>
          <button
            type="button"
            onClick={() => onOpenReturnUpload(booking)}
            style={{ ...small, background: '#64748b22', color: '#94a3b8', border: '1px solid #64748b40', cursor: 'pointer', padding: '8px 8px' }}
            title="Retourlabel ersetzen"
          >
            ✏
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpenReturnUpload(booking)}
          style={{ ...small, background: '#64748b22', color: '#94a3b8', border: '1px solid #64748b40', cursor: 'pointer' }}
          title="Retourlabel hochladen (JPG, PNG oder PDF — wird serverseitig auf A5 konvertiert)"
        >
          ⬆ Retourlabel
        </button>
      );

      const printBtn = booking.label_url && booking.return_label_url ? (
        <a
          href={`/admin/pdf-viewer?u=${encodeURIComponent(`/api/admin/combined-labels/${booking.id}`)}&t=${encodeURIComponent('Etiketten Hin + Retour (A4 quer)')}`}
          style={{ ...small, background: '#8b5cf622', color: '#a78bfa', border: '1px solid #8b5cf640' }}
          title="Hin- und Retour-Etikett nebeneinander auf A4-Querformat (für vorgestanzte 2× A5 Hochformat-Bögen)"
        >
          🖨 Drucken
        </a>
      ) : null;

      return (
        <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
            {labelBtn}
            {returnBtn}
          </div>
          {printBtn}
          <Link href={`/admin/versand/${booking.id}/packen`} style={{ ...base, background: '#06b6d4', color: 'white' }}>
            📦 Packen
          </Link>
        </div>
      );
    }
    return (
      <Link href={`/admin/buchungen/${booking.id}/uebergabe`} style={{ ...base, background: '#8b5cf6', color: 'white' }}>
        👋 Übergabe
      </Link>
    );
  }

  if (tab === 'unterwegs') {
    return (
      <Link href={`/admin/buchungen/${booking.id}`} style={{ ...base, background: 'transparent', color: '#94a3b8', border: '1px solid #334155' }}>
        Details
      </Link>
    );
  }

  if (tab === 'rueckgabe') {
    return (
      <Link href={`/admin/retouren/${booking.id}/pruefen`} style={{ ...base, background: '#10b981', color: 'white' }}>
        Rückgabe prüfen
      </Link>
    );
  }

  // abgeschlossen
  return (
    <Link href={`/admin/buchungen/${booking.id}`} style={{ ...base, background: 'transparent', color: '#94a3b8', border: '1px solid #334155' }}>
      Details
    </Link>
  );
}

// ─── Inline-Edit für das Rückgabe-Soll-Datum pro Buchung (Rueckgabe-Tab) ─────

function ReturnDueCell({
  booking, buf, onSaved,
}: {
  booking: FulfillmentBooking;
  buf: Buffer;
  onSaved: () => void;
}) {
  const dueDate = returnDueDate(booking.rental_to, booking.delivery_mode, buf, booking.return_due_date_override);
  const overdue = isOverdue(dueDate);
  const daysLeft = daysUntil(dueDate);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(booking.return_due_date_override?.slice(0, 10) ?? isoDate(dueDate));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isOverridden = !!booking.return_due_date_override;

  // Default-Vorschlag (ohne Override)
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

  // Farb-Staffelung: überfällig/heute → rot, 1–3 → amber, 4–7 → cyan, sonst grau.
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
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: overdue ? '#ef4444' : '#e2e8f0' }}>
          {fmtDate(dueDate.toISOString())}
        </p>
        {isOverridden && (
          <span title="Manuell überschrieben" style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            manuell
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Rückgabe-Datum ändern"
          style={{ marginLeft: 4, padding: '0 4px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}
        >
          ✏
        </button>
      </div>
      <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
        Miete bis {fmtDate(booking.rental_to)} · {booking.delivery_mode === 'versand' ? 'Versand' : 'Abholung'}
      </p>
      <span
        style={{
          display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}40`,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Sendcloud-Etikett-Modal (dunkel, Inline-Styles) ─────────────────────────
// Bewusst Inline-Styles — die globalen .admin-dark-Overrides aus globals.css
// kippen sonst bg-white/border-Klassen per !important. Markup logisch 1:1 zur
// alten /admin/versand → Modal, nur ohne Tailwind-Klassen.

function LabelModal({
  booking, form, setForm, methods, methodsLoading, creating, result, onCreate, onClose,
}: {
  booking: FulfillmentBooking;
  form: LabelForm;
  setForm: React.Dispatch<React.SetStateAction<LabelForm>>;
  methods: ShippingMethod[];
  methodsLoading: boolean;
  creating: boolean;
  result: LabelResult | null;
  onCreate: () => void;
  onClose: () => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155',
    background: '#0f172a', color: '#e2e8f0', fontSize: 14, outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  };
  const btnPrimary: React.CSSProperties = {
    flex: 1, padding: '12px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
    background: '#06b6d4', color: 'white', border: 'none', cursor: 'pointer',
  };
  const btnSecondary: React.CSSProperties = {
    flex: 1, padding: '12px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
    background: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer',
  };
  const disabled = creating || !form.name.trim() || !form.address.trim() || !form.postalCode.trim() || !form.city.trim() || !form.methodId;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 16,
      }}
    >
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
          Sendcloud-Etikett erstellen
        </h2>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>Buchung {booking.id}</p>

        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 12, background: '#10b98122', border: '1px solid #10b98140', borderRadius: 10, fontSize: 13, color: '#6ee7b7' }}>
              ✓ Etikett wurde erfolgreich erstellt.
            </div>
            {result.labelUrl && (
              <a
                href={`/admin/pdf-viewer?u=${encodeURIComponent(`/api/admin/label/${booking.id}`)}&t=${encodeURIComponent('Versandetikett (A5)')}`}
                style={{ ...btnPrimary, textAlign: 'center', textDecoration: 'none', display: 'block' }}
              >
                📄 Versandetikett anzeigen
              </a>
            )}
            <button type="button" onClick={onClose} style={btnSecondary}>Schließen</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input type="text" value={form.name} placeholder="Vor- und Nachname"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Straße + Hausnummer *</label>
              <input type="text" value={form.address} placeholder="Musterstraße 12"
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>PLZ *</label>
                <input type="text" value={form.postalCode} placeholder="12345"
                  onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Stadt *</label>
                <input type="text" value={form.city} placeholder="Berlin"
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>E-Mail</label>
              <input type="email" value={form.email} placeholder="kunde@beispiel.de"
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Gewicht (kg)</label>
                <input type="number" step="0.1" min="0.1" value={form.weightKg}
                  onChange={(e) => setForm((f) => ({ ...f, weightKg: parseFloat(e.target.value) || 0.5 }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Versandmethode *</label>
                {methodsLoading ? (
                  <div style={{ ...inputStyle, color: '#64748b' }}>Lädt…</div>
                ) : (
                  <select value={form.methodId}
                    onChange={(e) => setForm((f) => ({ ...f, methodId: Number(e.target.value) }))}
                    style={inputStyle}
                  >
                    {methods.length === 0
                      ? <option value={0}>Keine Methoden geladen</option>
                      : methods.map((m) => (
                          <option key={m.id} value={m.id}>{m.carrier} – {m.name}</option>
                        ))
                    }
                  </select>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" onClick={onClose} disabled={creating} style={{ ...btnSecondary, opacity: creating ? 0.4 : 1 }}>
                Abbrechen
              </button>
              <button type="button" onClick={onCreate} disabled={disabled} style={{ ...btnPrimary, opacity: disabled ? 0.4 : 1 }}>
                {creating ? 'Erstelle Etikett…' : 'Versandetikett erstellen'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Retour-Etikett-Upload-Modal ─────────────────────────────────────────────

function ReturnUploadModal({
  booking, file, setFile, uploading, error, onUpload, onClose,
}: {
  booking: FulfillmentBooking;
  file: File | null;
  setFile: (f: File | null) => void;
  uploading: boolean;
  error: string | null;
  onUpload: () => void;
  onClose: () => void;
}) {
  const btnPrimary: React.CSSProperties = {
    flex: 1, padding: '12px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
    background: '#06b6d4', color: 'white', border: 'none', cursor: 'pointer',
  };
  const btnSecondary: React.CSSProperties = {
    flex: 1, padding: '12px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
    background: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer',
  };
  const disabled = uploading || !file;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 16,
      }}
    >
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 24, maxWidth: 440, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
          Retourlabel hochladen
        </h2>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          Buchung {booking.id} · Bild oder PDF wird auf A5 Hochformat konvertiert
        </p>

        <div style={{ padding: 12, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
          Lade hier das Retoure-Versandetikett (von DHL Online-Frankierung, DHL-
          Geschäftskundenportal o.ä.) als JPG, PNG oder PDF hoch. Wir wandeln es
          serverseitig in ein A5-Hochformat-PDF um und können es zusammen mit dem
          Hin-Etikett auf einen A4-Bogen drucken.
        </div>

        <label
          htmlFor="return-label-file"
          style={{
            display: 'block', padding: 20, border: '2px dashed #334155',
            borderRadius: 10, textAlign: 'center', cursor: 'pointer',
            background: file ? '#06b6d411' : '#0f172a',
            color: file ? '#22d3ee' : '#94a3b8',
            fontSize: 13, marginBottom: 14,
          }}
        >
          {file ? (
            <>
              <div style={{ fontSize: 22, marginBottom: 4 }}>📄</div>
              <div style={{ fontWeight: 600 }}>{file.name}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                {Math.round(file.size / 1024)} KB · {file.type || 'unbekannter Typ'}
              </div>
              <div style={{ fontSize: 11, color: '#06b6d4', marginTop: 6 }}>
                Klick zum Wechseln
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 22, marginBottom: 4 }}>⬆</div>
              <div>Datei wählen oder hierher ziehen</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                JPG, PNG oder PDF · max. 10 MB
              </div>
            </>
          )}
          <input
            id="return-label-file"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>

        {error && (
          <div style={{ padding: 10, background: '#ef444422', border: '1px solid #ef444440', borderRadius: 8, fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} disabled={uploading} style={{ ...btnSecondary, opacity: uploading ? 0.4 : 1 }}>
            Abbrechen
          </button>
          <button type="button" onClick={onUpload} disabled={disabled} style={{ ...btnPrimary, opacity: disabled ? 0.4 : 1 }}>
            {uploading ? 'Lädt hoch…' : 'Hochladen & konvertieren'}
          </button>
        </div>
      </div>
    </div>
  );
}

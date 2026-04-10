'use client';

import { useEffect, useState, useCallback } from 'react';
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
  notes: string | null;
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
  pending_verification: { label: 'Warte auf Freigabe', color: '#f59e0b', bg: '#f59e0b14' },
  awaiting_payment: { label: 'Warte auf Zahlung', color: '#8b5cf6', bg: '#8b5cf614' },
  confirmed: { label: 'Bestätigt', color: '#06b6d4', bg: '#06b6d414' },
  shipped: { label: 'Versendet', color: '#10b981', bg: '#10b98114' },
  picked_up: { label: 'Abgeholt', color: '#10b981', bg: '#10b98114' },
  completed: { label: 'Abgeschlossen', color: '#64748b', bg: '#64748b14' },
  cancelled: { label: 'Storniert', color: '#ef4444', bg: '#ef444414' },
  damaged: { label: 'Beschädigt', color: '#f97316', bg: '#f9731614' },
};

const ALL_STATUSES = ['pending_verification', 'awaiting_payment', 'confirmed', 'shipped', 'picked_up', 'completed', 'cancelled', 'damaged'];

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

  // ─── Gemeinsame Styles für A4-Dokumente ───
  const docStyles = `
    @page { size: A4 portrait; margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; padding: 20mm 25mm; max-width: none; min-height: 297mm; }
    h1 { font-size: 20pt; color: #1e3a5f; margin-bottom: 6px; border-bottom: 3px solid #1e3a5f; padding-bottom: 8px; }
    .subtitle { font-size: 9pt; color: #6b7280; margin-bottom: 20px; }
    h2 { font-size: 12pt; color: #1e3a5f; margin: 18px 0 8px; }
    .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 4px 12px; margin-bottom: 14px; }
    .info-label { font-size: 10pt; color: #6b7280; }
    .info-value { font-size: 11pt; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th { background: #eef2f7; padding: 5px 8px; text-align: left; font-size: 10pt; color: #4a5568; border: 1px solid #ccc; }
    td { padding: 4px 8px; border: 1px solid #ccc; }
    .check-section { margin: 12px 0; }
    .check-row { display: flex; gap: 28px; margin-bottom: 8px; flex-wrap: wrap; }
    .check-item { display: flex; align-items: center; gap: 6px; font-size: 10.5pt; }
    .checkbox { width: 14px; height: 14px; border: 2px solid #4a5568; display: inline-block; border-radius: 2px; flex-shrink: 0; }
    .line { border-bottom: 1px solid #333; width: 180px; display: inline-block; margin-left: 4px; }
    .line-short { width: 120px; }
    .line-long { width: 280px; }
    .confirm-text { font-size: 10pt; color: #4a5568; line-height: 1.5; margin: 10px 0; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 36px; }
    .sig-block { text-align: center; }
    .sig-line { border-top: 1px solid #333; width: 200px; margin-bottom: 4px; padding-top: 4px; }
    .sig-label { font-size: 9pt; color: #6b7280; }
    .toolbar { position: fixed; top: 0; left: 0; right: 0; background: #111827; padding: 12px 24px; display: flex; gap: 12px; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    .toolbar button { padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; }
    .btn-pdf { background: #06b6d4; color: #fff; }
    .btn-close { background: #374151; color: #e5e7eb; }
    .toolbar-spacer { height: 52px; }
    @media print { .toolbar, .toolbar-spacer { display: none !important; } body { padding: 0; } }`;

  const toolbarHtml = `<div class="toolbar"><button class="btn-pdf" onclick="window.print()">Als PDF speichern / Drucken</button><button class="btn-close" onclick="window.close()">Schließen</button></div><div class="toolbar-spacer"></div>`;

  const openPackliste = useCallback(() => {
    if (!booking) return;
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;
    const kundenName = booking.customer_name || customer?.full_name || '';
    const produktName = booking.product_name || '';
    const zeitraum = `${fmtDate(booking.rental_from)} – ${fmtDate(booking.rental_to)}`;
    const accRows = booking.accessories?.map((a, i) => `<tr><td style="width:40px">${i + 1}</td><td>${a}</td><td style="width:50px"></td></tr>`) ?? [];
    const emptyCount = Math.max(0, 10 - accRows.length);
    const zubehoerRows = accRows.join('') + Array.from({ length: emptyCount }, (_, i) => `<tr><td style="width:40px">${accRows.length + i + 1}</td><td></td><td style="width:50px"></td></tr>`).join('');
    const adresse = booking.shipping_address || (customer ? `${customer.address_street || ''}, ${customer.address_zip || ''} ${customer.address_city || ''}` : '');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Versand-Packliste – ${booking.id}</title><style>${docStyles}</style></head><body>
  ${toolbarHtml}
  <h1>Versand-Packliste</h1>
  <div class="subtitle">cam2rent – internes Versanddokument</div>
  <div class="info-grid">
    <span class="info-label">Buchungsnummer:</span><span class="info-value">${booking.id}</span>
    <span class="info-label">Kundenname:</span><span class="info-value">${kundenName}</span>
    <span class="info-label">Mietzeitraum:</span><span class="info-value">${zeitraum}</span>
    <span class="info-label">Versandart:</span><span class="info-value">${booking.shipping_method === 'express' ? 'Express-Versand' : 'Standard-Versand'}</span>
    <span class="info-label">Lieferadresse:</span><span class="info-value">${adresse}</span>
  </div>
  <h2>1. Versanddatum</h2>
  <p style="margin-bottom:12px">Datum: <strong>${dateStr}</strong></p>
  <h2>2. Versandgegenstand</h2>
  <div class="info-grid" style="margin-bottom:4px"><span class="info-label">Kamera / Gerät:</span><span class="info-value">${produktName}</span></div>
  <p style="margin-bottom:8px">Seriennummer: <span class="line line-short"></span></p>
  <p style="margin-bottom:4px;font-weight:600">Zubehör:</p>
  <table><thead><tr><th style="width:40px">Nr.</th><th>Bezeichnung</th><th style="width:50px">OK</th></tr></thead><tbody>${zubehoerRows}</tbody></table>
  <h2>3. Zustand bei Verpackung</h2>
  <div class="check-section">
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Gerät funktionsfähig getestet</div><div class="check-item"><span class="checkbox"></span> Keine sichtbaren Schäden</div></div>
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Sonstiges: <span class="line"></span></div></div>
  </div>
  <h2>4. Verpackungskontrolle</h2>
  <div class="check-section">
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Gerät sicher verpackt</div><div class="check-item"><span class="checkbox"></span> Zubehör vollständig</div></div>
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Paketinhalt dokumentiert (Foto/Video)</div><div class="check-item"><span class="checkbox"></span> Paketnummer: <span class="line line-short"></span></div></div>
  </div>
  <h2>5. Bestätigung</h2>
  <p class="confirm-text">Der Unterzeichner bestätigt die vollständige und ordnungsgemäße Verpackung des oben genannten Equipments.<br>Die Kontrolle wurde durch eine zweite Person gegengezeichnet.</p>
  <div class="sig-row"><div class="sig-block"><div class="sig-line"></div><div class="sig-label">(Packer, Ort/Datum)</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">(Kontrolleur, Ort/Datum)</div></div></div>
</body></html>`;

    const w = window.open('', '_blank', 'width=800,height=1100');
    if (w) { w.document.write(html); w.document.close(); }
  }, [booking, customer]);

  const openUebergabeprotokoll = useCallback(() => {
    if (!booking) return;
    const kundenName = booking.customer_name || customer?.full_name || '';
    const kundenEmail = booking.customer_email || customer?.email || '';
    const kundenAdresse = booking.shipping_address || (customer ? `${customer.address_street || ''}, ${customer.address_zip || ''} ${customer.address_city || ''}` : '');
    const zeitraum = `${fmtDate(booking.rental_from)} – ${fmtDate(booking.rental_to)}`;

    // Kameras mit Seriennummern — Produktnamen aufsplitten (kommagetrennt)
    const productNames = (booking.product_name || '').split(',').map((n: string) => n.trim()).filter(Boolean);
    const kameraRows = productNames.map((name: string) =>
      `<p style="margin-bottom:4px"><strong>Kamera:</strong> ${name} &nbsp;&nbsp;&nbsp;&nbsp; <strong>SN:</strong> <span class="line line-short"></span></p>`
    ).join('');

    // Zubehoer-Namen aufloesen (IDs → Namen aus AccessoriesProvider nicht verfuegbar, nutze IDs als Fallback)
    const accList = Array.isArray(booking.accessories) ? booking.accessories : [];
    const accRows2 = accList.map((a: string, i: number) => `<tr><td style="width:40px">${i + 1}</td><td>${a}</td><td style="width:50px"></td></tr>`);
    const emptyCount2 = Math.max(0, 10 - accRows2.length);
    const zubehoerRows = accRows2.join('') + Array.from({ length: emptyCount2 }, (_, i) => `<tr><td style="width:40px">${accRows2.length + i + 1}</td><td></td><td style="width:50px"></td></tr>`).join('');

    // Lieferart
    const lieferart = booking.delivery_mode === 'abholung' ? 'Abgeholt' : 'Versand';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Übergabeprotokoll – ${booking.id}</title><style>${docStyles}</style></head><body>
  ${toolbarHtml}
  <h1>Übergabeprotokoll – Kameraequipment</h1>
  <div class="subtitle">cam2rent – Buchung ${booking.id} · ${lieferart}</div>

  <div style="margin-bottom:16px">
    <p style="font-weight:700;margin-bottom:2px">Vermieter (Cam2Rent):</p>
    <p>Name: Lennart Schickel</p>
    <p>Adresse: Heimsbrunner Str. 12, 12349 Berlin</p>
  </div>

  <div style="margin-bottom:16px">
    <p style="font-weight:700;color:#1e3a5f;margin-bottom:4px">Mieter:</p>
    <div class="info-grid">
      <span class="info-label">Name:</span><span class="info-value">${kundenName || '<span class="line-long" style="display:inline-block;border-bottom:1px solid #333;width:250px"></span>'}</span>
      <span class="info-label">Adresse:</span><span class="info-value">${kundenAdresse || '<span class="line-long" style="display:inline-block;border-bottom:1px solid #333;width:250px"></span>'}</span>
      <span class="info-label">Ausweisnummer:</span><span class="info-value"><span class="line" style="width:220px"></span></span>
      <span class="info-label">Telefon / E-Mail:</span><span class="info-value">${kundenEmail || '<span class="line" style="width:220px"></span>'}</span>
    </div>
  </div>

  <h2>1. Übergabedatum & Ort</h2>
  <p style="margin-bottom:4px">Datum: <span class="line line-short"></span> &nbsp;&nbsp; Uhrzeit: <span class="line line-short"></span></p>
  <p style="margin-bottom:14px">Ort: <span class="line"></span></p>

  <h2>2. Mietgegenstand</h2>
  ${kameraRows}
  <p style="margin-bottom:6px;margin-top:12px;font-weight:600">Zubehör:</p>
  <table><thead><tr><th style="width:40px">Nr.</th><th>Bezeichnung</th><th style="width:50px">OK</th></tr></thead><tbody>${zubehoerRows}</tbody></table>

  <h2>3. Zustand bei Übergabe</h2>
  <div class="check-section">
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Gerät funktionsfähig getestet</div></div>
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Keine sichtbaren Schäden</div></div>
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Sonstiges: <span class="line"></span></div></div>
  </div>
  <p style="margin-top:8px">Fotos / Videos zur Dokumentation erstellt:</p>
  <div class="check-row" style="margin-top:6px"><div class="check-item"><span class="checkbox"></span> Ja</div><div class="check-item"><span class="checkbox"></span> Nein</div></div>

  <h2>4. Bestätigung der Übergabe</h2>
  <p class="confirm-text">Der Mieter bestätigt den ordnungsgemäßen Erhalt des oben genannten Equipments in beschriebenem Zustand.<br>Etwaige Schäden oder fehlendes Zubehör sind auf diesem Protokoll vermerkt.</p>
  <p class="confirm-text" style="font-size:9pt">Mietzeitraum: <strong>${zeitraum}</strong> &nbsp;|&nbsp; Buchung: <strong>${booking.id}</strong></p>

  <div class="sig-row"><div class="sig-block"><div class="sig-line"></div><div class="sig-label">(Vermieter, Ort/Datum)</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">(Mieter, Ort/Datum)</div></div></div>
</body></html>`;

    const w = window.open('', '_blank', 'width=800,height=1100');
    if (w) { w.document.write(html); w.document.close(); }
  }, [booking, customer]);

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
                {/* Freigeben-Button fuer pending Buchungen */}
                {(booking.status === 'pending_verification' || booking.status === 'awaiting_payment') && (
                  <div className="p-4 rounded-xl" style={{ background: '#f59e0b14', border: '1px solid #f59e0b40' }}>
                    <p className="text-xs font-heading font-semibold text-amber-600 uppercase tracking-wider mb-2">
                      {booking.status === 'pending_verification' ? 'Warte auf Freigabe' : 'Warte auf Zahlung'}
                    </p>
                    {booking.status === 'pending_verification' && (
                      <button
                        onClick={async () => {
                          if (!confirm('Buchung freigeben und Zahlungslink an den Kunden senden?')) return;
                          setStatusUpdating(true);
                          try {
                            const res = await fetch('/api/admin/approve-booking', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ bookingId: booking.id }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error);
                            alert('Zahlungslink wurde an den Kunden gesendet!');
                            window.location.reload();
                          } catch (err) {
                            alert(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`);
                          } finally {
                            setStatusUpdating(false);
                          }
                        }}
                        disabled={statusUpdating}
                        className="w-full px-4 py-2.5 text-sm font-heading font-semibold bg-amber-500 text-white rounded-btn hover:bg-amber-600 transition-colors disabled:opacity-40"
                      >
                        {statusUpdating ? 'Wird gesendet...' : 'Freigeben + Zahlungslink senden'}
                      </button>
                    )}
                    {booking.status === 'awaiting_payment' && booking.notes && (
                      <p className="text-xs font-body text-brand-steel mt-1">
                        {booking.notes}
                      </p>
                    )}
                  </div>
                )}

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
                  {booking.delivery_mode === 'versand' && (
                    <button
                      onClick={openPackliste}
                      className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-cyan-600 text-white rounded-btn hover:bg-cyan-700 transition-colors"
                    >
                      Versand-Packliste
                    </button>
                  )}
                  <a
                    href={`/api/invoice/${booking.id}`}
                    target="_blank"
                    className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors"
                  >
                    Rechnung herunterladen
                  </a>
                  {booking.delivery_mode === 'abholung' && (
                    <button
                      onClick={openUebergabeprotokoll}
                      className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-cyan-600 text-white rounded-btn hover:bg-cyan-700 transition-colors"
                    >
                      Übergabeprotokoll
                    </button>
                  )}
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

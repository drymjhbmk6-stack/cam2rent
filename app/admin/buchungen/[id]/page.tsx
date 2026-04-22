'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { BUSINESS } from '@/lib/business-config';

interface BookingDetail {
  id: string;
  payment_intent_id: string | null;
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
  coupon_code: string | null;
  discount_amount: number | null;
  duration_discount: number | null;
  loyalty_discount: number | null;
  label_url: string | null;
  return_label_url: string | null;
  unit_id: string | null;
  serial_number: string | null;
  stripe_payment_link_id: string | null;
}

interface RentalAgreement {
  id: string;
  pdf_url: string;
  contract_hash: string;
  signed_by_name: string;
  signed_at: string;
  ip_address: string;
  signature_method: string;
  created_at: string;
}

interface EmailLogEntry {
  id: string;
  email_type: string;
  subject: string | null;
  status: string;
  customer_email: string;
  resend_message_id: string | null;
  error_message: string | null;
  created_at: string;
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  booking_confirmation: 'Buchungsbestätigung',
  booking_admin: 'Admin-Benachrichtigung',
  cancellation_customer: 'Stornierung',
  cancellation_admin: 'Stornierung (Admin)',
  shipping_confirmation: 'Versandbestätigung',
  contract_signed: 'Mietvertrag',
  damage_report: 'Schadensmeldung',
  damage_resolution: 'Schadensabschluss',
  review_request: 'Bewertungsanfrage',
  extension_confirmation: 'Verlängerung',
  return_reminder: 'Rückgabe-Erinnerung',
  overdue_notice: 'Überfällig',
};

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
  const [agreement, setAgreement] = useState<RentalAgreement | null>(null);
  const [emails, setEmails] = useState<EmailLogEntry[]>([]);
  const [accessoryMap, setAccessoryMap] = useState<Record<string, string>>({});
  const [setMap, setSetMap] = useState<Record<string, { name: string; items: { accessory_id: string; qty: number }[] }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailToast, setEmailToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailAttachments, setEmailAttachments] = useState<{ rechnung: boolean; vertrag: boolean; agb: boolean; widerruf: boolean; haftung: boolean; datenschutz: boolean; impressum: boolean }>({ rechnung: true, vertrag: true, agb: false, widerruf: false, haftung: false, datenschutz: false, impressum: false });
  useEffect(() => {
    fetchBooking();
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchBooking() {
    setLoading(true);
    setError('');
    try {
      const [res, accRes, setsRes] = await Promise.all([
        fetch(`/api/admin/booking/${bookingId}`),
        fetch('/api/admin/accessories'),
        fetch('/api/sets'),
      ]);
      if (!res.ok) throw new Error('Nicht gefunden');
      const data = await res.json();
      setBooking(data.booking);
      setCustomer(data.customer ?? null);
      setAgreement(data.agreement ?? null);
      setEmails(data.emails ?? []);
      setNewStatus(data.booking.status);

      // Zubehör-Map (ID → Name)
      const accData = accRes.ok ? await accRes.json() : { accessories: [] };
      const aMap: Record<string, string> = {};
      for (const a of accData.accessories ?? []) aMap[a.id] = a.name;
      setAccessoryMap(aMap);

      // Sets-Map (ID → { name, items })
      const sData = setsRes.ok ? await setsRes.json() : { sets: [] };
      const sMap: Record<string, { name: string; items: { accessory_id: string; qty: number }[] }> = {};
      for (const s of sData.sets ?? []) sMap[s.id] = { name: s.name, items: s.accessory_items ?? [] };
      setSetMap(sMap);
    } catch {
      setError('Buchung konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!booking) return;
    const recipient = emailRecipient || booking.customer_email;
    if (!recipient) return;
    setEmailSending(true);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          attachRechnung: emailAttachments.rechnung,
          attachVertrag: emailAttachments.vertrag,
          legalDocs: ['agb', 'widerruf', 'haftung', 'datenschutz', 'impressum']
            .filter(key => emailAttachments[key as keyof typeof emailAttachments]),
        }),
      });
      if (res.ok) {
        setEmailToast({ msg: 'E-Mail erfolgreich gesendet', type: 'ok' });
        setShowEmailModal(false);
        fetchBooking(); // E-Mail-Verlauf aktualisieren
      } else {
        const err = await res.json();
        setEmailToast({ msg: err.error || 'Fehler beim Senden', type: 'err' });
      }
    } catch {
      setEmailToast({ msg: 'Netzwerkfehler beim Senden', type: 'err' });
    } finally {
      setEmailSending(false);
      setTimeout(() => setEmailToast(null), 4000);
    }
  }

  async function handleResendPaymentLink() {
    if (!booking) return;
    const recipient = emailRecipient || booking.customer_email;
    if (!recipient) {
      setEmailToast({ msg: 'Keine Empfänger-E-Mail', type: 'err' });
      setTimeout(() => setEmailToast(null), 4000);
      return;
    }
    setEmailSending(true);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}/resend-payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient }),
      });
      if (res.ok) {
        setEmailToast({ msg: 'Zahlungs-Link erneut gesendet', type: 'ok' });
        setShowEmailModal(false);
        fetchBooking();
      } else {
        const err = await res.json().catch(() => ({}));
        setEmailToast({ msg: err.error || 'Fehler beim Senden', type: 'err' });
      }
    } catch {
      setEmailToast({ msg: 'Netzwerkfehler beim Senden', type: 'err' });
    } finally {
      setEmailSending(false);
      setTimeout(() => setEmailToast(null), 4000);
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

  async function handleCancel() {
    if (!booking || !cancelReason.trim()) return;
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancellation_reason: cancelReason.trim() }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Fehler.'); return; }
      setBooking((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
      setNewStatus('cancelled');
      setShowCancelModal(false);
      setCancelReason('');
    } catch { alert('Netzwerkfehler.'); }
    finally { setStatusUpdating(false); }
  }

  async function handleDelete() {
    if (!booking) return;
    setDeleteError('');
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error ?? 'Fehler.'); return; }
      window.location.href = '/admin/buchungen';
    } catch { setDeleteError('Netzwerkfehler.'); }
  }

  // ─── Zubehör-IDs auflösen (Sets → Einzelteile) ───
  function resolveAccessoryNames(accIds: string[]): string[] {
    const result: string[] = [];
    for (const id of accIds) {
      const setInfo = setMap[id];
      if (setInfo) {
        // Set → Einzelteile auflösen
        result.push(`── ${setInfo.name} ──`);
        for (const item of setInfo.items) {
          const accName = accessoryMap[item.accessory_id] || item.accessory_id;
          result.push(item.qty > 1 ? `${item.qty}x ${accName}` : accName);
        }
      } else {
        // Einzelnes Zubehör
        result.push(accessoryMap[id] || id.replace(/-[a-z0-9]{6,}$/, '').split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      }
    }
    return result;
  }

  // ─── Gemeinsame Styles für A4-Dokumente (kompakt, 1 Seite) ───
  const docStyles = `
    @page { size: A4 portrait; margin: 12mm 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9pt; color: #1a1a1a; padding: 12mm 15mm; max-width: none; }
    h1 { font-size: 14pt; color: #1e3a5f; margin-bottom: 2px; border-bottom: 2px solid #1e3a5f; padding-bottom: 4px; }
    .subtitle { font-size: 8pt; color: #6b7280; margin-bottom: 10px; }
    h2 { font-size: 10pt; color: #1e3a5f; margin: 10px 0 4px; }
    .info-grid { display: grid; grid-template-columns: 120px 1fr; gap: 1px 8px; margin-bottom: 8px; }
    .info-label { font-size: 8pt; color: #6b7280; }
    .info-value { font-size: 9pt; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th { background: #eef2f7; padding: 3px 6px; text-align: left; font-size: 8pt; color: #4a5568; border: 1px solid #ccc; }
    td { padding: 2px 6px; border: 1px solid #ccc; font-size: 8.5pt; }
    .check-section { margin: 6px 0; }
    .check-row { display: flex; gap: 20px; margin-bottom: 4px; flex-wrap: wrap; }
    .check-item { display: flex; align-items: center; gap: 4px; font-size: 8.5pt; }
    .checkbox { width: 11px; height: 11px; border: 1.5px solid #4a5568; display: inline-block; border-radius: 2px; flex-shrink: 0; }
    .line { border-bottom: 1px solid #333; width: 160px; display: inline-block; margin-left: 4px; }
    .line-short { width: 100px; }
    .line-long { width: 240px; }
    .confirm-text { font-size: 8pt; color: #4a5568; line-height: 1.4; margin: 4px 0; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 20px; }
    .sig-block { text-align: center; }
    .sig-line { border-top: 1px solid #333; width: 180px; margin-bottom: 2px; padding-top: 2px; }
    .sig-label { font-size: 7.5pt; color: #6b7280; }
    .toolbar { position: fixed; top: 0; left: 0; right: 0; background: #111827; padding: 8px 24px; display: flex; gap: 12px; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    .toolbar button { padding: 6px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; }
    .btn-pdf { background: #06b6d4; color: #fff; }
    .btn-close { background: #374151; color: #e5e7eb; }
    .toolbar-spacer { height: 40px; }
    @media print { .toolbar, .toolbar-spacer { display: none !important; } body { padding: 0; } }`;

  const toolbarHtml = `<div class="toolbar"><button class="btn-pdf" onclick="window.print()">Als PDF speichern / Drucken</button><button class="btn-close" onclick="window.close()">Schließen</button></div><div class="toolbar-spacer"></div>`;

  const openPackliste = useCallback(() => {
    if (!booking) return;
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;
    const kundenName = booking.customer_name || customer?.full_name || '';
    const produktName = booking.product_name || '';
    const zeitraum = `${fmtDate(booking.rental_from)} – ${fmtDate(booking.rental_to)}`;
    const resolvedAcc = resolveAccessoryNames(booking.accessories ?? []);
    let accNum = 0;
    const accRows = resolvedAcc.map((name) => {
      const isSetHeader = name.startsWith('── ');
      if (isSetHeader) {
        return `<tr><td style="width:40px"></td><td style="font-weight:700;font-size:9pt;color:#1e3a5f;padding-top:6px">${name}</td><td style="width:50px"></td></tr>`;
      }
      accNum++;
      return `<tr><td style="width:40px">${accNum}</td><td>${name}</td><td style="width:50px"></td></tr>`;
    });
    const emptyCount = accNum > 0 ? 0 : 2;
    const zubehoerRows = accRows.join('') + Array.from({ length: emptyCount }, (_, i) => `<tr><td style="width:40px">${accNum + i + 1}</td><td></td><td style="width:50px"></td></tr>`).join('');
    const adresse = booking.shipping_address || (customer ? `${customer.address_street || ''}, ${customer.address_zip || ''} ${customer.address_city || ''}` : '');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Versand-Packliste – ${booking.id}</title><style>${docStyles}</style></head><body>
  ${toolbarHtml}
  <h1>Versand-Packliste</h1>
  <div class="subtitle">cam2rent · ${booking.id} · ${dateStr}</div>
  <div style="display:flex;gap:24px;margin-bottom:8px">
    <div class="info-grid" style="flex:1">
      <span class="info-label">Kunde:</span><span class="info-value">${kundenName}</span>
      <span class="info-label">Zeitraum:</span><span class="info-value">${zeitraum}</span>
      <span class="info-label">Versandart:</span><span class="info-value">${booking.shipping_method === 'express' ? 'Express' : 'Standard'}</span>
    </div>
    <div class="info-grid" style="flex:1">
      <span class="info-label">Adresse:</span><span class="info-value">${adresse}</span>
    </div>
  </div>
  <h2>1. Versandgegenstand</h2>
  <div style="display:flex;gap:16px;margin-bottom:4px">
    <span><strong>Kamera:</strong> ${produktName}</span>
    <span><strong>SN:</strong> ${booking.serial_number || '<span class="line line-short"></span>'}</span>
  </div>
  <p style="margin:4px 0 2px;font-weight:600;font-size:8.5pt">Zubehör:</p>
  <table><thead><tr><th style="width:30px">Nr.</th><th>Bezeichnung</th><th style="width:40px">OK</th></tr></thead><tbody>${zubehoerRows}</tbody></table>
  <h2>2. Zustand & Verpackung</h2>
  <div class="check-section">
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Funktionsfähig getestet</div><div class="check-item"><span class="checkbox"></span> Keine Schäden</div><div class="check-item"><span class="checkbox"></span> Sicher verpackt</div><div class="check-item"><span class="checkbox"></span> Zubehör vollständig</div></div>
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Inhalt dokumentiert (Foto/Video)</div><div class="check-item"><span class="checkbox"></span> Paketnr.: <span class="line line-short"></span></div><div class="check-item"><span class="checkbox"></span> Sonstiges: <span class="line"></span></div></div>
  </div>
  <h2>3. Bestätigung</h2>
  <p class="confirm-text">Vollständige und ordnungsgemäße Verpackung bestätigt. Kontrolle durch zweite Person gegengezeichnet.</p>
  <div class="sig-row"><div class="sig-block"><div class="sig-line"></div><div class="sig-label">(Packer, Ort/Datum)</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">(Kontrolleur, Ort/Datum)</div></div></div>
</body></html>`;

    const w = window.open('', '_blank', 'width=800,height=1100');
    if (w) { w.document.write(html); w.document.close(); }
  }, [booking, customer, accessoryMap, setMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const openÜbergabeprotokoll = useCallback(() => {
    if (!booking) return;
    const kundenName = booking.customer_name || customer?.full_name || '';
    const kundenEmail = booking.customer_email || customer?.email || '';
    const kundenAdresse = booking.shipping_address || (customer ? `${customer.address_street || ''}, ${customer.address_zip || ''} ${customer.address_city || ''}` : '');
    const zeitraum = `${fmtDate(booking.rental_from)} – ${fmtDate(booking.rental_to)}`;

    // Kameras mit Seriennummern — Produktnamen aufsplitten (kommagetrennt)
    const productNames = (booking.product_name || '').split(',').map((n: string) => n.trim()).filter(Boolean);
    const kameraRows = productNames.map((name: string) =>
      `<p style="margin-bottom:2px"><strong>Kamera:</strong> ${name} &nbsp;&nbsp; <strong>SN:</strong> ${booking.serial_number || '<span class="line line-short"></span>'}</p>`
    ).join('');

    // Zubehör-Namen auflösen (Sets → Einzelteile)
    const resolvedAcc2 = resolveAccessoryNames(Array.isArray(booking.accessories) ? booking.accessories : []);
    let accNum2 = 0;
    const accRows2 = resolvedAcc2.map((name: string) => {
      const isSetHeader = name.startsWith('── ');
      if (isSetHeader) {
        return `<tr><td style="width:40px"></td><td style="font-weight:700;font-size:9pt;color:#1e3a5f;padding-top:6px">${name}</td><td style="width:50px"></td></tr>`;
      }
      accNum2++;
      return `<tr><td style="width:40px">${accNum2}</td><td>${name}</td><td style="width:50px"></td></tr>`;
    });
    const emptyCount2 = accNum2 > 0 ? 0 : 2;
    const zubehoerRows = accRows2.join('') + Array.from({ length: emptyCount2 }, (_, i) => `<tr><td style="width:40px">${accNum2 + i + 1}</td><td></td><td style="width:50px"></td></tr>`).join('');

    // Lieferart
    const lieferart = booking.delivery_mode === 'abholung' ? 'Abgeholt' : 'Versand';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Übergabeprotokoll – ${booking.id}</title><style>${docStyles}</style></head><body>
  ${toolbarHtml}
  <h1>Übergabeprotokoll</h1>
  <div class="subtitle">cam2rent · ${booking.id} · ${lieferart}</div>

  <div style="display:flex;gap:20px;margin-bottom:8px">
    <div style="flex:1">
      <p style="font-weight:700;font-size:8pt;color:#1e3a5f;margin-bottom:2px">Vermieter</p>
      <p style="font-size:8.5pt">${BUSINESS.owner} · ${BUSINESS.fullAddress}</p>
    </div>
    <div style="flex:1">
      <p style="font-weight:700;font-size:8pt;color:#1e3a5f;margin-bottom:2px">Mieter</p>
      <div class="info-grid" style="grid-template-columns:90px 1fr;margin-bottom:0">
        <span class="info-label">Name:</span><span class="info-value">${kundenName || '<span style="display:inline-block;border-bottom:1px solid #333;width:140px"></span>'}</span>
        <span class="info-label">Adresse:</span><span class="info-value">${kundenAdresse || '<span style="display:inline-block;border-bottom:1px solid #333;width:140px"></span>'}</span>
        <span class="info-label">Ausweis-Nr.:</span><span class="info-value"><span class="line" style="width:140px"></span></span>
        <span class="info-label">Tel. / E-Mail:</span><span class="info-value">${kundenEmail || '<span class="line" style="width:140px"></span>'}</span>
      </div>
    </div>
  </div>

  <h2>1. Übergabe</h2>
  <p style="margin-bottom:6px">Datum: <span class="line line-short"></span> &nbsp; Uhrzeit: <span class="line line-short"></span> &nbsp; Ort: <span class="line"></span></p>

  <h2>2. Mietgegenstand</h2>
  ${kameraRows}
  <p style="margin:4px 0 2px;font-weight:600;font-size:8.5pt">Zubehör:</p>
  <table><thead><tr><th style="width:30px">Nr.</th><th>Bezeichnung</th><th style="width:40px">OK</th></tr></thead><tbody>${zubehoerRows}</tbody></table>

  <h2>3. Zustand bei Übergabe</h2>
  <div class="check-section">
    <div class="check-row"><div class="check-item"><span class="checkbox"></span> Funktionsfähig getestet</div><div class="check-item"><span class="checkbox"></span> Keine sichtbaren Schäden</div><div class="check-item"><span class="checkbox"></span> Fotos/Videos erstellt</div><div class="check-item"><span class="checkbox"></span> Sonstiges: <span class="line line-short"></span></div></div>
  </div>

  <h2>4. Bestätigung</h2>
  <p class="confirm-text">Der Mieter bestätigt den ordnungsgemäßen Erhalt des Equipments in beschriebenem Zustand. Schäden oder fehlendes Zubehör sind vermerkt.</p>
  <p class="confirm-text">Mietzeitraum: <strong>${zeitraum}</strong> · Buchung: <strong>${booking.id}</strong></p>
  <div class="sig-row"><div class="sig-block"><div class="sig-line"></div><div class="sig-label">(Vermieter, Ort/Datum)</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">(Mieter, Ort/Datum)</div></div></div>
</body></html>`;

    const w = window.open('', '_blank', 'width=800,height=1100');
    if (w) { w.document.write(html); w.document.close(); }
  }, [booking, customer, accessoryMap, setMap]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <AdminBackLink href="/admin/buchungen" label="Zurück zu Buchungen" />
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-body">
            {error || 'Buchung nicht gefunden.'}
          </div>
        </div>
      </div>
    );
  }

  const sc = STATUS_CONFIG[booking.status] ?? { label: booking.status, color: '#94a3b8', bg: '#94a3b814' };

  const totalDiscount = (booking.discount_amount ?? 0) + (booking.duration_discount ?? 0) + (booking.loyalty_discount ?? 0);

  async function quickStatusChange(targetStatus: string, label: string) {
    if (!confirm(`Status wirklich auf "${label}" ändern?`)) return;
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (!res.ok) { alert('Fehler beim Aktualisieren.'); return; }
      setBooking((prev) => prev ? { ...prev, status: targetStatus } : prev);
      setNewStatus(targetStatus);
    } catch { alert('Netzwerkfehler.'); } finally { setStatusUpdating(false); }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <AdminBackLink href="/admin/buchungen" label="Zurück zu Buchungen" />
            <div className="flex items-center gap-3 mt-1">
              <h1 className="font-heading font-bold text-2xl text-brand-black">{booking.id}</h1>
              <span className="inline-flex px-3 py-1 rounded-full text-xs font-heading font-semibold" style={{ color: sc.color, backgroundColor: sc.bg, border: `1px solid ${sc.color}30` }}>{sc.label}</span>
            </div>
            <p className="text-sm font-body text-brand-muted mt-1">Erstellt am {fmtDateTime(booking.created_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            {booking.status === 'shipped' && (
              <button onClick={() => quickStatusChange('completed', 'Zugestellt / Abgeschlossen')} disabled={statusUpdating} className="px-4 py-2 text-sm font-heading font-semibold bg-green-600 text-white rounded-btn hover:bg-green-700 transition-colors disabled:opacity-40">
                Als zugestellt markieren
              </button>
            )}
            {booking.status === 'confirmed' && booking.delivery_mode === 'abholung' && (
              <button onClick={() => quickStatusChange('picked_up', 'Abgeholt')} disabled={statusUpdating} className="px-4 py-2 text-sm font-heading font-semibold bg-green-600 text-white rounded-btn hover:bg-green-700 transition-colors disabled:opacity-40">
                Als abgeholt markieren
              </button>
            )}
          </div>
        </div>

        {/* Suspicious warning */}
        {booking.suspicious && (
          <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <div>
              <p className="text-sm font-heading font-semibold text-amber-800">Verdächtige Buchung</p>
              {booking.suspicious_reasons?.length > 0 && <p className="text-xs font-body text-amber-700 mt-0.5">{booking.suspicious_reasons.join(', ')}</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ═══ Left column: 2/3 ═══ */}
          <div className="lg:col-span-2 space-y-6">

            {/* Buchungsdaten */}
            <Section title="Buchungsdaten">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Produkt" value={booking.product_name} />
                {booking.serial_number && <InfoRow label="Seriennummer" value={booking.serial_number} highlight />}
                <InfoRow label="Mietdauer" value={`${booking.days} Tag${booking.days !== 1 ? 'e' : ''}`} />
                <InfoRow label="Von" value={fmtDate(booking.rental_from)} />
                <InfoRow label="Bis" value={fmtDate(booking.rental_to)} />
                {booking.extended_at && <InfoRow label="Verlängert" value={`Ursprünglich bis ${booking.original_rental_to ? fmtDate(booking.original_rental_to) : '\u2013'}`} highlight />}
                <InfoRow label="Lieferart" value={booking.delivery_mode === 'versand' ? 'Versand' : 'Abholung'} />
                {booking.shipping_method && <InfoRow label="Versandart" value={booking.shipping_method === 'express' ? 'Express' : 'Standard'} />}
                <InfoRow label="Haftungsoption" value={booking.haftung === 'standard' ? 'Standard-Haftungsschutz' : booking.haftung === 'premium' ? 'Premium-Haftungsschutz' : 'Keine Haftungsbegrenzung'} />
              </div>
              {booking.payment_intent_id && (
                <div className="mt-4 pt-4 border-t border-brand-border">
                  <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Payment Intent</p>
                  <p className="text-xs font-mono text-brand-steel break-all">{booking.payment_intent_id}</p>
                </div>
              )}
              {booking.notes && (
                <div className="mt-4 pt-4 border-t border-brand-border">
                  <InfoRow label="Notizen" value={booking.notes} />
                </div>
              )}
            </Section>

            {/* Preisaufstellung */}
            <Section title="Preisaufstellung">
              <div className="space-y-2">
                <PriceRow label={`Miete (${booking.days} ${booking.days === 1 ? 'Tag' : 'Tage'})`} amount={booking.price_rental} />
                {booking.price_accessories > 0 && <PriceRow label="Zubehör" amount={booking.price_accessories} />}
                {booking.price_haftung > 0 && <PriceRow label="Haftungsschutz" amount={booking.price_haftung} />}
                {(booking.shipping_price ?? 0) > 0 && <PriceRow label="Versand" amount={booking.shipping_price!} />}
                {(booking.discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-body text-green-600">Gutschein ({booking.coupon_code})</span>
                    <span className="text-sm font-body text-green-600">-{fmtEuro(booking.discount_amount!)}</span>
                  </div>
                )}
                {(booking.duration_discount ?? 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-body text-green-600">Mengenrabatt</span>
                    <span className="text-sm font-body text-green-600">-{fmtEuro(booking.duration_discount!)}</span>
                  </div>
                )}
                {(booking.loyalty_discount ?? 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-body text-green-600">Treuerabatt</span>
                    <span className="text-sm font-body text-green-600">-{fmtEuro(booking.loyalty_discount!)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-brand-border">
                  <span className="font-heading font-bold text-sm text-brand-black">Gesamt</span>
                  <span className="font-heading font-bold text-sm text-brand-black">{fmtEuro(booking.price_total)}</span>
                </div>
                {totalDiscount > 0 && (
                  <p className="text-xs text-brand-muted">Rabatte gesamt: {fmtEuro(totalDiscount)}</p>
                )}
              </div>
              {booking.deposit > 0 && (
                <div className="mt-4 pt-4 border-t border-brand-border flex items-center gap-3">
                  <span className="text-sm font-body text-brand-steel">Kaution:</span>
                  <span className="font-heading font-semibold text-sm text-brand-black">{fmtEuro(booking.deposit)}</span>
                  <DepositBadge status={booking.deposit_status} />
                </div>
              )}
            </Section>

            {/* Zubehör */}
            {booking.accessories && booking.accessories.length > 0 && (
              <Section title="Zubehör & Set">
                <div className="flex flex-wrap gap-2">
                  {booking.accessories.map((a, i) => {
                    const name = a.replace(/-[a-z0-9]{6,}$/, '').split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    return <span key={i} className="px-2.5 py-1 bg-brand-bg rounded-full text-xs font-body text-brand-steel">{name}</span>;
                  })}
                </div>
              </Section>
            )}

            {/* Versand & Tracking */}
            <Section title="Versand & Tracking">
              {booking.delivery_mode === 'versand' ? (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InfoRow label="Trackingnummer" value={booking.tracking_number || '\u2013'} />
                    <InfoRow label="Versandt am" value={booking.shipped_at ? fmtDateTime(booking.shipped_at) : '\u2013'} />
                    {booking.tracking_url && (
                      <div>
                        <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Tracking-Link</p>
                        <a href={booking.tracking_url} target="_blank" rel="noopener noreferrer" className="text-sm font-body text-accent-blue hover:underline break-all">Sendung verfolgen</a>
                      </div>
                    )}
                    {booking.shipping_address && (
                      <div>
                        <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Lieferadresse</p>
                        <p className="text-sm font-body text-brand-black whitespace-pre-line">{booking.shipping_address}</p>
                      </div>
                    )}
                    <InfoRow label="Rückgabe" value={booking.returned_at ? fmtDateTime(booking.returned_at) : 'Noch nicht zurück'} />
                    {booking.return_condition && <InfoRow label="Zustand" value={booking.return_condition} />}
                  </div>
                  {booking.return_notes && (
                    <div className="mt-3 pt-3 border-t border-brand-border">
                      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Rückgabe-Notizen</p>
                      <p className="text-sm font-body text-brand-black">{booking.return_notes}</p>
                    </div>
                  )}
                  {/* Labels */}
                  {(booking.label_url || booking.return_label_url) && (
                    <div className="mt-3 pt-3 border-t border-brand-border flex flex-wrap gap-2">
                      {booking.label_url && <a href={booking.label_url} target="_blank" className="text-xs font-heading font-semibold text-accent-blue hover:underline">Versandlabel</a>}
                      {booking.return_label_url && <a href={`/api/admin/return-label/${booking.id}`} target="_blank" className="text-xs font-heading font-semibold text-accent-blue hover:underline">Rücksendeetikett</a>}
                    </div>
                  )}
                  {/* Quick actions */}
                  <div className="mt-4 pt-4 border-t border-brand-border flex flex-wrap gap-2">
                    {booking.status === 'confirmed' && <Link href="/admin/versand" className="px-3 py-1.5 text-xs font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors">Zum Versand</Link>}
                    {booking.status === 'shipped' && (
                      <button onClick={() => quickStatusChange('completed', 'Zugestellt / Abgeschlossen')} disabled={statusUpdating} className="px-3 py-1.5 text-xs font-heading font-semibold bg-green-600 text-white rounded-btn hover:bg-green-700 transition-colors disabled:opacity-40">Als zugestellt markieren</button>
                    )}
                    {(booking.status === 'shipped' || booking.status === 'picked_up') && <Link href="/admin/retouren" className="px-3 py-1.5 text-xs font-heading font-semibold bg-cyan-600 text-white rounded-btn hover:bg-cyan-700 transition-colors">Rückgabe prüfen</Link>}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-body text-brand-muted mb-3">Selbstabholung</p>
                  {booking.status === 'confirmed' && (
                    <button onClick={() => quickStatusChange('picked_up', 'Abgeholt')} disabled={statusUpdating} className="px-3 py-1.5 text-xs font-heading font-semibold bg-green-600 text-white rounded-btn hover:bg-green-700 transition-colors disabled:opacity-40">Als abgeholt markieren</button>
                  )}
                </div>
              )}
            </Section>

            {/* Mietvertrag */}
            <Section title="Mietvertrag">
              {booking.contract_signed ? (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-heading font-semibold bg-green-100 text-green-700">Unterschrieben</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow label="Unterzeichnet am" value={booking.contract_signed_at ? fmtDateTime(booking.contract_signed_at) : '\u2013'} />
                    {agreement && (
                      <>
                        <InfoRow label="Unterzeichner" value={agreement.signed_by_name} />
                        <InfoRow label="Methode" value={agreement.signature_method === 'canvas' ? 'Canvas-Unterschrift' : 'Getippter Name'} />
                        <InfoRow label="IP-Adresse" value={agreement.ip_address} />
                      </>
                    )}
                  </div>
                  {agreement?.contract_hash && (
                    <div className="mt-3 pt-3 border-t border-brand-border">
                      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Dokument-Hash (SHA-256)</p>
                      <p className="text-xs font-mono text-brand-steel break-all">{agreement.contract_hash}</p>
                    </div>
                  )}
                  <a href={`/api/rental-contract/${booking.id}`} target="_blank" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-heading font-semibold bg-teal-600 text-white rounded-btn hover:bg-teal-700 transition-colors mt-4">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Vertrag PDF herunterladen
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-heading font-semibold bg-red-100 text-red-600">Ausstehend</span>
                  <span className="text-sm font-body text-brand-muted">Noch nicht unterschrieben</span>
                  <a
                    href={`/admin/buchungen/${booking.id}/vertrag-unterschreiben`}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-heading font-semibold bg-amber-500 text-white rounded-btn hover:bg-amber-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    Jetzt unterschreiben
                  </a>
                </div>
              )}
            </Section>

            {/* E-Mail-Verlauf */}
            {emails.length > 0 && (
              <Section title="E-Mail-Verlauf">
                <div className="space-y-3">
                  {emails.map((em) => (
                    <div key={em.id} className="flex items-start justify-between gap-3 py-2 border-b border-brand-border last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-heading font-semibold text-brand-black">
                          {EMAIL_TYPE_LABELS[em.email_type] || em.email_type}
                        </p>
                        {em.subject && <p className="text-xs font-body text-brand-muted truncate">{em.subject}</p>}
                        <p className="text-xs font-body text-brand-muted">{em.customer_email}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-heading font-semibold ${em.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {em.status === 'sent' ? 'Gesendet' : 'Fehler'}
                        </span>
                        <span className="text-xs text-brand-muted whitespace-nowrap">{fmtDateTime(em.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Statusverlauf */}
            <Section title="Statusverlauf">
              <div className="space-y-4">
                <TimelineItem label="Buchung erstellt" date={fmtDateTime(booking.created_at)} status="confirmed" active />
                {booking.contract_signed_at && <TimelineItem label="Vertrag unterschrieben" date={fmtDateTime(booking.contract_signed_at)} status="confirmed" active />}
                {booking.shipped_at && <TimelineItem label="Versendet" date={fmtDateTime(booking.shipped_at)} status="shipped" active />}
                {booking.status === 'picked_up' && <TimelineItem label="Abgeholt" date="" status="shipped" active />}
                {booking.extended_at && <TimelineItem label="Verlängert" date={fmtDateTime(booking.extended_at)} status="confirmed" active />}
                {booking.returned_at && <TimelineItem label="Zurückgegeben" date={fmtDateTime(booking.returned_at)} status="completed" active />}
                {booking.status === 'completed' && !booking.returned_at && <TimelineItem label="Abgeschlossen" date="" status="completed" active />}
                {booking.status === 'cancelled' && <TimelineItem label="Storniert" date="" status="cancelled" active />}
                {booking.status === 'damaged' && <TimelineItem label="Beschädigt gemeldet" date="" status="damaged" active />}
              </div>
            </Section>
          </div>

          {/* ═══ Right column: 1/3 ═══ */}
          <div className="space-y-6">

            {/* Kundendaten */}
            <Section title="Kundendaten">
              <div className="space-y-3">
                <InfoRow label="Name" value={booking.customer_name || customer?.full_name || '\u2013'} />
                <div>
                  <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">E-Mail</p>
                  {editingEmail ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="email"
                        value={emailDraft}
                        onChange={e => setEmailDraft(e.target.value)}
                        placeholder="E-Mail eingeben"
                        className="flex-1 px-2.5 py-1.5 text-sm font-body rounded-lg border border-brand-border bg-brand-card text-brand-black focus:outline-none focus:border-accent-cyan"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            (async () => {
                              setEmailSaving(true);
                              try {
                                const res = await fetch(`/api/admin/booking/${booking.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_email: emailDraft.trim() }) });
                                if (!res.ok) throw new Error('Fehler');
                                setBooking({ ...booking, customer_email: emailDraft.trim() || null });
                                setEditingEmail(false);
                              } catch { alert('E-Mail konnte nicht gespeichert werden.'); }
                              finally { setEmailSaving(false); }
                            })();
                          }
                          if (e.key === 'Escape') setEditingEmail(false);
                        }}
                      />
                      <button
                        onClick={async () => {
                          setEmailSaving(true);
                          try {
                            const res = await fetch(`/api/admin/booking/${booking.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_email: emailDraft.trim() }) });
                            if (!res.ok) throw new Error('Fehler');
                            setBooking({ ...booking, customer_email: emailDraft.trim() || null });
                            setEditingEmail(false);
                          } catch { alert('E-Mail konnte nicht gespeichert werden.'); }
                          finally { setEmailSaving(false); }
                        }}
                        disabled={emailSaving}
                        className="px-2.5 py-1.5 text-xs font-heading font-semibold rounded-lg bg-accent-cyan text-white hover:bg-accent-cyan/80 disabled:opacity-40"
                      >
                        {emailSaving ? '...' : 'OK'}
                      </button>
                      <button
                        onClick={() => setEditingEmail(false)}
                        className="px-2.5 py-1.5 text-xs font-heading font-semibold rounded-lg bg-brand-border text-brand-muted hover:bg-brand-border/80"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {(booking.customer_email || customer?.email) ? (
                        <a href={`mailto:${booking.customer_email || customer?.email}`} className="text-sm font-body text-accent-blue hover:underline">{booking.customer_email || customer?.email}</a>
                      ) : (
                        <span className="text-sm font-body text-brand-muted">–</span>
                      )}
                      <button
                        onClick={() => { setEmailDraft(booking.customer_email || customer?.email || ''); setEditingEmail(true); }}
                        className="text-brand-muted hover:text-accent-cyan transition-colors"
                        title="E-Mail bearbeiten"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                    </div>
                  )}
                </div>
                {customer?.phone && <InfoRow label="Telefon" value={customer.phone} />}
                {customer?.address_street && (
                  <div>
                    <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Adresse</p>
                    <p className="text-sm font-body text-brand-black">{customer.address_street}<br />{customer.address_zip} {customer.address_city}</p>
                  </div>
                )}
                {customer?.blacklisted && <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-heading font-semibold bg-red-100 text-red-600">GESPERRT</span>}
                {customer?.verification_status && <InfoRow label="Verifizierung" value={customer.verification_status} />}
              </div>
            </Section>

            {/* Aktionen */}
            <Section title="Aktionen">
              <div className="space-y-4">
                {(booking.status === 'pending_verification' || booking.status === 'awaiting_payment') && (
                  <div className="p-4 rounded-xl" style={{ background: '#f59e0b14', border: '1px solid #f59e0b40' }}>
                    <p className="text-xs font-heading font-semibold text-amber-600 uppercase tracking-wider mb-2">
                      {booking.status === 'pending_verification' ? 'Warte auf Freigabe' : 'Warte auf Zahlung'}
                    </p>
                    {booking.status === 'pending_verification' && (
                      <button onClick={async () => {
                        if (!confirm('Buchung freigeben und Zahlungslink an den Kunden senden?')) return;
                        setStatusUpdating(true);
                        try {
                          const res = await fetch('/api/admin/approve-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id }) });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error);
                          alert('Zahlungslink wurde an den Kunden gesendet!');
                          window.location.reload();
                        } catch (err) { alert(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`); } finally { setStatusUpdating(false); }
                      }} disabled={statusUpdating} className="w-full px-4 py-2.5 text-sm font-heading font-semibold bg-amber-500 text-white rounded-btn hover:bg-amber-600 transition-colors disabled:opacity-40">
                        {statusUpdating ? 'Wird gesendet...' : 'Freigeben + Zahlungslink senden'}
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider block mb-2">Status ändern</label>
                  <div className="flex gap-2">
                    <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="flex-1 text-sm font-body border border-brand-border rounded-btn px-3 py-2 bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-accent-blue">
                      {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>)}
                    </select>
                    <button onClick={handleStatusUpdate} disabled={statusUpdating || newStatus === booking.status} className="px-4 py-2 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {statusUpdating ? '...' : 'Speichern'}
                    </button>
                  </div>
                </div>

                {/* Stornieren + Löschen */}
                <div className="flex gap-2 pt-2 border-t border-brand-border">
                  {booking.status !== 'cancelled' && (
                    <button onClick={() => setShowCancelModal(true)}
                      className="flex-1 px-4 py-2 text-sm font-heading font-semibold text-red-600 border border-red-200 rounded-btn hover:bg-red-50 transition-colors">
                      Stornieren
                    </button>
                  )}
                  <button onClick={() => { setShowDeleteModal(true); setDeletePassword(''); setDeleteError(''); }}
                    className="flex-1 px-4 py-2 text-sm font-heading font-semibold text-red-600 bg-red-50 border border-red-200 rounded-btn hover:bg-red-100 transition-colors">
                    Endgültig löschen
                  </button>
                </div>
              </div>
            </Section>

            {/* Dokumente */}
            <Section title="Dokumente">
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setEmailRecipient(booking.customer_email || '');
                    setEmailAttachments({ rechnung: true, vertrag: booking.contract_signed ?? false, agb: false, widerruf: false, haftung: false, datenschutz: false, impressum: false });
                    setShowEmailModal(true);
                  }}
                  className="block w-full text-center px-4 py-2.5 text-sm font-heading font-semibold bg-blue-600 text-white rounded-btn hover:bg-blue-700 transition-colors"
                >
                  ✉ E-Mail senden
                </button>
                <div className="border-t border-brand-border dark:border-slate-700 my-2" />
                <a href={`/api/invoice/${booking.id}`} target="_blank" className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors">Rechnung PDF</a>
                {booking.contract_signed && (
                  <a href={`/api/rental-contract/${booking.id}`} target="_blank" className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-teal-600 text-white rounded-btn hover:bg-teal-700 transition-colors">Mietvertrag PDF</a>
                )}
                {booking.delivery_mode === 'versand' && (
                  <>
                    <button onClick={openPackliste} className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-cyan-600 text-white rounded-btn hover:bg-cyan-700 transition-colors">Versand-Packliste</button>
                    <a href={`/api/packlist/${booking.id}`} target="_blank" className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-amber-500 text-white rounded-btn hover:bg-amber-600 transition-colors">Packliste PDF</a>
                  </>
                )}
                {booking.delivery_mode === 'abholung' && (
                  <button onClick={openÜbergabeprotokoll} className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-cyan-600 text-white rounded-btn hover:bg-cyan-700 transition-colors">Übergabeprotokoll</button>
                )}
                <Link href="/admin/schaeden" className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-orange-500 text-white rounded-btn hover:bg-orange-600 transition-colors">Schadensbericht erstellen</Link>
              </div>
            </Section>
          </div>
        </div>

        {/* ═══ Stornieren-Modal ═══ */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCancelModal(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">Buchung stornieren</h3>
              <p className="text-sm font-body text-brand-muted mb-4">Buchung {booking.id} wird als storniert markiert.</p>
              <label className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider block mb-2">Stornierungsgrund *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Warum wird die Buchung storniert?"
                rows={3}
                autoFocus
                className="w-full px-3 py-2.5 border border-brand-border dark:border-slate-600 rounded-xl text-sm font-body bg-white dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                  className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-brand-bg transition-colors">
                  Abbrechen
                </button>
                <button onClick={handleCancel} disabled={!cancelReason.trim() || statusUpdating}
                  className="px-5 py-2 text-sm font-heading font-semibold bg-red-600 text-white rounded-btn hover:bg-red-700 transition-colors disabled:opacity-40">
                  {statusUpdating ? 'Wird storniert...' : 'Stornieren'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Löschen-Modal ═══ */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteModal(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading font-bold text-lg text-red-600 mb-1">Buchung endgültig löschen</h3>
              <p className="text-sm font-body text-brand-muted mb-1">Buchung <strong>{booking.id}</strong> wird unwiderruflich aus der Datenbank entfernt.</p>
              <p className="text-sm font-body text-red-600 font-semibold mb-4">Diese Aktion kann nicht rückgängig gemacht werden!</p>
              <label className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider block mb-2">Admin-Passwort eingeben</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }}
                placeholder="Passwort"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && deletePassword) handleDelete(); }}
                className="w-full px-3 py-2.5 border border-brand-border dark:border-slate-600 rounded-xl text-sm font-body bg-white dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              {deleteError && <p className="text-xs text-red-600 mt-2 font-body">{deleteError}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-brand-bg transition-colors">
                  Abbrechen
                </button>
                <button onClick={handleDelete} disabled={!deletePassword}
                  className="px-5 py-2 text-sm font-heading font-semibold bg-red-600 text-white rounded-btn hover:bg-red-700 transition-colors disabled:opacity-40">
                  Endgültig löschen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ E-Mail-senden-Modal ═══ */}
        {showEmailModal && booking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEmailModal(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-heading font-bold text-lg text-brand-black dark:text-white mb-1">E-Mail senden</h3>
              <p className="text-sm font-body text-brand-muted mb-4">Dokumente an den Kunden senden</p>

              {/* Empfänger */}
              <label className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider block mb-2">Empfänger</label>
              <input
                type="email"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                placeholder="E-Mail-Adresse"
                className="w-full px-3 py-2.5 border border-brand-border dark:border-slate-600 rounded-xl text-sm font-body bg-white dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
              />

              {/* Quick-Action: Zahlungs-Link erneut senden */}
              {booking.stripe_payment_link_id && (
                <div className="mb-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 p-3">
                  <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Schnell-Aktion</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-heading font-semibold text-brand-black dark:text-white">Zahlungs-Link</p>
                      <p className="text-xs font-body text-brand-muted">Erneut versenden ohne PDF-Anhänge</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleResendPaymentLink}
                      disabled={emailSending || !emailRecipient}
                      className="flex-shrink-0 px-3 py-2 text-xs font-heading font-semibold bg-sky-500 text-white rounded-btn hover:bg-sky-600 transition-colors disabled:opacity-40 whitespace-nowrap"
                    >
                      {emailSending ? '...' : '✉ Erneut senden'}
                    </button>
                  </div>
                </div>
              )}

              {/* Anhänge */}
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Anhänge auswählen</label>
                <button
                  type="button"
                  onClick={() => {
                    const allChecked = emailAttachments.rechnung && emailAttachments.agb && emailAttachments.widerruf && emailAttachments.haftung && emailAttachments.datenschutz && emailAttachments.impressum;
                    const val = !allChecked;
                    setEmailAttachments(prev => ({ ...prev, rechnung: val, agb: val, widerruf: val, haftung: val, datenschutz: val, impressum: val, vertrag: val && (booking.contract_signed ?? false) }));
                  }}
                  className="text-xs font-heading font-semibold text-blue-500 hover:text-blue-400"
                >
                  Alle auswählen
                </button>
              </div>
              <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
                {/* Buchungsdokumente */}
                <p className="text-xs font-heading font-semibold text-brand-muted mt-1 mb-1">Buchungsdokumente</p>
                <label className="flex items-center gap-3 p-3 rounded-xl border border-brand-border dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <input type="checkbox" checked={emailAttachments.rechnung} onChange={(e) => setEmailAttachments(prev => ({ ...prev, rechnung: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
                  <div>
                    <span className="text-sm font-heading font-semibold text-brand-black dark:text-white">Rechnung</span>
                    <span className="text-xs font-body text-brand-muted block">PDF-Rechnung für Buchung {booking.id}</span>
                  </div>
                </label>

                <label className={`flex items-center gap-3 p-3 rounded-xl border border-brand-border dark:border-slate-600 transition-colors ${booking.contract_signed ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700' : 'opacity-40 cursor-not-allowed'}`}>
                  <input type="checkbox" checked={emailAttachments.vertrag} onChange={(e) => setEmailAttachments(prev => ({ ...prev, vertrag: e.target.checked }))} disabled={!booking.contract_signed} className="w-4 h-4 accent-blue-600" />
                  <div>
                    <span className="text-sm font-heading font-semibold text-brand-black dark:text-white">Mietvertrag</span>
                    <span className="text-xs font-body text-brand-muted block">{booking.contract_signed ? 'Unterschriebener Mietvertrag' : 'Noch nicht unterschrieben'}</span>
                  </div>
                </label>

                {/* Rechtliche Dokumente */}
                <p className="text-xs font-heading font-semibold text-brand-muted mt-3 mb-1">Rechtliche Dokumente</p>
                {[
                  { key: 'agb' as const, label: 'AGB', desc: 'Allgemeine Geschäftsbedingungen' },
                  { key: 'widerruf' as const, label: 'Widerrufsbelehrung', desc: 'Widerrufsrecht und Muster-Widerrufsformular' },
                  { key: 'haftung' as const, label: 'Haftungsbedingungen', desc: 'Haftungsschutz und Schadensbedingungen' },
                  { key: 'datenschutz' as const, label: 'Datenschutzerklärung', desc: 'DSGVO-konforme Datenschutzhinweise' },
                  { key: 'impressum' as const, label: 'Impressum', desc: 'Anbieterkennzeichnung nach §5 TMG' },
                ].map(doc => (
                  <label key={doc.key} className="flex items-center gap-3 p-3 rounded-xl border border-brand-border dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <input type="checkbox" checked={emailAttachments[doc.key]} onChange={(e) => setEmailAttachments(prev => ({ ...prev, [doc.key]: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
                    <div>
                      <span className="text-sm font-heading font-semibold text-brand-black dark:text-white">{doc.label}</span>
                      <span className="text-xs font-body text-brand-muted block">{doc.desc}</span>
                    </div>
                  </label>
                ))}
              </div>

              {/* Hinweis wenn nichts ausgewählt */}
              {!emailAttachments.rechnung && !emailAttachments.vertrag && !emailAttachments.agb && !emailAttachments.widerruf && !emailAttachments.haftung && !emailAttachments.datenschutz && !emailAttachments.impressum && (
                <p className="text-xs text-amber-600 font-body mb-3">Bitte mindestens ein Dokument auswählen.</p>
              )}

              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-brand-bg transition-colors">
                  Abbrechen
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={emailSending || !emailRecipient || (!emailAttachments.rechnung && !emailAttachments.vertrag && !emailAttachments.agb && !emailAttachments.widerruf && !emailAttachments.haftung && !emailAttachments.datenschutz && !emailAttachments.impressum)}
                  className="px-5 py-2 text-sm font-heading font-semibold bg-blue-600 text-white rounded-btn hover:bg-blue-700 transition-colors disabled:opacity-40"
                >
                  {emailSending ? 'Sende...' : '✉ Senden'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* E-Mail Toast */}
        {emailToast && (
          <div className={`fixed top-5 right-5 z-[9999] px-5 py-3 rounded-lg shadow-lg text-white font-semibold text-sm ${emailToast.type === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}>
            {emailToast.msg}
          </div>
        )}
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
    none: { label: 'Keine', color: '#94a3b8', bg: '#94a3b814' },
    pending: { label: 'Ausstehend', color: '#8b5cf6', bg: '#8b5cf614' },
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

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import AccessoryDamageModal from '@/components/admin/AccessoryDamageModal';
import { BUSINESS } from '@/lib/business-config';
import { fmtEuro as fmtEuroCanonical, fmtDateTime as fmtDateTimeCanonical, fmtDateWeekday as fmtDateWeekdayCanonical, isoToDE, escapeHtml } from '@/lib/format-utils';
import { BOOKING_STATUS_CONFIG as STATUS_CONFIG } from '@/lib/booking-status-labels';

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
  accessory_items?: { accessory_id: string; qty: number }[] | null;
  resolved_items?: { id: string; name: string; qty: number; accessory_id?: string; isFromSet?: boolean; setName?: string }[] | null;
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
  tracking_carrier: string | null;
  return_tracking_number: string | null;
  return_tracking_url: string | null;
  return_tracking_carrier: string | null;
  shipped_at: string | null;
  return_condition: string | null;
  return_notes: string | null;
  returned_at: string | null;
  created_at: string;
  original_rental_to: string | null;
  extended_at: string | null;
  contract_signed: boolean | null;
  contract_signed_at: string | null;
  contract_signer_name: string | null;
  contract_signature_url: string | null;
  contract_locked: boolean | null;
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
  is_test: boolean | null;
  liability_summary?: LiabilitySummary | null;
  wbw_finalized?: boolean | null;
  wbw_finalized_at?: string | null;
  wbw_email_sent_at?: string | null;
  wbw_final?: { name: string; serial: string | null; value: number }[] | null;
  cameras_resolved?: { product_id: string | null; product_name: string; unit_id: string | null; serial_number: string | null }[] | null;
  adjustment_status?: string | null;
  adjustment_amount?: number | null;
  adjustment_payment_link_id?: string | null;
  adjustment_note?: string | null;
  ship_date_override?: string | null;
  return_due_date_override?: string | null;
  invoice_name?: string | null;
  invoice_address?: string | null;
}

interface LiabilityLine {
  name: string;
  qty: number;
  unit_value: number;
  total_value: number;
  source: 'asset' | 'accessory_replacement' | 'product_deposit' | 'unknown';
}

interface LiabilitySummary {
  camera: LiabilityLine;
  cameras?: LiabilityLine[];
  accessories: LiabilityLine[];
  total_wbw: number;
  accessories_total: number;
  customer_max_liability: number;
  customer_max_label: string;
  customer_max_note: string;
  haftung_option: string | null;
  deposit_anchor: number;
  camera_overridden?: boolean;
  accessories_overridden?: boolean;
  override_camera_product_id?: string | null;
  override_accessories?: { id: string; qty: number }[] | null;
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


const ALL_STATUSES = ['pending_verification', 'awaiting_payment', 'confirmed', 'preparing_shipment', 'awaiting_pickup', 'shipped', 'delivered', 'picked_up', 'completed', 'cancelled', 'damaged'];

type TabId = 'uebersicht' | 'versand' | 'dokumente' | 'bearbeiten' | 'verlauf';
const TABS: { id: TabId; label: string }[] = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'versand', label: 'Versand & Rückgabe' },
  { id: 'dokumente', label: 'Dokumente & E-Mail' },
  { id: 'bearbeiten', label: 'Bearbeiten' },
  { id: 'verlauf', label: 'Status & Verlauf' },
];

type NextActionTone = 'amber' | 'cyan' | 'indigo' | 'green' | 'rose';
type NextAction = {
  hint: string;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone: NextActionTone;
};
const TONE_BTN: Record<NextActionTone, string> = {
  amber: 'bg-amber-500 hover:bg-amber-600',
  cyan: 'bg-cyan-600 hover:bg-cyan-700',
  indigo: 'bg-indigo-600 hover:bg-indigo-700',
  green: 'bg-green-600 hover:bg-green-700',
  rose: 'bg-rose-600 hover:bg-rose-700',
};

function fmtDate(iso: string) {
  if (!iso) return '–';
  return isoToDE(iso.split('T')[0]);
}

// Datum inkl. Wochentag fuer die Anzeige (z.B. "Mo., 15.06.2026").
function fmtDateWd(iso: string) {
  if (!iso) return '–';
  return fmtDateWeekdayCanonical(iso);
}

// Null-safe Wrapper um zentralen fmtDateTime (Europe/Berlin-TZ).
// Vorher: fehlende Europe/Berlin-TZ -> falscher Tag zwischen 22-02 Uhr auf UTC-Server.
function fmtDateTime(iso: string) {
  if (!iso) return '–';
  return fmtDateTimeCanonical(iso);
}

function fmtEuro(n: number | null | undefined) {
  if (n == null) return '0,00 €';
  return fmtEuroCanonical(n);
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
  const [productList, setProductList] = useState<{ id: string; name: string }[]>([]);
  const [accessoryList, setAccessoryList] = useState<{ id: string; name: string }[]>([]);
  const [accessoryEditOptions, setAccessoryEditOptions] = useState<
    { id: string; name: string; kind: 'accessory' | 'set'; compat: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showAccessoryDamage, setShowAccessoryDamage] = useState(false);
  const [accessoryDamageMsg, setAccessoryDamageMsg] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [editingTracking, setEditingTracking] = useState(false);
  const [trackingDraft, setTrackingDraft] = useState('');
  const [trackingCarrierDraft, setTrackingCarrierDraft] = useState<'DHL' | 'DPD'>('DHL');
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [editingReturnTracking, setEditingReturnTracking] = useState(false);
  const [returnTrackingDraft, setReturnTrackingDraft] = useState('');
  const [returnTrackingCarrierDraft, setReturnTrackingCarrierDraft] = useState<'DHL' | 'DPD'>('DHL');
  const [returnTrackingSaving, setReturnTrackingSaving] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [resettingContract, setResettingContract] = useState(false);
  const [lockingContract, setLockingContract] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailToast, setEmailToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailAttachments, setEmailAttachments] = useState<{ rechnung: boolean; vertrag: boolean; agb: boolean; widerruf: boolean; haftung: boolean; datenschutz: boolean; impressum: boolean }>({ rechnung: true, vertrag: true, agb: false, widerruf: false, haftung: false, datenschutz: false, impressum: false });
  const [activeTab, setActiveTab] = useState<TabId>('uebersicht');
  const [wbwGateStatus, setWbwGateStatus] = useState<string | null>(null);
  useEffect(() => {
    fetchBooking();
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aktiven Reiter aus URL-Hash wiederherstellen (reload-/teilbar)
  useEffect(() => {
    const h = (typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '') as TabId;
    if (TABS.some((t) => t.id === h)) setActiveTab(h);
  }, []);

  function switchTab(id: TabId) {
    setActiveTab(id);
    if (typeof window !== 'undefined') {
      try { window.history.replaceState(null, '', `#${id}`); } catch { /* ignore */ }
    }
  }

  async function fetchBooking() {
    setLoading(true);
    setError('');
    try {
      const [res, accRes, setsRes, prodRes] = await Promise.all([
        fetch(`/api/admin/booking/${bookingId}`),
        fetch('/api/admin/accessories'),
        fetch('/api/sets'),
        fetch('/api/products'),
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
      setAccessoryList(
        (accData.accessories ?? []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
      );

      // Katalog-Kameras fuer das Override-Dropdown (id + name)
      const pData = prodRes.ok ? await prodRes.json() : [];
      setProductList(
        (Array.isArray(pData) ? pData : []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
      );

      // Sets-Map (ID → { name, items })
      const sData = setsRes.ok ? await setsRes.json() : { sets: [] };
      const sMap: Record<string, { name: string; items: { accessory_id: string; qty: number }[] }> = {};
      for (const s of sData.sets ?? []) sMap[s.id] = { name: s.name, items: s.accessory_items ?? [] };
      setSetMap(sMap);

      // Optionen fuer den Zubehoer-Editor: Accessories + Sets, jeweils mit
      // Kompatibilitaets-Label (welche Kameras passen) — disambiguiert auch
      // gleichnamige Eintraege (z.B. zwei „Selfi-Stick").
      const prodNameById = new Map<string, string>(
        (Array.isArray(pData) ? pData : []).map((p: { id: string; name: string }) => [p.id, p.name]),
      );
      const compatLabel = (ids: unknown): string => {
        const arr = Array.isArray(ids) ? (ids as string[]).filter(Boolean) : [];
        if (arr.length === 0) return 'alle Kameras';
        return arr.map((pid) => prodNameById.get(pid) ?? pid).join(', ');
      };
      const accOpts = ((accData.accessories ?? []) as { id: string; name: string; compatible_product_ids?: string[] }[])
        .map((a) => ({
          id: a.id,
          name: a.name,
          kind: 'accessory' as const,
          compat: compatLabel(a.compatible_product_ids),
        }))
        .sort((x, y) => x.name.localeCompare(y.name, 'de'));
      const setOpts = ((sData.sets ?? []) as { id: string; name: string; product_ids?: string[] }[])
        .map((s) => ({
          id: s.id,
          name: s.name,
          kind: 'set' as const,
          compat: compatLabel(s.product_ids),
        }))
        .sort((x, y) => x.name.localeCompare(y.name, 'de'));
      setAccessoryEditOptions([...setOpts, ...accOpts]);
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

  async function handleApproveBooking() {
    if (!booking) return;
    if (!confirm('Buchung freigeben und Zahlungslink an den Kunden senden?')) return;
    setStatusUpdating(true);
    try {
      const res = await fetch('/api/admin/approve-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('Zahlungslink wurde an den Kunden gesendet!');
      window.location.reload();
    } catch (err) { alert(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`); } finally { setStatusUpdating(false); }
  }

  async function handleRegenerateContract() {
    if (!booking) return;
    if (!confirm('Vertrag aus der gespeicherten Signatur regenerieren?')) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}/regenerate-contract`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchBooking();
        alert('Vertrag erfolgreich regeneriert.');
      } else {
        alert(data.error || 'Vertrag konnte nicht regeneriert werden.');
      }
    } catch {
      alert('Netzwerkfehler beim Regenerieren.');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleResetContract() {
    if (!booking) return;
    if (!confirm('Mietvertrag wirklich zurücksetzen?\n\nDas unterschriebene PDF wird gelöscht und der Kunde muss den Vertrag neu unterschreiben (sichtbar im Kundenkonto, oder über „Jetzt unterschreiben").')) return;
    setResettingContract(true);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}/reset-contract`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchBooking();
        if (data.emailSent) {
          alert('Mietvertrag zurückgesetzt. Der Kunde wurde per E-Mail zur Neu-Unterschrift aufgefordert.');
        } else {
          alert('Mietvertrag zurückgesetzt — aber die E-Mail an den Kunden ist fehlgeschlagen' + (data.emailError ? `:\n${data.emailError}` : '.') + '\nBitte den Kunden manuell informieren.');
        }
      } else {
        alert(data.error || 'Vertrag konnte nicht zurückgesetzt werden.');
      }
    } catch {
      alert('Netzwerkfehler beim Zurücksetzen.');
    } finally {
      setResettingContract(false);
    }
  }

  async function handleLockContract() {
    if (!booking) return;
    if (!confirm('Mietvertrag als geprüft freigeben?\n\nAchtung: Das ist endgültig — die Freigabe kann NICHT rückgängig gemacht werden. Der Vertrag lässt sich danach nicht mehr zurücksetzen.')) return;
    setLockingContract(true);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}/lock-contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchBooking();
      } else {
        alert(data.error || 'Freigabe konnte nicht gespeichert werden.');
      }
    } catch {
      alert('Netzwerkfehler bei der Freigabe.');
    } finally {
      setLockingContract(false);
    }
  }

  function handleWbwGateDone(status: string, emailFailed: boolean) {    setBooking((prev) => (prev ? { ...prev, status, wbw_finalized: true } : prev));
    setNewStatus(status);
    setWbwGateStatus(null);
    fetchBooking();
    if (emailFailed) {
      alert('WBW gespeichert & Status gesetzt, aber die E-Mail an den Mieter ist fehlgeschlagen. Bitte unter „Bearbeiten" → Wiederbeschaffungswerte erneut senden.');
    }
  }

  async function handleStatusUpdate() {
    if (!booking || newStatus === booking.status) return;
    // Beim Wechsel auf Abholung/Versand muss die WBW-Liste an den Mieter raus.
    // Sind die Werte noch nicht finalisiert, öffnet sich das WBW-Fenster — der
    // Statuswechsel passiert erst nach dem Versand der Liste.
    if (
      (newStatus === 'awaiting_pickup' || newStatus === 'shipped') &&
      !booking.wbw_finalized &&
      buildWbwRows(booking).length > 0
    ) {
      setWbwGateStatus(newStatus);
      return;
    }
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

  // Sweep 8 K6: Stored XSS-Schutz fuer window.open()-Druckansichten.
  // Der neu geoeffnete Tab erbt cam2rent.de-Origin via document.write, also
  // laeuft jedes injizierte Script mit Admin-Cookies. User-Eingaben (Name,
  // Adresse, Produktname, Seriennummer) werden mit `esc()` geescaped.
  // Nutzt zentralen escapeHtml aus lib/format-utils (client-safe).
  const esc = escapeHtml;

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
        return `<tr><td style="width:40px"></td><td style="font-weight:700;font-size:9pt;color:#1e3a5f;padding-top:6px">${esc(name)}</td><td style="width:50px"></td></tr>`;
      }
      accNum++;
      return `<tr><td style="width:40px">${accNum}</td><td>${esc(name)}</td><td style="width:50px"></td></tr>`;
    });
    const emptyCount = accNum > 0 ? 0 : 2;
    const zubehoerRows = accRows.join('') + Array.from({ length: emptyCount }, (_, i) => `<tr><td style="width:40px">${accNum + i + 1}</td><td></td><td style="width:50px"></td></tr>`).join('');
    const adresse = booking.shipping_address || (customer ? `${customer.address_street || ''}, ${customer.address_zip || ''} ${customer.address_city || ''}` : '');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Versand-Packliste – ${esc(booking.id)}</title><style>${docStyles}</style></head><body>
  ${toolbarHtml}
  <h1>Versand-Packliste</h1>
  <div class="subtitle">cam2rent · ${esc(booking.id)} · ${esc(dateStr)}</div>
  <div style="display:flex;gap:24px;margin-bottom:8px">
    <div class="info-grid" style="flex:1">
      <span class="info-label">Kunde:</span><span class="info-value">${esc(kundenName)}</span>
      <span class="info-label">Zeitraum:</span><span class="info-value">${esc(zeitraum)}</span>
      <span class="info-label">Versandart:</span><span class="info-value">${booking.shipping_method === 'express' ? 'Express' : 'Standard'}</span>
    </div>
    <div class="info-grid" style="flex:1">
      <span class="info-label">Adresse:</span><span class="info-value">${esc(adresse)}</span>
    </div>
  </div>
  <h2>1. Versandgegenstand</h2>
  <div style="display:flex;gap:16px;margin-bottom:4px">
    <span><strong>Kamera:</strong> ${esc(produktName)}</span>
    <span><strong>SN:</strong> ${booking.serial_number ? esc(booking.serial_number) : '<span class="line line-short"></span>'}</span>
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
      `<p style="margin-bottom:2px"><strong>Kamera:</strong> ${esc(name)} &nbsp;&nbsp; <strong>SN:</strong> ${booking.serial_number ? esc(booking.serial_number) : '<span class="line line-short"></span>'}</p>`
    ).join('');

    // Zubehör-Namen auflösen (Sets → Einzelteile)
    const resolvedAcc2 = resolveAccessoryNames(Array.isArray(booking.accessories) ? booking.accessories : []);
    let accNum2 = 0;
    const accRows2 = resolvedAcc2.map((name: string) => {
      const isSetHeader = name.startsWith('── ');
      if (isSetHeader) {
        return `<tr><td style="width:40px"></td><td style="font-weight:700;font-size:9pt;color:#1e3a5f;padding-top:6px">${esc(name)}</td><td style="width:50px"></td></tr>`;
      }
      accNum2++;
      return `<tr><td style="width:40px">${accNum2}</td><td>${esc(name)}</td><td style="width:50px"></td></tr>`;
    });
    const emptyCount2 = accNum2 > 0 ? 0 : 2;
    const zubehoerRows = accRows2.join('') + Array.from({ length: emptyCount2 }, (_, i) => `<tr><td style="width:40px">${accNum2 + i + 1}</td><td></td><td style="width:50px"></td></tr>`).join('');

    // Lieferart
    const lieferart = booking.delivery_mode === 'abholung' ? 'Abgeholt' : 'Versand';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Übergabeprotokoll – ${esc(booking.id)}</title><style>${docStyles}</style></head><body>
  ${toolbarHtml}
  <h1>Übergabeprotokoll</h1>
  <div class="subtitle">cam2rent · ${esc(booking.id)} · ${esc(lieferart)}</div>

  <div style="display:flex;gap:20px;margin-bottom:8px">
    <div style="flex:1">
      <p style="font-weight:700;font-size:8pt;color:#1e3a5f;margin-bottom:2px">Vermieter</p>
      <p style="font-size:8.5pt">${esc(BUSINESS.owner)} · ${esc(BUSINESS.fullAddress)}</p>
    </div>
    <div style="flex:1">
      <p style="font-weight:700;font-size:8pt;color:#1e3a5f;margin-bottom:2px">Mieter</p>
      <div class="info-grid" style="grid-template-columns:90px 1fr;margin-bottom:0">
        <span class="info-label">Name:</span><span class="info-value">${kundenName ? esc(kundenName) : '<span style="display:inline-block;border-bottom:1px solid #333;width:140px"></span>'}</span>
        <span class="info-label">Adresse:</span><span class="info-value">${kundenAdresse ? esc(kundenAdresse) : '<span style="display:inline-block;border-bottom:1px solid #333;width:140px"></span>'}</span>
        <span class="info-label">Ausweis-Nr.:</span><span class="info-value"><span class="line" style="width:140px"></span></span>
        <span class="info-label">Tel. / E-Mail:</span><span class="info-value">${kundenEmail ? esc(kundenEmail) : '<span class="line" style="width:140px"></span>'}</span>
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
  <p class="confirm-text">Mietzeitraum: <strong>${esc(zeitraum)}</strong> · Buchung: <strong>${esc(booking.id)}</strong></p>
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

  function buildTrackingUrlClient(carrier: 'DHL' | 'DPD', number: string): string {
    const clean = number.trim();
    if (carrier === 'DPD') return `https://www.dpd.com/de/de/empfangen/sendungsverfolgung/?parcelId=${clean}`;
    return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${clean}`;
  }

  async function saveTracking() {
    if (!booking) return;
    setTrackingSaving(true);
    try {
      const next = trackingDraft.trim();
      const carrier = trackingCarrierDraft;
      const res = await fetch(`/api/admin/booking/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: next, tracking_carrier: carrier }),
      });
      if (!res.ok) throw new Error('Fehler');
      setBooking({
        ...booking,
        tracking_number: next || null,
        tracking_carrier: next ? carrier : null,
        tracking_url: next ? buildTrackingUrlClient(carrier, next) : null,
      });
      setEditingTracking(false);
    } catch { alert('Trackingnummer konnte nicht gespeichert werden.'); }
    finally { setTrackingSaving(false); }
  }

  async function saveReturnTracking() {
    if (!booking) return;
    setReturnTrackingSaving(true);
    try {
      const next = returnTrackingDraft.trim();
      const carrier = returnTrackingCarrierDraft;
      const res = await fetch(`/api/admin/booking/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_tracking_number: next, return_tracking_carrier: carrier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 503) {
          alert(data?.error ?? 'Migration fuer Retoure-Tracking steht noch aus.');
          return;
        }
        throw new Error('Fehler');
      }
      setBooking({
        ...booking,
        return_tracking_number: next || null,
        return_tracking_carrier: next ? carrier : null,
        return_tracking_url: next ? buildTrackingUrlClient(carrier, next) : null,
      });
      setEditingReturnTracking(false);
    } catch { alert('Rueckgabe-Trackingnummer konnte nicht gespeichert werden.'); }
    finally { setReturnTrackingSaving(false); }
  }

  // ─── Nächste-Aktion-Logik: der nächste echte Arbeitsschritt je Status ───
  const isVersand = booking.delivery_mode === 'versand';
  const nextAction: NextAction | null = (() => {
    switch (booking.status) {
      case 'pending_verification':
        return { hint: 'Buchung wartet auf Freigabe', label: 'Freigeben + Zahlungslink senden', onClick: handleApproveBooking, disabled: statusUpdating, tone: 'amber' };
      case 'awaiting_payment':
        if (booking.stripe_payment_link_id && booking.customer_email)
          return { hint: 'Warte auf Zahlung des Kunden', label: '✉ Zahlungslink erneut senden', onClick: handleResendPaymentLink, disabled: emailSending, tone: 'amber' };
        return { hint: 'Warte auf Zahlung — Zahlungslink oder Kunden-E-Mail fehlt', label: 'Status & Verlauf öffnen', onClick: () => switchTab('verlauf'), tone: 'amber' };
      case 'confirmed':
        return isVersand
          ? { hint: 'Versandfertig — Paket packen', label: '📦 Paket packen', href: `/admin/versand/${booking.id}/packen`, tone: 'cyan' }
          : { hint: 'Kunde holt ab — Übergabe vorbereiten', label: '📝 Übergabe vorbereiten', href: `/admin/buchungen/${booking.id}/uebergabe`, tone: 'indigo' };
      case 'preparing_shipment':
        return { hint: 'Versand in Vorbereitung — Pack-Workflow fortsetzen', label: '📦 Pack-Workflow öffnen', href: `/admin/versand/${booking.id}/packen`, tone: 'cyan' };
      case 'awaiting_pickup':
        return { hint: 'Liegt zur Abholung bereit', label: '📝 Übergabe vorbereiten', href: `/admin/buchungen/${booking.id}/uebergabe`, tone: 'indigo' };
      case 'shipped':
        return { hint: 'Unterwegs zum Kunden', label: 'Als zugestellt markieren', onClick: () => quickStatusChange('delivered', 'Zugestellt'), disabled: statusUpdating, tone: 'green' };
      case 'delivered':
      case 'picked_up':
        return { hint: 'Beim Kunden — Rückgabe steht aus', label: '↩ Rückgabe prüfen', href: `/admin/retouren/${booking.id}/pruefen`, tone: 'green' };
      case 'damaged':
        return { hint: 'Schaden gemeldet — Abwicklung offen', label: 'Zur Schadensabwicklung', href: '/admin/schaeden', tone: 'rose' };
      default:
        return null; // completed / cancelled — keine offene Aktion
    }
  })();

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <AdminBackLink href="/admin/buchungen" label="Zurück zu Buchungen" />
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <h1 className="font-heading font-bold text-2xl text-brand-black">{booking.id}</h1>
              <span className="inline-flex px-3 py-1 rounded-full text-xs font-heading font-semibold" style={{ color: sc.color, backgroundColor: sc.bg, border: `1px solid ${sc.color}30` }}>{sc.label}</span>
              {booking.is_test && (
                <span
                  className="inline-flex px-3 py-1 rounded-full text-xs font-heading font-bold"
                  style={{ color: '#ec4899', backgroundColor: '#ec489914', border: '1px solid #ec489933', letterSpacing: '0.5px' }}
                  title="Test-Buchung — fällt aus Reports/EÜR/DATEV raus"
                >
                  TEST
                </span>
              )}
            </div>
            <p className="text-sm font-body text-brand-muted mt-1">Erstellt am {fmtDateTime(booking.created_at)}</p>
          </div>
        </div>

        {/* ═══ Nächste Aktion — immer ganz oben sichtbar, über den Reitern ═══ */}
        <NextActionBar action={nextAction} statusLabel={sc.label} statusColor={sc.color} />

        {/* Mietvertrag nicht unterschrieben — Warnung vor Übergabe/Versand */}
        {!booking.contract_signed && !['pending_verification', 'awaiting_payment', 'cancelled', 'completed'].includes(booking.status) && (
          <div className="mb-6 p-4 rounded-xl border-2 border-red-400 bg-red-50 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <div className="min-w-0">
              <p className="text-sm font-heading font-semibold text-red-800">Achtung: Mietvertrag nicht unterschrieben</p>
              <p className="text-xs font-body text-red-700 mt-0.5">
                Für diese Buchung liegt kein unterschriebener Mietvertrag vor. Vor Übergabe oder Versand
                den Vertrag unterschreiben lassen.
              </p>
              <Link href={`/admin/buchungen/${booking.id}/vertrag-unterschreiben`} className="inline-block mt-2 text-xs font-heading font-semibold text-red-700 underline">
                Jetzt unterschreiben →
              </Link>
            </div>
          </div>
        )}

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

        {/* Auf einen Blick — die wichtigsten Fakten zuerst (mobil ganz oben) */}
        <div className="bg-white rounded-xl border border-brand-border p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-4">
            <div>
              <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Status</p>
              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-heading font-semibold" style={{ color: sc.color, backgroundColor: sc.bg, border: `1px solid ${sc.color}30` }}>{sc.label}</span>
            </div>
            <div className="col-span-2 sm:col-span-1 min-w-0">
              <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Produkt</p>
              <p className="text-sm font-body text-brand-black truncate">{booking.product_name}</p>
              {booking.serial_number && <p className="text-xs font-mono text-blue-600 truncate">{booking.serial_number}</p>}
            </div>
            <div>
              <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Zeitraum</p>
              <p className="text-sm font-body text-brand-black">{fmtDateWd(booking.rental_from)} – {fmtDateWd(booking.rental_to)}</p>
              <p className="text-xs font-body text-brand-muted">{booking.days} Tag{booking.days !== 1 ? 'e' : ''}{booking.delivery_mode === 'versand' ? ' · Versand' : ' · Abholung'}</p>
            </div>
            <div className="col-span-2 sm:col-span-1 min-w-0">
              <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Kunde</p>
              <p className="text-sm font-body text-brand-black truncate">{booking.customer_name || customer?.full_name || '–'}</p>
              {(booking.customer_email || customer?.email) && (
                <a href={`mailto:${booking.customer_email || customer?.email}`} className="block text-xs font-body text-accent-blue hover:underline break-all">{booking.customer_email || customer?.email}</a>
              )}
            </div>
            <div>
              <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Gesamt</p>
              <p className="text-sm font-heading font-bold text-brand-black">{fmtEuro(booking.price_total)}</p>
            </div>
            {booking.deposit > 0 && (
              <div>
                <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Kaution</p>
                <p className="text-sm font-body text-brand-black">{fmtEuro(booking.deposit)}</p>
                <DepositBadge status={booking.deposit_status} />
              </div>
            )}
          </div>
        </div>

        {/* ═══ Reiter-Navigation ═══ */}
        <div className="mb-6 border-b border-brand-border overflow-x-auto">
          <nav className="flex gap-1 min-w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className={`px-4 py-2.5 text-sm font-heading font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${activeTab === t.id ? 'border-accent-cyan text-accent-cyan' : 'border-transparent text-brand-muted hover:text-brand-black'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="space-y-6">

            {/* ── Reiter: Übersicht ── */}
            {activeTab === 'uebersicht' && (<>

            {/* Buchungsdaten */}
            <Section title="Buchungsdaten">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Produkt" value={booking.product_name} />
                {booking.serial_number && <InfoRow label="Seriennummer" value={booking.serial_number} highlight />}
                <InfoRow label="Mietdauer" value={`${booking.days} Tag${booking.days !== 1 ? 'e' : ''}`} />
                <InfoRow label="Von" value={fmtDateWd(booking.rental_from)} />
                <InfoRow label="Bis" value={fmtDateWd(booking.rental_to)} />
                {booking.extended_at && <InfoRow label="Verlängert" value={`Ursprünglich bis ${booking.original_rental_to ? fmtDateWd(booking.original_rental_to) : '\u2013'}`} highlight />}
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
                  <NotesPanel notes={booking.notes} />
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
                    <span className="text-sm font-body text-green-600">
                      {booking.coupon_code
                        ? `Rabatt (${booking.coupon_code})`
                        : 'Rabatt'}
                    </span>
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
            {(() => {
              // Qty-aware Anzeige: accessory_items hat Vorrang, sonst Fallback
              // auf accessories[] mit qty=1 je Eintrag.
              const items: { accessory_id: string; qty: number }[] = Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0
                ? booking.accessory_items as { accessory_id: string; qty: number }[]
                : (Array.isArray(booking.accessories) ? booking.accessories : []).map((id: string) => ({ accessory_id: id, qty: 1 }));
              if (items.length === 0) return null;

              // Sets von Einzel-Zubehoer trennen — Sets werden als ausklappbare
              // Karte mit Sub-Items dargestellt, einzelnes Zubehoer bleibt als
              // Pille.
              const setEntries = items.filter((it) => setMap[it.accessory_id]);
              const accEntries = items.filter((it) => !setMap[it.accessory_id]);

              const resolveAccName = (id: string) =>
                accessoryMap[id]
                ?? id.replace(/-[a-z0-9]{6,}$/, '').split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

              return (
                <Section title="Zubehör & Set">
                  <div className="space-y-3">
                    {setEntries.map((it, i) => {
                      const setInfo = setMap[it.accessory_id];
                      const subItems = setInfo.items ?? [];
                      return (
                        <ExpandableSet
                          key={`set-${i}`}
                          name={setInfo.name}
                          qty={it.qty}
                          subItems={subItems}
                          resolveName={resolveAccName}
                        />
                      );
                    })}
                    {accEntries.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {accEntries.map((it, i) => {
                          const rawName = resolveAccName(it.accessory_id);
                          const label = it.qty > 1 ? `${it.qty}× ${rawName}` : rawName;
                          return <span key={`acc-${i}`} className="px-2.5 py-1 bg-brand-bg rounded-full text-xs font-body text-brand-steel">{label}</span>;
                        })}
                      </div>
                    )}
                  </div>
                </Section>
              );
            })()}

            </>)}

            {/* ── Reiter: Versand & Rückgabe ── */}
            {activeTab === 'versand' && (<>

            {/* Versand & Tracking */}
            <Section title="Versand & Tracking">
              {booking.delivery_mode === 'versand' ? (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Trackingnummer</p>
                      {editingTracking ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2 items-center">
                            <select
                              value={trackingCarrierDraft}
                              onChange={e => setTrackingCarrierDraft(e.target.value as 'DHL' | 'DPD')}
                              className="px-2 py-1.5 text-sm font-body rounded-lg border border-brand-border bg-brand-card text-brand-black focus:outline-none focus:border-accent-cyan"
                              title="Versanddienstleister"
                            >
                              <option value="DHL">DHL</option>
                              <option value="DPD">DPD</option>
                            </select>
                            <input
                              type="text"
                              value={trackingDraft}
                              onChange={e => setTrackingDraft(e.target.value)}
                              placeholder="Trackingnummer"
                              className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-body rounded-lg border border-brand-border bg-brand-card text-brand-black focus:outline-none focus:border-accent-cyan"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); saveTracking(); }
                                if (e.key === 'Escape') setEditingTracking(false);
                              }}
                            />
                            <button
                              onClick={saveTracking}
                              disabled={trackingSaving}
                              className="px-2.5 py-1.5 text-xs font-heading font-semibold rounded-lg bg-accent-cyan text-white hover:bg-accent-cyan/80 disabled:opacity-40"
                            >
                              {trackingSaving ? '...' : 'OK'}
                            </button>
                            <button
                              onClick={() => setEditingTracking(false)}
                              className="px-2.5 py-1.5 text-xs font-heading font-semibold rounded-lg bg-brand-border text-brand-muted hover:bg-brand-border/80"
                            >
                              {'\u2715'}
                            </button>
                          </div>
                          <p className="text-xs font-body text-brand-muted">
                            Tracking-Link wird automatisch neu erzeugt. Kunde bekommt eine neue Versand-E-Mail mit korrigiertem Link.
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-body text-brand-black break-all">{booking.tracking_number || '\u2013'}</span>
                          {booking.tracking_carrier && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-heading font-bold bg-brand-bg text-brand-steel">{booking.tracking_carrier}</span>
                          )}
                          <button
                            onClick={() => {
                              setTrackingDraft(booking.tracking_number || '');
                              setTrackingCarrierDraft((booking.tracking_carrier as 'DHL' | 'DPD') || 'DHL');
                              setEditingTracking(true);
                            }}
                            className="text-brand-muted hover:text-accent-cyan transition-colors"
                            title="Trackingnummer bearbeiten"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                          </button>
                        </div>
                      )}
                    </div>
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
                    {/* Retoure-Trackingnummer (intern) — immer eingebbar, damit der
                        Admin die Rücksende-Nummer (DHL/DPD) auch ohne von cam2rent
                        erzeugtes Rücksende-Etikett erfassen kann. Editierbar wie das
                        Hin-Tracking, baut tracking_url automatisch je nach Carrier. */}
                    <div>
                      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Rückgabe-Trackingnummer</p>
                      {editingReturnTracking ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2 items-center">
                            <select
                              value={returnTrackingCarrierDraft}
                              onChange={e => setReturnTrackingCarrierDraft(e.target.value as 'DHL' | 'DPD')}
                              className="px-2 py-1.5 text-sm font-body rounded-lg border border-brand-border bg-brand-card text-brand-black focus:outline-none focus:border-accent-cyan"
                              title="Versanddienstleister"
                            >
                              <option value="DHL">DHL</option>
                              <option value="DPD">DPD</option>
                            </select>
                            <input
                              type="text"
                              value={returnTrackingDraft}
                              onChange={e => setReturnTrackingDraft(e.target.value)}
                              placeholder="Trackingnummer"
                              className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-body rounded-lg border border-brand-border bg-brand-card text-brand-black focus:outline-none focus:border-accent-cyan"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); saveReturnTracking(); }
                                if (e.key === 'Escape') setEditingReturnTracking(false);
                              }}
                            />
                            <button
                              onClick={saveReturnTracking}
                              disabled={returnTrackingSaving}
                              className="px-2.5 py-1.5 text-xs font-heading font-semibold rounded-lg bg-accent-cyan text-white hover:bg-accent-cyan/80 disabled:opacity-40"
                            >
                              {returnTrackingSaving ? '...' : 'OK'}
                            </button>
                            <button
                              onClick={() => setEditingReturnTracking(false)}
                              className="px-2.5 py-1.5 text-xs font-heading font-semibold rounded-lg bg-brand-border text-brand-muted hover:bg-brand-border/80"
                            >
                              {'✕'}
                            </button>
                          </div>
                          <p className="text-xs font-body text-brand-muted">
                            Nur interne Anzeige — der Kunde bekommt keine E-Mail.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-body text-brand-black break-all">{booking.return_tracking_number || '–'}</span>
                            {booking.return_tracking_carrier && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-heading font-bold bg-brand-bg text-brand-steel">{booking.return_tracking_carrier}</span>
                            )}
                            <button
                              onClick={() => {
                                setReturnTrackingDraft(booking.return_tracking_number || '');
                                setReturnTrackingCarrierDraft((booking.return_tracking_carrier as 'DHL' | 'DPD') || 'DHL');
                                setEditingReturnTracking(true);
                              }}
                              className="text-brand-muted hover:text-accent-cyan transition-colors"
                              title="Rückgabe-Trackingnummer bearbeiten"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </button>
                          </div>
                          {booking.return_tracking_url && (
                            <a href={booking.return_tracking_url} target="_blank" rel="noopener noreferrer" className="text-xs font-body text-accent-blue hover:underline break-all">Retoure verfolgen</a>
                          )}
                        </div>
                      )}
                    </div>
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
                      {booking.label_url && <a href={`/admin/pdf-viewer?u=${encodeURIComponent(`/api/admin/label/${booking.id}`)}&t=${encodeURIComponent('Versandetikett')}`} className="text-xs font-heading font-semibold text-accent-blue hover:underline">Versandlabel</a>}
                      {booking.return_label_url && <a href={`/admin/pdf-viewer?u=${encodeURIComponent(`/api/admin/return-label/${booking.id}`)}&t=${encodeURIComponent('Rücksendeetikett')}`} className="text-xs font-heading font-semibold text-accent-blue hover:underline">Rücksendeetikett</a>}
                    </div>
                  )}
                  {/* Quick actions */}
                  <div className="mt-4 pt-4 border-t border-brand-border flex flex-wrap gap-2">
                    {booking.status === 'confirmed' && <Link href="/admin/versand" className="px-3 py-1.5 text-xs font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors">Zum Versand</Link>}
                    {booking.status === 'shipped' && (
                      <button onClick={() => quickStatusChange('delivered', 'Zugestellt')} disabled={statusUpdating} className="px-3 py-1.5 text-xs font-heading font-semibold bg-green-600 text-white rounded-btn hover:bg-green-700 transition-colors disabled:opacity-40">Als zugestellt markieren</button>
                    )}
                    {(booking.status === 'shipped' || booking.status === 'delivered' || booking.status === 'picked_up') && <Link href={`/admin/retouren/${booking.id}/pruefen`} className="px-3 py-1.5 text-xs font-heading font-semibold bg-cyan-600 text-white rounded-btn hover:bg-cyan-700 transition-colors">Rückgabe prüfen</Link>}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-body text-brand-muted mb-3">Selbstabholung</p>
                  <div className="flex flex-wrap gap-2">
                    {booking.status === 'confirmed' && (
                      <button onClick={() => quickStatusChange('picked_up', 'Abgeholt')} disabled={statusUpdating} className="px-3 py-1.5 text-xs font-heading font-semibold bg-green-600 text-white rounded-btn hover:bg-green-700 transition-colors disabled:opacity-40">Als abgeholt markieren</button>
                    )}
                    {booking.status === 'picked_up' && (
                      <Link href={`/admin/retouren/${booking.id}/pruefen`} className="px-3 py-1.5 text-xs font-heading font-semibold bg-cyan-600 text-white rounded-btn hover:bg-cyan-700 transition-colors">Rückgabe prüfen</Link>
                    )}
                  </div>
                </div>
              )}
            </Section>

            </>)}

            {/* ── Reiter: Dokumente & E-Mail ── */}
            {activeTab === 'dokumente' && (<>

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
                  {booking.contract_locked && (
                    <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-heading font-semibold bg-green-600 text-white">✓ Geprüft &amp; freigegeben</span>
                      <span className="text-xs font-body text-green-800">Endgültig gesperrt — kann nicht zurückgesetzt werden.</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-4">
                    <a href={`/admin/pdf-viewer?u=${encodeURIComponent(`/api/rental-contract/${booking.id}`)}&t=${encodeURIComponent('Mietvertrag')}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-heading font-semibold bg-teal-600 text-white rounded-btn hover:bg-teal-700 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Vertrag PDF herunterladen
                    </a>
                    {!booking.contract_locked && (
                      <>
                        <button
                          onClick={handleLockContract}
                          disabled={lockingContract}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-heading font-semibold bg-green-600 text-white rounded-btn hover:bg-green-700 transition-colors disabled:opacity-40"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          {lockingContract ? 'Speichere…' : 'Alles okay (freigeben)'}
                        </button>
                        <button
                          onClick={handleResetContract}
                          disabled={resettingContract}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-heading font-semibold bg-red-50 text-red-700 border border-red-200 rounded-btn hover:bg-red-100 transition-colors disabled:opacity-40"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          {resettingContract ? 'Setze zurück…' : 'Vertrag zurücksetzen'}
                        </button>
                      </>
                    )}
                  </div>
                  {!booking.contract_locked && (
                    <p className="text-xs font-body text-brand-muted mt-2">
                      Zurücksetzen löscht das unterschriebene PDF und fordert den Kunden <strong>per E-Mail</strong> zur Neu-Unterschrift auf (z.&nbsp;B. wenn die Unterschrift fehlt). Mit „Alles okay&ldquo; gibst du den geprüften Vertrag <strong>endgültig</strong> frei — danach ist kein Zurücksetzen mehr möglich.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
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
                  {booking.contract_signer_name && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-xs font-body text-amber-900 mb-2">
                        Kunde hat bei der Buchung digital unterschrieben (<strong>{booking.contract_signer_name}</strong>),
                        aber das Vertrags-PDF wurde nicht erzeugt. Du kannst es jetzt aus der gespeicherten Signatur regenerieren.
                      </p>
                      <button
                        onClick={handleRegenerateContract}
                        disabled={regenerating}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-heading font-semibold bg-amber-600 text-white rounded-btn hover:bg-amber-700 transition-colors disabled:opacity-40"
                      >
                        {regenerating ? 'Regeneriere…' : 'Vertrag aus Signatur regenerieren'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Section>

            </>)}

            {/* ── Reiter: Versand & Rückgabe (Termine) ── */}
            {activeTab === 'versand' && (<>

            {/* Versand- / Rückgabe-Datum */}
            <ShippingOverrideSection
              bookingId={booking.id}
              rentalFrom={booking.rental_from}
              rentalTo={booking.rental_to}
              deliveryMode={booking.delivery_mode}
              shipDateOverride={booking.ship_date_override ?? null}
              returnDueDateOverride={booking.return_due_date_override ?? null}
              onSaved={fetchBooking}
            />

            </>)}

            {/* ── Reiter: Bearbeiten ── */}
            {activeTab === 'bearbeiten' && (<>

            {/* Bearbeiten & Werkzeuge */}
            <Collapsible
              title="Bearbeiten & Werkzeuge"
              subtitle="Bestellung/Zubehör bearbeiten, Haftung, finale Werte, Rechnungsversionen"
              defaultOpen={true}
            >
              {booking.liability_summary && (
                <LiabilitySection
                  summary={booking.liability_summary}
                  bookingId={booking.id}
                  productId={booking.product_id}
                  accessoryItems={booking.accessory_items ?? null}
                  productList={productList}
                  accessoryList={accessoryList}
                  onSaved={fetchBooking}
                />
              )}
              {!['cancelled', 'completed', 'returned'].includes(booking.status) && (
                <BookingEditSection
                  booking={booking}
                  productList={productList}
                  options={accessoryEditOptions}
                  onSaved={fetchBooking}
                />
              )}
              {booking.status === 'confirmed' && (
                <WbwFinalizePanel booking={booking} onChanged={fetchBooking} />
              )}
              <BillingAddressSection booking={booking} onSaved={fetchBooking} />
              <InvoiceVersionsPanel bookingId={booking.id} />
            </Collapsible>

            </>)}

            {/* ── Reiter: Dokumente & E-Mail (Verlauf) ── */}
            {activeTab === 'dokumente' && (<>

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

            </>)}

            {/* ── Reiter: Status & Verlauf ── */}
            {activeTab === 'verlauf' && (<>

            {/* Statusverlauf */}
            <Section title="Statusverlauf">
              <div className="space-y-4">
                <TimelineItem label="Buchung erstellt" date={fmtDateTime(booking.created_at)} status="confirmed" active />
                {booking.contract_signed_at && <TimelineItem label="Vertrag unterschrieben" date={fmtDateTime(booking.contract_signed_at)} status="confirmed" active />}
                {booking.shipped_at && <TimelineItem label="Versendet" date={fmtDateTime(booking.shipped_at)} status="shipped" active />}
                {booking.status === 'delivered' && <TimelineItem label="Beim Kunden zugestellt" date="" status="shipped" active />}
                {booking.status === 'picked_up' && <TimelineItem label="Abgeholt" date="" status="shipped" active />}
                {booking.extended_at && <TimelineItem label="Verlängert" date={fmtDateTime(booking.extended_at)} status="confirmed" active />}
                {booking.returned_at && <TimelineItem label="Zurückgegeben" date={fmtDateTime(booking.returned_at)} status="completed" active />}
                {booking.status === 'completed' && !booking.returned_at && <TimelineItem label="Abgeschlossen" date="" status="completed" active />}
                {booking.status === 'cancelled' && <TimelineItem label="Storniert" date="" status="cancelled" active />}
                {booking.status === 'damaged' && <TimelineItem label="Beschädigt gemeldet" date="" status="damaged" active />}
              </div>
            </Section>

            </>)}

            {/* ── Reiter: Übersicht (Kundendaten) ── */}
            {activeTab === 'uebersicht' && (<>

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

            </>)}

            {/* ── Reiter: Status & Verlauf (Aktionen) ── */}
            {activeTab === 'verlauf' && (<>

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
                    {booking.status === 'awaiting_payment' && booking.stripe_payment_link_id && (
                      <button
                        onClick={handleResendPaymentLink}
                        disabled={emailSending || !booking.customer_email}
                        className="w-full px-4 py-2.5 text-sm font-heading font-semibold bg-amber-500 text-white rounded-btn hover:bg-amber-600 transition-colors disabled:opacity-40"
                      >
                        {emailSending ? 'Wird gesendet...' : `✉ Zahlungslink ${booking.customer_email ? 'an ' + booking.customer_email : ''} senden`}
                      </button>
                    )}
                    {booking.status === 'awaiting_payment' && !booking.stripe_payment_link_id && (
                      <p className="text-sm font-body text-amber-700">
                        Kein Zahlungslink hinterlegt. Bitte Status auf &bdquo;Warte auf Freigabe&ldquo; setzen, dann erneut freigeben.
                      </p>
                    )}
                    {booking.status === 'awaiting_payment' && booking.stripe_payment_link_id && !booking.customer_email && (
                      <p className="text-xs font-body text-amber-700 mt-2">
                        Hinterlege erst eine Kunden-E-Mail unter &bdquo;Kundendaten&ldquo;, damit der Link versendet werden kann.
                      </p>
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

            </>)}

            {/* ── Reiter: Dokumente & E-Mail (PDFs/Versand) ── */}
            {activeTab === 'dokumente' && (<>

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
                <a href={`/admin/pdf-viewer?u=${encodeURIComponent(`/api/invoice/${booking.id}`)}&t=${encodeURIComponent('Rechnung')}`} className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-brand-black text-white rounded-btn hover:bg-brand-dark transition-colors">Rechnung PDF</a>
                {booking.contract_signed && (
                  <a href={`/admin/pdf-viewer?u=${encodeURIComponent(`/api/rental-contract/${booking.id}`)}&t=${encodeURIComponent('Mietvertrag')}`} className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-teal-600 text-white rounded-btn hover:bg-teal-700 transition-colors">Mietvertrag PDF</a>
                )}
                {booking.delivery_mode === 'versand' && (
                  <>
                    {/* Digitaler Pack-Workflow: hier wird die PDF erst nach
                        Packen + Kontrolle (4-Augen) erzeugt — mit allen
                        Haakchen + Unterschriften. */}
                    <a href={`/admin/versand/${booking.id}/packen`} className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-cyan-600 text-white rounded-btn hover:bg-cyan-700 transition-colors">
                      📦 Paket packen (digital)
                    </a>
                    {/* Legacy/Sonderfall: leere PDF zum Ausdrucken + manuelles Abhaken */}
                    <button onClick={openPackliste} className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-slate-500 text-white rounded-btn hover:bg-slate-600 transition-colors">
                      📋 Manuelle Packliste (leer, zum Ausdrucken)
                    </button>
                  </>
                )}
                {booking.delivery_mode === 'abholung' && (
                  <>
                    <Link
                      href={`/admin/buchungen/${booking.id}/uebergabe`}
                      className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-cyan-600 text-white rounded-btn hover:bg-cyan-700 transition-colors"
                    >
                      📝 Übergabeprotokoll (digital)
                    </Link>
                    {/* Legacy/Sonderfall: leeres PDF zum Ausdrucken + manuelles Abhaken */}
                    <button
                      onClick={openÜbergabeprotokoll}
                      className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-slate-500 text-white rounded-btn hover:bg-slate-600 transition-colors"
                    >
                      📋 Leeres Protokoll (zum Ausdrucken)
                    </button>
                  </>
                )}
                {booking.accessory_items && booking.accessory_items.length > 0 && (
                  <button
                    onClick={() => { setAccessoryDamageMsg(null); setShowAccessoryDamage(true); }}
                    className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-rose-600 text-white rounded-btn hover:bg-rose-700 transition-colors"
                  >
                    Zubehör-Schaden melden
                  </button>
                )}
                {accessoryDamageMsg && (
                  <p className="text-xs font-body text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg p-2">
                    {accessoryDamageMsg}
                  </p>
                )}
                <Link href="/admin/schaeden" className="block w-full text-center px-4 py-2 text-sm font-heading font-semibold bg-orange-500 text-white rounded-btn hover:bg-orange-600 transition-colors">Schadensbericht erstellen</Link>
              </div>
            </Section>

            </>)}

        </div>

        {/* ═══ Zubehör-Schaden-Modal ═══ */}
        <AccessoryDamageModal
          bookingId={booking.id}
          open={showAccessoryDamage}
          onClose={() => setShowAccessoryDamage(false)}
          onSuccess={(msg) => {
            setAccessoryDamageMsg(msg);
            // Buchung neu laden, damit Status/Kaution sich aktualisieren
            fetchBooking();
          }}
        />

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

        {/* ═══ WBW-Gate-Modal (Statuswechsel auf Abholung/Versand) ═══ */}
        {wbwGateStatus && booking && (
          <WbwStatusGateModal
            booking={booking}
            targetStatus={wbwGateStatus}
            onClose={() => setWbwGateStatus(null)}
            onDone={handleWbwGateDone}
          />
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

function NextActionBar({ action, statusLabel, statusColor }: { action: NextAction | null; statusLabel: string; statusColor: string }) {
  // Terminal-Status (abgeschlossen/storniert) — keine offene Aktion
  if (!action) {
    return (
      <div className="mb-6 rounded-xl border border-brand-border bg-white px-5 py-4 flex items-center gap-3">
        <span className="inline-flex w-9 h-9 items-center justify-center rounded-full flex-shrink-0" style={{ backgroundColor: `${statusColor}1a`, color: statusColor }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </span>
        <div>
          <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Nächste Aktion</p>
          <p className="text-sm font-body text-brand-black">Keine offene Aktion — Buchung ist „{statusLabel}“.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-xl border border-accent-cyan/40 bg-accent-cyan/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-heading font-semibold text-accent-cyan uppercase tracking-wider">Nächste Aktion</p>
        <p className="text-sm font-body text-brand-black mt-0.5">{action.hint}</p>
      </div>
      {action.href ? (
        <Link
          href={action.href}
          className={`flex-shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-heading font-semibold text-white rounded-btn transition-colors ${TONE_BTN[action.tone]}`}
        >
          {action.label}
        </Link>
      ) : (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className={`flex-shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-heading font-semibold text-white rounded-btn transition-colors disabled:opacity-40 ${TONE_BTN[action.tone]}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-brand-border p-5">
      <h2 className="font-heading font-bold text-base text-brand-black mb-4">{title}</h2>
      {children}
    </div>
  );
}

function ExpandableSet({
  name, qty, subItems, resolveName,
}: {
  name: string;
  qty: number;
  subItems: { accessory_id: string; qty: number }[];
  resolveName: (id: string) => string;
}) {
  const [open, setOpen] = useState(true);
  const totalSubItems = subItems.reduce((s, it) => s + (it.qty || 1), 0);
  return (
    <div className="border border-brand-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 bg-brand-bg hover:bg-brand-border/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-xs font-bold">📦</span>
          <span className="font-heading font-semibold text-sm text-brand-black truncate">
            {qty > 1 ? `${qty}× ` : ''}{name}
          </span>
          <span className="text-xs text-brand-muted whitespace-nowrap">
            ({totalSubItems} Teile)
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-brand-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="px-3.5 py-2 bg-white divide-y divide-brand-border/60">
          {subItems.length === 0 ? (
            <li className="text-xs text-brand-muted italic py-1">Set hat keine Sub-Items definiert.</li>
          ) : (
            subItems.map((sub, i) => {
              const subQty = (sub.qty || 1) * (qty || 1);
              return (
                <li key={i} className="flex items-center justify-between py-1.5 text-sm font-body text-brand-steel">
                  <span>{resolveName(sub.accessory_id)}</span>
                  <span className="text-xs font-semibold text-brand-muted">{subQty}×</span>
                </li>
              );
            })
          )}
        </ul>
      )}
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

// Einklappbarer Sammel-Block. Kinder werden per CSS versteckt (nicht
// unmounten), damit halb ausgefuellte Edit-Formulare beim Zuklappen
// erhalten bleiben.
function Collapsible({
  title, subtitle, defaultOpen = false, children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-brand-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-brand-bg/60 transition-colors"
      >
        <div className="min-w-0">
          <span className="font-heading font-bold text-base text-brand-black">{title}</span>
          {subtitle && <p className="text-xs font-body text-brand-muted mt-0.5">{subtitle}</p>}
        </div>
        <svg
          className={`w-4 h-4 text-brand-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={open ? 'px-5 pb-5 space-y-6 border-t border-brand-border' : 'hidden'}>
        {children}
      </div>
    </div>
  );
}

// Zerlegt das frei-Text-Feld booking.notes in lesbare Bloecke:
// Zahlungslink -> Button, Stornogrund -> hervorgehobene Box,
// alles andere -> Aenderungsverlauf-Liste. Reine Anzeige, schreibt
// nichts zurueck. Faellt bei unbekanntem Format auf Rohtext zurueck.
function NotesPanel({ notes }: { notes: string }) {
  const [showAll, setShowAll] = useState(false);
  const URL_RE = /(https?:\/\/[^\s|]+)/;
  const segments = notes.split(' | ').map((s) => s.trim()).filter(Boolean);

  // Fallback: einzeiliger Freitext ohne Trenner/Link -> wie bisher.
  if (segments.length <= 1 && !URL_RE.test(notes)) {
    return (
      <div>
        <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Notizen</p>
        <p className="text-sm font-body text-brand-black whitespace-pre-line">{notes}</p>
      </div>
    );
  }

  const links: { caption: string; url: string }[] = [];
  const stornoTexts: string[] = [];
  const history: string[] = [];

  for (const seg of segments) {
    const m = seg.match(URL_RE);
    if (m) {
      const url = m[1];
      const caption = seg.replace(url, '').replace(/[:\s]+$/, '').trim() || 'Zahlungslink';
      links.push({ caption, url });
      continue;
    }
    if (/^(stornierungsgrund|storniert|stornogrund|storno)\b/i.test(seg)) {
      stornoTexts.push(seg.replace(/^[^:]*:\s*/, '').trim() || seg);
      continue;
    }
    history.push(seg);
  }

  const VISIBLE = 4;
  const shownHistory = showAll ? history : history.slice(0, VISIBLE);

  return (
    <div className="space-y-3">
      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Notizen</p>

      {stornoTexts.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs font-heading font-semibold text-amber-800 uppercase tracking-wider mb-1">Stornogrund</p>
          {stornoTexts.map((t, i) => (
            <p key={i} className="text-sm font-body text-amber-900 whitespace-pre-line">{t}</p>
          ))}
        </div>
      )}

      {links.map((l, i) => (
        <div key={i}>
          <p className="text-xs font-body text-brand-muted mb-1">{l.caption}</p>
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-heading font-semibold bg-blue-600 text-white rounded-btn hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m6.656-1.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" /></svg>
            Zahlungslink öffnen
          </a>
        </div>
      ))}

      {history.length > 0 && (
        <div>
          <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1.5">Änderungsverlauf</p>
          <ul className="space-y-1.5">
            {shownHistory.map((h, i) => (
              <li key={i} className="text-sm font-body text-brand-black flex gap-2">
                <span className="text-brand-muted shrink-0">•</span>
                <span className="whitespace-pre-line">{h}</span>
              </li>
            ))}
          </ul>
          {history.length > VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs font-heading font-semibold text-accent-blue hover:underline"
            >
              {showAll ? 'weniger anzeigen' : `weitere anzeigen (${history.length - VISIBLE})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface EditPreview {
  days: number;
  camera_count: number;
  camera_changed: boolean;
  period_changed: boolean;
  price_rental: number;
  price_accessories: number;
  price_haftung: number;
  shipping_price: number;
  shipping_overridden?: boolean;
  delivery_mode?: 'versand' | 'abholung';
  shipping_method?: 'standard' | 'express';
  discount_total: number;
  discount_scaled?: boolean;
  computed_total: number;
  final_total: number;
  old_total: number;
  diff: number;
  settlement: 'payment_link' | 'refund' | 'none';
  is_stripe_payment: boolean;
}

function BookingEditSection({
  booking, productList, options, onSaved,
}: {
  booking: BookingDetail;
  productList: { id: string; name: string }[];
  options: { id: string; name: string; kind: 'accessory' | 'set'; compat: string }[];
  onSaved: () => void;
}) {
  const setOptions = options.filter((o) => o.kind === 'set');
  const accOptions = options.filter((o) => o.kind === 'accessory');
  // Rohe Komposition aus accessory_items — Set-IDs bleiben als Sets sichtbar,
  // damit der Admin sie als Block behandeln kann (statt aufgeloester Einzelteile).
  // Fix fuer den Basic-Set-Pricing-Bug: beim Speichern wuerde der Server die
  // Set-ID sonst verlieren und alle Sub-Items als individuelle Posten zum
  // Katalogpreis abrechnen.
  const initRows = (() => {
    if (Array.isArray(booking.accessory_items) && booking.accessory_items.length > 0) {
      return booking.accessory_items
        .filter((r) => r && typeof r.accessory_id === 'string' && r.accessory_id)
        .map((r) => ({ id: r.accessory_id, qty: Math.max(1, Math.min(99, Math.round(Number(r.qty) || 1))) }));
    }
    if (Array.isArray(booking.accessories)) {
      return (booking.accessories as string[])
        .filter((id) => typeof id === 'string' && id)
        .map((id) => ({ id, qty: 1 }));
    }
    return [];
  })();

  const curHaftung: 'none' | 'standard' | 'premium' =
    booking.haftung === 'standard' ? 'standard' : booking.haftung === 'premium' ? 'premium' : 'none';

  const camCount = Math.max(1, (booking.cameras_resolved?.length ?? 0) || 1);
  const initialCamRows = (): string[] => {
    const cr = booking.cameras_resolved;
    if (cr && cr.length > 0) return cr.map((c) => c.product_id || booking.product_id);
    return Array(camCount).fill(booking.product_id);
  };
  const curDelivery: 'versand' | 'abholung' =
    booking.delivery_mode === 'abholung' ? 'abholung' : 'versand';
  const curShipMethod: 'standard' | 'express' =
    booking.shipping_method === 'express' ? 'express' : 'standard';

  const [editing, setEditing] = useState(false);
  const [rentalFrom, setRentalFrom] = useState(String(booking.rental_from).slice(0, 10));
  const [rentalTo, setRentalTo] = useState(String(booking.rental_to).slice(0, 10));
  const [camRows, setCamRows] = useState<string[]>(initialCamRows());
  const [deliveryMode, setDeliveryMode] = useState<'versand' | 'abholung'>(curDelivery);
  const [shipMethod, setShipMethod] = useState<'standard' | 'express'>(curShipMethod);
  const [shipOverrideOn, setShipOverrideOn] = useState(false);
  const [shipOverrideVal, setShipOverrideVal] = useState(String(booking.shipping_price ?? 0));
  const [haftung, setHaftung] = useState<'none' | 'standard' | 'premium'>(curHaftung);
  const [rows, setRows] = useState<{ id: string; qty: number }[]>(initRows);
  const [accChanged, setAccChanged] = useState(false);
  const [reason, setReason] = useState('');
  const [settle, setSettle] = useState<'auto' | 'none'>('auto');
  const [overrideOn, setOverrideOn] = useState(false);
  const [overrideVal, setOverrideVal] = useState(String(booking.price_total ?? 0));
  const [preview, setPreview] = useState<EditPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  function start() {
    setRentalFrom(String(booking.rental_from).slice(0, 10));
    setRentalTo(String(booking.rental_to).slice(0, 10));
    setCamRows(initialCamRows());
    setDeliveryMode(curDelivery);
    setShipMethod(curShipMethod);
    setShipOverrideOn(false);
    setShipOverrideVal(String(booking.shipping_price ?? 0));
    setHaftung(curHaftung);
    setRows(initRows);
    setAccChanged(false);
    setReason('');
    setSettle('auto');
    setOverrideOn(false);
    setOverrideVal(String(booking.price_total ?? 0));
    setPreview(null);
    setErr('');
    setDone(null);
    setEditing(true);
  }

  function buildBody(dryRun: boolean) {
    const body: Record<string, unknown> = {
      rental_from: rentalFrom,
      rental_to: rentalTo,
      cameras: camRows.map((pid) => ({ product_id: pid })),
      delivery_mode: deliveryMode,
      shipping_method: shipMethod,
      haftung,
      reason: reason.trim(),
      settle,
      dry_run: dryRun,
    };
    if (shipOverrideOn) {
      const s = Number(shipOverrideVal.replace(',', '.'));
      if (Number.isFinite(s) && s >= 0) body.shipping_override = s;
    }
    // Zubehör/Set nur senden, wenn wirklich geändert — sonst behält der
    // Server die aktuelle Komposition (Set bleibt als Set bepreist).
    if (accChanged) {
      body.items = rows.filter((r) => r.id).map((r) => ({ id: r.id, qty: r.qty }));
    }
    if (overrideOn) {
      const n = Number(overrideVal.replace(',', '.'));
      if (Number.isFinite(n) && n >= 0) body.new_price_total = n;
    }
    return body;
  }

  async function runPreview() {
    setBusy(true);
    setErr('');
    setDone(null);
    try {
      const res = await fetch(`/api/admin/booking/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_edit: buildBody(true) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Vorschau fehlgeschlagen.');
      setPreview(d.preview as EditPreview);
    } catch (e) {
      setPreview(null);
      setErr(e instanceof Error ? e.message : 'Vorschau fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (reason.trim().length < 10) {
      setErr('Bitte einen Grund mit mindestens 10 Zeichen angeben.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`/api/admin/booking/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_edit: buildBody(false) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Speichern fehlgeschlagen.');
      let msg = 'Buchung aktualisiert.';
      if (d.settlement === 'payment_link') {
        msg = d.payment_url
          ? `Buchung aktualisiert. Zahlungslink über ${fmtEuro(d.diff)} wurde dem Kunden per E-Mail geschickt.`
          : `Buchung aktualisiert. Nachzahlung über ${fmtEuro(d.diff)} — Zahlungslink konnte nicht erstellt werden, bitte prüfen.`;
      } else if (d.settlement === 'refund') {
        msg = d.adjustment_status === 'refunded'
          ? `Buchung aktualisiert. ${fmtEuro(-d.diff)} wurden automatisch erstattet.`
          : `Buchung aktualisiert. Erstattung über ${fmtEuro(-d.diff)} muss manuell ausgeführt werden (siehe Benachrichtigung).`;
      }
      setDone(msg);
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <Section title="Bestellung bearbeiten">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-brand-muted leading-relaxed">
              Mietzeitraum, Kamera, Set/Zubehör und Haftungsschutz ändern.
              Wirkt sofort auf die echte Buchung. Preisdifferenz: Nachzahlung
              per Zahlungslink oder Rückerstattung.
            </p>
            <button
              type="button"
              onClick={start}
              className="text-xs text-accent-blue font-heading font-semibold whitespace-nowrap"
            >
              Bearbeiten
            </button>
          </div>
          {done && (
            <p className="text-xs text-green-700 bg-green-50 rounded-lg p-2">{done}</p>
          )}
          {booking.adjustment_status && (
            <p className="text-xs text-brand-muted bg-brand-bg-soft rounded-lg p-2">
              Letzte Anpassung:{' '}
              {booking.adjustment_status === 'pending_payment' && 'Nachzahlung offen (Zahlungslink verschickt)'}
              {booking.adjustment_status === 'paid' && 'Nachzahlung bezahlt'}
              {booking.adjustment_status === 'refunded' && 'Erstattung ausgeführt'}
              {booking.adjustment_status === 'refund_pending' && '⚠ Erstattung manuell ausführen'}
              {booking.adjustment_status === 'payment_link_failed' && '⚠ Zahlungslink fehlgeschlagen'}
              {booking.adjustment_amount != null && ` (${fmtEuro(booking.adjustment_amount)})`}
            </p>
          )}
        </div>
      </Section>
    );
  }

  return (
    <Section title="Bestellung bearbeiten">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Von</label>
            <input
              type="date"
              value={rentalFrom}
              onChange={(e) => { setRentalFrom(e.target.value); setPreview(null); }}
              className="w-full text-base border border-brand-border rounded-lg px-2 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Bis</label>
            <input
              type="date"
              value={rentalTo}
              onChange={(e) => { setRentalTo(e.target.value); setPreview(null); }}
              className="w-full text-base border border-brand-border rounded-lg px-2 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">
            Kamera{camRows.length > 1 ? `s (${camRows.length})` : ''}
          </label>
          <div className="space-y-2">
            {camRows.map((pid, i) => (
              <select
                key={i}
                value={pid}
                onChange={(e) => {
                  const v = e.target.value;
                  setCamRows((rs) => rs.map((p, j) => (j === i ? v : p)));
                  setPreview(null);
                }}
                className="w-full text-base border border-brand-border rounded-lg px-2 py-2"
              >
                {!productList.some((p) => p.id === pid) && (
                  <option value={pid}>{booking.product_name}</option>
                )}
                {productList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ))}
          </div>
          {camRows.length > 1 && (
            <p className="text-xs text-brand-muted mt-1">
              Jede Kamera einzeln wählbar — verschiedene Modelle möglich.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Lieferart / Versand</label>
          <div className="flex gap-2">
            <select
              value={deliveryMode}
              onChange={(e) => { setDeliveryMode(e.target.value as 'versand' | 'abholung'); setPreview(null); }}
              className="flex-1 text-base border border-brand-border rounded-lg px-2 py-2"
            >
              <option value="versand">Versand</option>
              <option value="abholung">Abholung</option>
            </select>
            <select
              value={shipMethod}
              onChange={(e) => { setShipMethod(e.target.value as 'standard' | 'express'); setPreview(null); }}
              disabled={deliveryMode === 'abholung'}
              className="flex-1 text-base border border-brand-border rounded-lg px-2 py-2 disabled:opacity-50"
            >
              <option value="standard">Standard</option>
              <option value="express">Express (immer 12,99 €)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 mt-2 text-xs text-brand-muted">
            <input
              type="checkbox"
              checked={shipOverrideOn}
              onChange={(e) => { setShipOverrideOn(e.target.checked); setPreview(null); }}
            />
            Versandkosten manuell setzen (z.B. 0 € = kostenlos)
          </label>
          {shipOverrideOn && (
            <input
              type="text"
              inputMode="decimal"
              value={shipOverrideVal}
              onChange={(e) => { setShipOverrideVal(e.target.value); setPreview(null); }}
              placeholder="z.B. 0"
              className="w-full text-base border border-brand-border rounded-lg px-2 py-2 mt-1"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">Haftungsschutz</label>
          <select
            value={haftung}
            onChange={(e) => { setHaftung(e.target.value as 'none' | 'standard' | 'premium'); setPreview(null); }}
            className="w-full text-base border border-brand-border rounded-lg px-2 py-2"
          >
            <option value="none">Keine Haftungsbegrenzung</option>
            <option value="standard">Standard-Haftungsschutz</option>
            <option value="premium">Premium-Haftungsschutz</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">Set / Zubehör</label>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.id}
                onChange={(e) => { setRows((rs) => rs.map((r, j) => (j === i ? { ...r, id: e.target.value } : r))); setAccChanged(true); setPreview(null); }}
                className="flex-1 min-w-0 text-base border border-brand-border rounded-lg px-2 py-2"
              >
                <option value="">— wählen —</option>
                {setOptions.length > 0 && (
                  <optgroup label="Sets (bleiben als Set in der Buchung)">
                    {setOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.name} — {o.compat}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Zubehör">
                  {accOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.name} — {o.compat}</option>
                  ))}
                </optgroup>
              </select>
              <input
                type="number"
                min={1}
                max={99}
                value={row.qty}
                onChange={(e) => { setRows((rs) => rs.map((r, j) => (j === i ? { ...r, qty: Math.max(1, Math.min(99, Number(e.target.value) || 1)) } : r))); setAccChanged(true); setPreview(null); }}
                className="w-16 text-base border border-brand-border rounded-lg px-2 py-2"
              />
              <button
                type="button"
                onClick={() => { setRows((rs) => rs.filter((_, j) => j !== i)); setAccChanged(true); setPreview(null); }}
                className="text-red-500 text-sm px-2 py-2 hover:bg-red-50 rounded-lg"
                aria-label="Zeile entfernen"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => { setRows((rs) => [...rs, { id: '', qty: 1 }]); setAccChanged(true); setPreview(null); }}
            className="text-sm text-accent-blue font-heading font-semibold"
          >
            + Set / Zubehör hinzufügen
          </button>
          {!accChanged && (
            <p className="text-xs text-brand-muted">Unverändert — Sets bleiben als Set (0 €) in der Rechnung. Sub-Items werden beim Packen automatisch aufgelöst.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1">
            Grund der Änderung (Pflicht, min. 10 Zeichen)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full text-base border border-brand-border rounded-lg px-3 py-2"
            placeholder="z.B. Kunde verlängert um 3 Tage und tauscht auf Premium-Haftung"
          />
        </div>

        <div className="rounded-lg border border-brand-border p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-heading font-semibold text-brand-black">
            <input type="checkbox" checked={overrideOn} onChange={(e) => { setOverrideOn(e.target.checked); setPreview(null); }} />
            Gesamtpreis manuell überschreiben
          </label>
          {overrideOn && (
            <input
              type="number"
              min={0}
              step="0.01"
              value={overrideVal}
              onChange={(e) => { setOverrideVal(e.target.value); setPreview(null); }}
              className="w-40 text-base border border-brand-border rounded-lg px-3 py-2"
            />
          )}
          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm font-body text-brand-black">
              <input type="radio" name="settle" checked={settle === 'auto'} onChange={() => setSettle('auto')} />
              Differenz automatisch abwickeln (Zahlungslink / Erstattung)
            </label>
            <label className="flex items-center gap-2 text-sm font-body text-brand-black">
              <input type="radio" name="settle" checked={settle === 'none'} onChange={() => setSettle('none')} />
              Nur ändern, keine Zahlung
            </label>
          </div>
        </div>

        {preview && (
          <div className="rounded-lg bg-brand-bg-soft p-3 space-y-1 text-sm">
            <p className="font-heading font-semibold text-brand-black mb-1">Vorschau ({preview.days} {preview.days === 1 ? 'Tag' : 'Tage'})</p>
            <div className="flex justify-between"><span className="text-brand-steel">Miete</span><span>{fmtEuro(preview.price_rental)}</span></div>
            {preview.price_accessories > 0 && <div className="flex justify-between"><span className="text-brand-steel">Zubehör/Sets</span><span>{fmtEuro(preview.price_accessories)}</span></div>}
            {preview.price_haftung > 0 && <div className="flex justify-between"><span className="text-brand-steel">Haftungsschutz</span><span>{fmtEuro(preview.price_haftung)}</span></div>}
            <div className="flex justify-between">
              <span className="text-brand-steel">
                Versand{preview.delivery_mode === 'abholung'
                  ? ' (Abholung)'
                  : ` (${preview.shipping_method === 'express' ? 'Express' : 'Standard'}${preview.shipping_overridden ? ', manuell' : ''})`}
              </span>
              <span>{fmtEuro(preview.shipping_price)}</span>
            </div>
            {preview.discount_total > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Rabatte{preview.discount_scaled ? ' (anteilig)' : ''}</span>
                <span>-{fmtEuro(preview.discount_total)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-brand-border"><span className="text-brand-steel">Alt</span><span>{fmtEuro(preview.old_total)}</span></div>
            <div className="flex justify-between font-heading font-bold text-brand-black"><span>Neu</span><span>{fmtEuro(preview.final_total)}</span></div>
            <div className="flex justify-between font-heading font-bold pt-1 border-t border-brand-border">
              <span>{preview.diff > 0 ? 'Nachzahlung' : preview.diff < 0 ? 'Erstattung' : 'Differenz'}</span>
              <span className={preview.diff > 0 ? 'text-red-600' : preview.diff < 0 ? 'text-green-700' : ''}>
                {fmtEuro(Math.abs(preview.diff))}
              </span>
            </div>
            {settle === 'auto' && preview.diff > 0.005 && (
              <p className="text-xs text-brand-muted">→ Kunde erhält einen Stripe-Zahlungslink per E-Mail.</p>
            )}
            {settle === 'auto' && preview.diff < -0.005 && (
              <p className="text-xs text-brand-muted">
                → {preview.is_stripe_payment ? 'Automatische Stripe-Erstattung.' : 'Manuelle Erstattung nötig (keine Stripe-Zahlung).'}
              </p>
            )}
          </div>
        )}

        {err && <p className="text-xs text-red-600">{err}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-brand-border text-sm font-heading font-semibold disabled:opacity-50"
          >
            {busy ? '…' : 'Vorschau berechnen'}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || reason.trim().length < 10}
            className="px-4 py-2 rounded-btn bg-brand-black text-white text-sm font-heading font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {busy ? 'Speichert…' : 'Übernehmen'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-brand-border text-sm font-heading font-semibold"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </Section>
  );
}

function LiabilitySection({
  summary, bookingId, productId, accessoryItems, productList, accessoryList, onSaved,
}: {
  summary: LiabilitySummary;
  bookingId: string;
  productId: string;
  accessoryItems: { accessory_id: string; qty: number }[] | null;
  productList: { id: string; name: string }[];
  accessoryList: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const haftung = summary.haftung_option;
  // Farbschema je nach Modus: Premium grün (Kunde sicher), Basis amber, Ohne rot.
  const accentColor =
    haftung === 'premium' ? '#10b981' :
    haftung === 'standard' ? '#f59e0b' : '#ef4444';
  const accentBg =
    haftung === 'premium' ? 'rgba(16,185,129,0.08)' :
    haftung === 'standard' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)';

  const isOverridden = !!(summary.camera_overridden || summary.accessories_overridden);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [camOn, setCamOn] = useState(!!summary.camera_overridden);
  const [camId, setCamId] = useState(summary.override_camera_product_id || productId);
  const [accOn, setAccOn] = useState(!!summary.accessories_overridden);
  const [accRows, setAccRows] = useState<{ id: string; qty: number }[]>(
    summary.override_accessories && summary.override_accessories.length > 0
      ? summary.override_accessories
      : (accessoryItems ?? []).map((a) => ({ id: a.accessory_id, qty: a.qty })),
  );

  function startEdit() {
    setCamOn(!!summary.camera_overridden);
    setCamId(summary.override_camera_product_id || productId);
    setAccOn(!!summary.accessories_overridden);
    setAccRows(
      summary.override_accessories && summary.override_accessories.length > 0
        ? summary.override_accessories
        : (accessoryItems ?? []).map((a) => ({ id: a.accessory_id, qty: a.qty })),
    );
    setEditErr('');
    setEditing(true);
  }

  async function patchOverride(payload: unknown) {
    setSaving(true);
    setEditErr('');
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liability_override: payload }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Speichern fehlgeschlagen.');
      }
      setEditing(false);
      onSaved();
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!camOn && !accOn) {
      patchOverride(null);
      return;
    }
    const payload: { camera_product_id?: string; accessories?: { id: string; qty: number }[] } = {};
    if (camOn) payload.camera_product_id = camId;
    if (accOn) payload.accessories = accRows.filter((r) => r.id);
    patchOverride(payload);
  }

  if (editing) {
    return (
      <Section title="Wiederbeschaffung & Haftung (intern)">
        <div className="space-y-4">
          <p className="text-xs text-brand-muted leading-relaxed">
            Nur fuer diese interne Box. Aendert nichts an der echten Buchung
            (Preis, Mietvertrag, Packliste, Verfuegbarkeit bleiben unveraendert).
          </p>

          {/* Kamera-Override */}
          <div className="rounded-lg border border-brand-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-heading font-semibold text-brand-black">
              <input type="checkbox" checked={camOn} onChange={(e) => setCamOn(e.target.checked)} />
              Kamera fuer Berechnung ueberschreiben
            </label>
            {camOn && (
              <select
                value={camId}
                onChange={(e) => setCamId(e.target.value)}
                className="w-full text-base border border-brand-border rounded-lg px-3 py-2"
              >
                {!productList.some((p) => p.id === productId) && (
                  <option value={productId}>Original ({productId})</option>
                )}
                {productList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Zubehoer-Override */}
          <div className="rounded-lg border border-brand-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-heading font-semibold text-brand-black">
              <input type="checkbox" checked={accOn} onChange={(e) => setAccOn(e.target.checked)} />
              Zubehoer fuer Berechnung ueberschreiben
            </label>
            {accOn && (
              <div className="space-y-2">
                {accRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={row.id}
                      onChange={(e) => setAccRows((rs) => rs.map((r, j) => j === i ? { ...r, id: e.target.value } : r))}
                      className="flex-1 min-w-0 text-base border border-brand-border rounded-lg px-2 py-2"
                    >
                      <option value="">— waehlen —</option>
                      {accessoryList.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={row.qty}
                      onChange={(e) => setAccRows((rs) => rs.map((r, j) => j === i ? { ...r, qty: Math.max(1, Math.min(99, Number(e.target.value) || 1)) } : r))}
                      className="w-16 text-base border border-brand-border rounded-lg px-2 py-2"
                    />
                    <button
                      type="button"
                      onClick={() => setAccRows((rs) => rs.filter((_, j) => j !== i))}
                      className="text-red-500 text-sm px-2 py-2 hover:bg-red-50 rounded-lg"
                      aria-label="Zeile entfernen"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAccRows((rs) => [...rs, { id: '', qty: 1 }])}
                  className="text-sm text-accent-blue font-heading font-semibold"
                >
                  + Zubehoer hinzufuegen
                </button>
                {accRows.length === 0 && (
                  <p className="text-xs text-brand-muted">Keine Zeile = 0 € Zubehoer in dieser Box.</p>
                )}
              </div>
            )}
          </div>

          {editErr && <p className="text-xs text-red-600">{editErr}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-btn bg-brand-black text-white text-sm font-heading font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-brand-border text-sm font-heading font-semibold"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Wiederbeschaffung & Haftung (intern)">
      <div className="space-y-4">
        {/* Bearbeiten / Status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {isOverridden ? (
            <span className="text-[11px] font-heading font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              manuell angepasst
            </span>
          ) : <span />}
          <div className="flex items-center gap-2">
            {isOverridden && (
              <button
                type="button"
                onClick={() => patchOverride(null)}
                disabled={saving}
                className="text-xs text-brand-muted underline disabled:opacity-50"
              >
                Auf automatisch zuruecksetzen
              </button>
            )}
            <button
              type="button"
              onClick={startEdit}
              className="text-xs text-accent-blue font-heading font-semibold"
            >
              Bearbeiten
            </button>
          </div>
        </div>
        {editErr && !editing && <p className="text-xs text-red-600">{editErr}</p>}

        {/* Wiederbeschaffungswert gesamt */}
        <div>
          <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-2">
            Kompletter Wiederbeschaffungswert
          </p>
          <p className="font-heading font-bold text-2xl text-brand-black">{fmtEuro(summary.total_wbw)}</p>
          <p className="text-xs text-brand-muted mt-1">
            Was du faktisch ausgeben muesstest, um alle Mietgegenstaende zu ersetzen.
          </p>
        </div>

        {/* Breakdown */}
        <div className="bg-brand-bg-soft rounded-lg p-3 space-y-1.5">
          {(summary.cameras && summary.cameras.length > 0 ? summary.cameras : [summary.camera]).map((line, i) => (
            <LiabilityLineRow key={`cam-${i}`} line={line} />
          ))}
          {summary.accessories.map((line, i) => (
            <LiabilityLineRow key={i} line={line} />
          ))}
          {summary.accessories.length > 0 && (
            <div className="pt-1.5 mt-1.5 border-t border-brand-border flex justify-between items-center">
              <span className="text-xs font-heading font-semibold text-brand-muted">Zubehoer-Summe</span>
              <span className="text-xs font-heading font-semibold text-brand-black">{fmtEuro(summary.accessories_total)}</span>
            </div>
          )}
        </div>

        {/* Was der Kunde haftet */}
        <div
          className="rounded-lg border p-3"
          style={{ borderColor: `${accentColor}55`, background: accentBg }}
        >
          <p className="text-xs font-heading font-semibold uppercase tracking-wider mb-1" style={{ color: accentColor }}>
            Vom Kunden gewaehlt: {summary.customer_max_label}
          </p>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs font-body text-brand-steel">Maximaler Uebernahmebetrag durch Kunde:</span>
            <span className="font-heading font-bold text-base" style={{ color: accentColor }}>
              {fmtEuro(summary.customer_max_liability)}
            </span>
          </div>
          <p className="text-xs text-brand-muted leading-relaxed">{summary.customer_max_note}</p>
          {haftung !== 'premium' && summary.customer_max_liability < summary.total_wbw && (
            <p className="text-xs text-brand-muted mt-1.5 pt-1.5 border-t border-brand-border">
              Differenz <strong>{fmtEuro(summary.total_wbw - summary.customer_max_liability)}</strong> traegt das Reparaturdepot bzw. muss bei &bdquo;Ohne Schadenspauschale&ldquo; manuell eingefordert werden.
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

// Vorschlagszeilen aus der internen Haftungs-Berechnung (Kamera + Zubehoer).
// Geteilt zwischen WbwFinalizePanel (manuell) und WbwStatusGateModal (Auto-Versand
// beim Statuswechsel auf Abholung/Versand).
type WbwRow = { name: string; serial: string | null; value: string };
function buildWbwRows(booking: BookingDetail): WbwRow[] {
  const sum = booking.liability_summary;
  if (!sum) return [];
  const camList = sum.cameras && sum.cameras.length > 0 ? sum.cameras : [sum.camera];
  const rows: WbwRow[] = camList.map((c, i) => ({
    name: c.name,
    serial: i === 0 ? (booking.serial_number || null) : null,
    value: String(c.total_value || ''),
  }));
  for (const a of sum.accessories) {
    rows.push({ name: a.name, serial: null, value: String(a.total_value || '') });
  }
  return rows;
}

function WbwFinalizePanel({ booking, onChanged }: { booking: BookingDetail; onChanged: () => void }) {
  const finalized = !!booking.wbw_finalized;

  const [rows, setRows] = useState<WbwRow[]>(() => buildWbwRows(booking));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);

  const allValid = rows.length > 0 && rows.every((r) => Number(r.value) > 0);

  async function doFinalize(resend: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/booking/${booking.id}/finalize-wbw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          resend
            ? { resend: true }
            : { items: rows.map((r) => ({ name: r.name, serial: r.serial, value: Number(r.value) })) },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Fehlgeschlagen.');
      if (d.success === false) {
        setMsg({ t: 'err', m: d.error || 'E-Mail fehlgeschlagen.' });
      } else {
        setMsg({ t: 'ok', m: resend ? 'E-Mail erneut gesendet.' : `Finalisiert & E-Mail an ${d.sentTo} gesendet.` });
      }
      setConfirmOpen(false);
      onChanged();
    } catch (e) {
      setMsg({ t: 'err', m: e instanceof Error ? e.message : 'Fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  }

  if (finalized) {
    const fin = booking.wbw_final ?? [];
    const total = fin.reduce((s, r) => s + (Number(r.value) || 0), 0);
    return (
      <Section title="Finale Wiederbeschaffungswerte">
        <div className="space-y-4">
          <div className="rounded-lg border border-green-300 bg-green-50 p-3">
            <p className="text-sm font-heading font-semibold text-green-800">
              WBW finalisiert am {fmtDateTime(booking.wbw_finalized_at || '')}
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              {booking.wbw_email_sent_at
                ? `E-Mail gesendet an ${booking.customer_email || '—'}`
                : 'E-Mail noch nicht versendet — bitte erneut senden.'}
            </p>
          </div>

          <div className="bg-brand-bg rounded-lg p-3 space-y-1.5">
            {fin.map((r, i) => (
              <div key={i} className="flex justify-between items-baseline gap-3">
                <span className="text-xs font-body text-brand-black truncate flex-1 min-w-0">
                  {r.name}{r.serial ? ` · ${r.serial}` : ''}
                </span>
                <span className="text-xs font-heading font-semibold text-brand-black">{fmtEuro(r.value)}</span>
              </div>
            ))}
            <div className="pt-1.5 mt-1.5 border-t border-brand-border flex justify-between items-center">
              <span className="text-xs font-heading font-semibold text-brand-muted">Gesamt</span>
              <span className="text-sm font-heading font-bold text-brand-black">{fmtEuro(total)}</span>
            </div>
          </div>

          {msg && (
            <p className={`text-xs ${msg.t === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.m}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`/api/admin/booking/${booking.id}/finalize-wbw`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-btn border border-brand-border text-sm font-heading font-semibold text-brand-black hover:bg-brand-bg transition-colors"
            >
              PDF herunterladen
            </a>
            <button
              type="button"
              onClick={() => doFinalize(true)}
              disabled={busy}
              className="px-4 py-2 rounded-btn bg-brand-black text-white text-sm font-heading font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              {busy ? 'Sendet…' : 'E-Mail erneut senden'}
            </button>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Wiederbeschaffungswerte finalisieren">
      <div className="space-y-4">
        <p className="text-xs text-brand-muted leading-relaxed">
          Lege die finalen Wiederbeschaffungswerte der tatsächlich mitgelieferten
          Ausrüstung fest. Sie werden dem Mieter als PDF per E-Mail gesendet und
          sind laut Mietvertrag ab dann maßgeblich für Ersatzansprüche.
        </p>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-body text-brand-black truncate">{r.name}</p>
                <p className="text-[11px] text-brand-muted">
                  {r.serial ? `SN: ${r.serial}` : 'Keine Seriennummer'}
                </p>
              </div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={r.value}
                onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                className="w-28 text-base border border-brand-border rounded-lg px-2 py-2 text-right"
              />
              <span className="text-sm text-brand-muted">€</span>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-xs text-red-600">Keine Positionen aus der Haftungs-Berechnung verfügbar.</p>
          )}
        </div>

        {msg && (
          <p className={`text-xs ${msg.t === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.m}</p>
        )}

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!allValid || busy}
          className="px-4 py-2 rounded-btn bg-brand-black text-white text-sm font-heading font-semibold hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          WBW finalisieren &amp; E-Mail senden
        </button>

        {confirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
              <h3 className="font-heading font-bold text-base text-brand-black">Finalisieren bestätigen</h3>
              <p className="text-sm text-brand-steel leading-relaxed">
                Die finalen Wiederbeschaffungswerte werden dem Mieter per E-Mail
                als PDF mitgeteilt und sind danach maßgeblich für etwaige
                Schadensersatzansprüche. Fortfahren?
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={busy}
                  className="px-4 py-2 rounded-btn border border-brand-border text-sm font-heading font-semibold"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => doFinalize(false)}
                  disabled={busy}
                  className="px-4 py-2 rounded-btn bg-brand-black text-white text-sm font-heading font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
                >
                  {busy ? 'Wird gesendet…' : 'Ja, finalisieren & senden'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

// Pflicht-Fenster beim Statuswechsel auf "Warten auf Abholung" / "Versendet":
// finalisiert die WBW-Liste (leere Felder → 0 €), schickt sie per E-Mail an den
// Mieter und setzt erst danach den Buchungsstatus.
function WbwStatusGateModal({
  booking,
  targetStatus,
  onClose,
  onDone,
}: {
  booking: BookingDetail;
  targetStatus: string;
  onClose: () => void;
  onDone: (newStatus: string, emailFailed: boolean) => void;
}) {
  const [rows, setRows] = useState<WbwRow[]>(() => buildWbwRows(booking));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const targetLabel = STATUS_CONFIG[targetStatus]?.label || targetStatus;

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      // 1. WBW finalisieren + per E-Mail an den Mieter senden (leer → 0 €).
      const res = await fetch(`/api/admin/booking/${booking.id}/finalize-wbw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: rows.map((r) => ({ name: r.name, serial: r.serial, value: Number(r.value) || 0 })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'WBW-Finalisierung fehlgeschlagen.');
      const emailFailed = d.success === false;

      // 2. Status setzen (WBW ist jetzt finalisiert/persistiert).
      const sres = await fetch(`/api/admin/booking/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (!sres.ok) {
        const sd = await sres.json().catch(() => ({}));
        throw new Error(sd.error || 'WBW finalisiert, aber Statusänderung fehlgeschlagen.');
      }
      onDone(targetStatus, emailFailed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-heading font-bold text-base text-brand-black">
            Wiederbeschaffungswerte finalisieren
          </h3>
          <p className="text-xs text-brand-muted leading-relaxed mt-1">
            Für den Statuswechsel auf &bdquo;{targetLabel}&ldquo; wird die WBW-Liste der
            tatsächlich mitgelieferten Ausrüstung dem Mieter als PDF per E-Mail gesendet
            und ist danach maßgeblich für Ersatzansprüche. Leere Felder werden als
            <strong> 0&nbsp;€</strong> übernommen.
          </p>
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-body text-brand-black truncate">{r.name}</p>
                <p className="text-[11px] text-brand-muted">
                  {r.serial ? `SN: ${r.serial}` : 'Keine Seriennummer'}
                </p>
              </div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={r.value}
                placeholder="0"
                onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                className="w-28 text-base border border-brand-border rounded-lg px-2 py-2 text-right"
              />
              <span className="text-sm text-brand-muted">€</span>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-xs text-red-600">Keine Positionen aus der Haftungs-Berechnung verfügbar.</p>
          )}
          {rows.length > 0 && (
            <div className="pt-2 mt-1 border-t border-brand-border flex justify-between items-center">
              <span className="text-xs font-heading font-semibold text-brand-muted">Gesamt</span>
              <span className="text-sm font-heading font-bold text-brand-black">{fmtEuro(total)}</span>
            </div>
          )}
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <div className="flex items-center gap-2 justify-end flex-wrap">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-btn border border-brand-border text-sm font-heading font-semibold disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || rows.length === 0}
            className="px-4 py-2 rounded-btn bg-brand-black text-white text-sm font-heading font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Wird gesendet…' : 'WBW senden & Status setzen'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface InvoiceVersionRow {
  id: string;
  version: number;
  isCurrent: boolean;
  gross: number;
  reason: string | null;
  triggerSource: string;
  createdAt: string;
  sentAt: string | null;
  sentTo: string | null;
  pdfUrl: string | null;
}

function InvoiceVersionsPanel({ bookingId }: { bookingId: string }) {
  const [versions, setVersions] = useState<InvoiceVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}/invoice-versions`);
      const d = await res.json().catch(() => ({}));
      setMigrationPending(!!d.migrationPending);
      setVersions(Array.isArray(d.versions) ? d.versions : []);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  async function sendCurrent() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}/invoice-versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Fehlgeschlagen.');
      if (d.success === false) {
        setMsg({ t: 'err', m: d.error || 'E-Mail fehlgeschlagen.' });
      } else {
        setMsg({ t: 'ok', m: `Angepasste Rechnung an ${d.sentTo} gesendet.` });
        await load();
      }
    } catch (e) {
      setMsg({ t: 'err', m: e instanceof Error ? e.message : 'Fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  }

  // Nichts anzeigen, solange nur die Erst-Fassung (v1) existiert oder gar
  // keine — erst ab einer echten Anpassung ist der Bereich relevant.
  if (loading) return null;
  if (migrationPending) return null;
  if (versions.length < 2) return null;

  const current = versions.find((v) => v.isCurrent) ?? versions[versions.length - 1];
  const isAdjustment = current.version >= 2;

  return (
    <Section title="Rechnungsversionen">
      <div className="space-y-4">
        <p className="text-xs text-brand-muted leading-relaxed">
          Jede Fassung der Rechnung wird intern archiviert. Die aktuelle
          Fassung kannst du dem Kunden als angepasste Rechnung schicken.
        </p>

        <div className="bg-brand-bg rounded-lg divide-y divide-brand-border">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-heading font-semibold text-brand-black">
                  {v.version === 1 ? 'Ursprüngliche Rechnung' : `Anpassung Nr. ${v.version}`}
                  {v.isCurrent && (
                    <span className="ml-2 text-[10px] font-body uppercase tracking-wide text-green-700 bg-green-100 rounded px-1.5 py-0.5">aktuell</span>
                  )}
                </p>
                <p className="text-[11px] text-brand-muted">
                  {fmtDateTime(v.createdAt)} · {fmtEuro(v.gross)}
                  {v.reason ? ` · ${v.reason}` : ''}
                </p>
                <p className="text-[11px] text-brand-muted">
                  {v.sentAt ? `An Kunden gesendet: ${fmtDateTime(v.sentAt)} (${v.sentTo || '—'})` : 'Noch nicht an Kunden gesendet'}
                </p>
              </div>
              {v.pdfUrl && (
                <a
                  href={v.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-btn border border-brand-border text-xs font-heading font-semibold text-brand-black hover:bg-white transition-colors shrink-0"
                >
                  PDF
                </a>
              )}
            </div>
          ))}
        </div>

        {msg && (
          <p className={`text-xs ${msg.t === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.m}</p>
        )}

        {isAdjustment && (
          <button
            type="button"
            onClick={sendCurrent}
            disabled={busy}
            className="px-4 py-2 rounded-btn bg-brand-black text-white text-sm font-heading font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {busy
              ? 'Wird gesendet…'
              : current.sentAt
                ? 'Angepasste Rechnung erneut senden'
                : 'Angepasste Rechnung an Kunden senden'}
          </button>
        )}
      </div>
    </Section>
  );
}

function BillingAddressSection({
  booking,
  onSaved,
}: {
  booking: BookingDetail;
  onSaved: () => void;
}) {
  const hasOverride = (
    (booking.invoice_address ?? '').trim().length > 0 ||
    (booking.invoice_name ?? '').trim().length > 0
  );
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(booking.invoice_name ?? '');
  const [addr, setAddr] = useState(booking.invoice_address ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);

  function openEdit() {
    setName(booking.invoice_name ?? '');
    setAddr(booking.invoice_address ?? '');
    setReason('');
    setMsg(null);
    setEditing(true);
  }

  async function save(reset = false) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/booking/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_address: reset
            ? { invoice_name: null, invoice_address: null, reason: reason.trim() || undefined }
            : { invoice_name: name.trim() || null, invoice_address: addr.trim(), reason: reason.trim() || undefined },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Fehlgeschlagen.');
      setMsg({ t: 'ok', m: reset ? 'Rechnungsadresse zurückgesetzt.' : 'Rechnungsadresse gespeichert. Eine neue Rechnungsfassung wird erzeugt.' });
      setEditing(false);
      onSaved();
    } catch (e) {
      setMsg({ t: 'err', m: e instanceof Error ? e.message : 'Fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Abweichende Rechnungsadresse">
      <div className="space-y-3">
        <p className="text-xs text-brand-muted leading-relaxed">
          Optional: ein anderer Empfänger und/oder eine andere Anschrift auf
          der Rechnung. Wirkt nur auf die Rechnung — Liefer-/Abholadresse,
          Mietvertrag und Versandetikett bleiben unverändert.
        </p>

        {!editing && (
          <div className="bg-brand-bg rounded-lg p-3 border border-brand-border">
            {hasOverride ? (
              <>
                <p className="text-[10px] uppercase tracking-wide text-brand-muted font-heading mb-1">
                  Wird auf der Rechnung verwendet
                </p>
                <p className="text-sm font-body text-brand-black whitespace-pre-line">
                  {(booking.invoice_name ?? '').trim() || booking.customer_name || '—'}
                </p>
                <p className="text-sm font-body text-brand-black whitespace-pre-line">
                  {booking.invoice_address}
                </p>
              </>
            ) : (
              <p className="text-sm font-body text-brand-muted">
                Keine abweichende Rechnungsadresse hinterlegt. Es wird die
                Versand-/Profil-Adresse verwendet.
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={openEdit}
                className="text-xs font-body px-3 py-1.5 rounded bg-accent-blue text-white hover:bg-blue-700"
              >
                {hasOverride ? 'Bearbeiten' : '+ Abweichende Adresse hinzufügen'}
              </button>
              {hasOverride && (
                <button
                  onClick={() => save(true)}
                  disabled={busy}
                  className="text-xs font-body px-3 py-1.5 rounded border border-brand-border text-brand-muted hover:bg-brand-bg disabled:opacity-50"
                >
                  Auf Standard zurücksetzen
                </button>
              )}
            </div>
          </div>
        )}

        {editing && (
          <div className="bg-brand-bg rounded-lg p-3 border border-brand-border space-y-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-brand-muted font-heading mb-1">
                Empfängername (optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={booking.customer_name ?? ''}
                maxLength={200}
                className="w-full text-base font-body px-3 py-2 rounded border border-brand-border bg-white"
              />
              <p className="text-[11px] text-brand-muted mt-1">
                Leer = aktueller Kundenname ({booking.customer_name || '—'}).
              </p>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-brand-muted font-heading mb-1">
                Rechnungsadresse *
              </label>
              <textarea
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                placeholder="Straße Nr.&#10;PLZ Stadt"
                rows={3}
                maxLength={500}
                className="w-full text-base font-body px-3 py-2 rounded border border-brand-border bg-white"
              />
              <p className="text-[11px] text-brand-muted mt-1">
                Mehrzeilig erlaubt. Z.B. „Firma GmbH, Musterstraße 1, 12345 Berlin&ldquo;.
              </p>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-brand-muted font-heading mb-1">
                Grund (optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z.B. Kunde wünscht Rechnung an Arbeitgeber"
                maxLength={200}
                className="w-full text-sm font-body px-3 py-2 rounded border border-brand-border bg-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => save(false)}
                disabled={busy || addr.trim().length === 0}
                className="text-sm font-body px-4 py-2 rounded bg-accent-blue text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? 'Speichern…' : 'Speichern'}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="text-sm font-body px-4 py-2 rounded border border-brand-border text-brand-muted hover:bg-white disabled:opacity-50"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {msg && (
          <p className={`text-xs font-body ${msg.t === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {msg.m}
          </p>
        )}
      </div>
    </Section>
  );
}

function LiabilityLineRow({ line }: { line: LiabilityLine }) {
  const sourceLabel: Record<LiabilityLine['source'], string> = {
    asset: 'Anlage',
    accessory_replacement: 'Wiederb.-Wert',
    product_deposit: 'Kautions-Anker',
    unknown: 'unbekannt',
  };
  return (
    <div className="flex justify-between items-baseline gap-3">
      <div className="flex-1 min-w-0">
        <span className="text-xs font-body text-brand-black truncate block">
          {line.qty > 1 ? `${line.qty}× ` : ''}{line.name}
        </span>
        {line.qty > 1 && (
          <span className="text-[10px] text-brand-muted">{fmtEuro(line.unit_value)} / Stueck · Quelle: {sourceLabel[line.source]}</span>
        )}
        {line.qty === 1 && line.source !== 'asset' && (
          <span className="text-[10px] text-brand-muted">Quelle: {sourceLabel[line.source]}</span>
        )}
      </div>
      <span className="text-xs font-heading font-semibold text-brand-black whitespace-nowrap">
        {fmtEuro(line.total_value)}
      </span>
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

// ─── Versand- / Rückgabe-Datum Override ──────────────────────────────────────
//
// Erlaubt dem Admin, Versand-/Übergabe-Tag (vor Mietbeginn) und Rückgabe-
// Soll-Tag (nach Mietende) pro Buchung manuell zu setzen. Override hat
// Vorrang vor admin_settings.booking_buffer_days. NULL = wieder Default.
//
// Wird wirksam in:
//  - Customer-Kalender (Verfügbarkeit blockiert exakt diesen Zeitraum)
//  - Admin-Verfügbarkeits-Gantt (Puffer-Balken nutzt Override)
//  - Auftrags-Kalender (ship_date / return_date kommen aus Override)
//  - Rückgabe-Liste /admin/retouren (Soll-Datum = return_due_date_override)

interface ShipBuf {
  versand_before: number;
  versand_after: number;
  abholung_before: number;
  abholung_after: number;
}

const SHIP_DEFAULT_BUFFER: ShipBuf = {
  versand_before: 2, versand_after: 2,
  abholung_before: 0, abholung_after: 1,
};

function shipAddDays(dateStr: string, n: number): string {
  // Local-Date-Arithmetik (kein UTC-Shift), liefert YYYY-MM-DD.
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function ShippingOverrideSection({
  bookingId,
  rentalFrom,
  rentalTo,
  deliveryMode,
  shipDateOverride,
  returnDueDateOverride,
  onSaved,
}: {
  bookingId: string;
  rentalFrom: string;
  rentalTo: string;
  deliveryMode: string;
  shipDateOverride: string | null;
  returnDueDateOverride: string | null;
  onSaved: () => void;
}) {
  const [buf, setBuf] = useState<ShipBuf>(SHIP_DEFAULT_BUFFER);
  const [shipDate, setShipDate] = useState<string>(shipDateOverride?.slice(0, 10) ?? '');
  const [returnDate, setReturnDate] = useState<string>(returnDueDateOverride?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Puffer laden für die Default-Vorschläge
  useEffect(() => {
    fetch('/api/admin/settings?key=booking_buffer_days')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.value) return;
        const parsed = typeof d.value === 'string' ? JSON.parse(d.value) : d.value;
        if (parsed && typeof parsed === 'object') setBuf({ ...SHIP_DEFAULT_BUFFER, ...parsed });
      })
      .catch(() => {});
  }, []);

  // Defaults aus rental_from/rental_to + delivery_mode + buffer
  const isAbholung = deliveryMode === 'abholung';
  const defaultShip = shipAddDays(rentalFrom, -(isAbholung ? buf.abholung_before : buf.versand_before));
  const defaultReturn = shipAddDays(rentalTo, isAbholung ? buf.abholung_after : buf.versand_after);

  // Bei externer Änderung (z.B. nach onSaved): State neu syncen
  useEffect(() => { setShipDate(shipDateOverride?.slice(0, 10) ?? ''); }, [shipDateOverride]);
  useEffect(() => { setReturnDate(returnDueDateOverride?.slice(0, 10) ?? ''); }, [returnDueDateOverride]);

  const shipChanged = (shipDateOverride?.slice(0, 10) ?? '') !== shipDate;
  const returnChanged = (returnDueDateOverride?.slice(0, 10) ?? '') !== returnDate;
  const hasChanges = shipChanged || returnChanged;
  const hasAnyOverride = !!shipDateOverride || !!returnDueDateOverride;

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (shipChanged) body.ship_date_override = shipDate || null;
      if (returnChanged) body.return_due_date_override = returnDate || null;
      const res = await fetch(`/api/admin/booking/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: 'err', text: data?.error ?? 'Speichern fehlgeschlagen.' });
        return;
      }
      setMsg({ type: 'ok', text: 'Gespeichert.' });
      window.setTimeout(() => setMsg(null), 3000);
      onSaved();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Fehler beim Speichern.' });
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/booking/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ship_date_override: null, return_due_date_override: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: 'err', text: data?.error ?? 'Zurücksetzen fehlgeschlagen.' });
        return;
      }
      setMsg({ type: 'ok', text: 'Auf Standard-Puffer zurückgesetzt.' });
      window.setTimeout(() => setMsg(null), 3000);
      onSaved();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Fehler.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-brand-border p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading font-semibold text-base text-brand-black">Versand- / Rückgabe-Termine</h2>
          <p className="text-xs font-body text-brand-muted mt-1">
            {isAbholung
              ? 'Übergabe-Tag (vor Mietbeginn) und Rückgabe-Tag (nach Mietende) pro Buchung anpassbar. Leer = Standard-Puffer.'
              : 'Versand-Tag (vor Mietbeginn) und Rückgabe-Soll-Tag (nach Mietende) pro Buchung anpassbar. Leer = Standard-Puffer.'}
            {' Wirksam im Kunden-Kalender, Admin-Gantt, Auftragskalender und Rückgabe-Liste.'}
          </p>
        </div>
        {hasAnyOverride && (
          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-heading font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
            manuell
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1.5">
            {isAbholung ? 'Übergabe-Tag' : 'Versand-Tag'}
          </label>
          <input
            type="date"
            value={shipDate}
            onChange={(e) => setShipDate(e.target.value)}
            className="w-full px-3 py-2 text-sm font-body border border-brand-border rounded-lg bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-accent-blue"
          />
          <p className="text-[11px] font-body text-brand-muted mt-1">
            Standard: {defaultShip} ({isAbholung ? `${buf.abholung_before} Tag${buf.abholung_before !== 1 ? 'e' : ''} vor Mietbeginn` : `${buf.versand_before} Tag${buf.versand_before !== 1 ? 'e' : ''} vor Mietbeginn`})
          </p>
        </div>
        <div>
          <label className="block text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-1.5">
            {isAbholung ? 'Rückgabe-Tag' : 'Rückgabe-Soll-Tag'}
          </label>
          <input
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            className="w-full px-3 py-2 text-sm font-body border border-brand-border rounded-lg bg-white text-brand-black focus:outline-none focus:ring-2 focus:ring-accent-blue"
          />
          <p className="text-[11px] font-body text-brand-muted mt-1">
            Standard: {defaultReturn} ({isAbholung ? `${buf.abholung_after} Tag${buf.abholung_after !== 1 ? 'e' : ''} nach Mietende` : `${buf.versand_after} Tag${buf.versand_after !== 1 ? 'e' : ''} nach Mietende`})
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={save}
          disabled={!hasChanges || saving}
          className="px-4 py-2 rounded-lg text-sm font-heading font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#06b6d4' }}
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
        {hasAnyOverride && (
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-heading font-semibold text-brand-muted hover:text-brand-black border border-brand-border disabled:opacity-40"
          >
            Auf Standard zurücksetzen
          </button>
        )}
        {msg && (
          <span className={`text-xs font-body ${msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

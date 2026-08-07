'use client';

import { useEffect, useState } from 'react';
import DamageReportModal from '@/components/admin/DamageReportModal';
import { PageHeader } from '@/components/admin/ui';
import { useToast } from '@/components/admin/ui/FeedbackProvider';
import { fmtDateTime, fmtEuro } from '@/lib/format-utils';
import { getCached, setCached } from '@/lib/use-cached-fetch';
import { usePersistentState } from '@/lib/use-persistent-state';

const DAMAGE_CACHE_KEY = 'admin:damage';

interface DamageReport {
  id: string;
  booking_id: string;
  reported_by: string;
  description: string;
  photos: string[];
  damage_amount: number | null;
  deposit_retained: number | null;
  status: string;
  admin_notes: string | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  attachments?: { path: string; filename: string; mime: string; source: string }[];
  customer_visible_paths?: string[];
  booking: {
    product_name: string;
    product_id: string;
    customer_name: string;
    customer_email: string;
    deposit: number;
    deposit_intent_id: string | null;
    deposit_status: string | null;
    price_haftung: number | null;
  } | null;
}

type StatusFilter = 'all' | 'open' | 'confirmed' | 'resolved';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  open: { label: 'Offen', bg: '#f59e0b22', text: '#f59e0b' },
  confirmed: { label: 'Bestätigt', bg: '#ef444422', text: '#ef4444' },
  resolved: { label: 'Abgeschlossen', bg: '#10b98122', text: '#10b981' },
};

export default function AdminSchaedenPage() {
  const { success, error: toastError } = useToast();
  const [reports, setReports] = useState<DamageReport[]>(() => getCached<DamageReport[]>(DAMAGE_CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(() => getCached<DamageReport[]>(DAMAGE_CACHE_KEY) === undefined);
  const [filter, setFilter] = usePersistentState<StatusFilter>('admin:schaeden:filter', 'all');
  const [selectedReport, setSelectedReport] = useState<DamageReport | null>(null);
  const [editForm, setEditForm] = useState({
    damage_amount: '',
    deposit_retained: '',
    resolution_note: '',
    admin_notes: '',
    repair_until: '',
  });
  const [saving, setSaving] = useState(false);
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceNotify, setInvoiceNotify] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<{ msg: string; link?: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    // Spinner nur beim ersten Laden (kein Cache) — Wiederbesuch zeigt sofort.
    if (getCached<DamageReport[]>(DAMAGE_CACHE_KEY) === undefined) setLoading(true);
    try {
      const res = await fetch('/api/admin/damage');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReports(data.reports || []);
      setCached(DAMAGE_CACHE_KEY, data.reports || []);
    } catch {
      console.error('Failed to load damage reports');
    } finally {
      setLoading(false);
    }
  }

  function openDetail(report: DamageReport) {
    setSelectedReport(report);
    setInvoiceAmount(report.damage_amount != null ? String(report.damage_amount) : '');
    setInvoiceNotify(false);
    setInvoiceFile(null);
    setInvoiceResult(null);
    setEditForm({
      damage_amount: report.damage_amount?.toString() || '',
      deposit_retained: report.deposit_retained?.toString() || '',
      resolution_note: report.resolution_note || '',
      admin_notes: report.admin_notes || '',
      repair_until: '',
    });
  }

  async function updateStatus(newStatus: string) {
    if (!selectedReport) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/damage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReport.id,
          status: newStatus,
          damage_amount: editForm.damage_amount ? parseFloat(editForm.damage_amount) : undefined,
          deposit_retained: editForm.deposit_retained ? parseFloat(editForm.deposit_retained) : undefined,
          resolution_note: editForm.resolution_note || undefined,
          admin_notes: editForm.admin_notes || undefined,
          repair_until: editForm.repair_until || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setSelectedReport(null);
      fetchReports();
    } catch {
      toastError('Fehler beim Aktualisieren.');
    } finally {
      setSaving(false);
    }
  }

  async function retainDeposit() {
    if (!selectedReport || !editForm.deposit_retained) return;
    const amount = parseFloat(editForm.deposit_retained);
    if (isNaN(amount) || amount <= 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/damage/retain-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: selectedReport.booking_id,
          amount,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toastError(d.error || 'Fehler.');
        return;
      }
      success(`${fmtEuro(amount)} Kaution einbehalten.`);
    } catch {
      toastError('Fehler beim Einbehalten.');
    } finally {
      setSaving(false);
    }
  }

  async function createInvoice() {
    if (!selectedReport) return;
    const amount = parseFloat(invoiceAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      setInvoiceResult({ msg: 'Bitte einen Betrag größer 0 eingeben.', ok: false });
      return;
    }
    setInvoiceBusy(true);
    setInvoiceResult(null);
    try {
      const fd = new FormData();
      fd.append('reportId', selectedReport.id);
      fd.append('amount', String(amount));
      fd.append('notify_customer', invoiceNotify ? 'true' : 'false');
      if (invoiceFile) fd.append('repair_invoice', invoiceFile);

      const res = await fetch('/api/admin/damage/invoice', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) {
        setInvoiceResult({ msg: d.error || 'Fehler beim Erstellen der Forderung.', ok: false });
        return;
      }
      const mailInfo = invoiceNotify
        ? d.emailSent ? ' Kunde per E-Mail informiert.' : ` E-Mail nicht gesendet${d.emailError ? ` (${d.emailError})` : ''}.`
        : ' (keine E-Mail versendet)';
      setInvoiceResult({ msg: `Schadensersatz-Forderung ${d.bookingId} über ${fmtEuro(amount)} erstellt.${mailInfo}`, link: d.paymentUrl, ok: true });
      fetchReports();
    } catch {
      setInvoiceResult({ msg: 'Fehler beim Erstellen der Forderung.', ok: false });
    } finally {
      setInvoiceBusy(false);
    }
  }

  const counts = {
    all: reports.length,
    open: reports.filter((r) => r.status === 'open').length,
    confirmed: reports.filter((r) => r.status === 'confirmed').length,
    resolved: reports.filter((r) => r.status === 'resolved').length,
  };

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  const TABS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: `Alle (${counts.all})` },
    { value: 'open', label: `Offen (${counts.open})` },
    { value: 'confirmed', label: `Bestätigt (${counts.confirmed})` },
    { value: 'resolved', label: `Abgeschlossen (${counts.resolved})` },
  ];

  return (
    <div style={{ padding: '20px 16px', color: 'var(--admin-text)' }}>
      <PageHeader
        backLabel="Zurück"
        title="Schadensmeldungen"
        subtitle="Schäden prüfen, Kaution einbehalten, Reparaturen verwalten"
        actions={
          <button
            onClick={() => setShowCreate(true)}
            style={{ padding: '10px 18px', background: '#f97316', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            + Neue Schadensmeldung
          </button>
        }
      />

      {/* Stat Cards */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {[
          { label: 'Offene Meldungen', value: counts.open, color: '#f59e0b' },
          { label: 'Bestätigt', value: counts.confirmed, color: 'var(--admin-danger)' },
          { label: 'Abgeschlossen', value: counts.resolved, color: '#10b981' },
          { label: 'Gesamt', value: counts.all, color: 'var(--admin-accent)' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ fontSize: 12, color: 'var(--admin-text-dim)', marginBottom: 4 }}>{stat.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1 mb-6" style={{ background: 'var(--admin-surface)', borderRadius: 12, padding: 4, display: 'inline-flex' }}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: filter === tab.value ? 600 : 400,
              background: filter === tab.value ? 'var(--admin-surface-2)' : 'transparent',
              color: filter === tab.value ? 'var(--admin-accent-hover)' : 'var(--admin-text-dim)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16" style={{ color: 'var(--admin-text-dim)' }}>Lädt...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--admin-text-dim)', fontSize: 14 }}>Keine Schadensmeldungen in dieser Kategorie.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--admin-border)' }}>
                  {['Buchung', 'Kamera', 'Kunde', 'Gemeldet', 'Status', 'Betrag', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--admin-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((report, idx) => {
                  const s = STATUS_CONFIG[report.status] || { label: report.status, bg: '#1e293b', text: '#94a3b8' };
                  return (
                    <tr
                      key={report.id}
                      style={{
                        borderBottom: idx < filtered.length - 1 ? '1px solid var(--admin-border)' : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onClick={() => openDetail(report)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1e293b44'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', fontFamily: 'monospace' }}>{report.booking_id}</p>
                        <p style={{ fontSize: 11, color: 'var(--admin-text-dim)', marginTop: 2 }}>
                          {report.reported_by === 'customer' ? 'Vom Kunden' : 'Vom Admin'}
                        </p>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, color: 'var(--admin-text)' }}>{report.booking?.product_name || '–'}</p>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, color: 'var(--admin-text)' }}>{report.booking?.customer_name || '–'}</p>
                        {report.booking?.customer_email && (
                          <p style={{ fontSize: 11, color: 'var(--admin-text-dim)' }}>{report.booking.customer_email}</p>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, color: 'var(--admin-muted)' }}>{fmtDateTime(report.created_at)}</p>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: s.bg, color: s.text }}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {report.damage_amount != null ? (
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-danger)' }}>{fmtEuro(report.damage_amount)}</p>
                        ) : (
                          <p style={{ fontSize: 13, color: 'var(--admin-text-dim)' }}>–</p>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <span style={{ fontSize: 12, color: 'var(--admin-accent)' }}>Details →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedReport && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedReport(null); }}
        >
          <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', padding: 32 }}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
                  Schadensmeldung
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>{selectedReport.booking_id}</p>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                style={{ color: '#64748b', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                &times;
              </button>
            </div>

            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div>
                <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Kamera</p>
                <p style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 600 }}>{selectedReport.booking?.product_name || '–'}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Kunde</p>
                <p style={{ fontSize: 14, color: '#e2e8f0' }}>{selectedReport.booking?.customer_name || '–'}</p>
                <p style={{ fontSize: 12, color: '#94a3b8' }}>{selectedReport.booking?.customer_email}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Gemeldet am</p>
                <p style={{ fontSize: 14, color: '#94a3b8' }}>{fmtDateTime(selectedReport.created_at)}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  {selectedReport.booking?.deposit_intent_id ? 'Kaution (Pre-Auth)' : 'Kautions-Anker'}
                </p>
                <p style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 600 }}>{fmtEuro(selectedReport.booking?.deposit || 0)}</p>
                {!selectedReport.booking?.deposit_intent_id && (selectedReport.booking?.price_haftung ?? 0) > 0 && (
                  <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>
                    Haftungsschutz-Modus · keine Pre-Auth
                  </p>
                )}
              </div>
            </div>

            {/* Beschreibung */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Beschreibung</p>
              <div style={{ background: '#0a0f1e', borderRadius: 10, padding: 16 }}>
                <p style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedReport.description}</p>
              </div>
            </div>

            {/* Fotos */}
            {selectedReport.photos.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  Fotos ({selectedReport.photos.length})
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selectedReport.photos.map((urlOrPath, i) => {
                    // Sweep 9 Followup: neue Eintraege sind Storage-Pfade,
                    // Legacy-Eintraege sind volle URLs (PublicURL aus Pre-
                    // Sweep-9-Zeit). Beide unterstuetzen.
                    const isLegacyUrl = /^https?:\/\//.test(urlOrPath);
                    const src = isLegacyUrl
                      ? urlOrPath
                      : `/api/admin/damage-photo-url?path=${encodeURIComponent(urlOrPath)}`;
                    const shared = (selectedReport.customer_visible_paths || []).includes(urlOrPath);
                    return (
                      <div key={i} style={{ width: 80 }}>
                        <button
                          onClick={() => setPhotoModal(src)}
                          style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #1e293b', cursor: 'pointer', padding: 0, background: 'none' }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Schaden ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </button>
                        <p style={{ fontSize: 10, marginTop: 3, color: shared ? '#34d399' : '#64748b' }}>{shared ? '🔓 Kunde' : '🔒 intern'}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Weitere Anhänge (Dokumente / Mailverlauf) */}
            {(selectedReport.attachments?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  Anhänge ({selectedReport.attachments!.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedReport.attachments!.map((a, i) => {
                    const shared = (selectedReport.customer_visible_paths || []).includes(a.path);
                    return (
                      <a
                        key={i}
                        href={`/api/admin/damage-attachment-url?path=${encodeURIComponent(a.path)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#0a0f1e', border: '1px solid #1e293b', textDecoration: 'none' }}
                      >
                        <span style={{ fontSize: 13, color: '#93c5fd', wordBreak: 'break-all' }}>
                          {a.source === 'email_history' ? '✉️ ' : '📎 '}{a.filename}
                        </span>
                        <span style={{ fontSize: 10, color: shared ? '#34d399' : '#64748b', whiteSpace: 'nowrap' }}>{shared ? '🔓 Kunde' : '🔒 intern'}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Schadensersatz-Forderung an Kunden (Zahlungsaufforderung + Zahlungslink) */}
            <div style={{ height: 1, background: '#1e293b', margin: '24px 0' }} />
            <div style={{ background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 12, padding: 16, marginBottom: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Schadensersatz-Forderung an Kunden</p>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
                Erstellt eine <strong>Zahlungsaufforderung (echter Schadensersatz)</strong> über die Reparaturkosten
                brutto — <strong>keine Rechnung, keine Rechnungsnummer, ohne USt</strong> (§ 19 UStG). Die Einnahme
                fließt als Betriebseinnahme in die EÜR, Zahlung per Stripe-Link (Karte/PayPal) oder Überweisung.
                Die von dir bezahlte Reparaturrechnung buchst du separat als Betriebsausgabe (Einkauf/Belege).
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Reparaturkosten brutto (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={invoiceAmount}
                    onChange={(e) => setInvoiceAmount(e.target.value)}
                    placeholder="0,00"
                    style={{ width: '100%', padding: '10px 14px', background: '#111827', border: '1px solid #1e293b', borderRadius: 10, color: '#e2e8f0', fontSize: 14, outline: 'none' }}
                  />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                  Kopie der Reparaturrechnung <span style={{ color: '#64748b' }}>(optional, PDF/Bild — wird beigelegt)</span>
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                  style={{ fontSize: 12, color: '#94a3b8' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={invoiceNotify}
                  onChange={(e) => setInvoiceNotify(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: '#ef4444', flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: '#e2e8f0' }}>
                  Zahlungsaufforderung per E-Mail an den Kunden senden
                  <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Ohne Haken wird der Vorgang nur angelegt (Zahlungslink bekommst du hier angezeigt), aber keine E-Mail verschickt.
                  </span>
                </span>
              </label>
              <button
                onClick={createInvoice}
                disabled={invoiceBusy}
                style={{ marginTop: 14, padding: '10px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: invoiceBusy ? 0.5 : 1 }}
              >
                {invoiceBusy ? 'Wird erstellt…' : 'Zahlungsaufforderung erstellen'}
              </button>
              {invoiceResult && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                  background: invoiceResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${invoiceResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  color: invoiceResult.ok ? '#6ee7b7' : '#fca5a5',
                }}>
                  {invoiceResult.msg}
                  {invoiceResult.link && (
                    <span style={{ display: 'block', marginTop: 6 }}>
                      <a href={invoiceResult.link} target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd', wordBreak: 'break-all' }}>
                        Zahlungslink öffnen ↗
                      </a>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Bearbeitung */}
            {selectedReport.status !== 'resolved' && (
              <>
                <div style={{ height: 1, background: '#1e293b', margin: '24px 0' }} />

                {/* Schadens-Modus-Hinweis */}
                {!selectedReport.booking?.deposit_intent_id && (selectedReport.booking?.price_haftung ?? 0) > 0 && (
                  <div style={{
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#fde68a', lineHeight: 1.55,
                  }}>
                    <strong>Haftungsschutz-Modus</strong> — Der Kunde hat einen Haftungsschutz gewählt, es ist <strong>keine Kaution per Stripe geblockt</strong>. Stripe-Capture aus der Pre-Auth ist nicht möglich. Wenn ein Schaden über den Höchstbetrag der Ersatzpflicht des Kunden hinaus geht, trägt cam2rent den Rest — andernfalls musst du den Mieter manuell zur Zahlung auffordern.
                  </div>
                )}
                {!selectedReport.booking?.deposit_intent_id && (selectedReport.booking?.price_haftung ?? 0) === 0 && (
                  <div style={{
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#fca5a5', lineHeight: 1.55,
                  }}>
                    <strong>Ohne Haftungsschutz</strong> — Der Kunde haftet bis zum Wiederbeschaffungswert. Es ist aber keine Stripe-Pre-Auth vorhanden, daher kein automatischer Capture moeglich. Forderung muss schriftlich an den Mieter gehen.
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Schadenshöhe (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.damage_amount}
                      onChange={(e) => setEditForm((p) => ({ ...p, damage_amount: e.target.value }))}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '10px 14px', background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, color: '#e2e8f0', fontSize: 14, outline: 'none' }}
                    />
                  </div>
                  {selectedReport.booking?.deposit_intent_id ? (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                        Kaution einbehalten (€) <span style={{ color: '#64748b' }}>max {fmtEuro(selectedReport.booking?.deposit || 0)}</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={selectedReport.booking?.deposit || 0}
                        value={editForm.deposit_retained}
                        onChange={(e) => setEditForm((p) => ({ ...p, deposit_retained: e.target.value }))}
                        placeholder="0.00"
                        style={{ width: '100%', padding: '10px 14px', background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, color: '#e2e8f0', fontSize: 14, outline: 'none' }}
                      />
                    </div>
                  ) : (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                        Kaution einbehalten <span style={{ color: '#64748b' }}>nicht verfügbar</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value="— keine Pre-Auth —"
                        style={{ width: '100%', padding: '10px 14px', background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, color: '#64748b', fontSize: 14, outline: 'none', cursor: 'not-allowed' }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Reparatur bis (optional)</label>
                  <input
                    type="date"
                    value={editForm.repair_until}
                    onChange={(e) => setEditForm((p) => ({ ...p, repair_until: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, color: '#e2e8f0', fontSize: 14, outline: 'none' }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                    Abschluss-Info an den Kunden <span style={{ color: '#34d399' }}>(sieht der Kunde)</span>
                  </label>
                  <textarea
                    value={editForm.resolution_note}
                    onChange={(e) => setEditForm((p) => ({ ...p, resolution_note: e.target.value }))}
                    rows={3}
                    placeholder="Was haben wir gemacht? z. B. Linse getauscht, Kamera wieder einsatzbereit…"
                    style={{ width: '100%', padding: '10px 14px', background: '#0a0f1e', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 10, color: '#e2e8f0', fontSize: 14, outline: 'none', resize: 'none' }}
                  />
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    Erscheint in der Abschluss-Mail an den Kunden (nur wenn der Haken unten gesetzt ist).
                  </p>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                    Admin-Notizen <span style={{ color: '#f59e0b' }}>(nur intern)</span>
                  </label>
                  <textarea
                    value={editForm.admin_notes}
                    onChange={(e) => setEditForm((p) => ({ ...p, admin_notes: e.target.value }))}
                    rows={3}
                    placeholder="Interne Notizen – gehen NICHT an den Kunden…"
                    style={{ width: '100%', padding: '10px 14px', background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, color: '#e2e8f0', fontSize: 14, outline: 'none', resize: 'none' }}
                  />
                </div>

                {/* Beim Abschließen geht IMMER eine Abschluss-Mail an den Kunden */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', marginBottom: 16, borderRadius: 10, background: '#062e22', border: '1px solid #10b981' }}>
                  <span style={{ fontSize: 16, lineHeight: 1, marginTop: 1 }}>✉️</span>
                  <span style={{ fontSize: 13, color: '#e2e8f0' }}>
                    Beim Abschließen geht automatisch eine E-Mail an den Kunden.
                    <span style={{ display: 'block', fontSize: 11, color: '#6ee7b7', marginTop: 2 }}>
                      Enthält Schadenshöhe, einbehaltenen Betrag und die &bdquo;Abschluss-Info an den Kunden&ldquo;. Die Admin-Notizen bleiben intern. (Nur wenn eine Kunden-E-Mail hinterlegt ist.)
                    </span>
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {selectedReport.status === 'open' && (
                    <>
                      <button
                        onClick={() => updateStatus('confirmed')}
                        disabled={saving}
                        style={{ padding: '10px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
                      >
                        Schaden bestätigen
                      </button>
                      <button
                        onClick={() => updateStatus('resolved')}
                        disabled={saving}
                        style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
                      >
                        Abgeschlossen
                      </button>
                    </>
                  )}
                  {selectedReport.status === 'confirmed' && (
                    <>
                      {selectedReport.booking?.deposit_intent_id && editForm.deposit_retained && parseFloat(editForm.deposit_retained) > 0 && (
                        <button
                          onClick={retainDeposit}
                          disabled={saving}
                          style={{ padding: '10px 20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
                        >
                          Kaution einbehalten
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus('resolved')}
                        disabled={saving}
                        style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}
                      >
                        Abgeschlossen
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedReport(null)}
                    style={{ padding: '10px 20px', background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Schließen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
      {photoModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, cursor: 'pointer' }}
          onClick={() => setPhotoModal(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoModal} alt="Schadensfoto" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}

      {/* Neue Schadensmeldung (Admin erstellt für Kunden) */}
      <DamageReportModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => fetchReports()}
      />
    </div>
  );
}

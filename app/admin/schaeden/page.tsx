'use client';

import { useEffect, useState } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';

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
  created_at: string;
  resolved_at: string | null;
  booking: {
    product_name: string;
    product_id: string;
    customer_name: string;
    customer_email: string;
    deposit: number;
  } | null;
}

type StatusFilter = 'all' | 'open' | 'confirmed' | 'resolved';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  open: { label: 'Offen', bg: '#f59e0b22', text: '#f59e0b' },
  confirmed: { label: 'Bestätigt', bg: '#ef444422', text: '#ef4444' },
  resolved: { label: 'Gelöst', bg: '#10b98122', text: '#10b981' },
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtEuro(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

export default function AdminSchaedenPage() {
  const [reports, setReports] = useState<DamageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedReport, setSelectedReport] = useState<DamageReport | null>(null);
  const [editForm, setEditForm] = useState({
    damage_amount: '',
    deposit_retained: '',
    admin_notes: '',
    repair_until: '',
  });
  const [saving, setSaving] = useState(false);
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/damage');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReports(data.reports || []);
    } catch {
      console.error('Failed to load damage reports');
    } finally {
      setLoading(false);
    }
  }

  function openDetail(report: DamageReport) {
    setSelectedReport(report);
    setEditForm({
      damage_amount: report.damage_amount?.toString() || '',
      deposit_retained: report.deposit_retained?.toString() || '',
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
          admin_notes: editForm.admin_notes || undefined,
          repair_until: editForm.repair_until || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setSelectedReport(null);
      fetchReports();
    } catch {
      alert('Fehler beim Aktualisieren.');
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
        alert(d.error || 'Fehler.');
        return;
      }
      alert(`${fmtEuro(amount)} Kaution einbehalten.`);
    } catch {
      alert('Fehler beim Einbehalten.');
    } finally {
      setSaving(false);
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
    { value: 'resolved', label: `Gelöst (${counts.resolved})` },
  ];

  return (
    <div className="min-h-screen" style={{ padding: '20px 16px' }}>
      <AdminBackLink label="Zurück" />
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading font-bold text-2xl" style={{ color: '#e2e8f0' }}>
          Schadensmeldungen
        </h1>
        <p className="text-sm font-body mt-1" style={{ color: '#64748b' }}>
          Schäden prüfen, Kaution einbehalten, Reparaturen verwalten
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {[
          { label: 'Offene Meldungen', value: counts.open, color: '#f59e0b' },
          { label: 'Bestätigt', value: counts.confirmed, color: '#ef4444' },
          { label: 'Gelöst', value: counts.resolved, color: '#10b981' },
          { label: 'Gesamt', value: counts.all, color: '#06b6d4' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{stat.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1 mb-6" style={{ background: '#111827', borderRadius: 12, padding: 4, display: 'inline-flex' }}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: filter === tab.value ? 600 : 400,
              background: filter === tab.value ? '#1e293b' : 'transparent',
              color: filter === tab.value ? '#22d3ee' : '#64748b',
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
        <div className="text-center py-16" style={{ color: '#64748b' }}>Lädt...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
          <p style={{ color: '#64748b', fontSize: 14 }}>Keine Schadensmeldungen in dieser Kategorie.</p>
        </div>
      ) : (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  {['Buchung', 'Kamera', 'Kunde', 'Gemeldet', 'Status', 'Betrag', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                        borderBottom: idx < filtered.length - 1 ? '1px solid #1e293b' : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onClick={() => openDetail(report)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1e293b44'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace' }}>{report.booking_id}</p>
                        <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          {report.reported_by === 'customer' ? 'Vom Kunden' : 'Vom Admin'}
                        </p>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, color: '#e2e8f0' }}>{report.booking?.product_name || '–'}</p>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, color: '#e2e8f0' }}>{report.booking?.customer_name || '–'}</p>
                        {report.booking?.customer_email && (
                          <p style={{ fontSize: 11, color: '#64748b' }}>{report.booking.customer_email}</p>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 13, color: '#94a3b8' }}>{fmtDateTime(report.created_at)}</p>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: s.bg, color: s.text }}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {report.damage_amount != null ? (
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#ef4444' }}>{fmtEuro(report.damage_amount)}</p>
                        ) : (
                          <p style={{ fontSize: 13, color: '#64748b' }}>–</p>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <span style={{ fontSize: 12, color: '#06b6d4' }}>Details →</span>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
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
                <p style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Kaution</p>
                <p style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 600 }}>{fmtEuro(selectedReport.booking?.deposit || 0)}</p>
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
                  {selectedReport.photos.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoModal(url)}
                      style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #1e293b', cursor: 'pointer', padding: 0, background: 'none' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Schaden ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bearbeitung */}
            {selectedReport.status !== 'resolved' && (
              <>
                <div style={{ height: 1, background: '#1e293b', margin: '24px 0' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
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

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Admin-Notizen</label>
                  <textarea
                    value={editForm.admin_notes}
                    onChange={(e) => setEditForm((p) => ({ ...p, admin_notes: e.target.value }))}
                    rows={3}
                    placeholder="Interne Notizen..."
                    style={{ width: '100%', padding: '10px 14px', background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, color: '#e2e8f0', fontSize: 14, outline: 'none', resize: 'none' }}
                  />
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
                        Direkt lösen
                      </button>
                    </>
                  )}
                  {selectedReport.status === 'confirmed' && (
                    <>
                      {editForm.deposit_retained && parseFloat(editForm.deposit_retained) > 0 && (
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
                        Als gelöst markieren
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
    </div>
  );
}

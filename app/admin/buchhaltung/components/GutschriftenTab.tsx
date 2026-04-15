'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';
import StatusBadge from './shared/StatusBadge';

interface CreditNote {
  id: string;
  credit_note_number: string;
  invoice_number: string;
  invoice_id: string;
  booking_id: string;
  customer_name: string;
  customer_email: string;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
  reason: string;
  reason_category: string;
  status: string;
  refund_status: string;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
  notes: string | null;
}

interface CreditNotesResponse {
  creditNotes: CreditNote[];
  total: number;
}

const REASON_LABELS: Record<string, string> = {
  cancellation: 'Stornierung',
  complaint: 'Reklamation',
  goodwill: 'Kulanz',
  correction: 'Korrektur',
  other: 'Sonstiges',
};

export default function GutschriftenTab() {
  const [data, setData] = useState<CreditNotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [detail, setDetail] = useState<CreditNote | null>(null);
  const [editReason, setEditReason] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    try {
      const res = await fetch(`/api/admin/buchhaltung/credit-notes?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function openDetail(cn: CreditNote) {
    setDetail(cn);
    setEditReason(cn.reason);
    setEditAmount(cn.gross_amount.toFixed(2));
    setEditNotes(cn.notes || '');
  }

  async function handleApprove() {
    if (!detail) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/credit-notes/${detail.id}/approve`, { method: 'POST' });
      if (res.ok) {
        showToast('Gutschrift freigegeben und versendet', 'ok');
        setDetail(null);
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Fehler bei Freigabe', 'err');
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!detail) return;
    if (!confirm('Gutschrift wirklich verwerfen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/credit-notes/${detail.id}/reject`, { method: 'POST' });
      if (res.ok) {
        showToast('Gutschrift verworfen', 'ok');
        setDetail(null);
        fetchData();
      } else {
        showToast('Fehler', 'err');
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleSave() {
    if (!detail) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/credit-notes/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: editReason,
          gross_amount: parseFloat(editAmount),
          notes: editNotes,
        }),
      });
      if (res.ok) {
        showToast('Gutschrift aktualisiert', 'ok');
        setDetail(null);
        fetchData();
      } else {
        showToast('Fehler beim Speichern', 'err');
      }
    } finally {
      setProcessing(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', background: '#0f172a', border: '1px solid #1e293b',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%',
  };

  const pendingCount = data?.creditNotes.filter(cn => cn.status === 'pending_review').length ?? 0;

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 8, background: toast.type === 'ok' ? '#10b981' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14 }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      {pendingCount > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 14 }}>{pendingCount} Gutschrift{pendingCount !== 1 ? 'en' : ''} zur Prüfung</span>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', maxWidth: 200 }}>
          <option value="">Alle Status</option>
          <option value="pending_review">Entwurf</option>
          <option value="approved">Freigegeben</option>
          <option value="sent">Versendet</option>
          <option value="rejected">Verworfen</option>
        </select>
      </div>

      {/* Tabelle */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={thStyle}>Gutschriftnr.</th>
                <th style={thStyle}>Datum</th>
                <th style={thStyle}>Bezugsrechnung</th>
                <th style={thStyle}>Kunde</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Betrag</th>
                <th style={thStyle}>Grund</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Refund</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} style={{ padding: 12 }}><div style={{ height: 20, background: '#1e293b', borderRadius: 4 }} /></td></tr>
                ))
              ) : (data?.creditNotes ?? []).length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Keine Gutschriften vorhanden</td></tr>
              ) : (
                (data?.creditNotes ?? []).map((cn) => (
                  <tr
                    key={cn.id}
                    style={{ borderBottom: '1px solid #1e293b20', cursor: 'pointer' }}
                    onClick={() => openDetail(cn)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#0f172a'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '10px 8px', color: '#06b6d4', fontWeight: 600 }}>{cn.credit_note_number}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{fmtDateShort(cn.created_at)}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{cn.invoice_number || '—'}</td>
                    <td style={{ padding: '10px 8px', color: '#e2e8f0' }}>{cn.customer_name || '—'}</td>
                    <td style={{ padding: '10px 8px', color: '#ef4444', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(cn.gross_amount)}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{REASON_LABELS[cn.reason_category] || cn.reason_category}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}><StatusBadge status={cn.status} /></td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}><StatusBadge status={cn.refund_status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail-Modal */}
      {detail && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}
        >
          <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 28, maxWidth: 520, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, margin: 0 }}>Gutschrift {detail.credit_note_number}</h3>
              <StatusBadge status={detail.status} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, fontSize: 14 }}>
              <div><span style={{ color: '#64748b' }}>Bezugsrechnung:</span> <span style={{ color: '#06b6d4' }}>{detail.invoice_number}</span></div>
              <div><span style={{ color: '#64748b' }}>Buchung:</span> <span style={{ color: '#94a3b8' }}>{detail.booking_id}</span></div>
              <div><span style={{ color: '#64748b' }}>Kunde:</span> <span style={{ color: '#e2e8f0' }}>{detail.customer_name}</span></div>
              <div><span style={{ color: '#64748b' }}>E-Mail:</span> <span style={{ color: '#94a3b8' }}>{detail.customer_email}</span></div>
            </div>

            {detail.status === 'pending_review' ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Grund</label>
                    <input value={editReason} onChange={(e) => setEditReason(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Betrag (brutto)</label>
                    <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Notiz</label>
                    <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button onClick={handleApprove} disabled={processing} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none' }}>
                    {processing ? 'Verarbeite...' : 'Freigeben & Senden'}
                  </button>
                  <button onClick={handleSave} disabled={processing} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: 'transparent', color: '#06b6d4', border: '1px solid #06b6d4' }}>
                    Speichern
                  </button>
                  <button onClick={handleReject} disabled={processing} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: 'transparent', color: '#ef4444', border: '1px solid #ef444480' }}>
                    Verwerfen
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: '#94a3b8' }}>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b' }}>Betrag:</span> <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{formatCurrency(detail.gross_amount)}</span></div>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b' }}>Grund:</span> {detail.reason}</div>
                {detail.notes && <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b' }}>Notiz:</span> {detail.notes}</div>}
                {detail.approved_at && <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b' }}>Freigegeben:</span> {fmtDateShort(detail.approved_at)}</div>}
                {detail.sent_at && <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b' }}>Versendet:</span> {fmtDateShort(detail.sent_at)}</div>}
                <div><span style={{ color: '#64748b' }}>Refund-Status:</span> <StatusBadge status={detail.refund_status} /></div>
              </div>
            )}

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button onClick={() => setDetail(null)} style={{ padding: '8px 16px', borderRadius: 8, background: '#1e293b', color: '#94a3b8', border: 'none', cursor: 'pointer', fontSize: 13 }}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 8px', color: '#64748b', fontWeight: 600,
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
};

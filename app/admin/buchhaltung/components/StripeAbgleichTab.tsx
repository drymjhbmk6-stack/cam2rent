'use client';

import { useState, useCallback } from 'react';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';
import StatusBadge from './shared/StatusBadge';
import DateRangePicker, { type DateRange } from './shared/DateRangePicker';
import ExportButton from './shared/ExportButton';

interface StripeTx {
  id: string;
  stripe_payment_intent_id: string;
  amount: number;
  fee: number;
  net: number;
  status: string;
  payment_method: string | null;
  booking_id: string | null;
  match_status: string;
  stripe_created_at: string;
}

interface ReconciliationData {
  transactions: StripeTx[];
  summary: {
    total: number;
    matched: number;
    unmatched_stripe: number;
    unmatched_booking: number;
    total_fees: number;
  };
}

export default function StripeAbgleichTab() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [matchModal, setMatchModal] = useState<StripeTx | null>(null);
  const [matchBookingId, setMatchBookingId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [importingFees, setImportingFees] = useState(false);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const fetchData = useCallback(async (r: DateRange) => {
    if (!r.from || !r.to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/stripe-reconciliation?from=${r.from}&to=${r.to}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRangeChange = useCallback((r: DateRange) => {
    setRange(r);
    fetchData(r);
  }, [fetchData]);

  async function handleSync() {
    if (!range.from || !range.to) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/stripe-reconciliation/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: range.from, to: range.to }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast(`${result.synced} Stripe-Transaktionen synchronisiert`, 'ok');
        setLastSyncAt(new Date().toISOString());
        fetchData(range);
      } else {
        const err = await res.json();
        showToast(err.error || 'Sync fehlgeschlagen', 'err');
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleMatch() {
    if (!matchModal || !matchBookingId) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/stripe-reconciliation/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: matchModal.id, booking_id: matchBookingId }),
      });
      if (res.ok) {
        showToast('Manuell verknüpft', 'ok');
        setMatchModal(null);
        setMatchBookingId('');
        fetchData(range);
      } else {
        showToast('Fehler beim Verknüpfen', 'err');
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleCsvExport() {
    if (!range.from || !range.to) return;
    const res = await fetch(`/api/admin/buchhaltung/stripe-reconciliation/export?from=${range.from}&to=${range.to}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stripe-abgleich-${range.from}-${range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleImportFees() {
    if (!range.from || !range.to) return;
    setImportingFees(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/stripe-reconciliation/import-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: range.from, to: range.to }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast(`${result.imported} Stripe-Gebühren als Ausgaben verbucht`, 'ok');
      } else {
        const err = await res.json();
        showToast(err.error || 'Fehler', 'err');
      }
    } finally {
      setImportingFees(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', background: '#0f172a', border: '1px solid #1e293b',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%',
  };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 8, background: toast.type === 'ok' ? '#10b981' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <DateRangePicker onChange={handleRangeChange} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleSync} disabled={syncing || !range.from} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: syncing ? 'not-allowed' : 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none', opacity: syncing ? 0.5 : 1 }}>
            {syncing ? 'Synchronisiere...' : 'Synchronisieren'}
          </button>
          <button onClick={handleImportFees} disabled={importingFees || !data} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: importingFees || !data ? 'not-allowed' : 'pointer', background: 'transparent', color: '#06b6d4', border: '1px solid #06b6d4', opacity: importingFees || !data ? 0.5 : 1 }}>
            {importingFees ? 'Importiere...' : 'Gebühren als Ausgaben'}
          </button>
          <ExportButton label="CSV-Export" onClick={handleCsvExport} disabled={!data} />
        </div>
      </div>

      {lastSyncAt && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          Letzte Synchronisierung: {new Date(lastSyncAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} Uhr
        </div>
      )}

      {/* Übersicht */}
      {data?.summary && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <SummaryCard icon="check" color="#10b981" label="Verknüpft" value={`${data.summary.matched} Zahlungen`} />
          <SummaryCard icon="warn" color="#f59e0b" label="Stripe ohne Buchung" value={`${data.summary.unmatched_stripe}`} />
          <SummaryCard icon="warn" color="#f97316" label="Buchung ohne Stripe" value={`${data.summary.unmatched_booking}`} />
          <SummaryCard icon="euro" color="#06b6d4" label="Stripe-Gebühren" value={formatCurrency(data.summary.total_fees)} />
        </div>
      )}

      {/* Tabelle */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={thStyle}>Datum</th>
                <th style={thStyle}>Stripe-PI</th>
                <th style={thStyle}>Buchungs-Nr.</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Brutto</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Gebühr</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Netto</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} style={{ padding: 12 }}><div style={{ height: 20, background: '#1e293b', borderRadius: 4 }} /></td></tr>
                ))
              ) : (data?.transactions ?? []).length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Keine Transaktionen. Klicke &quot;Synchronisieren&quot; um Stripe-Daten zu laden.</td></tr>
              ) : (
                (data?.transactions ?? []).map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{fmtDateShort(tx.stripe_created_at)}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>{tx.stripe_payment_intent_id.slice(0, 20)}...</td>
                    <td style={{ padding: '10px 8px', color: tx.booking_id ? '#06b6d4' : '#64748b', fontWeight: tx.booking_id ? 600 : 400 }}>{tx.booking_id || '—'}</td>
                    <td style={{ padding: '10px 8px', color: '#e2e8f0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatCurrency(tx.amount)}</td>
                    <td style={{ padding: '10px 8px', color: '#ef4444', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(tx.fee)}</td>
                    <td style={{ padding: '10px 8px', color: '#10b981', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(tx.net)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}><StatusBadge status={tx.match_status} /></td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      {tx.match_status === 'unmatched' && (
                        <button
                          onClick={() => { setMatchModal(tx); setMatchBookingId(''); }}
                          style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid #1e293b', color: '#06b6d4', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >
                          Verknüpfen
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Match-Modal */}
      {matchModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMatchModal(null); }}
        >
          <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 28, maxWidth: 440, width: '90%' }}>
            <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Manuell verknüpfen</h3>
            <div style={{ marginBottom: 16, fontSize: 14, color: '#94a3b8' }}>
              <div>Stripe-PI: <span style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{matchModal.stripe_payment_intent_id.slice(0, 30)}...</span></div>
              <div>Betrag: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatCurrency(matchModal.amount)}</span></div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Buchungs-ID</label>
              <input value={matchBookingId} onChange={(e) => setMatchBookingId(e.target.value)} placeholder="z.B. BK-2026-00001" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleMatch} disabled={processing || !matchBookingId} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none', opacity: processing || !matchBookingId ? 0.5 : 1 }}>
                {processing ? 'Verknüpfe...' : 'Verknüpfen'}
              </button>
              <button onClick={() => setMatchModal(null)} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b' }}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
    warn: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    euro: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  };
  return (
    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 180 }}>
      {iconMap[icon]}
      <div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 8px', color: '#64748b', fontWeight: 600,
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
};

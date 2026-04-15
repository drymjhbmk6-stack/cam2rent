'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';
import StatusBadge from './shared/StatusBadge';

interface OpenItem {
  id: string;
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  gross_amount: number;
  invoice_date: string;
  due_date: string | null;
  days_overdue: number;
  dunning_level: number;
  last_dunning_at: string | null;
}

interface OpenItemsResponse {
  items: OpenItem[];
  total: number;
  totalAmount: number;
}

export default function OffenePostenTab() {
  const [data, setData] = useState<OpenItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [modal, setModal] = useState<{ type: 'dunning' | 'paid'; item: OpenItem } | null>(null);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidMethod, setPaidMethod] = useState('bank_transfer');
  const [paidNote, setPaidNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/open-items');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleCreateDunning(item: OpenItem) {
    setProcessing(true);
    try {
      const nextLevel = Math.min(item.dunning_level + 1, 3);
      const res = await fetch('/api/admin/buchhaltung/dunning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: item.invoice_id, level: nextLevel }),
      });
      if (res.ok) {
        showToast(`Mahnung Stufe ${nextLevel} erstellt`, 'ok');
        setModal(null);
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Fehler', 'err');
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleMarkPaid(item: OpenItem) {
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/invoices/${item.invoice_id}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: paidDate, method: paidMethod, note: paidNote }),
      });
      if (res.ok) {
        showToast('Als bezahlt markiert', 'ok');
        setModal(null);
        fetchData();
      } else {
        showToast('Fehler beim Markieren', 'err');
      }
    } finally {
      setProcessing(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          padding: '12px 20px', borderRadius: 8,
          background: toast.type === 'ok' ? '#10b981' : '#ef4444',
          color: '#fff', fontWeight: 600, fontSize: 14,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Zusammenfassung */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 24px' }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Offene Posten</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{data?.total ?? 0}</div>
        </div>
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 24px' }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Gesamtsumme offen</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{formatCurrency(data?.totalAmount ?? 0)}</div>
        </div>
      </div>

      {/* Tabelle */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={thStyle}>Rechnungsnr.</th>
                <th style={thStyle}>Kunde</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Betrag</th>
                <th style={thStyle}>Rechnungsdatum</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Fällig seit</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Mahnstufe</th>
                <th style={thStyle}>Letzte Mahnung</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} style={{ padding: 12 }}><div style={{ height: 20, background: '#1e293b', borderRadius: 4 }} /></td></tr>
                ))
              ) : (data?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                    Keine offenen Posten — alles bezahlt!
                  </td>
                </tr>
              ) : (
                (data?.items ?? []).map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                    <td style={{ padding: '10px 8px', color: '#06b6d4', fontWeight: 600 }}>{item.invoice_number}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ color: '#e2e8f0' }}>{item.customer_name}</div>
                      <div style={{ color: '#64748b', fontSize: 11 }}>{item.customer_email}</div>
                    </td>
                    <td style={{ padding: '10px 8px', color: '#e2e8f0', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(item.gross_amount)}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{fmtDateShort(item.invoice_date)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <span style={{ color: item.days_overdue > 30 ? '#ef4444' : item.days_overdue > 14 ? '#f59e0b' : '#94a3b8', fontWeight: 600 }}>
                        {item.days_overdue} Tage
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      {item.dunning_level > 0 ? (
                        <DunningBadge level={item.dunning_level} />
                      ) : (
                        <span style={{ color: '#64748b' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>
                      {item.last_dunning_at ? fmtDateShort(item.last_dunning_at) : '—'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button
                          onClick={() => setModal({ type: 'dunning', item })}
                          style={actionBtnStyle}
                          title="Mahnung erzeugen"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        </button>
                        <button
                          onClick={() => setModal({ type: 'paid', item })}
                          style={actionBtnStyle}
                          title="Als bezahlt markieren"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Mahnung erzeugen */}
      {modal?.type === 'dunning' && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Mahnung erzeugen</h3>
          <div style={{ marginBottom: 16, fontSize: 14, color: '#94a3b8' }}>
            <div>Rechnung: <span style={{ color: '#06b6d4', fontWeight: 600 }}>{modal.item.invoice_number}</span></div>
            <div>Kunde: <span style={{ color: '#e2e8f0' }}>{modal.item.customer_name}</span></div>
            <div>Betrag: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatCurrency(modal.item.gross_amount)}</span></div>
            <div>Nächste Stufe: <span style={{ color: '#f59e0b', fontWeight: 700 }}>{Math.min(modal.item.dunning_level + 1, 3)}</span></div>
          </div>
          <StatusBadge status={modal.item.dunning_level >= 2 ? 'escalated' : 'draft'} customLabel={`Stufe ${Math.min(modal.item.dunning_level + 1, 3)} wird erstellt`} />
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={() => handleCreateDunning(modal.item)} disabled={processing} style={primaryBtnStyle}>
              {processing ? 'Erstelle...' : 'Mahnung erstellen'}
            </button>
            <button onClick={() => setModal(null)} style={secondaryBtnStyle}>Abbrechen</button>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: Als bezahlt markieren */}
      {modal?.type === 'paid' && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Als bezahlt markieren</h3>
          <div style={{ marginBottom: 16, fontSize: 14, color: '#94a3b8' }}>
            Rechnung <span style={{ color: '#06b6d4', fontWeight: 600 }}>{modal.item.invoice_number}</span> — {formatCurrency(modal.item.gross_amount)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Zahlungsdatum</label>
              <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Zahlungsweise</label>
              <select value={paidMethod} onChange={(e) => setPaidMethod(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="bank_transfer">Banküberweisung</option>
                <option value="paypal">PayPal</option>
                <option value="stripe">Stripe</option>
                <option value="cash">Barzahlung</option>
                <option value="other">Sonstige</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Notiz (optional)</label>
              <input type="text" value={paidNote} onChange={(e) => setPaidNote(e.target.value)} placeholder="z.B. Referenznummer" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={() => handleMarkPaid(modal.item)} disabled={processing} style={{ ...primaryBtnStyle, background: '#10b981' }}>
              {processing ? 'Speichere...' : 'Als bezahlt markieren'}
            </button>
            <button onClick={() => setModal(null)} style={secondaryBtnStyle}>Abbrechen</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function DunningBadge({ level }: { level: number }) {
  const colors = { 1: '#f59e0b', 2: '#f97316', 3: '#ef4444' };
  const c = colors[level as keyof typeof colors] || '#64748b';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 700,
      background: `${c}20`, color: c, border: `1px solid ${c}40`,
    }}>
      {level}
    </span>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 28, maxWidth: 480, width: '90%' }}>
        {children}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 8px', color: '#64748b', fontWeight: 600,
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
};

const actionBtnStyle: React.CSSProperties = {
  padding: 6, borderRadius: 6, background: 'transparent',
  border: '1px solid #1e293b', color: '#94a3b8', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
  cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
  cursor: 'pointer', background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b',
};

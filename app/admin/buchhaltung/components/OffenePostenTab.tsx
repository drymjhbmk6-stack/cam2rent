'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';


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
  dunningStats: { level1: number; level2: number; level3: number };
}

export default function OffenePostenTab() {
  const [data, setData] = useState<OpenItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Mahnung-Modal State
  const [dunningModal, setDunningModal] = useState<OpenItem | null>(null);
  const [dunningFee, setDunningFee] = useState('');
  const [dunningText, setDunningText] = useState('');
  const [dunningLoading, setDunningLoading] = useState(false);

  // Bezahlt-Modal State
  const [paidModal, setPaidModal] = useState<OpenItem | null>(null);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidMethod, setPaidMethod] = useState('bank_transfer');
  const [paidNote, setPaidNote] = useState('');
  const [paidLoading, setPaidLoading] = useState(false);

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

  // Mahnung-Modal öffnen: Lade Mahn-Text + Gebühr
  async function openDunningModal(item: OpenItem) {
    setDunningModal(item);
    setDunningLoading(true);
    const nextLevel = Math.min(item.dunning_level + 1, 3);
    try {
      // Gebühr laden
      const feeRes = await fetch(`/api/admin/settings?key=accounting_dunning_fee_${nextLevel}`);
      if (feeRes.ok) {
        const d = await feeRes.json();
        setDunningFee(d.value || '0');
      }
      // Mahn-Text laden
      const textRes = await fetch(`/api/admin/settings?key=accounting_dunning_text_${nextLevel}`);
      if (textRes.ok) {
        const d = await textRes.json();
        let text = d.value || '';
        // Platzhalter ersetzen
        text = text.replace(/{kunde}/g, item.customer_name || 'Kunde');
        text = text.replace(/{rechnungsnr}/g, item.invoice_number || '');
        text = text.replace(/{betrag}/g, formatCurrency(item.gross_amount));
        text = text.replace(/{faellig_seit_tagen}/g, String(item.days_overdue));
        const newDue = new Date();
        newDue.setDate(newDue.getDate() + 7);
        text = text.replace(/{neue_frist}/g, newDue.toLocaleDateString('de-DE'));
        text = text.replace(/{mahngebuehr}/g, formatCurrency(parseFloat(dunningFee || '0')));
        setDunningText(text);
      }
    } finally {
      setDunningLoading(false);
    }
  }

  async function handleSendDunning() {
    if (!dunningModal) return;
    setDunningLoading(true);
    const nextLevel = Math.min(dunningModal.dunning_level + 1, 3);
    try {
      const res = await fetch('/api/admin/buchhaltung/dunning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: dunningModal.invoice_id,
          level: nextLevel,
          fee: parseFloat(dunningFee) || 0,
          custom_text: dunningText,
          send: true,
        }),
      });
      if (res.ok) {
        showToast(`Mahnung Stufe ${nextLevel} erstellt und versendet`, 'ok');
        setDunningModal(null);
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Fehler', 'err');
      }
    } finally {
      setDunningLoading(false);
    }
  }

  async function handleSaveDunningDraft() {
    if (!dunningModal) return;
    setDunningLoading(true);
    const nextLevel = Math.min(dunningModal.dunning_level + 1, 3);
    try {
      const res = await fetch('/api/admin/buchhaltung/dunning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: dunningModal.invoice_id,
          level: nextLevel,
          fee: parseFloat(dunningFee) || 0,
          custom_text: dunningText,
          send: false,
        }),
      });
      if (res.ok) {
        showToast(`Mahnentwurf Stufe ${nextLevel} gespeichert`, 'ok');
        setDunningModal(null);
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Fehler', 'err');
      }
    } finally {
      setDunningLoading(false);
    }
  }

  async function handleMarkPaid() {
    if (!paidModal) return;
    setPaidLoading(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/invoices/${paidModal.invoice_id}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: paidDate, method: paidMethod, note: paidNote }),
      });
      if (res.ok) {
        showToast('Als bezahlt markiert', 'ok');
        setPaidModal(null);
        fetchData();
      } else {
        showToast('Fehler beim Markieren', 'err');
      }
    } finally {
      setPaidLoading(false);
    }
  }

  // Filter
  const filtered = (data?.items ?? []).filter(item => {
    if (search) {
      const s = search.toLowerCase();
      if (!item.invoice_number.toLowerCase().includes(s) &&
          !item.customer_name.toLowerCase().includes(s) &&
          !item.customer_email.toLowerCase().includes(s)) return false;
    }
    if (levelFilter) {
      const lvl = parseInt(levelFilter);
      if (item.dunning_level !== lvl) return false;
    }
    return true;
  });

  const mahnfaellig = (data?.items ?? []).filter(i => i.days_overdue >= 14);

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', background: '#0f172a', border: '1px solid #1e293b',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%',
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px', borderRadius: 8, background: toast.type === 'ok' ? '#10b981' : '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {toast.msg}
        </div>
      )}

      {/* Übersicht */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <SummaryCard label="Offen gesamt" value={formatCurrency(data?.totalAmount ?? 0)} color="#ef4444" />
        <SummaryCard label="Offene Rechnungen" value={String(data?.total ?? 0)} color="#f59e0b" />
        <SummaryCard label="Davon mahnfällig" value={String(mahnfaellig.length)} color="#f97316"
          subtitle={data?.dunningStats ? `Stufe 1: ${data.dunningStats.level1} | Stufe 2: ${data.dunningStats.level2} | Stufe 3: ${data.dunningStats.level3}` : undefined} />
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Suche: Rechnungsnr., Kunde..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 240, width: 'auto' }}
        />
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer', width: 'auto', minWidth: 160 }}
        >
          <option value="">Alle Stufen</option>
          <option value="0">Nicht gemahnt</option>
          <option value="1">Stufe 1</option>
          <option value="2">Stufe 2</option>
          <option value="3">Stufe 3</option>
        </select>
      </div>

      {/* Tabelle */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={{ padding: '12px 8px', width: 36 }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={() => {
                      if (selected.size === filtered.length) setSelected(new Set());
                      else setSelected(new Set(filtered.map(i => i.invoice_id)));
                    }}
                  />
                </th>
                <th style={thStyle}>Rechnungsnr.</th>
                <th style={thStyle}>Kunde</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Betrag</th>
                <th style={thStyle}>Datum</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Fällig seit</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Stufe</th>
                <th style={thStyle}>Letzte Mahnung</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={9} style={{ padding: 12 }}><div style={{ height: 20, background: '#1e293b', borderRadius: 4 }} /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                    {search || levelFilter ? 'Keine Ergebnisse für diesen Filter' : 'Keine offenen Posten — alles bezahlt!'}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selected.has(item.invoice_id)} onChange={() => {
                        setSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(item.invoice_id)) next.delete(item.invoice_id); else next.add(item.invoice_id);
                          return next;
                        });
                      }} />
                    </td>
                    <td style={{ padding: '10px 8px', color: '#06b6d4', fontWeight: 600 }}>{item.invoice_number}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ color: '#e2e8f0' }}>{item.customer_name}</div>
                      <div style={{ color: '#64748b', fontSize: 11 }}>{item.customer_email}</div>
                    </td>
                    <td style={{ padding: '10px 8px', color: '#e2e8f0', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(item.gross_amount)}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{fmtDateShort(item.invoice_date)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <OverdueBadge days={item.days_overdue} />
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <DunningBadge level={item.dunning_level} />
                    </td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>
                      {item.last_dunning_at ? fmtDateShort(item.last_dunning_at) : '—'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {item.dunning_level < 3 && (
                          <ActionBtn title="Mahnung erzeugen" onClick={() => openDunningModal(item)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          </ActionBtn>
                        )}
                        <ActionBtn title="Als bezahlt markieren" onClick={() => setPaidModal(item)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mahnung-Modal */}
      {dunningModal && (
        <ModalOverlay onClose={() => setDunningModal(null)}>
          <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>
            Mahnung erstellen — Stufe {Math.min(dunningModal.dunning_level + 1, 3)}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 16, fontSize: 14, color: '#94a3b8' }}>
            <div>Rechnung: <span style={{ color: '#06b6d4', fontWeight: 600 }}>{dunningModal.invoice_number}</span></div>
            <div>Betrag: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatCurrency(dunningModal.gross_amount)}</span></div>
            <div>Kunde: <span style={{ color: '#e2e8f0' }}>{dunningModal.customer_name}</span></div>
            <div>Fällig seit: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{dunningModal.days_overdue} Tagen</span></div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Mahngebühr (€)</label>
            <input type="number" step="0.01" value={dunningFee} onChange={(e) => setDunningFee(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Mahn-Text (editierbar)</label>
            <textarea
              value={dunningText}
              onChange={(e) => setDunningText(e.target.value)}
              rows={8}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleSendDunning} disabled={dunningLoading} style={primaryBtnStyle}>
              {dunningLoading ? 'Verarbeite...' : 'Freigeben & senden'}
            </button>
            <button onClick={handleSaveDunningDraft} disabled={dunningLoading} style={secondaryBtnStyle}>
              Als Entwurf speichern
            </button>
            <button onClick={() => setDunningModal(null)} style={{ ...secondaryBtnStyle, color: '#64748b' }}>Abbrechen</button>
          </div>
        </ModalOverlay>
      )}

      {/* Bezahlt-Modal */}
      {paidModal && (
        <ModalOverlay onClose={() => setPaidModal(null)}>
          <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Als bezahlt markieren</h3>
          <div style={{ marginBottom: 16, fontSize: 14, color: '#94a3b8' }}>
            Rechnung <span style={{ color: '#06b6d4', fontWeight: 600 }}>{paidModal.invoice_number}</span> — {formatCurrency(paidModal.gross_amount)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Zahlungsdatum</label>
              <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Zahlungsweise</label>
              <select value={paidMethod} onChange={(e) => setPaidMethod(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="bank_transfer">Banküberweisung</option>
                <option value="paypal">PayPal</option>
                <option value="stripe">Stripe</option>
                <option value="cash">Barzahlung</option>
                <option value="other">Sonstige</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Notiz (optional)</label>
              <input type="text" value={paidNote} onChange={(e) => setPaidNote(e.target.value)} placeholder="z.B. Referenznummer" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={handleMarkPaid} disabled={paidLoading} style={{ ...primaryBtnStyle, background: '#10b981' }}>
              {paidLoading ? 'Speichere...' : 'Als bezahlt markieren'}
            </button>
            <button onClick={() => setPaidModal(null)} style={secondaryBtnStyle}>Abbrechen</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Sub-Komponenten ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, subtitle }: { label: string; value: string; color: string; subtitle?: string }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 24px', flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      {subtitle && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}

function OverdueBadge({ days }: { days: number }) {
  const color = days > 42 ? '#ef4444' : days > 28 ? '#f97316' : days > 14 ? '#f59e0b' : '#94a3b8';
  return <span style={{ color, fontWeight: 600 }}>{days} Tage</span>;
}

function DunningBadge({ level }: { level: number }) {
  if (level === 0) return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 700, background: '#64748b20', color: '#64748b', border: '1px solid #64748b40' }}>0</span>;
  const colors = { 1: '#f59e0b', 2: '#f97316', 3: '#ef4444' };
  const c = colors[level as keyof typeof colors] || '#64748b';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 700, background: `${c}20`, color: c, border: `1px solid ${c}40` }}>
      {level}
    </span>
  );
}

function ActionBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ padding: 6, borderRadius: 6, background: 'transparent', border: '1px solid #1e293b', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.color = '#06b6d4'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}
    >
      {children}
    </button>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 28, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 8px', color: '#64748b', fontWeight: 600,
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
  cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
  cursor: 'pointer', background: 'transparent', color: '#06b6d4', border: '1px solid #1e293b',
};

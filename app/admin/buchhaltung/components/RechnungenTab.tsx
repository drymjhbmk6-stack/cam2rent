'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';
import StatusBadge from './shared/StatusBadge';
import ExportButton from './shared/ExportButton';
import BulkBar, { BulkBtn } from './shared/BulkBar';

interface Invoice {
  id: string;
  booking_id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_email: string;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
  status: string;
  pdf_url: string | null;
  sent_at: string | null;
  due_date: string | null;
  tax_mode: string;
}

interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
  page: number;
  totalPages: number;
}

export default function RechnungenTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<InvoicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || '');
  const [page, setPage] = useState(() => parseInt(searchParams.get('p') || '1', 10) || 1);
  const [perPage, setPerPage] = useState(() => parseInt(searchParams.get('limit') || '25', 10) || 25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resending, setResending] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // URL-Filter-Persistenz: bei Aenderung von search/statusFilter/page/perPage URL aktualisieren
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (search) params.set('q', search); else params.delete('q');
    if (statusFilter) params.set('status', statusFilter); else params.delete('status');
    if (page > 1) params.set('p', String(page)); else params.delete('p');
    if (perPage !== 25) params.set('limit', String(perPage)); else params.delete('limit');
    const newUrl = `/admin/buchhaltung?${params.toString()}`;
    router.replace(newUrl, { scroll: false });
  }, [search, statusFilter, page, perPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(perPage),
    });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    try {
      const res = await fetch(`/api/admin/buchhaltung/invoices?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, statusFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleResend(invoiceId: string) {
    setResending(invoiceId);
    try {
      const res = await fetch(`/api/admin/buchhaltung/invoices/${invoiceId}/resend`, { method: 'POST' });
      if (res.ok) showToast('E-Mail erneut gesendet', 'ok');
      else showToast('Fehler beim Versand', 'err');
    } finally {
      setResending(null);
    }
  }

  async function handleBulkMarkPaid() {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} ${selected.size === 1 ? 'Rechnung' : 'Rechnungen'} als bezahlt markieren?\n\nZahlungsweise: Überweisung\nDatum: heute`)) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/invoices/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid', ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast(`${json.paid} bezahlt${json.skipped ? ` · ${json.skipped} übersprungen` : ''}`, 'ok');
        setSelected(new Set());
        fetchInvoices();
      } else {
        showToast(json.error || 'Fehler', 'err');
      }
    } catch {
      showToast('Netzwerkfehler', 'err');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkResend() {
    if (selected.size === 0) return;
    if (selected.size > 20) {
      if (!confirm(`${selected.size} E-Mails versenden? Das kann ein paar Sekunden dauern.`)) return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/invoices/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'resend_email', ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast(`${json.sent} versendet${json.failed ? ` · ${json.failed} fehlgeschlagen` : ''}`, json.failed ? 'err' : 'ok');
        setSelected(new Set());
      } else {
        showToast(json.error || 'Fehler', 'err');
      }
    } catch {
      showToast('Netzwerkfehler', 'err');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleCsvExport() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    params.set('format', 'csv');
    const res = await fetch(`/api/admin/buchhaltung/invoices/export?${params}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rechnungen-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    if (selected.size === data.invoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.invoices.map(i => i.id)));
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
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Bulk-Aktionen */}
      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkBtn variant="primary" onClick={handleBulkMarkPaid} disabled={bulkBusy}>
          {bulkBusy ? 'Verarbeite…' : 'Als bezahlt markieren'}
        </BulkBtn>
        <BulkBtn variant="secondary" onClick={handleBulkResend} disabled={bulkBusy}>
          E-Mail erneut senden
        </BulkBtn>
      </BulkBar>

      {/* Filter-Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Suche: Rechnungsnr., Kunde, E-Mail, Buchungs-ID..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inputStyle, flex: 1, minWidth: 200, maxWidth: '100%' }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ ...inputStyle, cursor: 'pointer', minWidth: 150 }}
        >
          <option value="">Alle Status</option>
          <option value="paid">Bezahlt</option>
          <option value="open">Offen</option>
          <option value="overdue">Überfällig</option>
          <option value="cancelled">Storniert</option>
        </select>
        <select
          value={perPage}
          onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ ...inputStyle, cursor: 'pointer', width: 80 }}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <ExportButton label="CSV-Export" onClick={handleCsvExport} />
      </div>

      {/* Tabelle */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={{ padding: '12px 8px', width: 40 }}>
                  <input type="checkbox" checked={data ? selected.size === data.invoices.length && data.invoices.length > 0 : false} onChange={toggleSelectAll} />
                </th>
                <th style={thStyle}>Rechnungsnr.</th>
                <th style={thStyle}>Datum</th>
                <th style={thStyle}>Kunde</th>
                <th style={thStyle}>Buchung</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Netto</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Steuer</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Brutto</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1e293b20' }}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} style={{ padding: '12px 8px' }}>
                        <div style={{ height: 16, background: '#1e293b', borderRadius: 4, animation: 'shimmer 1.5s infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (data?.invoices ?? []).length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                    Keine Rechnungen gefunden
                  </td>
                </tr>
              ) : (
                (data?.invoices ?? []).map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleSelect(inv.id)} />
                    </td>
                    <td style={{ padding: '10px 8px', color: '#06b6d4', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{inv.invoice_date ? fmtDateShort(inv.invoice_date) : '—'}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ color: '#e2e8f0' }}>{inv.customer_name || '—'}</div>
                      {inv.customer_email && <div style={{ color: '#64748b', fontSize: 11 }}>{inv.customer_email}</div>}
                    </td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>{inv.booking_id}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(inv.net_amount)}</td>
                    <td style={{ padding: '10px 8px', color: '#64748b', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(inv.tax_amount)}</td>
                    <td style={{ padding: '10px 8px', color: '#e2e8f0', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(inv.gross_amount)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}><StatusBadge status={inv.status || 'paid'} /></td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {inv.pdf_url && (
                          <ActionBtn title="Herunterladen" onClick={() => window.open(inv.pdf_url!, '_blank')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </ActionBtn>
                        )}
                        <ActionBtn title="E-Mail erneut senden" onClick={() => handleResend(inv.id)} disabled={resending === inv.id}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          </ActionBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #1e293b' }}>
            <span style={{ color: '#64748b', fontSize: 13 }}>
              {data.total} Rechnungen gesamt
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Zurück</PagBtn>
              <span style={{ padding: '6px 12px', color: '#94a3b8', fontSize: 13 }}>
                Seite {data.page} von {data.totalPages}
              </span>
              <PagBtn onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages}>Weiter</PagBtn>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 8px',
  color: '#64748b',
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

function ActionBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        padding: 6,
        borderRadius: 6,
        background: 'transparent',
        border: '1px solid #1e293b',
        color: '#94a3b8',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.color = '#06b6d4'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}
    >
      {children}
    </button>
  );
}

function PagBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        background: disabled ? 'transparent' : '#1e293b',
        border: '1px solid #1e293b',
        color: disabled ? '#475569' : '#e2e8f0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

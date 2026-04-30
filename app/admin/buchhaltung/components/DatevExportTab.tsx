'use client';

import { useState, useEffect, useCallback } from 'react';
import { isoToDE, formatCurrency } from '@/lib/format-utils';
import ExportButton from './shared/ExportButton';
import DateRangePicker, { type DateRange } from './shared/DateRangePicker';

interface PreviewData { count: number; revenue: number }

interface PreviewRow {
  datum: string;
  konto: string;
  gegenkonto: string;
  betrag: string;
  buSchluessel: string;
  buchungstext: string;
}

interface Validation {
  type: 'error' | 'warning' | 'success';
  message: string;
}

interface ExportLogEntry {
  id: string;
  export_type: string;
  period_from: string;
  period_to: string;
  row_count: number;
  total_amount: number;
  exported_at: string;
}

export default function DatevExportTab() {
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [includeExpenses, setIncludeExpenses] = useState(false);
  const [exportLog, setExportLog] = useState<ExportLogEntry[]>([]);

  // Vorschau-Modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewRowsLoading, setPreviewRowsLoading] = useState(false);

  // Validierung
  const [validations, setValidations] = useState<Validation[]>([]);
  const [validationLoading, setValidationLoading] = useState(false);

  useEffect(() => {
    fetch('/api/admin/buchhaltung/export-log?type=datev')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.entries) setExportLog(data.entries); })
      .catch(() => {});
  }, []);

  const loadPreview = useCallback(async (r: DateRange) => {
    if (!r.from || !r.to) { setPreview(null); return; }
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/datev-export?from=${r.from}&to=${r.to}&preview=1`);
      if (res.ok) setPreview(await res.json());
    } finally { setPreviewLoading(false); }
  }, []);

  const handleRangeChange = useCallback((r: DateRange) => {
    setRange(r);
    loadPreview(r);
    setValidations([]);
  }, [loadPreview]);

  async function loadValidation() {
    if (!range.from || !range.to) return;
    setValidationLoading(true);
    try {
      const res = await fetch(`/api/admin/datev-export/validate?from=${range.from}&to=${range.to}`);
      if (res.ok) { const d = await res.json(); setValidations(d.warnings); }
    } finally { setValidationLoading(false); }
  }

  async function openPreviewModal() {
    if (!range.from || !range.to) return;
    setShowPreviewModal(true);
    setPreviewRowsLoading(true);
    // Lade Validierung + Vorschau-Zeilen parallel
    await Promise.all([
      loadValidation(),
      (async () => {
        const res = await fetch(`/api/admin/datev-export/preview-rows?from=${range.from}&to=${range.to}`);
        if (res.ok) { const d = await res.json(); setPreviewRows(d.rows); }
      })(),
    ]);
    setPreviewRowsLoading(false);
  }

  async function handleExport() {
    if (!range.from || !range.to) return;
    setExporting(true);
    setExportError('');
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (includeExpenses) params.set('includeExpenses', '1');
      const res = await fetch(`/api/admin/datev-export?${params}`);
      if (!res.ok) {
        const err = await res.json();
        setExportError(err.error || 'Export fehlgeschlagen');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `cam2rent-DATEV-${range.from}-bis-${range.to}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);

      // Export-Log speichern
      await fetch('/api/admin/buchhaltung/export-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          export_type: 'datev',
          period_from: range.from,
          period_to: range.to,
          row_count: preview?.count || 0,
          total_amount: preview?.revenue || 0,
          exported_by: 'admin',
          file_name: filename,
        }),
      });

      // Log aktualisieren
      const logRes = await fetch('/api/admin/buchhaltung/export-log?type=datev');
      if (logRes.ok) { const data = await logRes.json(); if (data?.entries) setExportLog(data.entries); }
    } catch {
      setExportError('Netzwerkfehler beim Export');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* Export */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 17, fontWeight: 700, marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          DATEV-Buchungsstapel Export
        </h3>

        <div style={{ marginBottom: 20 }}><DateRangePicker onChange={handleRangeChange} /></div>

        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
          Konten-Konfiguration: <a href="?tab=einstellungen" style={{ color: '#06b6d4', textDecoration: 'none' }}>Einstellungen →</a>
        </div>

        {/* Preview Summary */}
        {previewLoading ? (
          <div style={{ padding: '16px 0', color: '#64748b', fontSize: 14 }}>Vorschau laden...</div>
        ) : preview ? (
          <div style={{ display: 'flex', gap: 24, padding: 16, background: '#0f172a', borderRadius: 8, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Buchungen</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>{preview.count}</div>
            </div>
            <div style={{ width: 1, background: '#1e293b' }} />
            <div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Umsatz (brutto)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#06b6d4' }}>{formatCurrency(preview.revenue)}</div>
            </div>
            {range.from && range.to && (
              <>
                <div style={{ width: 1, background: '#1e293b' }} />
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Zeitraum</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>{isoToDE(range.from)} — {isoToDE(range.to)}</div>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Validierungswarnungen */}
        {validations.length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {validations.map((v, i) => (
              <div key={i} style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: v.type === 'error' ? 'rgba(239,68,68,0.08)' : v.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
                color: v.type === 'error' ? '#ef4444' : v.type === 'warning' ? '#f59e0b' : '#10b981',
                border: `1px solid ${v.type === 'error' ? 'rgba(239,68,68,0.2)' : v.type === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}`,
              }}>
                {v.type === 'error' ? '⚠️' : v.type === 'warning' ? '⚠️' : '✅'} {v.message}
              </div>
            ))}
          </div>
        )}

        {/* Optionen */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#94a3b8' }}>
            <input type="checkbox" checked={includeExpenses} onChange={(e) => setIncludeExpenses(e.target.checked)} style={{ accentColor: '#06b6d4' }} />
            Ausgaben mit-exportieren (als zusätzliche Buchungszeilen)
          </label>
        </div>

        {preview?.count === 0 && (
          <div style={{ padding: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#f59e0b' }}>
            Keine Buchungen im ausgewählten Zeitraum.
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <ExportButton label="DATEV-Export herunterladen" onClick={handleExport} variant="primary" disabled={exporting || !range.from || preview?.count === 0} />
          <button
            onClick={openPreviewModal}
            disabled={!range.from || preview?.count === 0}
            style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', background: 'transparent', color: '#06b6d4', border: '1px solid #06b6d4', opacity: !range.from || preview?.count === 0 ? 0.4 : 1 }}
          >
            Vorschau anzeigen
          </button>
          <button
            onClick={loadValidation}
            disabled={validationLoading || !range.from}
            style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b', opacity: validationLoading ? 0.5 : 1 }}
          >
            {validationLoading ? 'Prüfe...' : 'Validieren'}
          </button>
          {exportError && <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }}>{exportError}</span>}
        </div>

        <div style={{ marginTop: 20, padding: 14, background: 'rgba(6,182,212,0.06)', borderRadius: 8, border: '1px solid rgba(6,182,212,0.15)' }}>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Der Export erzeugt eine DATEV-Buchungsstapel-CSV (Semikolon-getrennt, UTF-8 mit BOM).
            Die Datei kann direkt in DATEV Unternehmen online oder DATEV Kanzlei-Rechnungswesen importiert werden.
          </p>
        </div>
      </div>

      {/* Vorschau-Modal */}
      {showPreviewModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPreviewModal(false); }}
        >
          <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 28, maxWidth: 900, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, margin: 0 }}>DATEV-Vorschau (erste 10 Buchungen)</h3>
              <button onClick={() => setShowPreviewModal(false)} style={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#94a3b8', padding: '6px 12px', cursor: 'pointer' }}>Schließen</button>
            </div>

            {/* Validierungen im Modal */}
            {validations.length > 0 && (
              <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {validations.map((v, i) => (
                  <div key={i} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: v.type === 'error' ? 'rgba(239,68,68,0.08)' : v.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)', color: v.type === 'error' ? '#ef4444' : v.type === 'warning' ? '#f59e0b' : '#10b981' }}>
                    {v.message}
                  </div>
                ))}
              </div>
            )}

            {previewRowsLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Lade Vorschau...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      <th style={thStyleModal}>Datum</th>
                      <th style={thStyleModal}>Konto</th>
                      <th style={thStyleModal}>Gegenkonto</th>
                      <th style={{ ...thStyleModal, textAlign: 'right' }}>Betrag</th>
                      <th style={thStyleModal}>BU-Schlüssel</th>
                      <th style={thStyleModal}>Buchungstext</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Keine Daten</td></tr>
                    ) : (
                      previewRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1e293b20' }}>
                          <td style={{ padding: '8px 6px', color: '#94a3b8' }}>{row.datum}</td>
                          <td style={{ padding: '8px 6px', color: '#06b6d4', fontFamily: 'monospace' }}>{row.konto}</td>
                          <td style={{ padding: '8px 6px', color: '#94a3b8', fontFamily: 'monospace' }}>{row.gegenkonto}</td>
                          <td style={{ padding: '8px 6px', color: '#e2e8f0', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{row.betrag}</td>
                          <td style={{ padding: '8px 6px', color: '#94a3b8', fontFamily: 'monospace' }}>{row.buSchluessel || '—'}</td>
                          <td style={{ padding: '8px 6px', color: '#e2e8f0', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.buchungstext}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export-Historie */}
      {exportLog.length > 0 && (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 24 }}>
          <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Export-Historie</h3>
          <div style={{ overflowX: 'auto', margin: '0 -24px', padding: '0 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={thStyle}>Datum</th>
                <th style={thStyle}>Zeitraum</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Zeilen</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Summe</th>
              </tr>
            </thead>
            <tbody>
              {exportLog.map(entry => (
                <tr key={entry.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                  <td style={{ padding: '8px', color: '#94a3b8' }}>{new Date(entry.exported_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '8px', color: '#e2e8f0' }}>{isoToDE(entry.period_from)} — {isoToDE(entry.period_to)}</td>
                  <td style={{ padding: '8px', color: '#94a3b8', textAlign: 'right' }}>{entry.row_count}</td>
                  <td style={{ padding: '8px', color: '#e2e8f0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(entry.total_amount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px', color: '#64748b', fontWeight: 600, fontSize: 12, textTransform: 'uppercase',
};

const thStyleModal: React.CSSProperties = {
  textAlign: 'left', padding: '8px 6px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
};

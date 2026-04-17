'use client';

import { useState, useCallback } from 'react';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';
import { getTaxModeLabel } from '@/lib/accounting/tax';
import DateRangePicker, { type DateRange } from './shared/DateRangePicker';
import ExportButton from './shared/ExportButton';

interface EuerData {
  income: { rental: number; haftung: number; shipping: number; other: number; total: number };
  expenses: { categories: Array<{ category: string; label: string; amount: number }>; total: number };
  profit: number;
  taxMode: string;
  period: { from: string; to: string };
}

interface RevenueItem {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
}

export default function ReportsTab() {
  const [subTab, setSubTab] = useState<'euer' | 'umsatzliste' | 'ustva'>('euer');

  const tabs = [
    { id: 'euer' as const, label: 'EÜR' },
    { id: 'umsatzliste' as const, label: 'Umsatzliste' },
    { id: 'ustva' as const, label: 'USt-VA' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: subTab === tab.id ? '#06b6d4' : '#1e293b', color: subTab === tab.id ? '#0f172a' : '#94a3b8', border: 'none', cursor: 'pointer' }}>
            {tab.label}
          </button>
        ))}
      </div>
      {subTab === 'euer' && <EuerReport />}
      {subTab === 'umsatzliste' && <UmsatzlisteReport />}
      {subTab === 'ustva' && <UstVAPrep />}
    </div>
  );
}

// ─── EÜR ─────────────────────────────────────────────────────────────────────

function EuerReport() {
  const [data, setData] = useState<EuerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });

  const fetchData = useCallback(async (r: DateRange) => {
    if (!r.from || !r.to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/reports/euer?from=${r.from}&to=${r.to}`);
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, []);

  const handleRangeChange = useCallback((r: DateRange) => { setRange(r); fetchData(r); }, [fetchData]);

  async function handleExport() {
    if (!range.from || !range.to) return;
    const res = await fetch(`/api/admin/buchhaltung/reports/euer/pdf?from=${range.from}&to=${range.to}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `EUER-${range.from.slice(0, 4)}-cam2rent.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <DateRangePicker onChange={handleRangeChange} initialPeriod="jahr" />
        <ExportButton label="Als CSV exportieren" onClick={handleExport} variant="primary" disabled={!data} />
      </div>
      {loading ? (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 32, textAlign: 'center', color: '#64748b' }}>Lade EÜR-Daten...</div>
      ) : data ? (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, margin: 0 }}>Einnahmen-Überschuss-Rechnung {data.period.from.slice(0, 4)}</h3>
            <span style={{ fontSize: 13, color: '#64748b' }}>{getTaxModeLabel(data.taxMode as 'kleinunternehmer' | 'regelbesteuerung')}</span>
          </div>
          <Section title="Einnahmen" color="#10b981">
            <EuerRow label="Mieterlöse" amount={data.income.rental} />
            <EuerRow label="Haftungsschutz" amount={data.income.haftung} />
            <EuerRow label="Versandkostenpauschalen" amount={data.income.shipping} />
            <EuerRow label="Sonstige Einnahmen" amount={data.income.other} />
            <TotalRow label="Summe Einnahmen" amount={data.income.total} />
          </Section>
          <Section title="Ausgaben" color="#ef4444">
            {data.expenses.categories.map(cat => <EuerRow key={cat.category} label={cat.label} amount={cat.amount} />)}
            <TotalRow label="Summe Ausgaben" amount={data.expenses.total} />
          </Section>
          <div style={{ borderTop: '3px solid #06b6d4', paddingTop: 16, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0' }}>Gewinn vor Steuern</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: data.profit >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(data.profit)}</span>
            </div>
          </div>
          <div style={{ marginTop: 20, padding: 12, background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b' }}>
            <p style={{ color: '#64748b', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Vorläufige Berechnung. Maßgeblich ist die Steuerberater-/Finanzamts-Prüfung.
              {data.taxMode === 'kleinunternehmer' && ' Gemäß § 19 UStG entfällt die Umsatzsteuer-Voranmeldung.'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ color, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, marginTop: 0 }}>{title}</h4>
      {children}
    </div>
  );
}

function EuerRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(amount)}</span>
    </div>
  );
}

function TotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div style={{ borderTop: '2px solid #1e293b', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(amount)}</span>
    </div>
  );
}

// ─── Umsatzliste ─────────────────────────────────────────────────────────────

function UmsatzlisteReport() {
  const [items, setItems] = useState<RevenueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async (r: DateRange) => {
    if (!r.from || !r.to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/reports/revenue-list?from=${r.from}&to=${r.to}`);
      if (res.ok) { const d = await res.json(); setItems(d.items); setTotal(d.total); }
    } finally { setLoading(false); }
  }, []);

  const handleRangeChange = useCallback((r: DateRange) => { setRange(r); fetchData(r); }, [fetchData]);

  async function handleCsvExport() {
    if (!range.from || !range.to) return;
    const res = await fetch(`/api/admin/buchhaltung/reports/revenue-list/export?from=${range.from}&to=${range.to}&format=csv`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `umsatzliste-${range.from}-${range.to}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <DateRangePicker onChange={handleRangeChange} />
        <ExportButton label="CSV-Export" onClick={handleCsvExport} disabled={items.length === 0} />
      </div>
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={thStyle}>Rechnungsnr.</th>
                <th style={thStyle}>Datum</th>
                <th style={thStyle}>Kunde</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Netto</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Steuer</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Brutto</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Lade...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Keine Rechnungen im Zeitraum</td></tr>
              ) : (
                <>
                  {items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b20' }}>
                      <td style={{ padding: '10px 8px', color: '#06b6d4', fontWeight: 600 }}>{item.invoice_number}</td>
                      <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{item.invoice_date ? fmtDateShort(item.invoice_date) : '—'}</td>
                      <td style={{ padding: '10px 8px', color: '#e2e8f0' }}>{item.customer_name || '—'}</td>
                      <td style={{ padding: '10px 8px', color: '#94a3b8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(item.net_amount)}</td>
                      <td style={{ padding: '10px 8px', color: '#64748b', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(item.tax_amount)}</td>
                      <td style={{ padding: '10px 8px', color: '#e2e8f0', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(item.gross_amount)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #1e293b' }}>
                    <td colSpan={5} style={{ padding: '12px 8px', color: '#e2e8f0', fontWeight: 700 }}>Summe ({items.length} Rechnungen)</td>
                    <td style={{ padding: '12px 8px', color: '#06b6d4', textAlign: 'right', fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(total)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── USt-VA Vorbereitung ─────────────────────────────────────────────────────

function UstVAPrep() {
  const [data, setData] = useState<{ revenue19: number; ust19: number; vorsteuer: number; zahllast: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [taxMode, setTaxMode] = useState('kleinunternehmer');

  const fetchData = useCallback(async (r: DateRange) => {
    if (!r.from || !r.to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/buchhaltung/reports/ust-vorbereitung?from=${r.from}&to=${r.to}`);
      if (res.ok) { const d = await res.json(); setData(d); setTaxMode(d.taxMode); }
    } finally { setLoading(false); }
  }, []);

  const handleRangeChange = useCallback((r: DateRange) => { fetchData(r); }, [fetchData]);

  if (taxMode === 'kleinunternehmer') {
    return (
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 28 }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>USt-Voranmeldung Vorbereitung</h3>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
          Diese Funktion ist nur bei Regelbesteuerung relevant. Aktuell ist der Modus &quot;Kleinunternehmer (§ 19 UStG)&quot; aktiv.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}><DateRangePicker onChange={handleRangeChange} initialPeriod="quartal" /></div>
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Lade...</div>
      ) : data ? (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 28 }}>
          <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>USt-Voranmeldung — Vorbereitung</h3>
          <EuerRow label="Steuerpflichtige Umsätze 19 % (Netto)" amount={data.revenue19} />
          <EuerRow label="USt 19 %" amount={data.ust19} />
          <div style={{ height: 8 }} />
          <EuerRow label="Vorsteuer aus Eingangsrechnungen" amount={data.vorsteuer} />
          <div style={{ borderTop: '2px solid #1e293b', paddingTop: 8, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
              <span style={{ color: '#e2e8f0', fontWeight: 700 }}>Zahllast</span>
              <span style={{ color: data.zahllast >= 0 ? '#ef4444' : '#10b981', fontWeight: 800 }}>{formatCurrency(data.zahllast)}</span>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: '#0f172a', borderRadius: 8 }}>
            <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>Dies ist eine Vorbereitung — die offizielle Voranmeldung erfolgt via ELSTER durch deinen Steuerberater.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Ausgaben ────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 8px', color: '#64748b', fontWeight: 600,
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
};

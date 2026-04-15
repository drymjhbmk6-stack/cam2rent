'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';
import { getTaxModeLabel } from '@/lib/accounting/tax';
import DateRangePicker, { type DateRange } from './shared/DateRangePicker';
import ExportButton from './shared/ExportButton';

interface EuerData {
  income: {
    rental: number;
    shipping: number;
    haftung: number;
    other: number;
    total: number;
  };
  expenses: {
    categories: Array<{ category: string; label: string; amount: number }>;
    total: number;
  };
  profit: number;
  taxMode: string;
  period: { from: string; to: string };
}

interface Expense {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  vendor: string | null;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
  receipt_url: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  stripe_fees: 'Stripe-Gebühren',
  shipping: 'Versandkosten',
  software: 'Software & Abos',
  hardware: 'Hardware & Equipment',
  marketing: 'Marketing & Werbung',
  office: 'Bürobedarf',
  travel: 'Reisekosten',
  insurance: 'Versicherungen',
  legal: 'Rechts- & Beratungskosten',
  other: 'Sonstiges',
};

export default function ReportsTab() {
  const [subTab, setSubTab] = useState<'euer' | 'expenses' | 'ustva'>('euer');

  return (
    <div>
      {/* Sub-Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[
          { id: 'euer' as const, label: 'EÜR' },
          { id: 'expenses' as const, label: 'Ausgaben' },
          { id: 'ustva' as const, label: 'USt-VA Vorbereitung' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: subTab === tab.id ? '#06b6d4' : '#1e293b',
              color: subTab === tab.id ? '#0f172a' : '#94a3b8',
              border: 'none', cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'euer' && <EuerReport />}
      {subTab === 'expenses' && <ExpensesList />}
      {subTab === 'ustva' && <UstVAPrep />}
    </div>
  );
}

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
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRangeChange = useCallback((r: DateRange) => {
    setRange(r);
    fetchData(r);
  }, [fetchData]);

  async function handlePdfExport() {
    if (!range.from || !range.to) return;
    const res = await fetch(`/api/admin/buchhaltung/reports/euer/pdf?from=${range.from}&to=${range.to}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EUER-${range.from.slice(0, 4)}-cam2rent.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <DateRangePicker onChange={handleRangeChange} initialPeriod="jahr" />
        <ExportButton label="Als PDF exportieren" onClick={handlePdfExport} variant="primary" disabled={!data} />
      </div>

      {loading ? (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 32, textAlign: 'center', color: '#64748b' }}>Lade EÜR-Daten...</div>
      ) : data ? (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, margin: 0 }}>
              EÜR {data.period.from.slice(0, 4)}
            </h3>
            <span style={{ fontSize: 13, color: '#64748b' }}>{getTaxModeLabel(data.taxMode as 'kleinunternehmer' | 'regelbesteuerung')}</span>
          </div>

          {/* Einnahmen */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ color: '#10b981', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Einnahmen</h4>
            <EuerRow label="Mieterlöse" amount={data.income.rental} />
            <EuerRow label="Haftungsschutz" amount={data.income.haftung} />
            <EuerRow label="Versandkostenpauschalen" amount={data.income.shipping} />
            <EuerRow label="Sonstige Einnahmen" amount={data.income.other} />
            <div style={{ borderTop: '2px solid #1e293b', paddingTop: 8, marginTop: 8 }}>
              <EuerRow label="Summe Einnahmen" amount={data.income.total} bold />
            </div>
          </div>

          {/* Ausgaben */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ color: '#ef4444', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Ausgaben</h4>
            {data.expenses.categories.map(cat => (
              <EuerRow key={cat.category} label={cat.label} amount={cat.amount} />
            ))}
            <div style={{ borderTop: '2px solid #1e293b', paddingTop: 8, marginTop: 8 }}>
              <EuerRow label="Summe Ausgaben" amount={data.expenses.total} bold />
            </div>
          </div>

          {/* Gewinn */}
          <div style={{ borderTop: '3px solid #06b6d4', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0' }}>Gewinn vor Steuern</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: data.profit >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(data.profit)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EuerRow({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
      <span style={{ color: bold ? '#e2e8f0' : '#94a3b8', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontWeight: bold ? 700 : 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(amount)}</span>
    </div>
  );
}

function ExpensesList() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ expense_date: new Date().toISOString().split('T')[0], category: 'other', description: '', vendor: '', gross_amount: '', tax_amount: '0', notes: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/expenses');
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.expenses);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  async function handleSave() {
    setSaving(true);
    try {
      const gross = parseFloat(form.gross_amount);
      const tax = parseFloat(form.tax_amount) || 0;
      const net = gross - tax;
      const res = await fetch('/api/admin/buchhaltung/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, gross_amount: gross, tax_amount: tax, net_amount: net }),
      });
      if (res.ok) {
        setToast({ msg: 'Ausgabe gespeichert', type: 'ok' });
        setTimeout(() => setToast(null), 3000);
        setShowForm(false);
        setForm({ expense_date: new Date().toISOString().split('T')[0], category: 'other', description: '', vendor: '', gross_amount: '', tax_amount: '0', notes: '' });
        fetchExpenses();
      }
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', background: '#0f172a', border: '1px solid #1e293b',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%',
  };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 8, background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 14 }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, margin: 0 }}>Ausgaben</h3>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none' }}>
          {showForm ? 'Abbrechen' : '+ Ausgabe erfassen'}
        </button>
      </div>

      {/* Formular */}
      {showForm && (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Datum</label>
              <input type="date" value={form.expense_date} onChange={(e) => setForm(f => ({ ...f, expense_date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Kategorie</label>
              <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Beschreibung</label>
              <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="z.B. DHL Paketversand März" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Lieferant / Anbieter</label>
              <input value={form.vendor} onChange={(e) => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="z.B. DHL, Hetzner" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Bruttobetrag (€)</label>
              <input type="number" step="0.01" value={form.gross_amount} onChange={(e) => setForm(f => ({ ...f, gross_amount: e.target.value }))} placeholder="0,00" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>davon MwSt. (€)</label>
              <input type="number" step="0.01" value={form.tax_amount} onChange={(e) => setForm(f => ({ ...f, tax_amount: e.target.value }))} placeholder="0,00" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving || !form.description || !form.gross_amount} style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none', opacity: saving || !form.description || !form.gross_amount ? 0.5 : 1 }}>
              {saving ? 'Speichere...' : 'Ausgabe speichern'}
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                <th style={thStyle}>Datum</th>
                <th style={thStyle}>Kategorie</th>
                <th style={thStyle}>Beschreibung</th>
                <th style={thStyle}>Anbieter</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Betrag</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Lade...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Noch keine Ausgaben erfasst</td></tr>
              ) : (
                expenses.map(exp => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{fmtDateShort(exp.expense_date)}</td>
                    <td style={{ padding: '10px 8px', color: '#e2e8f0' }}>{CATEGORY_LABELS[exp.category] || exp.category}</td>
                    <td style={{ padding: '10px 8px', color: '#e2e8f0' }}>{exp.description}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{exp.vendor || '—'}</td>
                    <td style={{ padding: '10px 8px', color: '#ef4444', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(exp.gross_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UstVAPrep() {
  return (
    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 28 }}>
      <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>USt-Voranmeldung Vorbereitung</h3>
      <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
        Diese Funktion ist nur bei Regelbesteuerung relevant. Sie fasst die Umsätze und die darauf
        entfallende Umsatzsteuer nach Steuersätzen zusammen — als Vorbereitung für die Meldung an das Finanzamt.
      </p>
      <div style={{ marginTop: 16, padding: 16, background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b' }}>
        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
          Aktuell ist der Steuermodus &quot;Kleinunternehmer&quot; aktiv. Bei Wechsel zu Regelbesteuerung
          werden hier die USt-Daten aufbereitet.
        </p>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 8px', color: '#64748b', fontWeight: 600,
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
};

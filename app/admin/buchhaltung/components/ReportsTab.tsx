'use client';

import { useState, useEffect, useCallback } from 'react';
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
  deleted_at: string | null;
}

interface RevenueItem {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  fees: 'Gebühren', shipping: 'Versandkosten', software: 'Software & Abos',
  hardware: 'Hardware & Equipment', marketing: 'Marketing & Werbung', office: 'Bürobedarf',
  travel: 'Reisekosten', insurance: 'Versicherungen', legal: 'Rechts- & Beratungskosten',
  other: 'Sonstiges',
};

export default function ReportsTab() {
  const [subTab, setSubTab] = useState<'euer' | 'umsatzliste' | 'ustva' | 'expenses'>('euer');

  const tabs = [
    { id: 'euer' as const, label: 'EÜR' },
    { id: 'umsatzliste' as const, label: 'Umsatzliste' },
    { id: 'ustva' as const, label: 'USt-VA' },
    { id: 'expenses' as const, label: 'Ausgaben verwalten' },
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
      {subTab === 'expenses' && <ExpensesList />}
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

function ExpensesList() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ expense_date: new Date().toISOString().split('T')[0], category: 'other', description: '', vendor: '', gross_amount: '', tax_amount: '0', notes: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/buchhaltung/expenses');
      if (res.ok) { const data = await res.json(); setExpenses(data.expenses); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  function resetForm() {
    setForm({ expense_date: new Date().toISOString().split('T')[0], category: 'other', description: '', vendor: '', gross_amount: '', tax_amount: '0', notes: '' });
    setEditingId(null);
  }

  function startEdit(exp: Expense) {
    setForm({
      expense_date: exp.expense_date,
      category: exp.category,
      description: exp.description,
      vendor: exp.vendor || '',
      gross_amount: exp.gross_amount.toString(),
      tax_amount: exp.tax_amount.toString(),
      notes: '',
    });
    setEditingId(exp.id);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const gross = parseFloat(form.gross_amount);
      const tax = parseFloat(form.tax_amount) || 0;
      const net = gross - tax;
      const url = editingId ? `/api/admin/buchhaltung/expenses/${editingId}` : '/api/admin/buchhaltung/expenses';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, gross_amount: gross, tax_amount: tax, net_amount: net }),
      });
      if (res.ok) {
        setToast({ msg: editingId ? 'Ausgabe aktualisiert' : 'Ausgabe gespeichert', type: 'ok' });
        setTimeout(() => setToast(null), 3000);
        setShowForm(false);
        resetForm();
        fetchExpenses();
      }
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Ausgabe wirklich löschen?')) return;
    const res = await fetch(`/api/admin/buchhaltung/expenses/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setToast({ msg: 'Ausgabe gelöscht', type: 'ok' });
      setTimeout(() => setToast(null), 3000);
      fetchExpenses();
    }
  }

  const filtered = categoryFilter ? expenses.filter(e => e.category === categoryFilter) : expenses;

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', background: '#0f172a', border: '1px solid #1e293b',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%',
  };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 8, background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 14 }}>{toast.msg}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', width: 'auto', minWidth: 180 }}>
            <option value="">Alle Kategorien</option>
            {Object.entries(CATEGORY_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none' }}>
          {showForm ? 'Abbrechen' : '+ Ausgabe erfassen'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <h4 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>
            {editingId ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Datum</label>
              <input type="date" value={form.expense_date} onChange={(e) => setForm(f => ({ ...f, expense_date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Kategorie</label>
              <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Beschreibung</label>
              <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="z.B. DHL Paketversand März" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Lieferant / Anbieter</label>
              <input value={form.vendor} onChange={(e) => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="z.B. DHL, Hetzner" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Bruttobetrag (€)</label>
              <input type="number" step="0.01" value={form.gross_amount} onChange={(e) => setForm(f => ({ ...f, gross_amount: e.target.value }))} placeholder="0,00" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>davon MwSt. (€)</label>
              <input type="number" step="0.01" value={form.tax_amount} onChange={(e) => setForm(f => ({ ...f, tax_amount: e.target.value }))} placeholder="0,00" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving || !form.description || !form.gross_amount}
              style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', background: '#06b6d4', color: '#0f172a', border: 'none', opacity: saving || !form.description || !form.gross_amount ? 0.5 : 1 }}>
              {saving ? 'Speichere...' : editingId ? 'Aktualisieren' : 'Ausgabe speichern'}
            </button>
          </div>
        </div>
      )}

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
                <th style={{ ...thStyle, textAlign: 'center' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Lade...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Noch keine Ausgaben erfasst</td></tr>
              ) : (
                filtered.map(exp => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{fmtDateShort(exp.expense_date)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#1e293b', color: '#94a3b8' }}>
                        {CATEGORY_LABELS[exp.category] || exp.category}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', color: '#e2e8f0' }}>{exp.description}</td>
                    <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{exp.vendor || '—'}</td>
                    <td style={{ padding: '10px 8px', color: '#ef4444', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(exp.gross_amount)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => startEdit(exp)} title="Bearbeiten"
                          style={{ padding: 4, borderRadius: 4, background: 'transparent', border: '1px solid #1e293b', color: '#94a3b8', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => handleDelete(exp.id)} title="Löschen"
                          style={{ padding: 4, borderRadius: 4, background: 'transparent', border: '1px solid #1e293b', color: '#ef4444', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
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

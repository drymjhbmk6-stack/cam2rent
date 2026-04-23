'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';

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

const CATEGORY_LABELS: Record<string, string> = {
  stripe_fees: 'Zahlungsgebühren', shipping: 'Versandkosten', software: 'Software & Abos',
  hardware: 'Hardware & Equipment', marketing: 'Marketing & Werbung', office: 'Bürobedarf',
  travel: 'Reisekosten', insurance: 'Versicherungen', legal: 'Rechts- & Beratungskosten',
  depreciation: 'Abschreibungen (AfA)', asset_purchase: 'GWG-Sofortabzug',
  other: 'Sonstiges',
};

export default function AusgabenTab() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ expense_date: new Date().toISOString().split('T')[0], category: 'other', description: '', vendor: '', gross_amount: '', tax_amount: '0', notes: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`${count} Ausgabe${count === 1 ? '' : 'n'} wirklich löschen?`)) return;
    setBulkDeleting(true);
    try {
      // Parallel loeschen; bei Fehlern nach erstem fail zumindest die bisherigen
      // Ergebnisse behalten.
      const results = await Promise.allSettled(
        [...selectedIds].map((id) =>
          fetch(`/api/admin/buchhaltung/expenses/${id}`, { method: 'DELETE' }).then((r) => {
            if (!r.ok) throw new Error(`${id}: ${r.status}`);
            return id;
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      setToast({
        msg: failed > 0 ? `${ok} geloescht, ${failed} fehlgeschlagen` : `${ok} Ausgabe${ok === 1 ? '' : 'n'} geloescht`,
        type: failed > 0 ? 'err' : 'ok',
      });
      setTimeout(() => setToast(null), 3500);
      setSelectedIds(new Set());
      fetchExpenses();
    } finally {
      setBulkDeleting(false);
    }
  }

  const filtered = categoryFilter ? expenses.filter(e => e.category === categoryFilter) : expenses;
  const visibleIds = filtered.map((e) => e.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', width: 'auto', minWidth: 180 }}>
            <option value="">Alle Kategorien</option>
            {Object.entries(CATEGORY_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
          {selectedIds.size > 0 && (
            <>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>
                {selectedIds.size} ausgewählt
              </span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: bulkDeleting ? 'default' : 'pointer',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  opacity: bulkDeleting ? 0.6 : 1,
                }}
              >
                {bulkDeleting ? 'Lösche...' : `${selectedIds.size} löschen`}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkDeleting}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: bulkDeleting ? 'default' : 'pointer',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #1e293b',
                }}
              >
                Auswahl aufheben
              </button>
            </>
          )}
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
                <th style={{ ...thStyle, width: 32, paddingLeft: 14 }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                    onChange={() => toggleSelectAll(visibleIds)}
                    aria-label="Alle auswählen"
                    style={{ cursor: 'pointer' }}
                  />
                </th>
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
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Lade...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Noch keine Ausgaben erfasst</td></tr>
              ) : (
                filtered.map(exp => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid #1e293b20', background: selectedIds.has(exp.id) ? 'rgba(6,182,212,0.05)' : undefined }}>
                    <td style={{ padding: '10px 8px', paddingLeft: 14 }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(exp.id)}
                        onChange={() => toggleSelect(exp.id)}
                        aria-label={`${exp.description} auswählen`}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
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

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { fmtDate, formatCurrency } from '@/lib/format-utils';
import PurchaseItemClassifier, { type ClassifierItem, type ProductOption, type AssetOption } from '@/components/admin/PurchaseItemClassifier';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  supplier_number: string | null;
  notes: string | null;
  created_at: string;
}

interface PurchaseItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  net_price?: number | null;
  tax_rate?: number | null;
  classification?: 'asset' | 'gwg' | 'expense' | 'ignored' | 'pending' | null;
  asset_id?: string | null;
  expense_id?: string | null;
}

type AttachmentKind = 'invoice' | 'receipt' | 'delivery_note' | 'other';

interface PurchaseAttachment {
  id: string;
  purchase_id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  kind: AttachmentKind;
  created_at: string;
}

interface Purchase {
  id: string;
  supplier_id: string;
  supplier: { id: string; name: string } | null;
  order_date: string;
  status: 'ordered' | 'shipped' | 'delivered' | 'cancelled';
  invoice_number: string | null;
  total_amount: number | null;
  notes: string | null;
  purchase_items: PurchaseItem[];
  attachments?: PurchaseAttachment[];
  created_at: string;
}

const KIND_LABEL: Record<AttachmentKind, string> = {
  invoice: 'Rechnung',
  receipt: 'Quittung',
  delivery_note: 'Lieferschein',
  other: 'Sonstiges',
};

const KIND_COLOR: Record<AttachmentKind, string> = {
  invoice: '#06b6d4',
  receipt: '#22c55e',
  delivery_note: '#a855f7',
  other: '#94a3b8',
};

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Tab = 'lieferanten' | 'einkauefe';

// ─── Styles ─────────────────────────────────────────────────────────────────

const S = {
  card: { background: '#111827', borderRadius: 12, border: '1px solid #1e293b' } as React.CSSProperties,
  input: { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 14, width: '100%' } as React.CSSProperties,
  select: {
    background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 14, width: '100%',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  } as React.CSSProperties,
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px' } as React.CSSProperties,
  text: { color: '#e2e8f0' },
  muted: { color: '#94a3b8' },
  dim: { color: '#64748b' },
  cyan: '#06b6d4',
};

const btnPrimary: React.CSSProperties = {
  background: '#06b6d4', color: '#0f172a', fontWeight: 700, fontSize: 13,
  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: 13,
  padding: '10px 20px', borderRadius: 10, border: '1px solid #1e293b', cursor: 'pointer',
};
const btnDanger: React.CSSProperties = {
  background: 'transparent', color: '#ef4444', fontWeight: 600, fontSize: 12,
  padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null): string {
  if (v == null) return '\u2014';
  return formatCurrency(v);
}

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  ordered:   { label: 'Bestellt',   bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
  shipped:   { label: 'Versendet',  bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  delivered: { label: 'Geliefert',  bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
  cancelled: { label: 'Storniert',  bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || STATUS_MAP.ordered;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function EinkaufPage() {
  const [tab, setTab] = useState<Tab>('lieferanten');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  // Lieferanten state
  const [supplierSearch, setSupplierSearch] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_person: '', email: '', phone: '', website: '', supplier_number: '', notes: '' });

  // Einkauf state
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterYear, setFilterYear] = useState<string>('');     // '' = alle, sonst '2025'
  const [filterMonth, setFilterMonth] = useState<string>('');   // '' = alle, sonst '1'..'12'
  const [purchaseSearch, setPurchaseSearch] = useState('');     // Volltext (Produkt, Rechnungsnummer, Notiz)
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null);
  const [showNewPurchase, setShowNewPurchase] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '', order_date: new Date().toISOString().slice(0, 10),
    invoice_number: '', notes: '',
    items: [{ product_name: '', quantity: 1, unit_price: 0 }] as { product_name: string; quantity: number; unit_price: number }[],
  });
  const [pendingFiles, setPendingFiles] = useState<{ file: File; kind: AttachmentKind }[]>([]);

  // Bulk-Auswahl
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Daten fuer Klassifizier-UI in der ausgeklappten PurchaseRow
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);

  const [saving, setSaving] = useState(false);

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchSuppliers = useCallback(async () => {
    const res = await fetch('/api/admin/suppliers');
    if (res.ok) { const j = await res.json(); setSuppliers(j.suppliers); }
  }, []);

  const fetchPurchases = useCallback(async () => {
    const url = filterSupplier
      ? `/api/admin/purchases?supplierId=${filterSupplier}`
      : '/api/admin/purchases';
    const res = await fetch(url);
    if (res.ok) { const j = await res.json(); setPurchases(j.purchases); }
  }, [filterSupplier]);

  const fetchClassifierData = useCallback(async () => {
    // Produkte + aktive Anlagen fuer das Verknuepfungs-Dropdown im Classifier
    try {
      const [pRes, aRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/admin/assets?status=active'),
      ]);
      if (pRes.ok) {
        const pJ = await pRes.json();
        if (Array.isArray(pJ?.products)) {
          setProducts(pJ.products.map((p: { id: string; name: string; brand: string }) => ({ id: p.id, name: p.name, brand: p.brand })));
        }
      }
      if (aRes.ok) {
        const aJ = await aRes.json();
        if (Array.isArray(aJ?.assets)) {
          setAssets(aJ.assets.map((a: { id: string; name: string; kind: string; purchase_price: number; serial_number: string | null; depreciation_method: 'linear' | 'immediate' | 'none' }) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            purchase_price: Number(a.purchase_price ?? 0),
            serial_number: a.serial_number,
            depreciation_method: a.depreciation_method,
          })));
        }
      }
    } catch {
      // silent — Classifier funktioniert auch ohne Vorab-Daten (Dropdowns einfach leer)
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSuppliers(), fetchPurchases(), fetchClassifierData()]).finally(() => setLoading(false));
  }, [fetchSuppliers, fetchPurchases, fetchClassifierData]);

  // ─── Supplier CRUD ──────────────────────────────────────────────────────

  async function saveSupplier() {
    if (!supplierForm.name.trim()) return;
    setSaving(true);
    const res = await fetch('/api/admin/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplierForm),
    });
    if (res.ok) {
      setShowNewSupplier(false);
      setSupplierForm({ name: '', contact_person: '', email: '', phone: '', website: '', supplier_number: '', notes: '' });
      await fetchSuppliers();
    }
    setSaving(false);
  }

  async function updateSupplier(id: string, data: Partial<Supplier>) {
    setSaving(true);
    const res = await fetch(`/api/admin/suppliers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditingSupplier(null);
      await fetchSuppliers();
    }
    setSaving(false);
  }

  async function deleteSupplier(id: string) {
    if (!confirm('Lieferant wirklich löschen?')) return;
    const res = await fetch(`/api/admin/suppliers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchSuppliers();
    } else {
      const j = await res.json();
      alert(j.error || 'Fehler beim Löschen');
    }
  }

  // ─── Purchase CRUD ──────────────────────────────────────────────────────

  async function savePurchase() {
    if (!purchaseForm.supplier_id || !purchaseForm.order_date) return;
    if (purchaseForm.items.some(i => !i.product_name.trim())) return;
    setSaving(true);
    try {
      const total = purchaseForm.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const res = await fetch('/api/admin/purchases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...purchaseForm, total_amount: total }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || 'Fehler beim Speichern');
        return;
      }
      const j = await res.json();
      const newPurchaseId = j?.purchase?.id as string | undefined;

      // Belege hochladen, wenn welche ausgewaehlt sind
      if (newPurchaseId && pendingFiles.length > 0) {
        const fd = new FormData();
        fd.append('purchase_id', newPurchaseId);
        for (const pf of pendingFiles) fd.append('files', pf.file);
        fd.append('kinds', JSON.stringify(pendingFiles.map(p => p.kind)));
        const up = await fetch('/api/admin/purchase-attachments', { method: 'POST', body: fd });
        if (!up.ok) {
          const ej = await up.json().catch(() => ({}));
          alert(`Einkauf gespeichert, aber Belege fehlgeschlagen: ${ej.error || ej.errors?.join('; ') || up.status}`);
        } else {
          const ej = await up.json().catch(() => ({}));
          if (ej.errors?.length) {
            alert(`Einige Belege konnten nicht hochgeladen werden:\n${ej.errors.join('\n')}`);
          }
        }
      }

      setShowNewPurchase(false);
      setPurchaseForm({
        supplier_id: '', order_date: new Date().toISOString().slice(0, 10),
        invoice_number: '', notes: '',
        items: [{ product_name: '', quantity: 1, unit_price: 0 }],
      });
      setPendingFiles([]);
      await fetchPurchases();
    } finally {
      setSaving(false);
    }
  }

  async function updatePurchaseStatus(id: string, status: string) {
    await fetch(`/api/admin/purchases/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await fetchPurchases();
  }

  async function deletePurchase(id: string) {
    const reason = window.prompt('Einkauf endgültig löschen.\n\nBitte Begründung angeben (mindestens 10 Zeichen):');
    if (reason === null) return; // Abbrechen
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      alert('Begründung muss mindestens 10 Zeichen lang sein.');
      return;
    }
    const res = await fetch(`/api/admin/purchases/${id}`, {
      method: 'DELETE',
      headers: { 'X-Delete-Reason': trimmed },
    });
    if (res.ok) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchPurchases();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || 'Fehler beim Löschen');
    }
  }

  async function bulkDeletePurchases() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const reason = window.prompt(
      `${ids.length} ${ids.length === 1 ? 'Einkauf' : 'Einkäufe'} endgültig löschen.\n\nBitte Begründung angeben (mindestens 10 Zeichen):`
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      alert('Begründung muss mindestens 10 Zeichen lang sein.');
      return;
    }
    if (!confirm(`Wirklich ${ids.length} ${ids.length === 1 ? 'Einkauf' : 'Einkäufe'} löschen? Diese Aktion ist nicht umkehrbar.`)) return;

    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/admin/purchases/${id}`, {
            method: 'DELETE',
            headers: { 'X-Delete-Reason': trimmed },
          }).then(async (r) => {
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
            return id;
          })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length > 0) {
        alert(`${ids.length - failed.length} gelöscht, ${failed.length} fehlgeschlagen:\n${failed.slice(0, 5).map((f) => f.reason?.message || f.reason).join('\n')}`);
      }
      setSelectedIds(new Set());
      await fetchPurchases();
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredPurchases.map((p) => p.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Computed stats ─────────────────────────────────────────────────────

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const totalThisYear = purchases
    .filter(p => new Date(p.order_date).getFullYear() === thisYear && p.status !== 'cancelled')
    .reduce((s, p) => s + (p.total_amount ?? 0), 0);
  const totalThisMonth = purchases
    .filter(p => {
      const d = new Date(p.order_date);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth && p.status !== 'cancelled';
    })
    .reduce((s, p) => s + (p.total_amount ?? 0), 0);

  // ─── Filtered lists ─────────────────────────────────────────────────────

  const filteredSuppliers = suppliers.filter(s =>
    !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.contact_person && s.contact_person.toLowerCase().includes(supplierSearch.toLowerCase())) ||
    (s.email && s.email.toLowerCase().includes(supplierSearch.toLowerCase()))
  );

  // Verfuegbare Jahre aus den Daten (fuer Year-Dropdown)
  const availableYears = [...new Set(purchases.map(p => new Date(p.order_date).getFullYear()))]
    .sort((a, b) => b - a);

  const filteredPurchases = purchases.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    const d = new Date(p.order_date);
    if (filterYear && String(d.getFullYear()) !== filterYear) return false;
    if (filterMonth && String(d.getMonth() + 1) !== filterMonth) return false;
    if (purchaseSearch.trim()) {
      const q = purchaseSearch.toLowerCase().trim();
      const haystack = [
        p.invoice_number ?? '',
        p.notes ?? '',
        ...((p.purchase_items ?? []).map(it => it.product_name ?? '')),
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <AdminBackLink label="Zurück" />
      {/* Header */}
      <h1 className="font-heading" style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 6 }}>
        Einkauf & Lieferanten
      </h1>
      <p style={{ ...S.dim, fontSize: 13, marginBottom: 24 }}>
        Lieferanten verwalten und Einkäufe tracken
      </p>

      {/* ─── KPI Cards ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Gesamtausgaben ' + thisYear, value: fmtCurrency(totalThisYear) },
          { label: 'Ausgaben diesen Monat', value: fmtCurrency(totalThisMonth) },
          { label: 'Anzahl Lieferanten', value: String(suppliers.length) },
        ].map((c) => (
          <div key={c.label} style={{ ...S.card, padding: '20px 24px' }}>
            <div style={{ ...S.dim, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{c.label}</div>
            <div style={{ color: '#06b6d4', fontSize: 24, fontWeight: 800 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1e293b', paddingBottom: 0 }}>
        {[
          { key: 'lieferanten' as Tab, label: 'Lieferanten' },
          { key: 'einkauefe' as Tab, label: 'Einkäufe' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: 'transparent', border: 'none', borderBottom: tab === t.key ? '2px solid #06b6d4' : '2px solid transparent',
              color: tab === t.key ? '#06b6d4' : '#64748b', marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, ...S.dim }}>Lade Daten...</div>
      ) : tab === 'lieferanten' ? (
        /* ═══════════════════════════════════════════════════════════════
           LIEFERANTEN TAB
           ═══════════════════════════════════════════════════════════ */
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="Suche nach Name, Kontakt, E-Mail..."
              value={supplierSearch}
              onChange={e => setSupplierSearch(e.target.value)}
              style={{ ...S.input, maxWidth: 320 }}
            />
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowNewSupplier(true)} style={btnPrimary}>+ Neuer Lieferant</button>
          </div>

          {/* New Supplier Form */}
          {showNewSupplier && (
            <div style={{ ...S.card, padding: 24, marginBottom: 16 }}>
              <h3 style={{ color: 'white', fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Neuer Lieferant</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <label style={S.label}>Name *</label>
                  <input style={S.input} value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Kontaktperson</label>
                  <input style={S.input} value={supplierForm.contact_person} onChange={e => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>E-Mail</label>
                  <input style={S.input} type="email" value={supplierForm.email} onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Telefon</label>
                  <input style={S.input} value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Website</label>
                  <input style={S.input} value={supplierForm.website} onChange={e => setSupplierForm({ ...supplierForm, website: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Lieferantennummer</label>
                  <input style={S.input} value={supplierForm.supplier_number} onChange={e => setSupplierForm({ ...supplierForm, supplier_number: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={S.label}>Notizen</label>
                  <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={supplierForm.notes} onChange={e => setSupplierForm({ ...supplierForm, notes: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={saveSupplier} disabled={saving} style={btnPrimary}>{saving ? 'Speichert...' : 'Speichern'}</button>
                <button onClick={() => setShowNewSupplier(false)} style={btnSecondary}>Abbrechen</button>
              </div>
            </div>
          )}

          {/* Supplier Table */}
          <div style={{ ...S.card, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    {['Name', 'Kontaktperson', 'E-Mail', 'Telefon', ''].map(h => (
                      <th key={h} style={{ ...S.dim, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '12px 16px', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', ...S.dim }}>Keine Lieferanten gefunden</td></tr>
                  ) : filteredSuppliers.map(sup => (
                    <SupplierRow
                      key={sup.id}
                      supplier={sup}
                      isEditing={editingSupplier === sup.id}
                      onEdit={() => setEditingSupplier(editingSupplier === sup.id ? null : sup.id)}
                      onSave={(data) => updateSupplier(sup.id, data)}
                      onDelete={() => deleteSupplier(sup.id)}
                      saving={saving}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════
           EINKÄUFE TAB
           ═══════════════════════════════════════════════════════════ */
        <div>
          {/* Bulk-Bar — sticky, sichtbar wenn Auswahl */}
          {selectedIds.size > 0 && (
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: 'rgba(15,23,42,0.95)',
                backdropFilter: 'blur(8px)',
                border: '1px solid #06b6d4',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 12,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: '#06b6d4', fontWeight: 700, fontSize: 13 }}>
                {selectedIds.size} {selectedIds.size === 1 ? 'Eintrag' : 'Einträge'} ausgewählt
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setSelectedIds(new Set())}
                style={btnSecondary}
                disabled={bulkDeleting}
              >
                Auswahl aufheben
              </button>
              <button
                onClick={bulkDeletePurchases}
                disabled={bulkDeleting}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '10px 20px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: bulkDeleting ? 'wait' : 'pointer',
                  opacity: bulkDeleting ? 0.7 : 1,
                }}
              >
                {bulkDeleting ? 'Löscht…' : `🗑 ${selectedIds.size} löschen`}
              </button>
            </div>
          )}

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} style={{ ...S.select, maxWidth: 220 }}>
              <option value="">Alle Lieferanten</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...S.select, maxWidth: 160 }}>
              <option value="">Alle Status</option>
              <option value="ordered">Bestellt</option>
              <option value="shipped">Versendet</option>
              <option value="delivered">Geliefert</option>
              <option value="cancelled">Storniert</option>
            </select>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ ...S.select, maxWidth: 120 }}>
              <option value="">Alle Jahre</option>
              {availableYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...S.select, maxWidth: 140 }}>
              <option value="">Alle Monate</option>
              <option value="1">Januar</option>
              <option value="2">Februar</option>
              <option value="3">März</option>
              <option value="4">April</option>
              <option value="5">Mai</option>
              <option value="6">Juni</option>
              <option value="7">Juli</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">Oktober</option>
              <option value="11">November</option>
              <option value="12">Dezember</option>
            </select>
            <input
              type="text"
              value={purchaseSearch}
              onChange={e => setPurchaseSearch(e.target.value)}
              placeholder="Suche: Produkt, Rechnungsnr., Notiz..."
              style={{ ...S.select, minWidth: 220, flex: 1 }}
            />
            {(filterSupplier || filterStatus || filterYear || filterMonth || purchaseSearch) && (
              <button
                onClick={() => {
                  setFilterSupplier('');
                  setFilterStatus('');
                  setFilterYear('');
                  setFilterMonth('');
                  setPurchaseSearch('');
                }}
                style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}
              >
                ✕ Filter zurücksetzen
              </button>
            )}
            <a href="/admin/einkauf/upload" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>
              📄 Rechnung hochladen (KI)
            </a>
            <button onClick={() => setShowNewPurchase(true)} style={btnSecondary}>+ Manuell</button>
          </div>

          {/* Trefferanzahl + Filter-Summe */}
          {(filterSupplier || filterStatus || filterYear || filterMonth || purchaseSearch) && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#94a3b8' }}>
              {filteredPurchases.length} {filteredPurchases.length === 1 ? 'Treffer' : 'Treffer'} ·{' '}
              Summe: <span style={{ color: '#22d3ee', fontWeight: 600 }}>
                {filteredPurchases.reduce((s, p) => s + (p.total_amount ?? 0), 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          )}

          {/* New Purchase Form */}
          {showNewPurchase && (
            <div style={{ ...S.card, padding: 24, marginBottom: 16 }}>
              <h3 style={{ color: 'white', fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Neuer Einkauf</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <label style={S.label}>Lieferant *</label>
                  <select
                    value={purchaseForm.supplier_id}
                    onChange={e => setPurchaseForm({ ...purchaseForm, supplier_id: e.target.value })}
                    style={S.select}
                  >
                    <option value="">Bitte wählen...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Datum *</label>
                  <input type="date" style={S.input} value={purchaseForm.order_date} onChange={e => setPurchaseForm({ ...purchaseForm, order_date: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Rechnungsnummer</label>
                  <input style={S.input} value={purchaseForm.invoice_number} onChange={e => setPurchaseForm({ ...purchaseForm, invoice_number: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Notizen</label>
                  <input style={S.input} value={purchaseForm.notes} onChange={e => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} />
                </div>
              </div>

              {/* Items */}
              <div style={{ marginTop: 16 }}>
                <label style={S.label}>Positionen</label>
                {purchaseForm.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input
                      placeholder="Produktname"
                      style={{ ...S.input, flex: 3 }}
                      value={item.product_name}
                      onChange={e => {
                        const items = [...purchaseForm.items];
                        items[idx] = { ...items[idx], product_name: e.target.value };
                        setPurchaseForm({ ...purchaseForm, items });
                      }}
                    />
                    <input
                      type="number" min={1} placeholder="Menge"
                      style={{ ...S.input, flex: 1 }}
                      value={item.quantity}
                      onChange={e => {
                        const items = [...purchaseForm.items];
                        items[idx] = { ...items[idx], quantity: parseInt(e.target.value) || 1 };
                        setPurchaseForm({ ...purchaseForm, items });
                      }}
                    />
                    <input
                      type="number" step="0.01" min={0} placeholder="Stückpreis"
                      style={{ ...S.input, flex: 1 }}
                      value={item.unit_price || ''}
                      onChange={e => {
                        const items = [...purchaseForm.items];
                        items[idx] = { ...items[idx], unit_price: parseFloat(e.target.value) || 0 };
                        setPurchaseForm({ ...purchaseForm, items });
                      }}
                    />
                    {purchaseForm.items.length > 1 && (
                      <button
                        onClick={() => {
                          const items = purchaseForm.items.filter((_, i) => i !== idx);
                          setPurchaseForm({ ...purchaseForm, items });
                        }}
                        style={{ ...btnDanger, padding: '8px 10px', flexShrink: 0 }}
                        title="Position entfernen"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setPurchaseForm({ ...purchaseForm, items: [...purchaseForm.items, { product_name: '', quantity: 1, unit_price: 0 }] })}
                  style={{ ...btnSecondary, fontSize: 12, padding: '6px 14px' }}
                >
                  + Position hinzufügen
                </button>
              </div>

              {/* Total */}
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: '#06b6d4' }}>
                Gesamt: {fmtCurrency(purchaseForm.items.reduce((s, i) => s + i.quantity * i.unit_price, 0))}
              </div>

              {/* Belege hochladen */}
              <div style={{ marginTop: 18 }}>
                <label style={S.label}>Belege (Rechnung, Quittung, Lieferschein …)</label>
                <PendingFilesPicker
                  files={pendingFiles}
                  onChange={setPendingFiles}
                  defaultKind="receipt"
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={savePurchase} disabled={saving} style={btnPrimary}>{saving ? 'Speichert...' : 'Speichern'}</button>
                <button onClick={() => { setShowNewPurchase(false); setPendingFiles([]); }} style={btnSecondary}>Abbrechen</button>
              </div>
            </div>
          )}

          {/* Purchase Table */}
          <div style={{ ...S.card, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '12px 8px 12px 16px', width: 36 }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredPurchases.length > 0 &&
                          filteredPurchases.every((p) => selectedIds.has(p.id))
                        }
                        ref={(el) => {
                          if (el) {
                            const visible = filteredPurchases.length;
                            const sel = filteredPurchases.filter((p) => selectedIds.has(p.id)).length;
                            el.indeterminate = sel > 0 && sel < visible;
                          }
                        }}
                        onChange={toggleSelectAllVisible}
                        title="Alle sichtbaren auswählen"
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#06b6d4' }}
                      />
                    </th>
                    {['Datum', 'Lieferant', 'Produkte', 'Betrag', 'Status', ''].map(h => (
                      <th key={h} style={{ ...S.dim, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '12px 16px', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', ...S.dim }}>Keine Einkäufe gefunden</td></tr>
                  ) : filteredPurchases.map(p => (
                    <PurchaseRow
                      key={p.id}
                      purchase={p}
                      expanded={expandedPurchase === p.id}
                      selected={selectedIds.has(p.id)}
                      onToggleSelect={() => toggleSelectOne(p.id)}
                      onToggle={() => setExpandedPurchase(expandedPurchase === p.id ? null : p.id)}
                      onStatusChange={(status) => updatePurchaseStatus(p.id, status)}
                      onDelete={() => deletePurchase(p.id)}
                      onAttachmentsChanged={fetchPurchases}
                      products={products}
                      assets={assets}
                      onItemClassified={async () => { await fetchPurchases(); await fetchClassifierData(); }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SupplierRow Component ──────────────────────────────────────────────────

function SupplierRow({
  supplier, isEditing, onEdit, onSave, onDelete, saving,
}: {
  supplier: Supplier; isEditing: boolean;
  onEdit: () => void; onSave: (d: Partial<Supplier>) => void;
  onDelete: () => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    name: supplier.name,
    contact_person: supplier.contact_person || '',
    email: supplier.email || '',
    phone: supplier.phone || '',
    website: supplier.website || '',
    supplier_number: supplier.supplier_number || '',
    notes: supplier.notes || '',
  });

  useEffect(() => {
    setForm({
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      website: supplier.website || '',
      supplier_number: supplier.supplier_number || '',
      notes: supplier.notes || '',
    });
  }, [supplier]);

  return (
    <>
      <tr
        onClick={onEdit}
        style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(6,182,212,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <td style={{ padding: '12px 16px', color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{supplier.name}</td>
        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>{supplier.contact_person || '\u2014'}</td>
        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>{supplier.email || '\u2014'}</td>
        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>{supplier.phone || '\u2014'}</td>
        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            style={btnDanger}
          >
            Löschen
          </button>
        </td>
      </tr>
      {isEditing && (
        <tr>
          <td colSpan={5} style={{ background: '#0a0f1e', borderBottom: '1px solid #1e293b', padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label style={S.label}>Name *</label>
                <input style={S.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Kontaktperson</label>
                <input style={S.input} value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>E-Mail</label>
                <input style={S.input} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Telefon</label>
                <input style={S.input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Website</label>
                <input style={S.input} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Lieferantennr.</label>
                <input style={S.input} value={form.supplier_number} onChange={e => setForm({ ...form, supplier_number: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={S.label}>Notizen</label>
                <textarea style={{ ...S.input, minHeight: 50, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => onSave(form)} disabled={saving} style={btnPrimary}>{saving ? 'Speichert...' : 'Speichern'}</button>
              <button onClick={onEdit} style={btnSecondary}>Abbrechen</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── PurchaseRow Component ──────────────────────────────────────────────────

function PurchaseRow({
  purchase, expanded, selected, onToggleSelect, onToggle, onStatusChange, onDelete, onAttachmentsChanged,
  products, assets, onItemClassified,
}: {
  purchase: Purchase; expanded: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggle: () => void;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
  onAttachmentsChanged: () => void | Promise<void>;
  products: ProductOption[];
  assets: AssetOption[];
  onItemClassified: () => void | Promise<void>;
}) {
  const productSummary = purchase.purchase_items
    .map(i => `${i.quantity}x ${i.product_name}`)
    .join(', ');

  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          borderBottom: '1px solid #1e293b',
          cursor: 'pointer',
          background: selected ? 'rgba(6,182,212,0.08)' : 'transparent',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = selected ? 'rgba(6,182,212,0.12)' : 'rgba(6,182,212,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = selected ? 'rgba(6,182,212,0.08)' : 'transparent')}
      >
        <td style={{ padding: '12px 8px 12px 16px', width: 36 }} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            title="Auswählen"
            style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#06b6d4' }}
          />
        </td>
        <td style={{ padding: '12px 16px', color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{fmtDate(purchase.order_date)}</td>
        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>{purchase.supplier?.name || '\u2014'}</td>
        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{productSummary || '\u2014'}</td>
        <td style={{ padding: '12px 16px', color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{fmtCurrency(purchase.total_amount)}</td>
        <td style={{ padding: '12px 16px' }}><StatusBadge status={purchase.status} /></td>
        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            style={btnDanger}
          >
            Löschen
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: '#0a0f1e', borderBottom: '1px solid #1e293b', padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={S.label}>Rechnungsnr.</div>
                <div style={{ color: '#e2e8f0', fontSize: 13 }}>{purchase.invoice_number || '\u2014'}</div>
              </div>
              <div>
                <div style={S.label}>Status ändern</div>
                <select
                  value={purchase.status}
                  onChange={e => onStatusChange(e.target.value)}
                  style={{ ...S.select, maxWidth: 180 }}
                  onClick={e => e.stopPropagation()}
                >
                  <option value="ordered">Bestellt</option>
                  <option value="shipped">Versendet</option>
                  <option value="delivered">Geliefert</option>
                  <option value="cancelled">Storniert</option>
                </select>
              </div>
              <div>
                <div style={S.label}>Notizen</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>{purchase.notes || '\u2014'}</div>
              </div>
            </div>

            {/* Items detail */}
            <div style={S.label}>Positionen</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...S.dim, fontSize: 11, fontWeight: 700, padding: '8px 12px', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Produkt</th>
                  <th style={{ ...S.dim, fontSize: 11, fontWeight: 700, padding: '8px 12px', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Menge</th>
                  <th style={{ ...S.dim, fontSize: 11, fontWeight: 700, padding: '8px 12px', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stückpreis</th>
                  <th style={{ ...S.dim, fontSize: 11, fontWeight: 700, padding: '8px 12px', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {purchase.purchase_items.map(item => (
                  <tr key={item.id} style={{ borderTop: '1px solid #1e293b' }}>
                    <td style={{ padding: '8px 12px', color: '#e2e8f0', fontSize: 13 }}>{item.product_name}</td>
                    <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 13, textAlign: 'right' }}>{item.quantity}</td>
                    <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 13, textAlign: 'right' }}>{fmtCurrency(item.unit_price)}</td>
                    <td style={{ padding: '8px 12px', color: '#e2e8f0', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{fmtCurrency(item.quantity * item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Klassifizierung & Verknuepfung */}
            <div style={{ marginTop: 20 }}>
              <div style={S.label}>Klassifizierung & Verknüpfung</div>
              <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 8px' }}>
                Pro Position als Anlagegut, GWG, Ausgabe oder Ignorieren festlegen — auch nachträglich. Anlagegüter können an eine bereits erfasste Anlage gehängt werden.
              </p>
              {purchase.purchase_items.map((item) => (
                <PurchaseItemClassifier
                  key={item.id}
                  item={item as ClassifierItem}
                  products={products}
                  assets={assets}
                  onSaved={onItemClassified}
                />
              ))}
            </div>

            {/* Belege */}
            <div style={{ marginTop: 20 }}>
              <AttachmentsSection
                purchaseId={purchase.id}
                attachments={purchase.attachments ?? []}
                onChanged={onAttachmentsChanged}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── PendingFilesPicker (vor dem Speichern) ─────────────────────────────────

function PendingFilesPicker({
  files, onChange, defaultKind = 'receipt',
}: {
  files: { file: File; kind: AttachmentKind }[];
  onChange: (next: { file: File; kind: AttachmentKind }[]) => void;
  defaultKind?: AttachmentKind;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(newFiles: FileList | File[] | null) {
    if (!newFiles) return;
    const added = Array.from(newFiles).map(f => ({ file: f, kind: defaultKind }));
    onChange([...files, ...added].slice(0, 10));
  }

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: '1px dashed #334155', borderRadius: 10, padding: 16, textAlign: 'center',
          cursor: 'pointer', background: '#0a0f1e', color: '#94a3b8', fontSize: 13,
        }}
      >
        📎 Belege hierher ziehen oder klicken (PDF, JPG, PNG, WebP — max 20 MB pro Datei, bis zu 10)
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>
      {files.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((pf, i) => (
            <li key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 10px',
            }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <span style={{ flex: 1, color: '#e2e8f0', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pf.file.name} <span style={{ color: '#64748b', fontSize: 11 }}>({fmtBytes(pf.file.size)})</span>
              </span>
              <select
                value={pf.kind}
                onChange={(e) => {
                  const next = [...files];
                  next[i] = { ...pf, kind: e.target.value as AttachmentKind };
                  onChange(next);
                }}
                style={{
                  background: '#111827', color: '#e2e8f0', border: '1px solid #1e293b',
                  borderRadius: 6, padding: '4px 8px', fontSize: 12,
                }}
              >
                {(Object.keys(KIND_LABEL) as AttachmentKind[]).map(k => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
              <button
                onClick={(e) => { e.stopPropagation(); onChange(files.filter((_, j) => j !== i)); }}
                style={{
                  background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
                }}
                title="Entfernen"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── AttachmentsSection (existierender Einkauf) ─────────────────────────────

function AttachmentsSection({
  purchaseId, attachments, onChanged,
}: {
  purchaseId: string;
  attachments: PurchaseAttachment[];
  onChanged: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<{ file: File; kind: AttachmentKind }[]>([]);
  const [uploading, setUploading] = useState(false);

  async function uploadPending() {
    if (pending.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('purchase_id', purchaseId);
      for (const pf of pending) fd.append('files', pf.file);
      fd.append('kinds', JSON.stringify(pending.map(p => p.kind)));
      const res = await fetch('/api/admin/purchase-attachments', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error || 'Upload fehlgeschlagen');
      } else if (j.errors?.length) {
        alert(`Einige Belege fehlgeschlagen:\n${j.errors.join('\n')}`);
      }
      setPending([]);
      await onChanged();
    } finally {
      setUploading(false);
    }
  }

  async function deleteAttachment(id: string, filename: string) {
    if (!confirm(`Beleg "${filename}" wirklich löschen?`)) return;
    const res = await fetch(`/api/admin/purchase-attachments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || 'Fehler beim Löschen');
      return;
    }
    await onChanged();
  }

  return (
    <div>
      <div style={S.label}>Belege ({attachments.length})</div>
      {attachments.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>Noch keine Belege hinterlegt.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {attachments.map(att => (
            <li key={att.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#111827', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 10px',
            }}>
              <span style={{ fontSize: 16 }}>{att.mime_type === 'application/pdf' ? '📄' : '🖼️'}</span>
              <a
                href={`/api/admin/invoices/purchase-pdf?path=${encodeURIComponent(att.storage_path)}`}
                target="_blank"
                rel="noreferrer"
                style={{ flex: 1, color: '#e2e8f0', fontSize: 13, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={(e) => e.stopPropagation()}
              >
                {att.filename}
                {att.size_bytes ? <span style={{ color: '#64748b', fontSize: 11 }}> ({fmtBytes(att.size_bytes)})</span> : null}
              </a>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                background: `${KIND_COLOR[att.kind]}22`, color: KIND_COLOR[att.kind],
              }}>{KIND_LABEL[att.kind]}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteAttachment(att.id, att.filename); }}
                style={{
                  background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
                }}
                title="Löschen"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <PendingFilesPicker files={pending} onChange={setPending} defaultKind="receipt" />
      {pending.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={(e) => { e.stopPropagation(); uploadPending(); }}
            disabled={uploading}
            style={btnPrimary}
          >
            {uploading ? 'Lädt hoch...' : `${pending.length} Beleg${pending.length === 1 ? '' : 'e'} hochladen`}
          </button>
        </div>
      )}
    </div>
  );
}

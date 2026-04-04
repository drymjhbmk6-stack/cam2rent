'use client';

import { useEffect, useState, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CouponRow {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  description: string;
  target_type: 'all' | 'accessory' | 'group' | 'user';
  target_id: string | null;
  target_group_id: string | null;
  target_name: string | null;
  target_user_email: string | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  used_count: number;
  min_order_value: number | null;
  once_per_customer: boolean;
  not_combinable: boolean;
  active: boolean;
  created_at: string;
}

interface AccessoryOption { id: string; name: string; category: string; }
interface SetOption { id: string; name: string; }
interface CustomerOption { id: string; full_name: string; email: string; }

type FormData = Omit<CouponRow, 'id' | 'used_count' | 'created_at'>;

// ─── Dark-theme inline styles ────────────────────────────────────────────────

const S = {
  card: { background: '#111827', borderRadius: 12, border: '1px solid #1e293b' } as React.CSSProperties,
  cardEdit: { background: '#0a0f1e', borderTop: '1px solid #1e293b' } as React.CSSProperties,
  input: { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 14 } as React.CSSProperties,
  select: { background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px', color: '#e2e8f0', fontSize: 14, appearance: 'none' as const, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px' } as React.CSSProperties,
  text: { color: '#e2e8f0' },
  muted: { color: '#94a3b8' },
  dim: { color: '#64748b' },
  cyan: '#06b6d4',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyForm(): FormData {
  return {
    code: '', type: 'percent', value: 10, description: '',
    target_type: 'all', target_id: null, target_group_id: null,
    target_name: null, target_user_email: null,
    valid_from: null, valid_until: null, max_uses: null,
    min_order_value: null, once_per_customer: false, not_combinable: false,
    active: true,
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── Customer Picker Modal ───────────────────────────────────────────────────

function CustomerPicker({
  customers,
  onSelect,
  onClose,
}: {
  customers: CustomerOption[];
  onSelect: (c: CustomerOption) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = search.toLowerCase();
  const filtered = customers.filter(
    (c) => c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      {/* Modal */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, maxHeight: '70vh', background: '#111827', border: '1px solid #1e293b', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>Kunde auswählen</span>
          <button onClick={onClose} style={{ color: '#64748b', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>{'\u2715'}</button>
        </div>
        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e293b' }}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name oder E-Mail suchen\u2026"
            style={{ ...S.input, width: '100%' }}
          />
        </div>
        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Keine Kunden gefunden.
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                  width: '100%', textAlign: 'left', padding: '10px 20px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#e2e8f0', fontSize: 14,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1e293b'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ fontWeight: 600 }}>{c.full_name || 'Kein Name'}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{c.email}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminGutscheinePage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<FormData>(emptyForm());
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FormData>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Dropdown data
  const [accessories, setAccessories] = useState<AccessoryOption[]>([]);
  const [sets, setSets] = useState<SetOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  // Customer picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'new' | 'edit'>('new');

  useEffect(() => {
    loadCoupons();
    fetch('/api/admin/accessories').then((r) => r.json())
      .then(({ accessories: d }) => setAccessories((d ?? []).map((a: AccessoryOption) => ({ id: a.id, name: a.name, category: a.category })))).catch(() => {});
    fetch('/api/sets').then((r) => r.json())
      .then(({ sets: d }) => setSets((d ?? []).map((s: SetOption) => ({ id: s.id, name: s.name })))).catch(() => {});
    fetch('/api/admin/kunden').then((r) => r.json())
      .then(({ customers: d }) => setCustomers((d ?? []).map((c: CustomerOption) => ({ id: c.id, full_name: c.full_name, email: c.email })))).catch(() => {});
  }, []);

  function loadCoupons() {
    setLoading(true);
    fetch('/api/admin/coupons').then((r) => r.json())
      .then(({ coupons: d }) => setCoupons(d ?? []))
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false));
  }

  async function handleCreate() {
    if (!newForm.code.trim()) { alert('Bitte einen Code eingeben.'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(`Fehler: ${d.error ?? 'Unbekannter Fehler'}`); return; }
      setNewForm(emptyForm()); setShowNew(false); loadCoupons();
    } catch (e) { alert(`Netzwerkfehler: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setCreating(false); }
  }

  function startEdit(c: CouponRow) {
    setEditId(c.id);
    setEditForm({
      code: c.code, type: c.type, value: c.value, description: c.description,
      target_type: c.target_type, target_id: c.target_id, target_group_id: c.target_group_id,
      target_name: c.target_name, target_user_email: c.target_user_email,
      valid_from: c.valid_from, valid_until: c.valid_until,
      max_uses: c.max_uses, min_order_value: c.min_order_value,
      once_per_customer: c.once_per_customer, not_combinable: c.not_combinable, active: c.active,
    });
  }

  async function handleSave(id: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/coupons/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error();
      setCoupons((prev) => prev.map((c) => c.id === id ? { ...c, ...editForm } as CouponRow : c));
      setEditId(null); setSavedId(id); setTimeout(() => setSavedId(null), 3000);
    } catch { alert('Fehler beim Speichern.'); }
    finally { setSavingId(null); }
  }

  async function handleDelete(id: string, code: string) {
    if (!confirm(`Gutschein "${code}" wirklich löschen?`)) return;
    setDeletingId(id);
    try { await fetch(`/api/admin/coupons/${id}`, { method: 'DELETE' }); setCoupons((p) => p.filter((c) => c.id !== id)); }
    catch { alert('Fehler beim Löschen.'); } finally { setDeletingId(null); }
  }

  async function handleToggleActive(c: CouponRow) {
    const v = !c.active;
    try {
      const res = await fetch(`/api/admin/coupons/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: v }) });
      if (!res.ok) throw new Error();
      setCoupons((p) => p.map((x) => x.id === c.id ? { ...x, active: v } : x));
    } catch { alert('Fehler beim Umschalten.'); }
  }

  function handleCustomerSelect(c: CustomerOption) {
    if (pickerTarget === 'new') {
      setNewForm((f) => ({ ...f, target_user_email: c.email }));
    } else {
      setEditForm((f) => ({ ...f, target_user_email: c.email }));
    }
    setPickerOpen(false);
  }

  // ─── Form fields (shared between create & edit) ────────────────────────────

  function renderFormFields(
    form: FormData | Partial<FormData>,
    setForm: (fn: (prev: typeof form) => typeof form) => void,
    mode: 'new' | 'edit'
  ) {
    const isPersonalized = !!(form.target_user_email);
    // The actual target for "gilt für" — independent of personalization
    const effectiveTarget = form.target_type === 'user' ? 'all' : (form.target_type ?? 'all');

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Code */}
        <div>
          <label style={S.label}>Code *</label>
          <input type="text" value={form.code ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="z.B. SOMMER25"
            style={{ ...S.input, width: '100%', fontFamily: 'monospace' }} />
        </div>

        {/* Type + Value */}
        <div>
          <label style={S.label}>Rabatt *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input type="number" min="0" step="0.5" value={form.value ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, value: parseFloat(e.target.value) || 0 }))}
                style={{ ...S.input, width: '100%', paddingRight: 32 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#64748b' }}>
                {form.type === 'percent' ? '%' : '\u20AC'}
              </span>
            </div>
            <select value={form.type ?? 'percent'}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}
              style={{ ...S.select, width: 140 }}>
              <option value="percent">Prozent</option>
              <option value="fixed">Festbetrag</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Beschreibung</label>
          <input type="text" value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="z.B. Sommeraktion 25% auf alles"
            style={{ ...S.input, width: '100%' }} />
        </div>

        {/* Target Type — always visible, independent of personalization */}
        <div>
          <label style={S.label}>Gilt für</label>
          <select value={effectiveTarget}
            onChange={(e) => {
              const tt = e.target.value as 'all' | 'accessory' | 'group';
              setForm((f) => ({ ...f, target_type: tt, target_id: null, target_group_id: null, target_name: null }));
            }}
            style={{ ...S.select, width: '100%' }}>
            <option value="all">Gesamte Bestellung</option>
            <option value="accessory">Einzelnes Zubehör</option>
            <option value="group">Set</option>
          </select>
        </div>

        {/* Conditional: accessory dropdown */}
        {effectiveTarget === 'accessory' && (
          <div>
            <label style={S.label}>Zubehör</label>
            <select value={form.target_id ?? ''}
              onChange={(e) => {
                const accId = e.target.value || null;
                const acc = accessories.find((a) => a.id === accId);
                setForm((f) => ({ ...f, target_id: accId, target_name: acc?.name ?? null }));
              }}
              style={{ ...S.select, width: '100%' }}>
              <option value="">{'\u2014'} Zubehör wählen {'\u2014'}</option>
              {accessories.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.category})</option>
              ))}
            </select>
          </div>
        )}

        {/* Conditional: set dropdown */}
        {effectiveTarget === 'group' && (
          <div>
            <label style={S.label}>Set</label>
            <select value={form.target_group_id ?? ''}
              onChange={(e) => {
                const setId = e.target.value || null;
                const s = sets.find((x) => x.id === setId);
                setForm((f) => ({ ...f, target_group_id: setId, target_name: s?.name ?? null }));
              }}
              style={{ ...S.select, width: '100%' }}>
              <option value="">{'\u2014'} Set wählen {'\u2014'}</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Personalisiert checkbox + customer picker — independent of target_type */}
        <div style={{ gridColumn: '1 / -1', background: '#0d1322', borderRadius: 10, padding: 16, border: '1px solid #1e293b' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox"
              checked={isPersonalized}
              onChange={(e) => {
                if (!e.target.checked) {
                  setForm((f) => ({ ...f, target_user_email: null }));
                }
              }}
              onClick={(e) => {
                const checkbox = e.target as HTMLInputElement;
                if (checkbox.checked) {
                  setPickerTarget(mode);
                  setPickerOpen(true);
                }
              }}
              style={{ width: 16, height: 16, accentColor: S.cyan }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Personalisiert</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>(nur für einen bestimmten Kunden einlösbar)</span>
          </label>
          {isPersonalized && (
            <div
              onClick={() => { setPickerTarget(mode); setPickerOpen(true); }}
              style={{
                ...S.input, width: '100%', cursor: 'pointer', marginTop: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#10b98120', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" fill="none" stroke="#10b981" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                    {customers.find((c) => c.email === form.target_user_email)?.full_name || form.target_user_email}
                  </div>
                  {customers.find((c) => c.email === form.target_user_email)?.full_name && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{form.target_user_email}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setForm((f) => ({ ...f, target_user_email: null })); }}
                  style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                  title="Personalisierung entfernen"
                >{'\u2715'}</button>
              </div>
            </div>
          )}
        </div>

        {/* Validity period */}
        <div>
          <label style={S.label}>Gültig ab</label>
          <input type="datetime-local" value={toLocal(form.valid_from ?? null)}
            onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value ? new Date(e.target.value).toISOString() : null }))}
            style={{ ...S.input, width: '100%' }} />
        </div>
        <div>
          <label style={S.label}>Gültig bis</label>
          <input type="datetime-local" value={toLocal(form.valid_until ?? null)}
            onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value ? new Date(e.target.value).toISOString() : null }))}
            style={{ ...S.input, width: '100%' }} />
        </div>

        {/* Max uses + Min order */}
        <div>
          <label style={S.label}>Max. Einlösungen</label>
          <input type="number" min="0" value={form.max_uses ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value ? parseInt(e.target.value) : null }))}
            placeholder="Leer = unbegrenzt"
            style={{ ...S.input, width: '100%' }} />
        </div>
        <div>
          <label style={S.label}>Mindestbestellwert</label>
          <div style={{ position: 'relative' }}>
            <input type="number" min="0" step="1" value={form.min_order_value ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, min_order_value: e.target.value ? parseFloat(e.target.value) : null }))}
              placeholder="Leer = kein Minimum"
              style={{ ...S.input, width: '100%', paddingRight: 32 }} />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#64748b' }}>{'\u20AC'}</span>
          </div>
        </div>

        {/* Restrictions */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.once_per_customer ?? false}
              onChange={(e) => setForm((f) => ({ ...f, once_per_customer: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: S.cyan }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Einmal pro Kunde</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.not_combinable ?? false}
              onChange={(e) => setForm((f) => ({ ...f, not_combinable: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: S.cyan }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Nicht mit anderen Rabatten kombinierbar</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active ?? true}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: S.cyan }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Aktiv</span>
          </label>
        </div>
      </div>
    );
  }

  // ─── Badge helpers ─────────────────────────────────────────────────────────

  function targetBadges(c: CouponRow): { label: string; detail: string; color: string }[] {
    const badges: { label: string; detail: string; color: string }[] = [];
    // Target type badge
    const tt = c.target_type === 'user' ? 'all' : c.target_type;
    switch (tt) {
      case 'all': badges.push({ label: 'Alles', detail: '', color: '#06b6d4' }); break;
      case 'accessory': badges.push({ label: 'Zubehör', detail: c.target_name ?? '', color: '#f59e0b' }); break;
      case 'group': badges.push({ label: 'Set', detail: c.target_name ?? '', color: '#8b5cf6' }); break;
    }
    // Personalized badge (independent)
    if (c.target_user_email) {
      badges.push({ label: 'Account', detail: c.target_user_email, color: '#10b981' });
    }
    return badges;
  }

  function valueLabel(c: CouponRow): string {
    return c.type === 'percent' ? `${c.value}%` : `${c.value.toFixed(2)} \u20AC`;
  }

  function validityLabel(c: CouponRow): string {
    if (!c.valid_from && !c.valid_until) return 'Unbegrenzt';
    const p: string[] = [];
    if (c.valid_from) p.push(`ab ${fmtDate(c.valid_from)}`);
    if (c.valid_until) p.push(`bis ${fmtDate(c.valid_until)}`);
    return p.join(' ');
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '20px 16px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>Gutscheine</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>{coupons.length} Gutschein{coupons.length !== 1 ? 'e' : ''} angelegt</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditId(null); }}
          style={{ background: S.cyan, color: 'white', fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer' }}
        >
          + Neuer Gutschein
        </button>
      </div>

      {/* New coupon form */}
      {showNew && (
        <div style={{ ...S.card, padding: 24, marginBottom: 20, borderColor: S.cyan }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Neuen Gutschein anlegen</span>
            <button onClick={() => setShowNew(false)} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>{'\u2715'}</button>
          </div>
          {renderFormFields(newForm, setNewForm as (fn: (prev: FormData | Partial<FormData>) => FormData | Partial<FormData>) => void, 'new')}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button onClick={() => setShowNew(false)}
              style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, color: '#94a3b8', background: 'transparent', border: '1px solid #1e293b', borderRadius: 10, cursor: 'pointer' }}>
              Abbrechen
            </button>
            <button onClick={handleCreate} disabled={creating}
              style={{ padding: '10px 22px', fontSize: 13, fontWeight: 600, color: 'white', background: S.cyan, border: 'none', borderRadius: 10, cursor: 'pointer', opacity: creating ? 0.5 : 1 }}>
              {creating ? 'Erstelle\u2026' : 'Gutschein erstellen'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>Laden\u2026</div>
      ) : coupons.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
          Noch keine Gutscheine angelegt.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {coupons.map((c) => {
            const badges = targetBadges(c);
            return (
              <div key={c.id} style={{ ...S.card, overflow: 'hidden' }}>
                {/* Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                    {/* Code */}
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: '#1e293b', color: '#e2e8f0' }}>
                      {c.code}
                    </span>
                    {/* Value */}
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                      {valueLabel(c)}
                    </span>
                    {/* Target badges */}
                    {badges.map((badge, i) => (
                      <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: `${badge.color}18`, color: badge.color }}>
                        {badge.label}{badge.detail ? `: ${badge.detail}` : ''}
                      </span>
                    ))}
                    {/* Active dot */}
                    <button onClick={() => handleToggleActive(c)}
                      title={c.active ? 'Aktiv' : 'Inaktiv'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c.active ? '#10b981' : '#475569' }} />
                    </button>
                    {savedId === c.id && <span style={{ fontSize: 12, color: '#10b981' }}>{'\u2713'} Gespeichert</span>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{validityLabel(c)}</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                        {c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ''} Nutzungen
                      </p>
                    </div>
                    <button onClick={() => handleDelete(c.id, c.code)} disabled={deletingId === c.id}
                      style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', background: 'transparent', border: '1px solid #ef444433', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', opacity: deletingId === c.id ? 0.4 : 1 }}>
                      {deletingId === c.id ? '\u2026' : 'Löschen'}
                    </button>
                    <button onClick={() => editId === c.id ? setEditId(null) : startEdit(c)}
                      style={{ fontSize: 14, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                      {editId === c.id ? '\u25B2' : '\u25BC'}
                    </button>
                  </div>
                </div>

                {/* Edit Panel */}
                {editId === c.id && (
                  <div style={{ ...S.cardEdit, padding: '20px 20px' }}>
                    {renderFormFields(editForm, setEditForm as (fn: (prev: FormData | Partial<FormData>) => FormData | Partial<FormData>) => void, 'edit')}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                      <button onClick={() => setEditId(null)}
                        style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, color: '#94a3b8', background: 'transparent', border: '1px solid #1e293b', borderRadius: 10, cursor: 'pointer' }}>
                        Abbrechen
                      </button>
                      <button onClick={() => handleSave(c.id)} disabled={savingId === c.id}
                        style={{ padding: '10px 22px', fontSize: 13, fontWeight: 600, color: 'white', background: S.cyan, border: 'none', borderRadius: 10, cursor: 'pointer', opacity: savingId === c.id ? 0.5 : 1 }}>
                        {savingId === c.id ? 'Speichern\u2026' : 'Speichern'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Customer picker modal */}
      {pickerOpen && (
        <CustomerPicker
          customers={customers}
          onSelect={handleCustomerSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

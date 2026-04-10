'use client';

import { useState, useEffect } from 'react';
import type { AdminProduct } from '@/lib/price-config';

interface AccessoryItem { accessory_id: string; qty: number; }

interface AdminSet {
  id: string;
  name: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  sortOrder: number;
  pricingMode: 'perDay' | 'flat';
  price: number;
  available: boolean;
  accessory_items: AccessoryItem[];
  product_ids: string[];
  includedItems: string[];
}

interface Accessory {
  id: string;
  name: string;
  category: string;
  available: boolean;
  available_qty: number;
  compatible_product_ids: string[];
}

const DEFAULT_BADGE_OPTIONS = [
  { label: 'Keins', value: '', color: '' },
  { label: 'Beliebt', value: 'Beliebt', color: 'bg-accent-blue text-white' },
  { label: 'Neu', value: 'Neu', color: 'bg-accent-teal text-white' },
  { label: 'Komplett', value: 'Komplett', color: 'bg-brand-black text-white' },
  { label: 'Wasserdicht', value: 'Wasserdicht', color: 'bg-accent-teal text-white' },
];

const STATIC_IDS = new Set(['basic', 'fahrrad', 'ski', 'motorrad', 'taucher', 'vlogging', 'allrounder']);

function emptyNew() {
  return {
    name: '', description: '', badge: '', pricing_mode: 'flat' as 'perDay' | 'flat',
    price: 0, accessory_items: [] as AccessoryItem[], product_ids: [] as string[], available: true,
  };
}

function computeAvailFromItems(
  items: AccessoryItem[],
  accMap: Map<string, Accessory>
): boolean {
  if (!items || items.length === 0) return true;
  return items.every((item) => {
    const a = accMap.get(item.accessory_id);
    return a && a.available && a.available_qty >= item.qty;
  });
}

export default function AdminSetsPage() {
  const [sets, setSets] = useState<AdminSet[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [BADGE_OPTIONS, setBadgeOptions] = useState(DEFAULT_BADGE_OPTIONS);
  const [products, setProducts] = useState<Record<string, AdminProduct>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, {
    name: string; description: string; badge: string; badge_color: string;
    pricing_mode: 'perDay' | 'flat'; price: string;
    accessory_items: AccessoryItem[]; product_ids: string[];
    available: boolean;
  }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newSet, setNewSet] = useState(emptyNew());
  const [creating, setCreating] = useState(false);

  const accMap = new Map(accessories.map((a) => [a.id, a]));

  useEffect(() => {
    Promise.all([
      fetch('/api/sets').then((r) => r.json()),
      fetch('/api/admin/accessories').then((r) => r.json()),
      fetch('/api/admin/config?key=products').then((r) => r.json()),
      fetch('/api/admin/settings?key=set_badges').then((r) => r.json()),
    ]).then(([setsData, accData, prodData, badgeData]) => {
      setSets(setsData.sets ?? []);
      setAccessories(accData.accessories ?? []);
      const src = prodData && Object.keys(prodData).length > 0 ? prodData : {};
      setProducts(src);
      if (badgeData?.value && Array.isArray(badgeData.value) && badgeData.value.length > 0) {
        setBadgeOptions(badgeData.value);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function openEdit(set: AdminSet) {
    const badge = BADGE_OPTIONS.find((b) => b.value === (set.badge ?? ''));
    setEditState((prev) => ({
      ...prev,
      [set.id]: {
        name: set.name,
        description: set.description ?? '',
        badge: set.badge ?? '',
        badge_color: badge?.color ?? '',
        pricing_mode: set.pricingMode,
        price: String(set.price),
        accessory_items: set.accessory_items ?? [],
        product_ids: set.product_ids ?? [],
        available: set.available,
      },
    }));
    setExpandedId(set.id);
  }

  function setEdit<K extends keyof typeof editState[string]>(
    id: string,
    key: K,
    value: typeof editState[string][K]
  ) {
    setEditState((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  function addItem(id: string) {
    if (accessories.length === 0) return;
    const existing = editState[id]?.accessory_items ?? [];
    setEdit(id, 'accessory_items', [...existing, { accessory_id: accessories[0].id, qty: 1 }]);
  }

  function updateItem(id: string, idx: number, field: 'accessory_id' | 'qty', val: string | number) {
    const items = [...(editState[id]?.accessory_items ?? [])];
    items[idx] = { ...items[idx], [field]: val };
    setEdit(id, 'accessory_items', items);
  }

  function removeItem(id: string, idx: number) {
    setEdit(id, 'accessory_items', (editState[id]?.accessory_items ?? []).filter((_, i) => i !== idx));
  }

  function toggleProduct(id: string, productId: string) {
    const current = editState[id]?.product_ids ?? [];
    setEdit(id, 'product_ids', current.includes(productId)
      ? current.filter((p) => p !== productId)
      : [...current, productId]
    );
  }

  async function handleSave(id: string) {
    const e = editState[id];
    if (!e) return;
    const price = parseFloat(e.price);
    if (isNaN(price)) { alert('Ungültiger Preis.'); return; }
    setSavingId(id);

    const badgeOption = BADGE_OPTIONS.find((b) => b.value === e.badge);

    try {
      const res = await fetch('/api/sets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: e.name,
          description: e.description || null,
          badge: e.badge || null,
          badge_color: badgeOption?.color || null,
          pricing_mode: e.pricing_mode,
          price,
          available: e.available,
          accessory_items: e.accessory_items,
          product_ids: e.product_ids,
        }),
      });
      if (!res.ok) throw new Error();
      const { available: newAvail } = await res.json();

      setSets((prev) => prev.map((s) => s.id === id ? {
        ...s,
        name: e.name,
        description: e.description,
        badge: e.badge || undefined,
        badgeColor: badgeOption?.color || undefined,
        pricingMode: e.pricing_mode,
        price,
        available: newAvail ?? e.available,
        accessory_items: e.accessory_items,
        product_ids: e.product_ids,
      } : s));

      setSavedId(id);
      setTimeout(() => setSavedId(null), 3000);
      setExpandedId(null);
    } catch {
      alert('Fehler beim Speichern.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Set "${name}" wirklich löschen?`)) return;
    try {
      const res = await fetch('/api/sets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Fehler.'); return; }
      setSets((prev) => prev.filter((s) => s.id !== id));
    } catch { alert('Fehler beim Löschen.'); }
  }

  // New set helpers
  function addNewItem() {
    if (accessories.length === 0) return;
    setNewSet((f) => ({ ...f, accessory_items: [...f.accessory_items, { accessory_id: accessories[0].id, qty: 1 }] }));
  }
  function updateNewItem(idx: number, field: 'accessory_id' | 'qty', val: string | number) {
    setNewSet((f) => {
      const items = [...f.accessory_items];
      items[idx] = { ...items[idx], [field]: val };
      return { ...f, accessory_items: items };
    });
  }
  function removeNewItem(idx: number) {
    setNewSet((f) => ({ ...f, accessory_items: f.accessory_items.filter((_, i) => i !== idx) }));
  }
  function toggleNewProduct(productId: string) {
    setNewSet((f) => ({
      ...f,
      product_ids: f.product_ids.includes(productId)
        ? f.product_ids.filter((id) => id !== productId)
        : [...f.product_ids, productId],
    }));
  }

  async function handleCreate() {
    if (!newSet.name.trim()) { alert('Bitte einen Namen eingeben.'); return; }
    setCreating(true);
    try {
      const badgeOption = BADGE_OPTIONS.find((b) => b.value === newSet.badge);
      const res = await fetch('/api/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSet.name.trim(),
          description: newSet.description || null,
          badge: newSet.badge || null,
          badge_color: badgeOption?.color || null,
          pricing_mode: newSet.pricing_mode,
          price: newSet.price,
          available: newSet.available,
          accessory_items: newSet.accessory_items,
          product_ids: newSet.product_ids,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Fehler.'); return; }
      const { set } = await res.json();

      const newAdminSet: AdminSet = {
        id: set.id, name: set.name, description: set.description ?? '',
        badge: set.badge ?? undefined, badgeColor: set.badge_color ?? undefined,
        sortOrder: set.sort_order ?? 999,
        pricingMode: set.pricing_mode, price: Number(set.price),
        available: set.available, accessory_items: newSet.accessory_items,
        product_ids: newSet.product_ids,
        includedItems: newSet.accessory_items.map((item) => {
          const acc = accMap.get(item.accessory_id);
          return acc ? `${acc.name}${item.qty > 1 ? ` ×${item.qty}` : ''}` : item.accessory_id;
        }),
      };
      setSets((prev) => [...prev, newAdminSet]);
      setNewSet(emptyNew());
      setShowNew(false);
    } catch { alert('Netzwerkfehler.'); }
    finally { setCreating(false); }
  }

  function AvailBadge({ set }: { set: AdminSet }) {
    const e = expandedId === set.id ? editState[set.id] : null;
    const items = e ? e.accessory_items : set.accessory_items;
    const hasItems = items && items.length > 0;
    const available = hasItems ? computeAvailFromItems(items, accMap) : (e ? e.available : set.available);

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-heading font-semibold ${available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
        {hasItems && <span title="Automatisch berechnet">⟳</span>}
        {available ? 'Verfügbar' : 'Nicht verfügbar'}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading font-bold text-xl text-brand-black">Sets verwalten</h1>
            <p className="text-xs font-body text-brand-muted mt-0.5">
              ⟳ = Verfügbarkeit wird automatisch aus dem Zubehör-Lagerbestand berechnet
            </p>
          </div>
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-brand-black text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors">
            + Neues Set
          </button>
        </div>

        {/* Neues Set Form */}
        {showNew && (
          <div className="bg-white rounded-2xl border-2 border-accent-blue p-6 mb-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading font-bold text-base text-brand-black">Neues Set anlegen</h2>
              <button onClick={() => setShowNew(false)} className="text-brand-muted hover:text-brand-black text-lg">✕</button>
            </div>
            <NewSetForm
              newSet={newSet} setNewSet={setNewSet}
              accessories={accessories} products={products} accMap={accMap}
              addItem={addNewItem} updateItem={updateNewItem} removeItem={removeNewItem}
              toggleProduct={toggleNewProduct}
              badgeOptions={BADGE_OPTIONS} setBadgeOptions={setBadgeOptions}
            />
            <div className="flex justify-end mt-5 gap-2">
              <button onClick={() => setShowNew(false)}
                className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-brand-bg transition-colors">
                Abbrechen
              </button>
              <button onClick={handleCreate} disabled={creating}
                className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-brand-black text-white hover:bg-brand-dark transition-colors disabled:opacity-40">
                {creating ? 'Erstelle…' : 'Set erstellen'}
              </button>
            </div>
          </div>
        )}

        {/* Sets Liste */}
        {loading ? (
          <div className="flex justify-center py-20">
            <span className="w-8 h-8 border-4 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sets.length === 0 ? (
          <div className="text-center py-16 text-brand-muted font-body">
            Noch kein Set angelegt. Klicke auf &bdquo;+ Neues Set&ldquo;.
          </div>
        ) : (
          <div className="space-y-3">
            {sets.map((set) => {
              const isExpanded = expandedId === set.id;
              const e = editState[set.id];
              const _isStatic = STATIC_IDS.has(set.id); void _isStatic;

              return (
                <div key={set.id} className="bg-white rounded-xl border border-brand-border overflow-hidden">
                  {/* Row */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
                      <span className="font-heading font-semibold text-sm text-brand-black">{set.name}</span>
                      {set.badge && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-heading font-semibold ${set.badgeColor}`}>
                          {set.badge}
                        </span>
                      )}
                      <AvailBadge set={set} />
                      {/* Kompatible Kameras */}
                      {set.product_ids?.length > 0 ? (
                        set.product_ids.map((pid) => {
                          const p = products[pid];
                          const brand = p?.brand?.toLowerCase() ?? '';
                          const colors = brand.includes('gopro') ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : brand.includes('dji') || brand.includes('osmo') ? 'bg-gray-100 text-gray-800 border-gray-300'
                            : brand.includes('insta') ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-brand-bg text-brand-steel border-brand-border';
                          return (
                            <span key={pid} className={`px-2 py-0.5 rounded-full text-[10px] font-body border ${colors}`}>
                              {p?.name ?? pid}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[10px] font-body text-brand-muted">Alle Kameras</span>
                      )}
                      {savedId === set.id && <span className="text-xs text-green-600 font-body">Gespeichert</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-heading font-semibold text-brand-black hidden sm:block">
                        {set.price} € {set.pricingMode === 'perDay' ? '/Tag' : 'einmalig'}
                      </span>
                      <button
                        onClick={() => handleDelete(set.id, set.name)}
                        className="px-3 py-1.5 text-xs font-heading font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Löschen
                      </button>
                      <button
                        onClick={() => isExpanded ? setExpandedId(null) : openEdit(set)}
                        className="text-sm font-heading font-semibold text-brand-muted hover:text-brand-black transition-colors px-2"
                      >
                        {isExpanded ? '▲ Schließen' : '▼ Bearbeiten'}
                      </button>
                    </div>
                  </div>

                  {/* Edit Panel */}
                  {isExpanded && e && (
                    <div className="border-t border-brand-border px-5 py-5 bg-brand-bg space-y-5">
                      {/* Grunddaten */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Name</label>
                          <input type="text" value={e.name}
                            onChange={(ev) => setEdit(set.id, 'name', ev.target.value)}
                            className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                        </div>
                        <div>
                          <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Badge</label>
                          <select value={e.badge}
                            onChange={(ev) => {
                              const opt = BADGE_OPTIONS.find((b) => b.value === ev.target.value);
                              setEdit(set.id, 'badge', ev.target.value);
                              setEdit(set.id, 'badge_color', opt?.color ?? '');
                            }}
                            className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                            {BADGE_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Beschreibung</label>
                          <input type="text" value={e.description}
                            onChange={(ev) => setEdit(set.id, 'description', ev.target.value)}
                            className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                        </div>
                      </div>

                      {/* Preis */}
                      <div className="bg-white rounded-xl border border-brand-border p-4">
                        <p className="text-xs font-heading font-semibold text-brand-muted mb-3">Preis</p>
                        <div className="flex gap-3 items-center">
                          <div className="relative w-32">
                            <input type="number" min="0" step="0.50" value={e.price}
                              onChange={(ev) => setEdit(set.id, 'price', ev.target.value)}
                              className="w-full pr-8 pl-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
                          </div>
                          <select value={e.pricing_mode}
                            onChange={(ev) => setEdit(set.id, 'pricing_mode', ev.target.value as 'perDay' | 'flat')}
                            className="px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                            <option value="flat">€ einmalig</option>
                            <option value="perDay">€ / Tag</option>
                          </select>
                        </div>
                      </div>

                      {/* Zubehör */}
                      <div className="bg-white rounded-xl border border-brand-border p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-xs font-heading font-semibold text-brand-muted">Enthaltenes Zubehör</p>
                            {e.accessory_items.length > 0 && (
                              <p className="text-xs font-body text-brand-muted mt-0.5">
                                Verfügbarkeit: {' '}
                                <span className={computeAvailFromItems(e.accessory_items, accMap) ? 'text-green-600' : 'text-red-600'}>
                                  {computeAvailFromItems(e.accessory_items, accMap) ? '✓ Alles verfügbar' : '✗ Nicht vollständig verfügbar'}
                                </span>
                              </p>
                            )}
                          </div>
                          {accessories.length > 0 && (
                            <button onClick={() => addItem(set.id)}
                              className="text-xs font-heading font-semibold text-accent-blue hover:text-accent-blue/80 transition-colors">
                              + Hinzufügen
                            </button>
                          )}
                        </div>
                        {e.accessory_items.length === 0 ? (
                          <div>
                            <p className="text-xs font-body text-brand-muted mb-2">Kein Zubehör verknüpft.</p>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={e.available}
                                onChange={(ev) => setEdit(set.id, 'available', ev.target.checked)}
                                className="w-4 h-4 rounded border-brand-border" />
                              <span className="text-sm font-body text-brand-black">Manuell verfügbar</span>
                            </label>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {e.accessory_items.map((item, idx) => {
                              const acc = accMap.get(item.accessory_id);
                              const accOk = acc && acc.available && acc.available_qty >= item.qty;
                              return (
                                <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg ${accOk ? 'bg-green-50' : 'bg-red-50'}`}>
                                  <select value={item.accessory_id}
                                    onChange={(ev) => updateItem(set.id, idx, 'accessory_id', ev.target.value)}
                                    className="flex-1 px-3 py-2 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                                    {accessories.map((a) => {
                                      const compat = a.compatible_product_ids?.length
                                        ? a.compatible_product_ids.map((pid) => products[pid]?.name ?? pid).join(', ')
                                        : 'Alle';
                                      return (
                                        <option key={a.id} value={a.id}>{a.name} ({a.available_qty} St.) [{compat}]</option>
                                      );
                                    })}
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-brand-muted">×</span>
                                    <input type="number" min="1" value={item.qty}
                                      onChange={(ev) => updateItem(set.id, idx, 'qty', parseInt(ev.target.value) || 1)}
                                      className="w-16 px-2 py-2 border border-brand-border rounded-[10px] text-sm font-body text-center bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                                  </div>
                                  <span className="text-xs">{accOk ? '✓' : '✗'}</span>
                                  <button onClick={() => removeItem(set.id, idx)}
                                    className="text-red-400 hover:text-red-600 transition-colors text-lg leading-none">✕</button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Passende Kameras */}
                      {Object.keys(products).length > 0 && (
                        <div className="bg-white rounded-xl border border-brand-border p-4">
                          <p className="text-xs font-heading font-semibold text-brand-muted mb-3">Passende Kameras (optional)</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.values(products).map((p) => (
                              <label key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-heading font-semibold cursor-pointer transition-colors ${e.product_ids.includes(p.id) ? 'border-accent-blue bg-accent-blue-soft/20 text-accent-blue' : 'border-brand-border text-brand-steel hover:border-brand-black'}`}>
                                <input type="checkbox" checked={e.product_ids.includes(p.id)}
                                  onChange={() => toggleProduct(set.id, p.id)} className="sr-only" />
                                {p.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Aktionen */}
                      <div className="flex justify-end gap-2 pt-1">
                        <button onClick={() => setExpandedId(null)}
                          className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-white transition-colors">
                          Abbrechen
                        </button>
                        <button onClick={() => handleSave(set.id)} disabled={savingId === set.id}
                          className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-brand-black text-white hover:bg-brand-dark transition-colors disabled:opacity-40">
                          {savingId === set.id ? 'Speichern…' : 'Speichern'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Neues Set Form ────────────────────────────────────────────────────────────

function NewSetForm({
  newSet, setNewSet, accessories, products, accMap,
  addItem, updateItem, removeItem, toggleProduct,
  badgeOptions, setBadgeOptions,
}: {
  newSet: ReturnType<typeof emptyNew>;
  setNewSet: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyNew>>>;
  accessories: Accessory[];
  products: Record<string, AdminProduct>;
  accMap: Map<string, Accessory>;
  addItem: () => void;
  updateItem: (idx: number, field: 'accessory_id' | 'qty', val: string | number) => void;
  removeItem: (idx: number) => void;
  toggleProduct: (id: string) => void;
  badgeOptions: typeof DEFAULT_BADGE_OPTIONS;
  setBadgeOptions: React.Dispatch<React.SetStateAction<typeof DEFAULT_BADGE_OPTIONS>>;
}) {
  const [showNewBadge, setShowNewBadge] = useState(false);
  const [newBadgeName, setNewBadgeName] = useState('');
  const BADGE_OPTIONS = badgeOptions;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Name *</label>
          <input type="text" value={newSet.name}
            onChange={(e) => setNewSet((f) => ({ ...f, name: e.target.value }))}
            placeholder="z.B. Taucher Set"
            className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Badge</label>
          <div className="flex gap-2">
            <select value={showNewBadge ? '__new__' : newSet.badge}
              onChange={(e) => {
                if (e.target.value === '__new__') { setShowNewBadge(true); }
                else { setShowNewBadge(false); setNewSet((f) => ({ ...f, badge: e.target.value })); }
              }}
              className="flex-1 px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
              {BADGE_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              <option value="__new__">+ Neues Badge...</option>
            </select>
            {showNewBadge && (
              <div className="flex gap-1">
                <input type="text" value={newBadgeName} onChange={(e) => setNewBadgeName(e.target.value)}
                  placeholder="Badge-Name" autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newBadgeName.trim()) {
                      const name = newBadgeName.trim();
                      const updated = [...BADGE_OPTIONS, { label: name, value: name, color: 'bg-accent-blue text-white' }];
                      setBadgeOptions(updated);
                      setNewSet((f) => ({ ...f, badge: name }));
                      setNewBadgeName(''); setShowNewBadge(false);
                      fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: 'set_badges', value: updated }) }).catch(() => {});
                    }
                    if (e.key === 'Escape') { setShowNewBadge(false); setNewBadgeName(''); }
                  }}
                  className="w-28 px-2 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                <button type="button" onClick={() => {
                  if (!newBadgeName.trim()) return;
                  const name = newBadgeName.trim();
                  const updated = [...BADGE_OPTIONS, { label: name, value: name, color: 'bg-accent-blue text-white' }];
                  setBadgeOptions(updated);
                  setNewSet((f) => ({ ...f, badge: name }));
                  setNewBadgeName(''); setShowNewBadge(false);
                  fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'set_badges', value: updated }) }).catch(() => {});
                }} className="px-3 py-2.5 bg-brand-black text-white text-sm font-heading font-semibold rounded-[10px]">+</button>
              </div>
            )}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Beschreibung</label>
          <input type="text" value={newSet.description}
            onChange={(e) => setNewSet((f) => ({ ...f, description: e.target.value }))}
            placeholder="Kurze Beschreibung"
            className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
        </div>
      </div>

      <div className="bg-brand-bg rounded-xl p-4 flex gap-3 items-center">
        <div className="relative w-32">
          <input type="number" min="0" step="0.50" value={newSet.price}
            onChange={(e) => setNewSet((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
            className="w-full pr-8 pl-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
        </div>
        <select value={newSet.pricing_mode}
          onChange={(e) => setNewSet((f) => ({ ...f, pricing_mode: e.target.value as 'perDay' | 'flat' }))}
          className="px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
          <option value="flat">€ einmalig</option>
          <option value="perDay">€ / Tag</option>
        </select>
      </div>

      {accessories.length > 0 && (
        <div className="bg-brand-bg rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-heading font-semibold text-brand-muted">Enthaltenes Zubehör</p>
            <button onClick={addItem}
              className="text-xs font-heading font-semibold text-accent-blue hover:text-accent-blue/80">
              + Hinzufügen
            </button>
          </div>
          {newSet.accessory_items.length === 0 ? (
            <p className="text-xs font-body text-brand-muted">Noch kein Zubehör. Ohne Zubehör wird Verfügbarkeit manuell gesetzt.</p>
          ) : (
            <div className="space-y-2">
              {newSet.accessory_items.map((item, idx) => {
                const acc = accMap.get(item.accessory_id);
                const ok = acc && acc.available && acc.available_qty >= item.qty;
                return (
                  <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
                    <select value={item.accessory_id}
                      onChange={(e) => updateItem(idx, 'accessory_id', e.target.value)}
                      className="flex-1 px-3 py-2 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                      {accessories.map((a) => {
                        const compat = a.compatible_product_ids?.length
                          ? a.compatible_product_ids.map((pid) => products[pid]?.name ?? pid).join(', ')
                          : 'Alle';
                        return (
                          <option key={a.id} value={a.id}>{a.name} ({a.available_qty} St.) [{compat}]</option>
                        );
                      })}
                    </select>
                    <span className="text-xs text-brand-muted">×</span>
                    <input type="number" min="1" value={item.qty}
                      onChange={(e) => updateItem(idx, 'qty', parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-2 border border-brand-border rounded-[10px] text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                    <span className="text-xs">{ok ? '✓' : '✗'}</span>
                    <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none">✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {Object.keys(products).length > 0 && (
        <div className="bg-brand-bg rounded-xl p-4">
          <p className="text-xs font-heading font-semibold text-brand-muted mb-3">Passende Kameras (optional)</p>
          <div className="flex flex-wrap gap-2">
            {Object.values(products).map((p) => (
              <label key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-heading font-semibold cursor-pointer transition-colors ${newSet.product_ids.includes(p.id) ? 'border-accent-blue bg-accent-blue-soft/20 text-accent-blue' : 'border-brand-border text-brand-steel hover:border-brand-black'}`}>
                <input type="checkbox" checked={newSet.product_ids.includes(p.id)}
                  onChange={() => toggleProduct(p.id)} className="sr-only" />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { AdminProduct } from '@/lib/price-config';
import AdminBackLink from '@/components/admin/AdminBackLink';
import BrandBadge from '@/components/BrandBadge';
import { getBrandStyle } from '@/lib/brand-colors';
import { useBrandColors } from '@/hooks/useBrandColors';
import { fmtEuro } from '@/lib/format-utils';

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
  image_url?: string | null;
}

interface Accessory {
  id: string;
  name: string;
  category: string;
  available: boolean;
  available_qty: number;
  compatible_product_ids: string[];
  internal?: boolean;
  upgrade_group?: string | null;
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

  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const accMap = new Map(accessories.map((a) => [a.id, a]));

  // ── Gruppierung nach Kamera-Marken ──────────────────────────────────────────
  function getGroupKey(set: AdminSet): string {
    if (!set.product_ids || set.product_ids.length === 0) return 'Alle Kameras';
    const brands = [...new Set(set.product_ids.map((pid) => products[pid]?.brand ?? 'Sonstige'))].sort();
    return brands.join(' + ');
  }

  const groupedSets = (() => {
    const groups = new Map<string, AdminSet[]>();
    for (const set of sets) {
      const key = getGroupKey(set);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(set);
    }
    // Innerhalb jeder Gruppe nach Preis aufsteigend sortieren
    for (const [, arr] of groups) {
      arr.sort((a, b) => a.price - b.price);
    }
    // Gruppen sortieren: "Alle Kameras" zuerst, dann alphabetisch
    const sorted = [...groups.entries()].sort(([a], [b]) => {
      if (a === 'Alle Kameras') return -1;
      if (b === 'Alle Kameras') return 1;
      return a.localeCompare(b, 'de');
    });
    return sorted;
  })();

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

  async function handleDuplicate(set: AdminSet) {
    setDuplicatingId(set.id);
    try {
      const badgeOption = BADGE_OPTIONS.find((b) => b.value === (set.badge ?? ''));
      const res = await fetch('/api/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${set.name} (Kopie)`,
          description: set.description || null,
          badge: set.badge || null,
          badge_color: badgeOption?.color ?? null,
          pricing_mode: set.pricingMode,
          price: set.price,
          available: set.available,
          accessory_items: set.accessory_items ?? [],
          product_ids: set.product_ids ?? [],
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Fehler beim Duplizieren.'); return; }
      const { set: created } = await res.json();

      const newAdminSet: AdminSet = {
        id: created.id,
        name: created.name,
        description: created.description ?? '',
        badge: created.badge ?? undefined,
        badgeColor: created.badge_color ?? undefined,
        sortOrder: created.sort_order ?? 999,
        pricingMode: created.pricing_mode,
        price: Number(created.price),
        available: created.available,
        accessory_items: set.accessory_items ?? [],
        product_ids: set.product_ids ?? [],
        includedItems: (set.accessory_items ?? []).map((item) => {
          const acc = accMap.get(item.accessory_id);
          return acc ? `${acc.name}${item.qty > 1 ? ` ×${item.qty}` : ''}` : item.accessory_id;
        }),
      };
      setSets((prev) => [...prev, newAdminSet]);
      // Direkt zum Bearbeiten öffnen
      openEdit(newAdminSet);
    } catch { alert('Netzwerkfehler beim Duplizieren.'); }
    finally { setDuplicatingId(null); }
  }

  // New set helpers
  function addNewItem() {
    if (accessories.length === 0) return;
    setNewSet((f) => ({ ...f, accessory_items: [...f.accessory_items, { accessory_id: accessories[0].id, qty: 1 }] }));
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
        <AdminBackLink label="Zurück" />
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading font-bold text-xl text-brand-black dark:text-white">Sets verwalten</h1>
            <p className="text-xs font-body text-brand-muted mt-0.5">
              ⟳ = Verfügbarkeit wird automatisch aus dem Zubehör-Lagerbestand berechnet
            </p>
          </div>
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-brand-black dark:bg-accent-blue text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-dark dark:hover:bg-accent-blue/80 transition-colors">
            + Neues Set
          </button>
        </div>

        {/* Neues Set Form */}
        {showNew && (
          <div className="bg-white dark:bg-slate-800/80 rounded-2xl border-2 border-accent-blue p-6 mb-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading font-bold text-base text-brand-black dark:text-white">Neues Set anlegen</h2>
              <button onClick={() => setShowNew(false)} className="text-brand-muted hover:text-brand-black dark:hover:text-white text-lg">✕</button>
            </div>
            <NewSetForm
              newSet={newSet} setNewSet={setNewSet}
              accessories={accessories} products={products} accMap={accMap}
              addItem={addNewItem} toggleProduct={toggleNewProduct}
              badgeOptions={BADGE_OPTIONS} setBadgeOptions={setBadgeOptions}
            />
            <div className="flex justify-end mt-5 gap-2">
              <button onClick={() => setShowNew(false)}
                className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border dark:border-slate-600 rounded-btn hover:bg-brand-bg dark:hover:bg-slate-700 transition-colors">
                Abbrechen
              </button>
              <button onClick={handleCreate} disabled={creating}
                className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-brand-black dark:bg-accent-blue text-white hover:bg-brand-dark dark:hover:bg-accent-blue/80 transition-colors disabled:opacity-40">
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
          <div className="space-y-6">
            {groupedSets.map(([groupName, groupSets]) => (
              <div key={groupName}>
                {/* Gruppen-Header */}
                <div className="flex items-center gap-3 mb-2 px-1">
                  <h2 className="font-heading font-bold text-sm text-brand-black dark:text-slate-300">
                    {groupName}
                  </h2>
                  <span className="text-xs font-body text-brand-muted">
                    ({groupSets.length} {groupSets.length === 1 ? 'Set' : 'Sets'})
                  </span>
                  <div className="flex-1 border-t border-brand-border dark:border-slate-700" />
                </div>
                <div className="space-y-3">
            {groupSets.map((set) => {
              const isExpanded = expandedId === set.id;
              const e = editState[set.id];
              const _isStatic = STATIC_IDS.has(set.id); void _isStatic;

              return (
                <div key={set.id} className="bg-white dark:bg-slate-800/60 rounded-xl border border-brand-border dark:border-slate-700 overflow-hidden">
                  {/* Row */}
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-4">
                      {/* Vorschaubild links */}
                      {set.image_url ? (
                        <Image
                          src={set.image_url}
                          alt={set.name}
                          width={80}
                          height={80}
                          className="w-20 h-20 object-cover rounded-lg border border-brand-border dark:border-slate-700 shrink-0"
                          unoptimized={set.image_url.startsWith('data:')}
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-lg border-2 border-dashed border-brand-border dark:border-slate-600 flex items-center justify-center text-brand-muted text-[10px] shrink-0">
                          Kein Bild
                        </div>
                      )}
                      {/* Name/Badges + Preis/Aktionen rechts daneben */}
                      <div className="flex-1 min-w-0 space-y-3">
                    {/* Zeile 1: Name + Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-semibold text-sm text-brand-black dark:text-slate-200">{set.name}</span>
                      <AvailBadge set={set} />
                      {set.product_ids?.length > 0 ? (
                        set.product_ids.map((pid) => {
                          const p = products[pid];
                          return (
                            <BrandBadge key={pid} brand={p?.brand ?? 'Sonstige'} className="text-[10px]" />
                          );
                        })
                      ) : (
                        <span className="text-[10px] font-body text-brand-muted">Alle Kameras</span>
                      )}
                      {set.badge && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-heading font-semibold ${set.badgeColor}`}>
                          {set.badge}
                        </span>
                      )}
                      {savedId === set.id && <span className="text-xs text-green-600 font-body">Gespeichert</span>}
                    </div>
                    {/* Zeile 2: Preis + Aktionen */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-heading font-semibold text-brand-black dark:text-slate-200 mr-auto">
                        {fmtEuro(set.price)} {set.pricingMode === 'perDay' ? '/Tag' : 'einmalig'}
                      </span>
                      <button
                        onClick={() => handleDuplicate(set)}
                        disabled={duplicatingId === set.id}
                        title="Set duplizieren"
                        className="px-3 py-1.5 text-xs font-heading font-semibold text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/50 rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-colors disabled:opacity-40"
                      >
                        {duplicatingId === set.id ? '…' : 'Kopieren'}
                      </button>
                      <button
                        onClick={() => handleDelete(set.id, set.name)}
                        className="px-3 py-1.5 text-xs font-heading font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
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
                    </div>
                  </div>

                  {/* Edit Panel */}
                  {isExpanded && e && (
                    <div className="border-t border-brand-border dark:border-slate-700 px-5 py-5 bg-brand-bg dark:bg-slate-800/30 space-y-5">
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

                      {/* Set-Bild */}
                      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-brand-border dark:border-slate-700 p-4">
                        <p className="text-xs font-heading font-semibold text-brand-muted mb-3">Set-Bild</p>
                        <div className="flex items-center gap-4">
                          {set.image_url ? (
                            <div className="relative group">
                              <Image src={set.image_url} alt={set.name} width={160} height={120} className="w-40 h-30 object-contain rounded-lg border border-brand-border" unoptimized={set.image_url.startsWith('data:')} />

                              <button
                                onClick={async () => {
                                  if (!confirm('Bild löschen?')) return;
                                  const pathMatch = set.image_url?.match(/product-images\/(.+)$/);
                                  const path = pathMatch?.[1] ?? '';
                                  try {
                                    await fetch('/api/set-images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, setId: set.id }) });
                                    setSets((prev) => prev.map((s) => s.id === set.id ? { ...s, image_url: null } : s));
                                  } catch { alert('Fehler beim Löschen.'); }
                                }}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >✕</button>
                            </div>
                          ) : (
                            <div className="w-40 h-30 rounded-lg border-2 border-dashed border-brand-border dark:border-slate-600 flex items-center justify-center text-brand-muted text-xs">
                              Kein Bild
                            </div>
                          )}
                          <label className="cursor-pointer px-4 py-2.5 bg-accent-blue text-white text-sm font-heading font-semibold rounded-[10px] hover:bg-blue-700 transition-colors">
                            {set.image_url ? 'Bild ändern' : 'Bild hochladen'}
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (ev) => {
                              const file = ev.target.files?.[0];
                              if (!file) return;
                              const fd = new FormData();
                              fd.append('setId', set.id);
                              fd.append('setName', e.name || set.name);
                              fd.append('file', file);
                              try {
                                const res = await fetch('/api/set-images', { method: 'POST', body: fd });
                                if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Upload fehlgeschlagen.'); return; }
                                const data = await res.json();
                                setSets((prev) => prev.map((s) => s.id === set.id ? { ...s, image_url: data.url } : s));
                              } catch { alert('Upload fehlgeschlagen.'); }
                              ev.target.value = '';
                            }} />
                          </label>
                        </div>
                        <p className="text-[11px] text-brand-muted mt-2">Wird automatisch auf 1200×900 skaliert mit Set-Name als Wasserzeichen.</p>
                      </div>

                      {/* Preis */}
                      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-brand-border dark:border-slate-700 p-4">
                        <p className="text-xs font-heading font-semibold text-brand-muted mb-3">Preis</p>
                        <div className="flex gap-3 items-center">
                          <div className="relative w-32">
                            <input type="number" min="0" step="0.50" value={e.price}
                              onChange={(ev) => setEdit(set.id, 'price', ev.target.value)}
                              className="w-full pr-8 pl-3 py-2.5 border border-brand-border dark:border-slate-600 rounded-[10px] text-sm font-body bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
                          </div>
                          <select value={e.pricing_mode}
                            onChange={(ev) => setEdit(set.id, 'pricing_mode', ev.target.value as 'perDay' | 'flat')}
                            className="px-3 py-2.5 border border-brand-border dark:border-slate-600 rounded-[10px] text-sm font-body bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue">
                            <option value="flat">€ einmalig</option>
                            <option value="perDay">€ / Tag</option>
                          </select>
                        </div>
                      </div>

                      {/* Zubehör */}
                      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-brand-border dark:border-slate-700 p-4">
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
                          <AccessoryItemList
                            items={e.accessory_items}
                            onChange={(next) => setEdit(set.id, 'accessory_items', next)}
                            accessories={accessories}
                            products={products}
                            accMap={accMap}
                          />
                        )}
                      </div>

                      {/* Passende Kameras */}
                      {Object.keys(products).length > 0 && (
                        <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-brand-border dark:border-slate-700 p-4">
                          <p className="text-xs font-heading font-semibold text-brand-muted mb-3">Passende Kameras (optional)</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.values(products).map((p) => (
                              <CameraToggle key={p.id} product={p} checked={e.product_ids.includes(p.id)}
                                onToggle={() => toggleProduct(set.id, p.id)} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Aktionen */}
                      <div className="flex justify-end gap-2 pt-1">
                        <button onClick={() => setExpandedId(null)}
                          className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border dark:border-slate-600 rounded-btn hover:bg-white dark:hover:bg-slate-700 transition-colors">
                          Abbrechen
                        </button>
                        <button onClick={() => handleSave(set.id)} disabled={savingId === set.id}
                          className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-brand-black dark:bg-accent-blue text-white hover:bg-brand-dark dark:hover:bg-accent-blue/80 transition-colors disabled:opacity-40">
                          {savingId === set.id ? 'Speichern…' : 'Speichern'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Neues Set Form ────────────────────────────────────────────────────────────

function NewSetForm({
  newSet, setNewSet, accessories, products, accMap,
  addItem, toggleProduct,
  badgeOptions, setBadgeOptions,
}: {
  newSet: ReturnType<typeof emptyNew>;
  setNewSet: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyNew>>>;
  accessories: Accessory[];
  products: Record<string, AdminProduct>;
  accMap: Map<string, Accessory>;
  addItem: () => void;
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

      <div className="bg-brand-bg dark:bg-slate-800/50 rounded-xl p-4 flex gap-3 items-center">
        <div className="relative w-32">
          <input type="number" min="0" step="0.50" value={newSet.price}
            onChange={(e) => setNewSet((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
            className="w-full pr-8 pl-3 py-2.5 border border-brand-border dark:border-slate-600 rounded-[10px] text-sm font-body bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
        </div>
        <select value={newSet.pricing_mode}
          onChange={(e) => setNewSet((f) => ({ ...f, pricing_mode: e.target.value as 'perDay' | 'flat' }))}
          className="px-3 py-2.5 border border-brand-border dark:border-slate-600 rounded-[10px] text-sm font-body bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-blue">
          <option value="flat">€ einmalig</option>
          <option value="perDay">€ / Tag</option>
        </select>
      </div>

      {accessories.length > 0 && (
        <div className="bg-brand-bg dark:bg-slate-800/50 rounded-xl p-4">
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
            <AccessoryItemList
              items={newSet.accessory_items}
              onChange={(next) => setNewSet((f) => ({ ...f, accessory_items: next }))}
              accessories={accessories}
              products={products}
              accMap={accMap}
            />
          )}
        </div>
      )}

      {Object.keys(products).length > 0 && (
        <div className="bg-brand-bg dark:bg-slate-800/50 rounded-xl p-4">
          <p className="text-xs font-heading font-semibold text-brand-muted mb-3">Passende Kameras (optional)</p>
          <div className="flex flex-wrap gap-2">
            {Object.values(products).map((p) => (
              <CameraToggle key={p.id} product={p} checked={newSet.product_ids.includes(p.id)}
                onToggle={() => toggleProduct(p.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kamera-Toggle mit Brand-Farben ───────────────────────────────────────────

function CameraToggle({ product, checked, onToggle }: { product: AdminProduct; checked: boolean; onToggle: () => void }) {
  const brandColors = useBrandColors();
  const style = getBrandStyle(product.brand, brandColors);

  return (
    <label
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-heading font-semibold cursor-pointer transition-all"
      style={checked ? {
        borderColor: style.color,
        backgroundColor: style.bg,
        color: style.color,
      } : {
        borderColor: 'rgba(100,116,139,0.3)',
        color: 'rgb(148,163,184)',
      }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      {product.name}
    </label>
  );
}

// ── Gruppiertes Zubehör-Dropdown mit Kategorie + Intern-Marker ───────────────

function AccessorySelect({
  value, onChange, accessories, products,
}: {
  value: string;
  onChange: (val: string) => void;
  accessories: Accessory[];
  products: Record<string, AdminProduct>;
}) {
  // Nach Kategorie gruppieren
  const categories = [...new Set(accessories.map((a) => a.category))].sort();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 min-w-0 px-3 py-2 rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
      style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
    >
      {categories.map((cat) => {
        const group = accessories.filter((a) => a.category === cat);
        return (
          <optgroup key={cat} label={cat}>
            {group.map((a) => {
              const tags: string[] = [];
              tags.push(`${a.available_qty} St.`);
              if (a.internal) tags.push('intern');
              if (a.upgrade_group) tags.push(`↑ ${a.upgrade_group}`);
              const compat = a.compatible_product_ids?.length
                ? a.compatible_product_ids.map((pid) => products[pid]?.name ?? pid).join(', ')
                : 'Alle';
              return (
                <option key={a.id} value={a.id}>
                  {a.name} ({tags.join(' · ')}) [{compat}]
                </option>
              );
            })}
          </optgroup>
        );
      })}
    </select>
  );
}

// ── Drag-and-Drop Liste fuer Set-Zubehoer ────────────────────────────────────

function AccessoryItemList({
  items,
  onChange,
  accessories,
  products,
  accMap,
}: {
  items: AccessoryItem[];
  onChange: (next: AccessoryItem[]) => void;
  accessories: Accessory[];
  products: Record<string, AdminProduct>;
  accMap: Map<string, Accessory>;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Etwas neutrales als Drag-Image, damit Browser den Container nicht mit Border-Farben anzeigt
    try {
      e.dataTransfer.setData('text/plain', String(idx));
    } catch {
      // ignore (Edge-Fall)
    }
  };

  const handleDragEnter = (idx: number) => () => {
    if (dragIdx !== null && dragIdx !== idx) setOverIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      const next = [...items];
      const [m] = next.splice(dragIdx, 1);
      next.splice(idx, 0, m);
      onChange(next);
    }
    setDragIdx(null);
    setOverIdx(null);
  };

  const updateItem = (idx: number, field: 'accessory_id' | 'qty', val: string | number) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const acc = accMap.get(item.accessory_id);
        const ok = acc && acc.available && acc.available_qty >= item.qty;
        const isDragging = dragIdx === idx;
        const isOver = overIdx === idx && dragIdx !== idx;
        return (
          <div
            key={idx}
            draggable
            onDragStart={handleDragStart(idx)}
            onDragEnter={handleDragEnter(idx)}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop(idx)}
            className="rounded-lg p-3 transition-all"
            style={{
              background: '#111827',
              border: `1px solid ${isOver ? '#06b6d4' : '#1e293b'}`,
              borderLeft: `4px solid ${ok ? '#10b981' : '#ef4444'}`,
              opacity: isDragging ? 0.4 : 1,
              boxShadow: isOver ? '0 0 0 2px rgba(6,182,212,0.25)' : 'none',
            }}
          >
            <div className="flex items-center gap-2">
              <span
                style={{
                  cursor: 'grab',
                  color: '#475569',
                  fontSize: 14,
                  userSelect: 'none',
                  flexShrink: 0,
                  letterSpacing: -1,
                  lineHeight: 1,
                  padding: '4px 2px',
                }}
                title="Ziehen zum Sortieren"
                aria-label="Ziehen zum Sortieren"
              >
                ⋮⋮
              </span>
              <AccessorySelect
                value={item.accessory_id}
                onChange={(val) => updateItem(idx, 'accessory_id', val)}
                accessories={accessories}
                products={products}
              />
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs" style={{ color: '#64748b' }}>×</span>
                <input
                  type="number"
                  min="1"
                  value={item.qty}
                  onChange={(ev) => updateItem(idx, 'qty', parseInt(ev.target.value) || 1)}
                  className="w-14 px-2 py-2 rounded-[10px] text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-blue"
                  style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}
                />
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: ok ? '#10b981' : '#ef4444' }}>
                {ok ? '✓' : '✗'}
              </span>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="text-lg leading-none flex-shrink-0 transition-colors"
                style={{ color: '#94a3b8' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
                title="Entfernen"
                aria-label="Entfernen"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

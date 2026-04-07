'use client';

import { useEffect, useState } from 'react';
import DynamicSelect from '@/components/admin/DynamicSelect';
import { DEFAULT_ADMIN_PRODUCTS, type AdminProduct } from '@/lib/price-config';

interface Accessory {
  id: string;
  name: string;
  category: string;
  description: string | null;
  pricing_mode: 'perDay' | 'flat';
  price: number;
  available_qty: number;
  available: boolean;
  image_url: string | null;
  sort_order: number;
  compatible_product_ids: string[];
}

const CATEGORIES = ['Akku', 'Speicher', 'Halterung', 'Schutz', 'Audio', 'Stativ', 'Sonstiges'];

function emptyForm() {
  return {
    name: '',
    category: 'Akku',
    description: '',
    pricing_mode: 'perDay' as 'perDay' | 'flat',
    price: 0,
    available_qty: 1,
    available: true,
    image_url: '',
    compatible_product_ids: [] as string[],
  };
}

export default function AdminZubehoerPage() {
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Accessory>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [productList, setProductList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadAccessories();
    // Kamera-Liste aus DB laden (gleiche Quelle wie /admin/preise/kameras)
    fetch('/api/admin/config?key=products')
      .then((r) => r.json())
      .then((data: Record<string, AdminProduct> | null) => {
        const source = data && Object.keys(data).length > 0 ? data : DEFAULT_ADMIN_PRODUCTS;
        setProductList(Object.entries(source).map(([id, p]) => ({ id, name: p.name })));
      })
      .catch(() => {
        setProductList(Object.entries(DEFAULT_ADMIN_PRODUCTS).map(([id, p]) => ({ id, name: p.name })));
      });
  }, []);

  function loadAccessories() {
    setLoading(true);
    fetch('/api/admin/accessories')
      .then((r) => r.json())
      .then(({ accessories: data }) => setAccessories(data ?? []))
      .catch(() => setAccessories([]))
      .finally(() => setLoading(false));
  }

  async function handleCreate() {
    if (!newForm.name.trim()) { alert('Bitte einen Namen eingeben.'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/accessories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newForm,
          description: newForm.description || null,
          image_url: newForm.image_url || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(`Fehler: ${d.error ?? 'Unbekannter Fehler (Status ' + res.status + ')'}`);
        return;
      }
      setNewForm(emptyForm());
      setShowNew(false);
      loadAccessories();
    } catch (e) {
      alert(`Netzwerkfehler: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(acc: Accessory) {
    setEditId(acc.id);
    setEditForm({
      name: acc.name,
      category: acc.category,
      description: acc.description ?? '',
      pricing_mode: acc.pricing_mode,
      price: acc.price,
      available_qty: acc.available_qty,
      available: acc.available,
      image_url: acc.image_url ?? '',
      compatible_product_ids: acc.compatible_product_ids ?? [],
    });
  }

  async function handleSave(id: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/accessories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          description: editForm.description || null,
          image_url: editForm.image_url || null,
        }),
      });
      if (!res.ok) throw new Error();
      setAccessories((prev) =>
        prev.map((a) => a.id === id ? { ...a, ...editForm, description: editForm.description || null, image_url: editForm.image_url || null } as Accessory : a)
      );
      setEditId(null);
      setSavedId(id);
      setTimeout(() => setSavedId(null), 3000);
    } catch {
      alert('Fehler beim Speichern.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    setDeletingId(id);
    try {
      await fetch(`/api/admin/accessories/${id}`, { method: 'DELETE' });
      setAccessories((prev) => prev.filter((a) => a.id !== id));
    } catch {
      alert('Fehler beim Löschen.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-heading font-bold text-xl text-brand-black">Zubehör</h1>
          <button
            onClick={() => { setShowNew(true); setEditId(null); }}
            className="px-4 py-2 bg-brand-black text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors"
          >
            + Neues Zubehör
          </button>
        </div>

        {/* Neues Zubehör Form */}
        {showNew && (
          <div className="bg-white rounded-2xl border-2 border-accent-blue p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-bold text-sm text-brand-black">Neues Zubehör anlegen</h2>
              <button onClick={() => setShowNew(false)} className="text-brand-muted hover:text-brand-black text-lg">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Name *</label>
                <input type="text" value={newForm.name}
                  onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. Extra Akku"
                  className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kategorie *</label>
                <DynamicSelect
                  value={newForm.category}
                  onChange={(cat) => setNewForm((f) => ({ ...f, category: cat }))}
                  settingsKey="accessory_categories"
                  defaults={CATEGORIES}
                  addLabel="+ Neue Kategorie..."
                  placeholder="Kategoriename"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Beschreibung</label>
                <input type="text" value={newForm.description}
                  onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Kurze Beschreibung (optional)"
                  className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Preis</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input type="number" min="0" step="0.50" value={newForm.price}
                      onChange={(e) => setNewForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                      className="w-full pr-8 pl-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
                  </div>
                  <select value={newForm.pricing_mode}
                    onChange={(e) => setNewForm((f) => ({ ...f, pricing_mode: e.target.value as 'perDay' | 'flat' }))}
                    className="px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                    <option value="perDay">/ Tag</option>
                    <option value="flat">einmalig</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Verfügbare Menge</label>
                <input type="number" min="0" value={newForm.available_qty}
                  onChange={(e) => setNewForm((f) => ({ ...f, available_qty: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Bild-URL (optional)</label>
                <input type="text" value={newForm.image_url}
                  onChange={(e) => setNewForm((f) => ({ ...f, image_url: e.target.value }))}
                  placeholder="https://…"
                  className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newForm.available}
                    onChange={(e) => setNewForm((f) => ({ ...f, available: e.target.checked }))}
                    className="w-4 h-4 rounded border-brand-border" />
                  <span className="text-sm font-body text-brand-black">Verfügbar</span>
                </label>
              </div>
              {/* Produkt-Zuordnung */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kompatible Kameras</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body cursor-pointer ${newForm.compatible_product_ids.length === 0 ? 'border-blue-500 bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                    <input type="radio" name="new-compat" checked={newForm.compatible_product_ids.length === 0}
                      onChange={() => setNewForm((f) => ({ ...f, compatible_product_ids: [] }))} className="sr-only" />
                    Alle Kameras
                  </label>
                  {productList.map((p) => {
                    const checked = newForm.compatible_product_ids.includes(p.id);
                    return (
                      <label key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body cursor-pointer ${checked ? 'border-blue-500 bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                        <input type="checkbox" checked={checked} className="sr-only"
                          onChange={() => setNewForm((f) => {
                            const ids = checked ? f.compatible_product_ids.filter((id) => id !== p.id) : [...f.compatible_product_ids, p.id];
                            return { ...f, compatible_product_ids: ids };
                          })} />
                        {p.name}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-brand-muted">Leer = passt zu allen Kameras. Auswahl = nur für diese Modelle.</p>
              </div>
            </div>
            <div className="flex justify-end mt-5 gap-2">
              <button onClick={() => setShowNew(false)}
                className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-brand-bg transition-colors">
                Abbrechen
              </button>
              <button onClick={handleCreate} disabled={creating}
                className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-brand-black text-white hover:bg-brand-dark transition-colors disabled:opacity-40">
                {creating ? 'Erstelle…' : 'Zubehör erstellen'}
              </button>
            </div>
          </div>
        )}

        {/* Liste */}
        {loading ? (
          <div className="text-center py-16 text-brand-muted font-body">Lädt…</div>
        ) : accessories.length === 0 ? (
          <div className="text-center py-16 text-brand-muted font-body">
            Noch kein Zubehör angelegt. Klicke auf &bdquo;+ Neues Zubehör&ldquo;.
          </div>
        ) : (
          <div className="space-y-3">
            {accessories.map((acc) => (
              <div key={acc.id} className="bg-white rounded-xl border border-brand-border overflow-hidden">
                {/* Row */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2 py-0.5 rounded-full text-xs font-heading font-semibold bg-brand-bg text-brand-steel shrink-0">
                      {acc.category}
                    </span>
                    <span className="font-heading font-semibold text-sm text-brand-black truncate">{acc.name}</span>
                    {!acc.available && (
                      <span className="text-xs font-body text-brand-muted bg-brand-bg px-2 py-0.5 rounded-full shrink-0">nicht verfügbar</span>
                    )}
                    {savedId === acc.id && (
                      <span className="text-xs font-body text-green-600 shrink-0">✓ Gespeichert</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-body text-brand-muted">Preis / Menge</p>
                      <p className="text-sm font-heading font-semibold text-brand-black">
                        {acc.price} € {acc.pricing_mode === 'perDay' ? '/Tag' : 'einmalig'} · {acc.available_qty} St.
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(acc.id, acc.name)}
                      disabled={deletingId === acc.id}
                      className="px-3 py-1.5 text-xs font-heading font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      {deletingId === acc.id ? '…' : 'Löschen'}
                    </button>
                    <button
                      onClick={() => editId === acc.id ? setEditId(null) : startEdit(acc)}
                      className="text-sm font-heading font-semibold text-brand-muted hover:text-brand-black transition-colors px-2"
                    >
                      {editId === acc.id ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {/* Edit Panel */}
                {editId === acc.id && (
                  <div className="border-t border-brand-border px-5 py-5 bg-brand-bg">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Name</label>
                        <input type="text" value={editForm.name ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                      <div>
                        <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kategorie</label>
                        <DynamicSelect
                          value={editForm.category ?? 'Sonstiges'}
                          onChange={(cat) => setEditForm((f) => ({ ...f, category: cat }))}
                          settingsKey="accessory_categories"
                          defaults={CATEGORIES}
                          addLabel="+ Neue Kategorie..."
                          placeholder="Kategoriename"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Beschreibung</label>
                        <input type="text" value={editForm.description ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                      <div>
                        <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Preis</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input type="number" min="0" step="0.50" value={editForm.price ?? 0}
                              onChange={(e) => setEditForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                              className="w-full pr-8 pl-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted">€</span>
                          </div>
                          <select value={editForm.pricing_mode ?? 'perDay'}
                            onChange={(e) => setEditForm((f) => ({ ...f, pricing_mode: e.target.value as 'perDay' | 'flat' }))}
                            className="px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                            <option value="perDay">/ Tag</option>
                            <option value="flat">einmalig</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Verfügbare Menge</label>
                        <input type="number" min="0" value={editForm.available_qty ?? 1}
                          onChange={(e) => setEditForm((f) => ({ ...f, available_qty: parseInt(e.target.value) || 0 }))}
                          className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Bild-URL (optional)</label>
                        <input type="text" value={editForm.image_url ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, image_url: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                      <div className="flex items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editForm.available ?? true}
                            onChange={(e) => setEditForm((f) => ({ ...f, available: e.target.checked }))}
                            className="w-4 h-4 rounded border-brand-border" />
                          <span className="text-sm font-body text-brand-black">Verfügbar</span>
                        </label>
                      </div>
                      {/* Produkt-Zuordnung */}
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kompatible Kameras</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body cursor-pointer ${(editForm.compatible_product_ids ?? []).length === 0 ? 'border-blue-500 bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                            <input type="radio" name="edit-compat" checked={(editForm.compatible_product_ids ?? []).length === 0}
                              onChange={() => setEditForm((f) => ({ ...f, compatible_product_ids: [] }))} className="sr-only" />
                            Alle Kameras
                          </label>
                          {productList.map((p) => {
                            const checked = (editForm.compatible_product_ids ?? []).includes(p.id);
                            return (
                              <label key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body cursor-pointer ${checked ? 'border-blue-500 bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                                <input type="checkbox" checked={checked} className="sr-only"
                                  onChange={() => setEditForm((f) => {
                                    const cur = f.compatible_product_ids ?? [];
                                    const ids = checked ? cur.filter((id: string) => id !== p.id) : [...cur, p.id];
                                    return { ...f, compatible_product_ids: ids };
                                  })} />
                                {p.name}
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-brand-muted">Leer = passt zu allen Kameras.</p>
                      </div>
                    </div>
                    <div className="flex justify-end mt-4 gap-2">
                      <button onClick={() => setEditId(null)}
                        className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-white transition-colors">
                        Abbrechen
                      </button>
                      <button onClick={() => handleSave(acc.id)} disabled={savingId === acc.id}
                        className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-brand-black text-white hover:bg-brand-dark transition-colors disabled:opacity-40">
                        {savingId === acc.id ? 'Speichern…' : 'Speichern'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

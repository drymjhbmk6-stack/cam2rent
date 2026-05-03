'use client';

import { useEffect, useState } from 'react';
import DynamicSelect from '@/components/admin/DynamicSelect';
import AdminBackLink from '@/components/admin/AdminBackLink';
import AccessoryUnitsManager from '@/components/admin/AccessoryUnitsManager';
import { type AdminProduct } from '@/lib/price-config';
import { getBrandStyle } from '@/lib/brand-colors';
import { useBrandColors } from '@/hooks/useBrandColors';
import { fmtEuro } from '@/lib/format-utils';
import {
  getSpecFieldsForCategory,
  SPEC_FIELD_DEFINITIONS,
  type AccessorySpecs,
  type SpecFieldKind,
} from '@/lib/accessory-specs';

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
  internal: boolean;
  upgrade_group: string | null;
  is_upgrade_base: boolean;
  allow_multi_qty?: boolean | null;
  max_qty_per_booking?: number | null;
  // String-Variante wird im Formular verwendet (input type="number" liefert string),
  // number kommt aus der DB. API nimmt beides entgegen und konvertiert.
  replacement_value?: number | string | null;
  // Sammel-Zubehoer: kein Exemplar-Tracking, ein Sammel-QR, manuelle Mengen-Pflege
  is_bulk?: boolean | null;
  // Kategorie-spezifische Specs (Gewicht, mAh, ND-Werte, Länge etc.)
  specs?: AccessorySpecs | null;
  // Bestandteile dieses Zubehoers (z.B. "2x Sender", "1x Windschutz") —
  // reine Anzeige fuer Pack-Workflow + Packliste, kein eigenes Inventar.
  included_parts?: string[] | null;
}

const CATEGORIES = ['Akku', 'Speicher', 'Halterung', 'Schutz', 'Audio', 'Stativ', 'Sonstiges'];
const UPGRADE_GROUPS = ['', 'Speicherkarte', 'Akku'];

function emptyForm() {
  return {
    name: '',
    category: 'Akku',
    description: '',
    pricing_mode: 'perDay' as 'perDay' | 'flat',
    price: 0,
    available_qty: 0,
    available: true,
    image_url: '',
    compatible_product_ids: [] as string[],
    internal: false,
    upgrade_group: '',
    is_upgrade_base: false,
    allow_multi_qty: false,
    max_qty_per_booking: null as number | null,
    replacement_value: '',
    is_bulk: false,
    specs: {} as Record<string, string>, // Form-State: Strings, beim Submit zu AccessorySpecs konvertiert
    included_parts: [] as string[],
  };
}

function specsToFormState(specs: AccessorySpecs | null | undefined): Record<string, string> {
  if (!specs) return {};
  const out: Record<string, string> = {};
  if (typeof specs.weight_g === 'number') out.weight_g = String(specs.weight_g);
  if (typeof specs.mah === 'number') out.mah = String(specs.mah);
  if (typeof specs.storage_gb === 'number') out.storage_gb = String(specs.storage_gb);
  if (typeof specs.length_min_cm === 'number') out.length_min_cm = String(specs.length_min_cm);
  if (typeof specs.length_max_cm === 'number') out.length_max_cm = String(specs.length_max_cm);
  if (Array.isArray(specs.nd_values)) out.nd_values = specs.nd_values.join(', ');
  return out;
}

function formStateToSpecs(form: Record<string, string> | undefined | null): AccessorySpecs {
  if (!form) return {};
  const out: AccessorySpecs = {};
  const numKeys: SpecFieldKind[] = ['weight_g', 'mah', 'storage_gb', 'length_min_cm', 'length_max_cm'];
  for (const k of numKeys) {
    const raw = form[k]?.trim?.();
    if (!raw) continue;
    const n = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) {
      (out as Record<string, unknown>)[k] = n;
    }
  }
  const ndRaw = form.nd_values?.trim?.();
  if (ndRaw) {
    const arr = ndRaw.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
    if (arr.length > 0) out.nd_values = arr;
  }
  return out;
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
  const [productList, setProductList] = useState<{ id: string; name: string; brand: string }[]>([]);

  useEffect(() => {
    loadAccessories();
    // Kamera-Liste aus DB laden (gleiche Quelle wie /admin/preise/kameras)
    fetch('/api/admin/config?key=products')
      .then((r) => r.json())
      .then((data: Record<string, AdminProduct> | null) => {
        if (!data || Object.keys(data).length === 0) { setProductList([]); return; }
        setProductList(Object.entries(data).map(([id, p]) => ({ id, name: p.name, brand: p.brand ?? '' })));
      })
      .catch(() => {
        setProductList([]);
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
          specs: formStateToSpecs(newForm.specs),
          included_parts: Array.isArray(newForm.included_parts)
            ? newForm.included_parts.filter((p) => typeof p === 'string' && p.trim().length > 0)
            : [],
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
      // id wird ins editForm gespiegelt — bei is_bulk im Editor editierbar.
      // Bei nicht-bulk wird das Feld nicht angezeigt; der Save schickt es
      // dann nicht als new_id mit (weil unveraendert).
      id: acc.id,
      name: acc.name,
      category: acc.category,
      description: acc.description ?? '',
      pricing_mode: acc.pricing_mode,
      price: acc.price,
      available_qty: acc.available_qty,
      available: acc.available,
      image_url: acc.image_url ?? '',
      compatible_product_ids: acc.compatible_product_ids ?? [],
      internal: acc.internal ?? false,
      upgrade_group: acc.upgrade_group ?? '',
      is_upgrade_base: acc.is_upgrade_base ?? false,
      allow_multi_qty: acc.allow_multi_qty ?? false,
      max_qty_per_booking: acc.max_qty_per_booking ?? null,
      replacement_value: acc.replacement_value != null ? String(acc.replacement_value) : '',
      is_bulk: acc.is_bulk ?? false,
      specs: specsToFormState(acc.specs ?? null) as unknown as AccessorySpecs,
      included_parts: Array.isArray(acc.included_parts) ? [...acc.included_parts] : [],
    });
  }

  async function handleSave(id: string) {
    setSavingId(id);
    try {
      // ID-Aenderung bei Sammel-Zubehoer: editForm.id != aktueller id
      const newId = typeof editForm.id === 'string' && editForm.id.trim() && editForm.id !== id
        ? editForm.id.trim()
        : null;

      if (newId) {
        const ok = confirm(
          'Achtung: Wenn du die Bezeichnung änderst, sind bestehende QR-Aufkleber ungültig und müssen neu gedruckt werden. Trotzdem ändern?'
        );
        if (!ok) {
          setSavingId(null);
          return;
        }
      }

      const res = await fetch(`/api/admin/accessories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          description: editForm.description || null,
          image_url: editForm.image_url || null,
          new_id: newId,
          specs: formStateToSpecs(editForm.specs as unknown as Record<string, string>),
          included_parts: Array.isArray(editForm.included_parts)
            ? (editForm.included_parts as string[]).filter((p) => typeof p === 'string' && p.trim().length > 0)
            : [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fehler beim Speichern.');
        return;
      }
      // Bei ID-Aenderung Liste neu laden — Position/Identitaet aendert sich,
      // in-place mapping wuerde Geister-Eintrag erzeugen.
      if (newId) {
        loadAccessories();
        setEditId(null);
        setSavedId(newId);
      } else {
        setAccessories((prev) =>
          prev.map((a) => a.id === id ? { ...a, ...editForm, description: editForm.description || null, image_url: editForm.image_url || null } as Accessory : a)
        );
        setEditId(null);
        setSavedId(id);
      }
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

  const [filterCategory, setFilterCategory] = useState('');

  // Alle vorhandenen Kategorien sammeln
  const allCategories = [...new Set(accessories.map((a) => a.category).filter(Boolean))].sort();

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <AdminBackLink label="Zurück" />
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-heading font-bold text-xl text-brand-black">Zubehör</h1>
          <button
            onClick={() => { setShowNew(true); setEditId(null); }}
            className="px-4 py-2 bg-brand-black text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors"
          >
            + Neues Zubehör
          </button>
        </div>

        {/* Kategorie-Filter */}
        {allCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            <button
              onClick={() => setFilterCategory('')}
              className={`px-3 py-1.5 rounded-full text-xs font-heading font-semibold transition-colors ${!filterCategory ? 'bg-brand-black text-white' : 'bg-brand-bg text-brand-steel border border-brand-border hover:bg-brand-border'}`}
            >
              Alle
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-heading font-semibold transition-colors ${filterCategory === cat ? 'bg-brand-black text-white' : 'bg-brand-bg text-brand-steel border border-brand-border hover:bg-brand-border'}`}
              >
                {cat} ({accessories.filter((a) => a.category === cat).length})
              </button>
            ))}
          </div>
        )}

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
              {/* Bestandteile (z.B. Funkmikrofon-Set) */}
              <IncludedPartsEditor
                value={newForm.included_parts}
                onChange={(parts) => setNewForm((f) => ({ ...f, included_parts: parts }))}
              />
              {/* Kategorie-spezifische Spezifikationen */}
              <SpecFields
                category={newForm.category}
                values={newForm.specs}
                onChange={(specs) => setNewForm((f) => ({ ...f, specs }))}
              />
              {/* Kompatible Kameras — direkt unter Beschreibung, vor Preis */}
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
              <div className="sm:col-span-2">
                <p className="text-xs font-body text-brand-muted bg-brand-bg dark:bg-slate-800/40 border border-brand-border rounded-[10px] px-3 py-2.5">
                  {newForm.is_bulk
                    ? 'Sammel-Zubehör: kein Exemplar-Tracking, ein Sammel-QR pro Eintrag. Verfügbare Menge pflegst du manuell, sie wird automatisch bei Buchungen reduziert und bei Rückgabe wieder erhöht.'
                    : 'Bild und Exemplare können nach dem ersten Speichern unten in der Bearbeiten-Ansicht erfasst werden. Wiederbeschaffungswert ergibt sich automatisch aus den Anlagen der einzelnen Exemplare.'}
                </p>
              </div>
              {newForm.is_bulk && (
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Verfügbare Menge</label>
                  <input
                    type="number" min="0" step="1"
                    value={newForm.available_qty}
                    onChange={(e) => setNewForm((f) => ({ ...f, available_qty: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                    placeholder="z.B. 200"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
                  />
                </div>
              )}
              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newForm.available}
                    onChange={(e) => setNewForm((f) => ({ ...f, available: e.target.checked }))}
                    className="w-4 h-4 rounded border-brand-border" />
                  <span className="text-sm font-body text-brand-black">Verfügbar</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newForm.internal}
                    onChange={(e) => setNewForm((f) => ({ ...f, internal: e.target.checked }))}
                    className="w-4 h-4 rounded border-brand-border accent-amber-500" />
                  <span className="text-sm font-body text-brand-black">Nur intern</span>
                  <span className="text-[10px] text-brand-muted">(Kunde sieht es nicht)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newForm.is_bulk}
                    onChange={(e) => setNewForm((f) => ({ ...f, is_bulk: e.target.checked }))}
                    className="w-4 h-4 rounded border-brand-border accent-purple-500" />
                  <span className="text-sm font-body text-brand-black">Sammel-Zubehör</span>
                  <span className="text-[10px] text-brand-muted">(Verbrauchsmaterial, kein Exemplar-Tracking)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newForm.allow_multi_qty}
                    onChange={(e) => setNewForm((f) => ({ ...f, allow_multi_qty: e.target.checked }))}
                    className="w-4 h-4 rounded border-brand-border accent-accent-blue" />
                  <span className="text-sm font-body text-brand-black">Mehrfach-Auswahl</span>
                  <span className="text-[10px] text-brand-muted">(Kunde kann Stückzahl wählen)</span>
                </label>
                {newForm.allow_multi_qty && (
                  <label className="flex items-center gap-2">
                    <span className="text-xs font-body text-brand-muted">Max pro Buchung</span>
                    <input
                      type="number"
                      min="1"
                      value={newForm.max_qty_per_booking ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNewForm((f) => ({ ...f, max_qty_per_booking: v === '' ? null : Math.max(1, parseInt(v, 10) || 1) }));
                      }}
                      placeholder="unbegr."
                      className="w-20 px-2 py-1 border border-brand-border rounded-[8px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue"
                    />
                  </label>
                )}
              </div>
              {/* Upgrade-Gruppe */}
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Upgrade-Gruppe</label>
                <div className="flex gap-2">
                  <select value={newForm.upgrade_group}
                    onChange={(e) => setNewForm((f) => ({ ...f, upgrade_group: e.target.value, is_upgrade_base: e.target.value ? f.is_upgrade_base : false }))}
                    className="flex-1 px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                    <option value="">Keine (normales Zubehör)</option>
                    {UPGRADE_GROUPS.filter(Boolean).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  {newForm.upgrade_group && (
                    <label className="flex items-center gap-2 px-3 py-2 border border-brand-border rounded-[10px] cursor-pointer bg-white">
                      <input type="checkbox" checked={newForm.is_upgrade_base}
                        onChange={(e) => setNewForm((f) => ({ ...f, is_upgrade_base: e.target.checked }))}
                        className="w-4 h-4 rounded border-brand-border accent-green-500" />
                      <span className="text-xs font-body text-brand-black whitespace-nowrap">Standard (inklusive)</span>
                    </label>
                  )}
                </div>
                <p className="text-xs text-brand-muted mt-1">Upgrade-Gruppen werden als Radio-Buttons im Buchungsflow angezeigt.</p>
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

        {/* Liste — Zwei Spalten: Buchbar + Intern */}
        {loading ? (
          <div className="text-center py-16 text-brand-muted font-body">Lädt…</div>
        ) : accessories.length === 0 ? (
          <div className="text-center py-16 text-brand-muted font-body">
            Noch kein Zubehör angelegt. Klicke auf &bdquo;+ Neues Zubehör&ldquo;.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Linke Spalte: Buchbar — nach Kategorie gruppiert */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-status-success" />
                <h2 className="font-heading font-bold text-sm text-brand-black">Buchbar für Kunden</h2>
                <span className="text-xs text-brand-muted font-body">({accessories.filter((a) => !a.internal && (!filterCategory || a.category === filterCategory)).length})</span>
              </div>
              <div className="space-y-5">
                {groupByCategory(accessories.filter((a) => !a.internal && (!filterCategory || a.category === filterCategory))).map(({ category, items }) => (
                  <div key={category}>
                    <p className="text-sm font-heading font-bold text-brand-black dark:text-slate-100 uppercase tracking-wider mb-2.5 px-1">{category}</p>
                    <div className="space-y-2.5">
                      {items.map((acc) => (
                        <AccessoryCard key={acc.id} acc={acc} editId={editId} editForm={editForm} setEditForm={setEditForm}
                          savedId={savedId} savingId={savingId} deletingId={deletingId} productList={productList}
                          onStartEdit={startEdit} onSetEditId={setEditId} onSave={handleSave} onDelete={handleDelete} />
                      ))}
                    </div>
                  </div>
                ))}
                {accessories.filter((a) => !a.internal && (!filterCategory || a.category === filterCategory)).length === 0 && (
                  <p className="text-sm text-brand-muted font-body py-4 text-center">Kein buchbares Zubehör.</p>
                )}
              </div>
            </div>

            {/* Rechte Spalte: Intern — nach Kategorie gruppiert */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <h2 className="font-heading font-bold text-sm text-brand-black">Intern (Kunde sieht es nicht)</h2>
                <span className="text-xs text-brand-muted font-body">({accessories.filter((a) => a.internal && (!filterCategory || a.category === filterCategory)).length})</span>
              </div>
              <div className="space-y-5">
                {groupByCategory(accessories.filter((a) => a.internal && (!filterCategory || a.category === filterCategory))).map(({ category, items }) => (
                  <div key={category}>
                    <p className="text-sm font-heading font-bold text-brand-black dark:text-slate-100 uppercase tracking-wider mb-2.5 px-1">{category}</p>
                    <div className="space-y-2.5">
                      {items.map((acc) => (
                        <AccessoryCard key={acc.id} acc={acc} editId={editId} editForm={editForm} setEditForm={setEditForm}
                          savedId={savedId} savingId={savingId} deletingId={deletingId} productList={productList}
                          onStartEdit={startEdit} onSetEditId={setEditId} onSave={handleSave} onDelete={handleDelete} />
                      ))}
                    </div>
                  </div>
                ))}
                {accessories.filter((a) => a.internal && (!filterCategory || a.category === filterCategory)).length === 0 && (
                  <p className="text-sm text-brand-muted font-body py-4 text-center">Kein internes Zubehör. Erstelle welches mit &bdquo;Nur intern&ldquo;.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Gruppierung nach Kategorie ────────────────────────────────────────────── */

function groupByCategory(accs: Accessory[]): { category: string; items: Accessory[] }[] {
  const map = new Map<string, Accessory[]>();
  for (const acc of accs) {
    const cat = acc.category || 'Sonstiges';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(acc);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}

/* ── AccessoryCard Komponente ──────────────────────────────────────────────── */

function AccessoryCard({ acc, editId, editForm, setEditForm, savedId, savingId, deletingId, productList, onStartEdit, onSetEditId, onSave, onDelete }: {
  acc: Accessory;
  editId: string | null;
  editForm: Partial<Accessory>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<Accessory>>>;
  savedId: string | null;
  savingId: string | null;
  deletingId: string | null;
  productList: { id: string; name: string; brand: string }[];
  onStartEdit: (acc: Accessory) => void;
  onSetEditId: (id: string | null) => void;
  onSave: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const brandColors = useBrandColors();
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${acc.internal ? 'border-amber-300' : 'border-brand-border'}`}>
      {/* Row */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-heading font-semibold bg-brand-bg text-brand-steel shrink-0">
              {acc.category}
            </span>
            <span className="font-heading font-semibold text-sm text-brand-black truncate">{acc.name}</span>
            {acc.upgrade_group && (
              <span className="text-[10px] font-body text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full shrink-0">
                {acc.upgrade_group}{acc.is_upgrade_base ? ' (Standard)' : ''}
              </span>
            )}
            {!acc.available && (
              <span className="text-[10px] font-body text-brand-muted bg-brand-bg px-1.5 py-0.5 rounded-full shrink-0">nicht verfügbar</span>
            )}
            {savedId === acc.id && (
              <span className="text-[10px] font-body text-green-600 shrink-0">Gespeichert</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-heading font-semibold text-brand-black hidden sm:block">
              {fmtEuro(acc.price)} {acc.pricing_mode === 'perDay' ? '/Tag' : 'einmalig'}
            </span>
            <button onClick={() => onDelete(acc.id, acc.name)} disabled={deletingId === acc.id}
              className="px-2 py-1 text-[10px] font-heading font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40">
              {deletingId === acc.id ? '…' : 'X'}
            </button>
            <button onClick={() => editId === acc.id ? onSetEditId(null) : onStartEdit(acc)}
              className="text-xs font-heading font-semibold text-brand-muted hover:text-brand-black transition-colors px-1">
              {editId === acc.id ? '▲' : '▼'}
            </button>
          </div>
        </div>
        {/* Kompatible Kameras Tags */}
        {(acc.compatible_product_ids?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1 mt-2">
            {acc.compatible_product_ids.map((pid) => {
              const p = productList.find((pr) => pr.id === pid);
              const brand = p?.brand ?? '';
              const style = getBrandStyle(brand, brandColors);
              return (
                <span key={pid} className="px-2 py-0.5 rounded-full text-[10px] font-body border"
                  style={{ color: style.color, backgroundColor: style.bg, borderColor: style.border }}>
                  {p?.name ?? pid}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="mt-1.5">
            <span className="text-[10px] font-body text-brand-muted">Alle Kameras</span>
          </div>
        )}
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
                      {/* Bestandteile (z.B. Funkmikrofon-Set) */}
                      <IncludedPartsEditor
                        value={Array.isArray(editForm.included_parts) ? editForm.included_parts : []}
                        onChange={(parts) => setEditForm((f) => ({ ...f, included_parts: parts }))}
                      />
                      {/* Kategorie-spezifische Spezifikationen */}
                      <SpecFields
                        category={editForm.category ?? 'Sonstiges'}
                        values={(editForm.specs as unknown as Record<string, string>) ?? {}}
                        onChange={(specs) => setEditForm((f) => ({ ...f, specs: specs as unknown as AccessorySpecs }))}
                      />
                      {/* Kompatible Kameras — direkt unter Beschreibung, vor Preis */}
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
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Bild</label>
                        <div className="flex items-center gap-4">
                          {editForm.image_url ? (
                            <div className="relative group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={editForm.image_url as string} alt={(editForm.name as string | undefined) ?? acc.name} className="w-40 h-30 object-contain rounded-lg border border-brand-border bg-white" />
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm('Bild löschen?')) return;
                                  const url = editForm.image_url as string;
                                  const pathMatch = url.match(/product-images\/(.+)$/);
                                  const path = pathMatch?.[1] ?? '';
                                  try {
                                    await fetch('/api/accessory-images', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, accessoryId: acc.id }) });
                                    setEditForm((f) => ({ ...f, image_url: '' }));
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
                            {editForm.image_url ? 'Bild ändern' : 'Bild hochladen'}
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (ev) => {
                              const file = ev.target.files?.[0];
                              if (!file) return;
                              const fd = new FormData();
                              fd.append('accessoryId', acc.id);
                              fd.append('accessoryName', (editForm.name as string | undefined) ?? acc.name);
                              fd.append('file', file);
                              try {
                                const res = await fetch('/api/accessory-images', { method: 'POST', body: fd });
                                if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Upload fehlgeschlagen.'); return; }
                                const data = await res.json();
                                setEditForm((f) => ({ ...f, image_url: data.url }));
                              } catch { alert('Upload fehlgeschlagen.'); }
                              ev.target.value = '';
                            }} />
                          </label>
                        </div>
                        <p className="text-[11px] text-brand-muted mt-2">Wird automatisch auf 1200×900 skaliert mit Name als dezentem Wasserzeichen.</p>
                      </div>
                      {Boolean((editForm as Record<string, unknown>).is_bulk) ? (
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Verfügbare Menge</label>
                          <input
                            type="number" min="0" step="1"
                            value={(editForm as Record<string, unknown>).available_qty as number ?? 0}
                            onChange={(e) => setEditForm((f) => ({ ...f, available_qty: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                            placeholder="z.B. 200"
                            className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                          />
                          <p className="text-[10px] text-brand-muted mt-1">Sammel-Zubehör — wird bei Buchung automatisch reduziert und bei Rückgabe wieder erhöht.</p>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-6 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editForm.available ?? true}
                            onChange={(e) => setEditForm((f) => ({ ...f, available: e.target.checked }))}
                            className="w-4 h-4 rounded border-brand-border" />
                          <span className="text-sm font-body text-brand-black">Verfügbar</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={(editForm as Record<string, unknown>).internal as boolean ?? false}
                            onChange={(e) => setEditForm((f) => ({ ...f, internal: e.target.checked }))}
                            className="w-4 h-4 rounded border-brand-border accent-amber-500" />
                          <span className="text-sm font-body text-brand-black">Nur intern</span>
                          <span className="text-[10px] text-brand-muted">(Kunde sieht es nicht)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={(editForm as Record<string, unknown>).is_bulk as boolean ?? false}
                            onChange={(e) => setEditForm((f) => ({ ...f, is_bulk: e.target.checked }))}
                            className="w-4 h-4 rounded border-brand-border accent-purple-500" />
                          <span className="text-sm font-body text-brand-black">Sammel-Zubehör</span>
                          <span className="text-[10px] text-brand-muted">(Verbrauchsmaterial, kein Exemplar-Tracking)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={(editForm as Record<string, unknown>).allow_multi_qty as boolean ?? false}
                            onChange={(e) => setEditForm((f) => ({ ...f, allow_multi_qty: e.target.checked }))}
                            className="w-4 h-4 rounded border-brand-border accent-accent-blue" />
                          <span className="text-sm font-body text-brand-black">Mehrfach-Auswahl</span>
                          <span className="text-[10px] text-brand-muted">(Kunde kann Stückzahl wählen)</span>
                        </label>
                        {(editForm as Record<string, unknown>).allow_multi_qty ? (
                          <label className="flex items-center gap-2">
                            <span className="text-xs font-body text-brand-muted">Max pro Buchung</span>
                            <input
                              type="number"
                              min="1"
                              value={((editForm as Record<string, unknown>).max_qty_per_booking as number | null) ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditForm((f) => ({ ...f, max_qty_per_booking: v === '' ? null : Math.max(1, parseInt(v, 10) || 1) }));
                              }}
                              placeholder="unbegr."
                              className="w-20 px-2 py-1 border border-brand-border rounded-[8px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                            />
                          </label>
                        ) : null}
                      </div>
                      {/* Upgrade-Gruppe */}
                      <div>
                        <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Upgrade-Gruppe</label>
                        <div className="flex gap-2">
                          <select value={(editForm as Record<string, unknown>).upgrade_group as string ?? ''}
                            onChange={(e) => setEditForm((f) => ({ ...f, upgrade_group: e.target.value || null, is_upgrade_base: e.target.value ? (f as Record<string, unknown>).is_upgrade_base as boolean : false }))}
                            className="flex-1 px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue">
                            <option value="">Keine (normales Zubehör)</option>
                            {UPGRADE_GROUPS.filter(Boolean).map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                          {Boolean((editForm as Record<string, unknown>).upgrade_group) && (
                            <label className="flex items-center gap-2 px-3 py-2 border border-brand-border rounded-[10px] cursor-pointer bg-white">
                              <input type="checkbox" checked={(editForm as Record<string, unknown>).is_upgrade_base as boolean ?? false}
                                onChange={(e) => setEditForm((f) => ({ ...f, is_upgrade_base: e.target.checked }))}
                                className="w-4 h-4 rounded border-brand-border accent-green-500" />
                              <span className="text-xs font-body text-brand-black whitespace-nowrap">Standard</span>
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Exemplar-Verwaltung — nur sichtbar wenn KEIN Sammel-Zubehoer.
                        Bei is_bulk wird die Menge manuell im Feld oben gepflegt
                        und ein einzelner Sammel-QR auf der QR-Codes-Seite ausgegeben. */}
                    {!Boolean((editForm as Record<string, unknown>).is_bulk) && (
                      <div className="mt-5">
                        <AccessoryUnitsManager
                          accessoryId={acc.id}
                          onCountChanged={({ available }) =>
                            setEditForm((f) => ({ ...f, available_qty: available }))
                          }
                        />
                      </div>
                    )}
                    {Boolean((editForm as Record<string, unknown>).is_bulk) && (
                      <div className="mt-5 bg-brand-bg dark:bg-slate-800/40 rounded-xl border border-brand-border dark:border-slate-700 p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                          <div>
                            <h3 className="font-heading font-bold text-sm text-brand-black dark:text-slate-200 mb-0.5">Sammel-QR</h3>
                            <p className="text-xs font-body text-brand-muted">Ein einzelner QR-Code für das gesamte Zubehör. Drauf kleben oder ausdrucken — keine Exemplar-Verwaltung nötig.</p>
                          </div>
                          <a
                            href={`/admin/zubehoer/${acc.id}/qr-codes`}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-heading font-semibold bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors"
                          >
                            QR-Code drucken
                          </a>
                        </div>
                        {/* Bezeichnung (= URL-Code, accessories.id) editierbar bei Bulk */}
                        <div>
                          <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Bezeichnung (URL-Code)</label>
                          <input
                            type="text"
                            value={(editForm.id as string | undefined) ?? acc.id}
                            onChange={(e) => setEditForm((f) => ({ ...f, id: e.target.value.trim() }))}
                            placeholder="z.B. BEF-SCHR-01"
                            className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                          />
                          {(editForm.id as string | undefined) && editForm.id !== acc.id && (
                            <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-body text-amber-800">
                              ⚠ Achtung: Die Bezeichnung wird als URL im QR-Code verwendet. Wenn du sie änderst, sind bestehende QR-Aufkleber ungültig und müssen neu gedruckt werden. Erlaubt sind Buchstaben, Zahlen, &quot;-&quot; und &quot;_&quot;.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end mt-4 gap-2">
                      <button onClick={() => onSetEditId(null)}
                        className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-white transition-colors">
                        Abbrechen
                      </button>
                      <button onClick={() => onSave(acc.id)} disabled={savingId === acc.id}
                        className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-brand-black text-white hover:bg-brand-dark transition-colors disabled:opacity-40">
                        {savingId === acc.id ? 'Speichern…' : 'Speichern'}
                      </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── IncludedPartsEditor: Bestandteile-Liste ───────────────────────────── */

function IncludedPartsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const items = Array.isArray(value) ? value : [];

  function update(idx: number, next: string) {
    const arr = [...items];
    arr[idx] = next;
    onChange(arr);
  }
  function removeAt(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function add() {
    if (items.length >= 30) return;
    onChange([...items, '']);
  }
  function moveUp(idx: number) {
    if (idx === 0) return;
    const arr = [...items];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    onChange(arr);
  }

  return (
    <div className="sm:col-span-2 bg-brand-bg dark:bg-slate-800/40 border border-brand-border dark:border-slate-700 rounded-[10px] p-3 space-y-2">
      <div>
        <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">
          Bestandteile
          <span className="ml-2 text-[10px] font-normal normal-case tracking-normal">
            (z.B. &bdquo;2× Sender&ldquo;, &bdquo;1× Windschutz&ldquo; — nur Anzeige beim Packen, kein eigenes Inventar)
          </span>
        </p>
      </div>
      {items.length === 0 && (
        <p className="text-[11px] font-body text-brand-muted italic">
          Keine Bestandteile hinterlegt.
        </p>
      )}
      <div className="space-y-1.5">
        {items.map((line, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-muted w-5 text-right shrink-0">{idx + 1}.</span>
            <input
              type="text"
              value={line}
              onChange={(e) => update(idx, e.target.value)}
              placeholder="z.B. 2x Sender"
              maxLength={120}
              className="flex-1 px-3 py-1.5 border border-brand-border rounded-[8px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                aria-label="Nach oben"
                className="px-2 py-1 text-xs font-heading text-brand-muted border border-brand-border rounded-[6px] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↑
              </button>
            )}
            <button
              type="button"
              onClick={() => removeAt(idx)}
              aria-label="Entfernen"
              className="px-2 py-1 text-xs font-heading text-red-600 border border-red-200 rounded-[6px] hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        disabled={items.length >= 30}
        className="text-xs font-heading font-semibold text-accent-blue hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Bestandteil hinzufügen
      </button>
    </div>
  );
}

/* ── SpecFields: kategorie-abhaengige Spezifikationen ──────────────────── */

function SpecFields({
  category,
  values,
  onChange,
}: {
  category: string;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const fields = getSpecFieldsForCategory(category);
  if (fields.length === 0) return null;
  return (
    <div className="sm:col-span-2 bg-brand-bg dark:bg-slate-800/40 border border-brand-border dark:border-slate-700 rounded-[10px] p-3 space-y-3">
      <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider">
        Spezifikationen
        <span className="ml-2 text-[10px] font-normal normal-case tracking-normal">
          (kategorie-spezifisch)
        </span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((kind) => {
          const def = SPEC_FIELD_DEFINITIONS[kind];
          return (
            <div key={kind} className={kind === 'nd_values' ? 'sm:col-span-2' : ''}>
              <label className="block text-[11px] font-heading font-semibold text-brand-muted mb-1">
                {def.label}{def.unit ? ` (${def.unit})` : ''}
              </label>
              <input
                type={def.type === 'number' ? 'number' : 'text'}
                inputMode={def.type === 'number' ? 'decimal' : undefined}
                step={def.step}
                min={def.type === 'number' ? 0 : undefined}
                value={values[kind] ?? ''}
                onChange={(e) => onChange({ ...values, [kind]: e.target.value })}
                placeholder={def.placeholder}
                className="w-full px-3 py-2 border border-brand-border rounded-[10px] text-sm font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
              />
              {def.helpText && (
                <p className="text-[10px] text-brand-muted mt-1">{def.helpText}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

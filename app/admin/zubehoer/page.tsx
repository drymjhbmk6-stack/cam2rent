'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
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
  // Optionales Referenzbild pro Bestandteil, per Index zu included_parts.
  included_parts_images?: string[] | null;
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
    included_parts_images: [] as string[],
  };
}

// Baut aus parts+images paarweise ausgerichtete Arrays, verwirft Zeilen
// ohne Text (Bild wandert dann mit raus → kein Index-Versatz).
function buildIncludedPartsPayload(parts: unknown, images: unknown) {
  const p = Array.isArray(parts) ? parts : [];
  const im = Array.isArray(images) ? images : [];
  const outParts: string[] = [];
  const outImages: string[] = [];
  p.forEach((part, i) => {
    if (typeof part === 'string' && part.trim().length > 0) {
      outParts.push(part.trim());
      outImages.push(typeof im[i] === 'string' ? (im[i] as string) : '');
    }
  });
  return { included_parts: outParts, included_parts_images: outImages };
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
          ...buildIncludedPartsPayload(newForm.included_parts, newForm.included_parts_images),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(`Fehler: ${d.error ?? 'Unbekannter Fehler (Status ' + res.status + ')'}`);
        return;
      }
      const okBody = await res.json().catch(() => ({}));
      if (Array.isArray(okBody.warnings) && okBody.warnings.length > 0) {
        alert('Achtung — beim Speichern wurden Felder verworfen:\n\n' + okBody.warnings.join('\n\n'));
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
      included_parts_images: Array.isArray(acc.included_parts_images)
        ? [...acc.included_parts_images]
        : [],
    });
  }

  /** Scrollt nach dem Zuklappen smooth zur Karte mit dieser ID. */
  function scrollToCard(id: string) {
    requestAnimationFrame(() => {
      const el = document.getElementById(`acc-card-${id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const targetY = window.scrollY + rect.top - 80; // 80 px Sticky-Header-Puffer
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      }
    });
  }

  /** Edit-Modus schliessen (Abbrechen / Header-Toggle) — mit Auto-Scroll zur Karte. */
  function closeEdit(id: string) {
    setEditId(null);
    scrollToCard(id);
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
          ...buildIncludedPartsPayload(editForm.included_parts, editForm.included_parts_images),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fehler beim Speichern.');
        return;
      }
      const okBody = await res.json().catch(() => ({}));
      if (Array.isArray(okBody.warnings) && okBody.warnings.length > 0) {
        alert('Achtung — beim Speichern wurden Felder verworfen:\n\n' + okBody.warnings.join('\n\n'));
      }
      // Bei ID-Aenderung Liste neu laden — Position/Identitaet aendert sich,
      // in-place mapping wuerde Geister-Eintrag erzeugen.
      const targetId = newId ?? id;
      if (newId) {
        loadAccessories();
        setEditId(null);
        setSavedId(newId);
      } else {
        // editForm.specs ist Form-State (Strings). Im persistierten Accessory
        // muss das aber AccessorySpecs (Numbers) sein — sonst landet beim
        // naechsten Aufklappen ein leeres Form-Object, weil specsToFormState
        // nur typeof 'number' akzeptiert.
        const persistedSpecs = formStateToSpecs(editForm.specs as unknown as Record<string, string>);
        setAccessories((prev) =>
          prev.map((a) => a.id === id
            ? { ...a, ...editForm, description: editForm.description || null, image_url: editForm.image_url || null, specs: persistedSpecs } as Accessory
            : a)
        );
        setEditId(null);
        setSavedId(id);
      }
      setTimeout(() => setSavedId(null), 3000);
      scrollToCard(targetId);
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
  const [view, setView] = useState<'public' | 'internal'>('public');

  // Alle vorhandenen Kategorien sammeln
  const allCategories = [...new Set(accessories.map((a) => a.category).filter(Boolean))].sort();
  const publicCount = accessories.filter((a) => !a.internal).length;
  const internalCount = accessories.filter((a) => a.internal).length;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-6 py-8">
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
                images={newForm.included_parts_images}
                onChange={(parts, images) => setNewForm((f) => ({ ...f, included_parts: parts, included_parts_images: images }))}
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
                  <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body cursor-pointer ${newForm.compatible_product_ids.length === 0 ? 'border-blue-500 bg-blue-500/20 text-blue-700 font-semibold' : 'border-gray-300 text-gray-700'}`}>
                    <input type="radio" name="new-compat" checked={newForm.compatible_product_ids.length === 0}
                      onChange={() => setNewForm((f) => ({ ...f, compatible_product_ids: [] }))} className="sr-only" />
                    Alle Kameras
                  </label>
                  {productList.map((p) => {
                    const checked = newForm.compatible_product_ids.includes(p.id);
                    return (
                      <label key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body cursor-pointer ${checked ? 'border-blue-500 bg-blue-500/20 text-blue-700 font-semibold' : 'border-gray-300 text-gray-700'}`}>
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
                <p className="text-xs font-body text-brand-muted bg-brand-bg border border-brand-border rounded-[10px] px-3 py-2.5">
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

        {/* Buchbar / Intern Tab-Leiste */}
        <div className="flex flex-wrap gap-2 mb-5 border-b border-brand-border">
          <button
            onClick={() => setView('public')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-heading font-semibold border-b-2 -mb-px transition-colors ${
              view === 'public'
                ? 'border-brand-black text-brand-black'
                : 'border-transparent text-brand-muted hover:text-brand-black'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-status-success" />
            Buchbar für Kunden
            <span className="text-xs font-body text-brand-muted">({publicCount})</span>
          </button>
          <button
            onClick={() => setView('internal')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-heading font-semibold border-b-2 -mb-px transition-colors ${
              view === 'internal'
                ? 'border-amber-500 text-brand-black'
                : 'border-transparent text-brand-muted hover:text-brand-black'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Intern <span className="text-xs font-body text-brand-muted hidden sm:inline">(Kunde sieht es nicht)</span>
            <span className="text-xs font-body text-brand-muted">({internalCount})</span>
          </button>
        </div>

        {/* Liste — Tabellen-Layout für aktiven Tab */}
        {loading ? (
          <div className="text-center py-16 text-brand-muted font-body">Lädt…</div>
        ) : accessories.length === 0 ? (
          <div className="text-center py-16 text-brand-muted font-body">
            Noch kein Zubehör angelegt. Klicke auf &bdquo;+ Neues Zubehör&ldquo;.
          </div>
        ) : (
          (() => {
            const visible = accessories.filter((a) => (view === 'internal' ? a.internal : !a.internal) && (!filterCategory || a.category === filterCategory));
            const groups = groupByCategory(visible);
            const isInternal = view === 'internal';
            return (
              <div className="bg-white rounded-xl border border-brand-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-brand-bg border-b border-brand-border text-left">
                        <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted w-[88px]">Bild</th>
                        <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted">Name</th>
                        <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted text-right whitespace-nowrap">Preis</th>
                        <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted hidden md:table-cell">Kompatible Kameras</th>
                        <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted text-right">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-brand-muted font-body text-sm">
                            {isInternal ? 'Kein internes Zubehör. Erstelle welches mit „Nur intern".' : 'Kein buchbares Zubehör.'}
                          </td>
                        </tr>
                      ) : (
                        groups.map(({ category, items }) => (
                          <React.Fragment key={category}>
                            <tr className="bg-brand-bg/50 border-b border-brand-border">
                              <td colSpan={5} className="px-4 py-2 text-[11px] font-heading font-bold uppercase tracking-wider text-brand-steel">
                                {category} <span className="text-brand-muted font-body normal-case tracking-normal ml-1">({items.length})</span>
                              </td>
                            </tr>
                            {items.map((acc) => (
                              <React.Fragment key={acc.id}>
                                <AccessoryRow
                                  acc={acc}
                                  isOpen={editId === acc.id}
                                  isInternal={isInternal}
                                  savedId={savedId}
                                  deletingId={deletingId}
                                  productList={productList}
                                  onStartEdit={startEdit}
                                  onCloseEdit={closeEdit}
                                  onDelete={handleDelete}
                                />
                                {editId === acc.id && (
                                  <AccessoryEditRow
                                    acc={acc}
                                    editForm={editForm}
                                    setEditForm={setEditForm}
                                    savingId={savingId}
                                    productList={productList}
                                    onCloseEdit={closeEdit}
                                    onSave={handleSave}
                                  />
                                )}
                              </React.Fragment>
                            ))}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()
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

/* ── AccessoryRow: kompakte Tabellen-Zeile ─────────────────────────────────── */

function AccessoryRow({ acc, isOpen, isInternal, savedId, deletingId, productList, onStartEdit, onCloseEdit, onDelete }: {
  acc: Accessory;
  isOpen: boolean;
  isInternal: boolean;
  savedId: string | null;
  deletingId: string | null;
  productList: { id: string; name: string; brand: string }[];
  onStartEdit: (acc: Accessory) => void;
  onCloseEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const brandColors = useBrandColors();
  return (
    <tr
      id={`acc-card-${acc.id}`}
      className={`border-b border-brand-border last:border-b-0 scroll-mt-20 transition-colors ${isOpen ? 'bg-brand-bg/50' : 'hover:bg-brand-bg/50'}`}
    >
      {/* Bild */}
      <td className={`px-4 py-3 align-top ${isInternal ? 'border-l-2 border-amber-300' : ''}`}>
        {acc.image_url ? (
          <Image
            src={acc.image_url}
            alt={acc.name}
            width={64}
            height={64}
            className="w-16 h-16 object-cover rounded-lg border border-brand-border bg-white"
            unoptimized={acc.image_url.startsWith('data:')}
          />
        ) : (
          <div className="w-16 h-16 rounded-lg border-2 border-dashed border-brand-border flex items-center justify-center text-brand-muted text-[10px]">
            Kein Bild
          </div>
        )}
      </td>
      {/* Name */}
      <td className="px-4 py-3 align-top">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-heading font-semibold text-sm text-brand-black">{acc.name}</span>
            {acc.upgrade_group && (
              <span className="text-[10px] font-body text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                {acc.upgrade_group}{acc.is_upgrade_base ? ' (Standard)' : ''}
              </span>
            )}
            {!acc.available && (
              <span className="text-[10px] font-body text-brand-muted bg-brand-bg px-1.5 py-0.5 rounded-full">nicht verfügbar</span>
            )}
            {savedId === acc.id && (
              <span className="text-[10px] font-body text-green-600">✓ Gespeichert</span>
            )}
          </div>
          {/* Mobile-only: Kompatible Kameras unter Name (Kategorie steht im
              Gruppen-Header; md+ hat eigene Spalte) */}
          <div className="md:hidden flex flex-wrap gap-1 mt-1">
            {(acc.compatible_product_ids?.length ?? 0) > 0 ? (
              acc.compatible_product_ids.map((pid) => {
                const p = productList.find((pr) => pr.id === pid);
                const style = getBrandStyle(p?.brand ?? '', brandColors);
                return (
                  <span key={pid} className="px-2 py-0.5 rounded-full text-[10px] font-body border"
                    style={{ color: style.color, backgroundColor: style.bg, borderColor: style.border }}>
                    {p?.name ?? pid}
                  </span>
                );
              })
            ) : (
              <span className="text-[10px] font-body text-brand-muted self-center">Alle Kameras</span>
            )}
          </div>
        </div>
      </td>

      {/* Preis */}
      <td className="px-4 py-3 align-top text-right whitespace-nowrap tabular-nums">
        <div className="text-sm font-heading font-semibold text-brand-black">{fmtEuro(acc.price)}</div>
        <div className="text-[10px] font-body text-brand-muted">{acc.pricing_mode === 'perDay' ? '/Tag' : 'einmalig'}</div>
      </td>

      {/* Kompatible Kameras */}
      <td className="px-4 py-3 align-top hidden md:table-cell">
        {(acc.compatible_product_ids?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1">
            {acc.compatible_product_ids.map((pid) => {
              const p = productList.find((pr) => pr.id === pid);
              const style = getBrandStyle(p?.brand ?? '', brandColors);
              return (
                <span key={pid} className="px-2 py-0.5 rounded-full text-[10px] font-body border"
                  style={{ color: style.color, backgroundColor: style.bg, borderColor: style.border }}>
                  {p?.name ?? pid}
                </span>
              );
            })}
          </div>
        ) : (
          <span className="text-[11px] font-body text-brand-muted italic">Alle Kameras</span>
        )}
      </td>

      {/* Aktionen */}
      <td className="px-4 py-3 align-top text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1.5">
          <button onClick={() => isOpen ? onCloseEdit(acc.id) : onStartEdit(acc)}
            className="px-3 py-1.5 text-xs font-heading font-semibold rounded-lg border border-accent-blue/40 text-accent-blue hover:bg-accent-blue hover:text-white transition-colors">
            {isOpen ? 'Schliessen' : 'Bearbeiten'}
          </button>
          <button onClick={() => onDelete(acc.id, acc.name)} disabled={deletingId === acc.id}
            className="px-2.5 py-1.5 text-xs font-heading font-semibold rounded-lg border border-red-400/50 text-red-500 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-40"
            title="Löschen">
            {deletingId === acc.id ? '…' : '✕'}
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── AccessoryEditRow: aufgeklappte Detail-Zeile mit komplettem Edit-Panel ─── */

function AccessoryEditRow({ acc, editForm, setEditForm, savingId, productList, onCloseEdit, onSave }: {
  acc: Accessory;
  editForm: Partial<Accessory>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<Accessory>>>;
  savingId: string | null;
  productList: { id: string; name: string; brand: string }[];
  onCloseEdit: (id: string) => void;
  onSave: (id: string) => void;
}) {
  return (
    <tr className="bg-brand-bg/50 border-b border-brand-border">
      <td colSpan={5} className="px-5 py-5">
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
                        images={Array.isArray(editForm.included_parts_images) ? editForm.included_parts_images : []}
                        accessoryId={acc.id}
                        onChange={(parts, images) => setEditForm((f) => ({ ...f, included_parts: parts, included_parts_images: images }))}
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
                          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body cursor-pointer ${(editForm.compatible_product_ids ?? []).length === 0 ? 'border-blue-500 bg-blue-500/20 text-blue-700 font-semibold' : 'border-gray-300 text-gray-700'}`}>
                            <input type="radio" name="edit-compat" checked={(editForm.compatible_product_ids ?? []).length === 0}
                              onChange={() => setEditForm((f) => ({ ...f, compatible_product_ids: [] }))} className="sr-only" />
                            Alle Kameras
                          </label>
                          {productList.map((p) => {
                            const checked = (editForm.compatible_product_ids ?? []).includes(p.id);
                            return (
                              <label key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body cursor-pointer ${checked ? 'border-blue-500 bg-blue-500/20 text-blue-700 font-semibold' : 'border-gray-300 text-gray-700'}`}>
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
                            <div className="w-40 h-30 rounded-lg border-2 border-dashed border-brand-border flex items-center justify-center text-brand-muted text-xs">
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
                      <div className="mt-5 bg-brand-bg rounded-xl border border-brand-border p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                          <div>
                            <h3 className="font-heading font-bold text-sm text-brand-black mb-0.5">Sammel-QR</h3>
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
                      <button onClick={() => onCloseEdit(acc.id)}
                        className="px-4 py-2 text-sm font-heading font-semibold text-brand-muted border border-brand-border rounded-btn hover:bg-white transition-colors">
                        Abbrechen
                      </button>
                      <button onClick={() => onSave(acc.id)} disabled={savingId === acc.id}
                        className="px-5 py-2 text-sm font-heading font-semibold rounded-btn bg-brand-black text-white hover:bg-brand-dark transition-colors disabled:opacity-40">
                        {savingId === acc.id ? 'Speichern…' : 'Speichern'}
                      </button>
                    </div>
      </td>
    </tr>
  );
}

/* ── IncludedPartsEditor: Bestandteile-Liste ───────────────────────────── */

function IncludedPartsEditor({
  value,
  images,
  accessoryId,
  onChange,
}: {
  value: string[];
  images?: string[];
  accessoryId?: string;
  onChange: (parts: string[], images: string[]) => void;
}) {
  const items = Array.isArray(value) ? value : [];
  // Bilder immer parallel zur parts-Laenge halten (kein Index-Versatz).
  const imgs = items.map((_, i) => (Array.isArray(images) && typeof images[i] === 'string' ? images[i] : ''));

  const fileRef = React.useRef<HTMLInputElement>(null);
  const pendingIdx = React.useRef<number | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  function emit(nextParts: string[], nextImgs: string[]) {
    onChange(nextParts, nextImgs);
  }
  function update(idx: number, next: string) {
    const p = [...items]; p[idx] = next;
    emit(p, [...imgs]);
  }
  function removeAt(idx: number) {
    emit(items.filter((_, i) => i !== idx), imgs.filter((_, i) => i !== idx));
  }
  function add() {
    if (items.length >= 30) return;
    emit([...items, ''], [...imgs, '']);
  }
  function moveUp(idx: number) {
    if (idx === 0) return;
    const p = [...items]; const im = [...imgs];
    [p[idx - 1], p[idx]] = [p[idx], p[idx - 1]];
    [im[idx - 1], im[idx]] = [im[idx], im[idx - 1]];
    emit(p, im);
  }
  function setImage(idx: number, url: string) {
    const im = [...imgs]; im[idx] = url;
    emit([...items], im);
  }
  async function removeImage(idx: number) {
    const url = imgs[idx];
    setImage(idx, '');
    // Storage-Datei best-effort aufraeumen (Pfad aus der public URL ableiten).
    if (accessoryId && url) {
      const m = url.match(/\/accessories\/[^/]+\/parts\/[^/?#]+/);
      if (m) {
        const path = m[0].replace(/^\//, '');
        fetch('/api/admin/accessory-part-images', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, accessoryId }),
        }).catch(() => { /* egal */ });
      }
    }
  }
  function triggerUpload(idx: number) {
    pendingIdx.current = idx;
    fileRef.current?.click();
  }
  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const idx = pendingIdx.current;
    e.target.value = '';
    pendingIdx.current = null;
    if (!file || idx == null || !accessoryId) return;
    setUploadingIdx(idx);
    try {
      const fd = new FormData();
      fd.append('accessoryId', accessoryId);
      fd.append('file', file);
      const res = await fetch('/api/admin/accessory-part-images', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) {
        alert(d.error || 'Bild-Upload fehlgeschlagen.');
        return;
      }
      setImage(idx, d.url as string);
    } finally {
      setUploadingIdx(null);
    }
  }

  return (
    <div className="sm:col-span-2 bg-brand-bg border border-brand-border rounded-[10px] p-3 space-y-2">
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
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFilePicked}
      />
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
            {/* Bild-Slot: Thumbnail (klickbar → gross) oder Hochladen-Button */}
            {imgs[idx] ? (
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgs[idx]}
                  alt={line || `Bestandteil ${idx + 1}`}
                  onClick={() => setZoom(imgs[idx])}
                  className="w-9 h-9 object-cover rounded-[6px] border border-brand-border cursor-zoom-in"
                />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  aria-label="Bild entfernen"
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-600 text-white text-[9px] leading-none"
                >
                  ✕
                </button>
              </div>
            ) : accessoryId ? (
              <button
                type="button"
                onClick={() => triggerUpload(idx)}
                disabled={uploadingIdx === idx}
                aria-label="Bild hinzufügen"
                title="Bild hinzufügen"
                className="shrink-0 w-9 h-9 flex items-center justify-center text-xs text-brand-muted border border-dashed border-brand-border rounded-[6px] hover:bg-white disabled:opacity-40"
              >
                {uploadingIdx === idx ? '…' : '📷'}
              </button>
            ) : (
              <span
                title="Bild nach dem Speichern hinzufügen"
                className="shrink-0 w-9 h-9 flex items-center justify-center text-[9px] text-center text-brand-muted border border-dashed border-brand-border rounded-[6px] opacity-50"
              >
                Bild
              </span>
            )}
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

      {zoom && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(null)}
          role="dialog"
          aria-label="Bild gross"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoom}
            alt="Bestandteil gross"
            className="max-w-full max-h-full object-contain rounded-[8px]"
          />
        </div>
      )}
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
    <div className="sm:col-span-2 bg-brand-bg border border-brand-border rounded-[10px] p-3 space-y-3">
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

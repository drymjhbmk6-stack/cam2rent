'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DEFAULT_KAUTION_TIERS,
  type AdminProduct,
  type AdminProductSpec,
  type KautionTiers,
  calcPriceFromTable,
} from '@/lib/price-config';
import ProductPreview from '@/components/ProductPreview';
import MarkdownEditor from '@/components/MarkdownEditor';
import BrandSelect from '@/components/admin/BrandSelect';
import { useSpecDefinitions } from '@/components/admin/SpecDefinitions';
import AdminBackLink from '@/components/admin/AdminBackLink';

interface ProductUnit {
  id: string;
  product_id: string;
  serial_number: string;
  label: string | null;
  status: 'available' | 'rented' | 'maintenance' | 'retired';
  notes: string | null;
  purchased_at: string | null;
  created_at: string;
}

const UNIT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  available: { label: 'Verfügbar', color: 'bg-emerald-100 text-emerald-700' },
  rented: { label: 'Vermietet', color: 'bg-blue-100 text-blue-700' },
  maintenance: { label: 'Wartung', color: 'bg-amber-100 text-amber-700' },
  retired: { label: 'Ausgemustert', color: 'bg-gray-200 text-gray-600' },
};

export default function AdminKameraEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [kautionTiers, setKautionTiers] = useState<KautionTiers>(DEFAULT_KAUTION_TIERS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [allProducts, setAllProducts] = useState<Record<string, AdminProduct>>({});
  const [uploading, setUploading] = useState(false);
  const [depositMode, setDepositMode] = useState<'kaution' | 'haftung'>('haftung');
  const { specs: specDefs } = useSpecDefinitions();

  // Seriennummern-Verwaltung
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [newUnit, setNewUnit] = useState({ serial_number: '', label: '', notes: '', purchased_at: '' });
  const [addingUnit, setAddingUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [editUnitData, setEditUnitData] = useState<Partial<ProductUnit>>({});

  useEffect(() => {
    // Load kaution tiers
    fetch('/api/prices').then((r) => r.json()).then((d) => {
      if (d.kautionTiers) setKautionTiers(d.kautionTiers);
    }).catch(() => {});

    // Load deposit mode
    fetch('/api/admin/settings?key=deposit_mode')
      .then((r) => r.json())
      .then((d) => { if (d.value) setDepositMode(d.value); })
      .catch(() => {});

    // Load all products, find this one
    fetch('/api/admin/config?key=products')
      .then((r) => r.json())
      .then((data: Record<string, AdminProduct> | null) => {
        const source: Record<string, AdminProduct> = data && Object.keys(data).length > 0
          ? data : {};
        setAllProducts(source);
        const found = source[id];
        if (found) setProduct({ ...found });
        else setProduct({ ...createEmpty(id) });
      })
      .catch(() => {
        setAllProducts({});
        setProduct({ ...createEmpty(id) });
      });
  }, [id]);

  // Units laden
  const loadUnits = useCallback(async () => {
    setUnitsLoading(true);
    try {
      const res = await fetch(`/api/admin/product-units?product_id=${id}`);
      const data = await res.json();
      setUnits(data.units ?? []);
    } catch {
      setUnits([]);
    } finally {
      setUnitsLoading(false);
    }
  }, [id]);

  useEffect(() => { loadUnits(); }, [loadUnits]);

  // Stock automatisch aus aktiven Units berechnen
  const activeUnitCount = units.filter((u) => u.status !== 'retired').length;
  useEffect(() => {
    if (product && product.stock !== activeUnitCount) {
      setProduct((p) => p && ({ ...p, stock: activeUnitCount }));
    }
  }, [activeUnitCount, product]);

  async function handleAddUnit() {
    if (!newUnit.serial_number.trim()) return;
    setAddingUnit(true);
    try {
      const res = await fetch('/api/admin/product-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: id, ...newUnit }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Fehler beim Hinzufügen.');
        return;
      }
      setNewUnit({ serial_number: '', label: '', notes: '', purchased_at: '' });
      await loadUnits();
    } catch {
      alert('Fehler beim Hinzufügen.');
    } finally {
      setAddingUnit(false);
    }
  }

  async function handleUpdateUnit(unitId: string) {
    try {
      const res = await fetch('/api/admin/product-units', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: unitId, ...editUnitData }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Fehler beim Speichern.');
        return;
      }
      setEditingUnit(null);
      setEditUnitData({});
      await loadUnits();
    } catch {
      alert('Fehler beim Speichern.');
    }
  }

  async function handleDeleteUnit(unit: ProductUnit) {
    if (!confirm(`Kamera "${unit.serial_number}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/admin/product-units?id=${unit.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Fehler beim Löschen.');
        return;
      }
      await loadUnits();
    } catch {
      alert('Fehler beim Löschen.');
    }
  }

  function createEmpty(productId: string): AdminProduct {
    return {
      id: productId, name: '', brand: 'GoPro', slug: '', shortDescription: '',
      priceTable: Array(30).fill(0),
      perDayAfter30: 3, kautionTier: null, hasHaftungsoption: true,
      available: true, stock: 1,
    };
  }

  function setTableDay(day: number, value: number) {
    setProduct((p) => {
      if (!p) return p;
      const t = [...p.priceTable];
      t[day - 1] = value;
      return { ...p, priceTable: t };
    });
  }

  // ── Specs helpers ──────────────────────────────────────────────────────────
  function addSpec() {
    setProduct((p) => {
      if (!p) return p;
      const specs = p.specs ? [...p.specs] : [];
      const usedIds = new Set(specs.map((s) => s.id));
      const nextDef = specDefs.find((d) => !usedIds.has(d.id)) ?? specDefs[0];
      specs.push({
        id: nextDef?.id ?? crypto.randomUUID(),
        name: nextDef?.name ?? '',
        value: '',
        icon: nextDef?.icon ?? 'custom',
        priority: specs.length,
      });
      return { ...p, specs };
    });
  }

  function updateSpec(index: number, patch: Partial<AdminProductSpec>) {
    setProduct((p) => {
      if (!p || !p.specs) return p;
      const specs = [...p.specs];
      specs[index] = { ...specs[index], ...patch };
      return { ...p, specs };
    });
  }

  function removeSpec(index: number) {
    setProduct((p) => {
      if (!p || !p.specs) return p;
      const specs = p.specs.filter((_, i) => i !== index).map((s, i) => ({ ...s, priority: i }));
      return { ...p, specs };
    });
  }

  function moveSpec(index: number, direction: 'up' | 'down') {
    setProduct((p) => {
      if (!p || !p.specs) return p;
      const specs = [...p.specs];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= specs.length) return p;
      [specs[index], specs[target]] = [specs[target], specs[index]];
      const reindexed = specs.map((s, i) => ({ ...s, priority: i }));
      return { ...p, specs: reindexed };
    });
  }

  // ── Image helpers ────────────────────────────────────────────────────────
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !product) return;
    setUploading(true);
    try {
      const newImages = [...(product.images ?? [])];
      for (const file of files) {
        const formData = new FormData();
        formData.append('productId', product.id);
        formData.append('file', file);
        const res = await fetch('/api/product-images', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) newImages.push(data.url);
      }
      setProduct((p) => p && ({ ...p, images: newImages }));
    } catch { /* ignore */ }
    finally { setUploading(false); e.target.value = ''; }
  }

  function removeImage(index: number) {
    setProduct((p) => {
      if (!p) return p;
      const images = [...(p.images ?? [])];
      images.splice(index, 1);
      return { ...p, images };
    });
  }

  function moveImage(index: number, direction: 'left' | 'right') {
    setProduct((p) => {
      if (!p || !p.images) return p;
      const images = [...p.images];
      const target = direction === 'left' ? index - 1 : index + 1;
      if (target < 0 || target >= images.length) return p;
      [images[index], images[target]] = [images[target], images[index]];
      return { ...p, images };
    });
  }

  async function handleSave() {
    if (!product) return;
    setSaving(true);
    try {
      const updated = { ...allProducts, [product.id]: product };
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'products', value: updated }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Kamera "${product?.name}" wirklich löschen?`)) return;
    const updated = { ...allProducts };
    delete updated[id];
    await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'products', value: updated }),
    });
    router.push('/admin/preise/kameras');
  }

  if (!product) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <p className="text-brand-muted font-body">Lädt…</p>
    </div>
  );

  const day30Price = product.priceTable[29] ?? 0;
  const day31Preview = day30Price + product.perDayAfter30;
  const kautionAmount = !product.hasHaftungsoption && product.kautionTier
    ? kautionTiers[product.kautionTier]?.amount
    : undefined;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <AdminBackLink href="/admin/preise/kameras" label="Zurück zu Kameras" />
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Link href="/admin/preise/kameras" className="text-sm font-body text-brand-muted hover:text-brand-black transition-colors">Kameras</Link>
            <span className="text-brand-muted">/</span>
            <h1 className="font-heading font-bold text-xl text-brand-black">
              {product.name || 'Neue Kamera'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-heading font-semibold text-red-600 border border-red-200 rounded-btn hover:bg-red-50 transition-colors"
            >
              Löschen
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-5 py-2 text-sm font-heading font-semibold rounded-btn transition-colors disabled:opacity-40 ${saved ? 'bg-green-600 text-white' : 'bg-brand-black text-white hover:bg-brand-dark'}`}
            >
              {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Speichern'}
            </button>
          </div>
        </div>

        {/* Two-column layout: Editor + Preview */}
        <div className="flex flex-col xl:flex-row gap-6">

          {/* Left: Editor form */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Produktbilder */}
            <div className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-heading font-bold text-sm text-brand-black mb-1">Produktbilder</h2>
              <p className="text-xs font-body text-brand-muted mb-4">Erstes Bild = Hauptbild. Bilder per Pfeiltasten sortieren.</p>

              {(product.images && product.images.length > 0) ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {product.images.map((url, i) => (
                    <div key={`${url}-${i}`} className="relative group aspect-square rounded-xl overflow-hidden border-2 border-brand-border bg-brand-bg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Bild ${i + 1}`} className="w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-accent-blue text-white text-[9px] font-heading font-bold rounded-full">
                          Hauptbild
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                        <button type="button" onClick={() => moveImage(i, 'left')} disabled={i === 0}
                          className="p-1.5 bg-white/90 rounded-lg text-xs disabled:opacity-30 hover:bg-white" title="Nach links">
                          ←
                        </button>
                        <button type="button" onClick={() => removeImage(i)}
                          className="p-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600" title="Löschen">
                          ✕
                        </button>
                        <button type="button" onClick={() => moveImage(i, 'right')} disabled={i === (product.images?.length ?? 0) - 1}
                          className="p-1.5 bg-white/90 rounded-lg text-xs disabled:opacity-30 hover:bg-white" title="Nach rechts">
                          →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mb-4 p-6 border-2 border-dashed border-brand-border rounded-xl text-center">
                  <svg className="w-8 h-8 text-brand-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xs text-brand-muted">Noch keine Bilder hochgeladen</p>
                </div>
              )}

              <label className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-heading font-semibold rounded-btn cursor-pointer transition-colors ${uploading ? 'bg-brand-bg text-brand-muted' : 'bg-accent-blue text-white hover:bg-blue-600'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {uploading ? 'Wird hochgeladen…' : 'Bilder hinzufügen'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleImageUpload} disabled={uploading} />
              </label>
            </div>

            {/* Stammdaten */}
            <div className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-heading font-bold text-sm text-brand-black mb-4">Stammdaten</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Name</label>
                  <input type="text" value={product.name}
                    onChange={(e) => setProduct((p) => p && ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Marke</label>
                  <BrandSelect value={product.brand} onChange={(brand) => setProduct((p) => p && ({ ...p, brand }))} />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kurzbeschreibung</label>
                  <input type="text" value={product.shortDescription}
                    onChange={(e) => setProduct((p) => p && ({ ...p, shortDescription: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">URL-Slug</label>
                  <input type="text" value={product.slug}
                    onChange={(e) => setProduct((p) => p && ({ ...p, slug: e.target.value }))}
                    placeholder="z.B. gopro-hero-13-black"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Modell</label>
                  <input type="text" value={product.model ?? ''}
                    onChange={(e) => setProduct((p) => p && ({ ...p, model: e.target.value }))}
                    placeholder="z.B. Hero 13"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kategorie</label>
                  <select value={product.category ?? 'action-cam'}
                    onChange={(e) => setProduct((p) => p && ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                    <option value="action-cam">Action-Cam</option>
                    <option value="360-cam">360°-Cam</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {['popular', 'new', 'deal'].map((tag) => {
                      const active = (product.tags ?? []).includes(tag);
                      return (
                        <button key={tag} type="button"
                          onClick={() => setProduct((p) => {
                            if (!p) return p;
                            const cur = p.tags ?? [];
                            return { ...p, tags: active ? cur.filter((t) => t !== tag) : [...cur, tag] };
                          })}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-body cursor-pointer transition-colors ${active ? 'border-blue-500 bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                          {tag === 'popular' ? 'Beliebt' : tag === 'new' ? 'Neu' : 'Angebot'}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kaution (€)</label>
                  <input type="number" min="0" step="10" value={product.deposit ?? 0}
                    onChange={(e) => setProduct((p) => p && ({ ...p, deposit: parseFloat(e.target.value) || 0 }))}
                    placeholder="z.B. 150"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Ausführliche Beschreibung (Markdown)</label>
                  <MarkdownEditor
                    value={product.description ?? ''}
                    onChange={(v) => setProduct((p) => p && ({ ...p, description: v }))}
                    placeholder="Detaillierte Produktbeschreibung für die Produktseite… (Markdown unterstützt)"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={product.available}
                      onChange={(e) => setProduct((p) => p && ({ ...p, available: e.target.checked }))}
                      className="w-4 h-4 rounded border-brand-border" />
                    <span className="text-sm font-body text-brand-black">Verfügbar</span>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Bestand (automatisch)</label>
                  <div className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-gray-50 text-brand-muted">
                    {activeUnitCount} {activeUnitCount === 1 ? 'Kamera' : 'Kameras'} (aus Seriennummern)
                  </div>
                </div>
              </div>
            </div>

            {/* Haftung / Kaution — abhängig von globaler Einstellung */}
            <div className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-heading font-bold text-sm text-brand-black mb-1">Haftung & Kaution</h2>
              <p className="text-xs font-body text-brand-muted mb-4">
                {depositMode === 'kaution' && 'Globaler Modus: Nur Kaution. Kaution-Stufe für dieses Produkt wählen.'}
                {depositMode === 'haftung' && 'Globaler Modus: Nur Haftungsschutz. Kunden können Standard/Premium wählen.'}
{/* both-Modus entfernt */}
              </p>

              <div className="space-y-3">
                {(depositMode === 'haftung') && (
                  <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${product.hasHaftungsoption ? 'border-accent-blue bg-accent-blue-soft/20' : 'border-brand-border hover:border-brand-muted'}`}>
                    <input type="radio" name="liability" checked={product.hasHaftungsoption}
                      onChange={() => setProduct((p) => p && ({ ...p, hasHaftungsoption: true, kautionTier: null }))}
                      className="sr-only" />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${product.hasHaftungsoption ? 'border-accent-blue' : 'border-brand-border'}`}>
                      {product.hasHaftungsoption && <div className="w-2 h-2 rounded-full bg-accent-blue" />}
                    </div>
                    <div>
                      <p className="text-sm font-heading font-semibold text-brand-black">Haftungsoption (Standard / Premium)</p>
                      <p className="text-xs font-body text-brand-muted">Kunden können Standard- oder Premium-Haftungsschutz wählen</p>
                    </div>
                  </label>
                )}

                {(depositMode === 'kaution') && ([1, 2, 3] as const).map((tier) => (
                  <label key={tier} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${!product.hasHaftungsoption && product.kautionTier === tier ? 'border-accent-blue bg-accent-blue-soft/20' : 'border-brand-border hover:border-brand-muted'}`}>
                    <input type="radio" name="liability"
                      checked={!product.hasHaftungsoption && product.kautionTier === tier}
                      onChange={() => setProduct((p) => p && ({ ...p, hasHaftungsoption: false, kautionTier: tier }))}
                      className="sr-only" />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${!product.hasHaftungsoption && product.kautionTier === tier ? 'border-accent-blue' : 'border-brand-border'}`}>
                      {!product.hasHaftungsoption && product.kautionTier === tier && <div className="w-2 h-2 rounded-full bg-accent-blue" />}
                    </div>
                    <div>
                      <p className="text-sm font-heading font-semibold text-brand-black">
                        {kautionTiers[tier].name} — {kautionTiers[tier].amount} €
                      </p>
                      <p className="text-xs font-body text-brand-muted">Kaution-Stufe {tier}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Technische Daten (Specs Editor) */}
            <div className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-heading font-bold text-sm text-brand-black mb-1">Technische Daten</h2>
              <p className="text-xs font-body text-brand-muted mb-4">Specs die auf der Produktseite angezeigt werden. Reihenfolge per Pfeiltasten ändern.</p>

              <div className="space-y-2">
                {(product.specs ?? []).map((spec, index) => {
                  const def = specDefs.find((d) => d.id === spec.id);
                  const unit = def?.unit ?? '';
                  return (
                    <div key={`${spec.id}-${index}`} className="flex items-center gap-2 p-2.5 rounded-xl border border-brand-border bg-brand-bg">
                      <div className="flex flex-col gap-0.5">
                        <button type="button" onClick={() => moveSpec(index, 'up')} disabled={index === 0}
                          className="px-1 py-0.5 text-[10px] text-brand-muted hover:text-brand-black disabled:opacity-30 transition-colors" title="Nach oben">&#9650;</button>
                        <button type="button" onClick={() => moveSpec(index, 'down')} disabled={index === (product.specs?.length ?? 0) - 1}
                          className="px-1 py-0.5 text-[10px] text-brand-muted hover:text-brand-black disabled:opacity-30 transition-colors" title="Nach unten">&#9660;</button>
                      </div>

                      <select
                        value={spec.id}
                        onChange={(e) => {
                          const d = specDefs.find((s) => s.id === e.target.value);
                          if (d) updateSpec(index, { id: d.id, name: d.name, icon: d.icon });
                        }}
                        className="w-32 px-2 py-1.5 border border-brand-border rounded-[8px] text-xs font-body bg-white focus:outline-none focus:ring-2 focus:ring-accent-blue"
                      >
                        {specDefs.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>

                      <div className="flex-1 min-w-0 relative">
                        <input
                          type="text"
                          value={spec.value}
                          onChange={(e) => updateSpec(index, { value: e.target.value })}
                          placeholder={unit ? `Wert (${unit})` : 'Wert'}
                          className="w-full px-2 py-1.5 border border-brand-border rounded-[8px] text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue pr-12"
                        />
                        {unit && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-brand-muted pointer-events-none">{unit}</span>
                        )}
                      </div>

                      <button type="button" onClick={() => removeSpec(index)}
                        className="px-2 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-[8px] transition-colors" title="Spec entfernen">&#10005;</button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addSpec}
                className="mt-3 px-4 py-2 text-xs font-heading font-semibold text-accent-blue border border-accent-blue/30 rounded-btn hover:bg-accent-blue-soft/20 transition-colors"
              >
                + Spec hinzufügen
              </button>
            </div>

            {/* Seriennummern / Kameras */}
            <div className="bg-white rounded-2xl border border-brand-border p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-heading font-bold text-sm text-brand-black">Kameras / Seriennummern</h2>
                <span className="text-xs font-body text-brand-muted">
                  {activeUnitCount} aktiv{units.filter((u) => u.status === 'retired').length > 0 && `, ${units.filter((u) => u.status === 'retired').length} ausgemustert`}
                </span>
              </div>
              <p className="text-xs font-body text-brand-muted mb-4">Jede physische Kamera einzeln erfassen. Der Lagerbestand wird automatisch berechnet.</p>

              {unitsLoading ? (
                <p className="text-sm text-brand-muted py-4 text-center">Lade Seriennummern…</p>
              ) : (
                <>
                  {/* Bestehende Units */}
                  {units.length > 0 && (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-brand-border">
                            <th className="text-left text-xs font-heading font-semibold text-brand-muted py-2 px-2">Seriennummer</th>
                            <th className="text-left text-xs font-heading font-semibold text-brand-muted py-2 px-2">Label</th>
                            <th className="text-left text-xs font-heading font-semibold text-brand-muted py-2 px-2">Status</th>
                            <th className="text-left text-xs font-heading font-semibold text-brand-muted py-2 px-2">Kaufdatum</th>
                            <th className="text-left text-xs font-heading font-semibold text-brand-muted py-2 px-2">Notizen</th>
                            <th className="text-right text-xs font-heading font-semibold text-brand-muted py-2 px-2">Aktionen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {units.map((unit) => (
                            <tr key={unit.id} className="border-b border-brand-border/50 hover:bg-brand-bg transition-colors">
                              {editingUnit === unit.id ? (
                                <>
                                  <td className="py-2 px-2">
                                    <input type="text" value={editUnitData.serial_number ?? unit.serial_number}
                                      onChange={(e) => setEditUnitData((d) => ({ ...d, serial_number: e.target.value }))}
                                      className="w-full px-2 py-1 border border-brand-border rounded-lg text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                                  </td>
                                  <td className="py-2 px-2">
                                    <input type="text" value={editUnitData.label ?? unit.label ?? ''}
                                      onChange={(e) => setEditUnitData((d) => ({ ...d, label: e.target.value }))}
                                      className="w-full px-2 py-1 border border-brand-border rounded-lg text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                                  </td>
                                  <td className="py-2 px-2">
                                    <select value={editUnitData.status ?? unit.status}
                                      onChange={(e) => setEditUnitData((d) => ({ ...d, status: e.target.value as ProductUnit['status'] }))}
                                      className="px-2 py-1 border border-brand-border rounded-lg text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                                      <option value="available">Verfügbar</option>
                                      <option value="rented">Vermietet</option>
                                      <option value="maintenance">Wartung</option>
                                      <option value="retired">Ausgemustert</option>
                                    </select>
                                  </td>
                                  <td className="py-2 px-2">
                                    <input type="date" value={editUnitData.purchased_at ?? unit.purchased_at ?? ''}
                                      onChange={(e) => setEditUnitData((d) => ({ ...d, purchased_at: e.target.value }))}
                                      className="px-2 py-1 border border-brand-border rounded-lg text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                                  </td>
                                  <td className="py-2 px-2">
                                    <input type="text" value={editUnitData.notes ?? unit.notes ?? ''}
                                      onChange={(e) => setEditUnitData((d) => ({ ...d, notes: e.target.value }))}
                                      className="w-full px-2 py-1 border border-brand-border rounded-lg text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                                  </td>
                                  <td className="py-2 px-2 text-right whitespace-nowrap">
                                    <button onClick={() => handleUpdateUnit(unit.id)}
                                      className="text-xs text-green-600 hover:text-green-700 font-semibold mr-2">Speichern</button>
                                    <button onClick={() => { setEditingUnit(null); setEditUnitData({}); }}
                                      className="text-xs text-brand-muted hover:text-brand-black">Abbrechen</button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-2 px-2 font-mono text-xs font-semibold text-brand-black">{unit.serial_number}</td>
                                  <td className="py-2 px-2 text-xs text-brand-muted">{unit.label || '–'}</td>
                                  <td className="py-2 px-2">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${UNIT_STATUS_CONFIG[unit.status]?.color ?? ''}`}>
                                      {UNIT_STATUS_CONFIG[unit.status]?.label ?? unit.status}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-xs text-brand-muted">
                                    {unit.purchased_at ? new Date(unit.purchased_at).toLocaleDateString('de-DE') : '–'}
                                  </td>
                                  <td className="py-2 px-2 text-xs text-brand-muted max-w-[150px] truncate">{unit.notes || '–'}</td>
                                  <td className="py-2 px-2 text-right whitespace-nowrap">
                                    <button onClick={() => { setEditingUnit(unit.id); setEditUnitData({}); }}
                                      className="text-xs text-accent-blue hover:text-blue-700 font-semibold mr-2">Bearbeiten</button>
                                    <button onClick={() => handleDeleteUnit(unit)}
                                      className="text-xs text-red-500 hover:text-red-700 font-semibold">Löschen</button>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Neue Unit hinzufügen */}
                  <div className="bg-brand-bg rounded-xl border border-brand-border/50 p-4">
                    <p className="text-xs font-heading font-semibold text-brand-black mb-3">+ Neue Kamera hinzufügen</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Seriennummer *</label>
                        <input type="text" value={newUnit.serial_number}
                          onChange={(e) => setNewUnit((u) => ({ ...u, serial_number: e.target.value }))}
                          placeholder="z.B. HERO13-ABC123"
                          className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Label (optional)</label>
                        <input type="text" value={newUnit.label}
                          onChange={(e) => setNewUnit((u) => ({ ...u, label: e.target.value }))}
                          placeholder="z.B. GoPro #1"
                          className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Kaufdatum</label>
                        <input type="date" value={newUnit.purchased_at}
                          onChange={(e) => setNewUnit((u) => ({ ...u, purchased_at: e.target.value }))}
                          className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-heading font-semibold text-brand-muted mb-1">Notizen</label>
                        <input type="text" value={newUnit.notes}
                          onChange={(e) => setNewUnit((u) => ({ ...u, notes: e.target.value }))}
                          placeholder="Zustand, Bemerkungen…"
                          className="w-full px-2 py-1.5 border border-brand-border rounded-lg text-xs font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                      </div>
                    </div>
                    <button onClick={handleAddUnit} disabled={addingUnit || !newUnit.serial_number.trim()}
                      className="px-4 py-2 text-xs font-heading font-semibold text-white bg-accent-blue rounded-btn hover:bg-blue-600 transition-colors disabled:opacity-40">
                      {addingUnit ? 'Wird hinzugefügt…' : '+ Hinzufügen'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Preistabelle Tag 1-30 */}
            <div className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-heading font-bold text-sm text-brand-black mb-1">Preistabelle: Tag 1–30</h2>
              <p className="text-xs font-body text-brand-muted mb-5">Jeden Tag einzeln festlegen (Gesamtpreis in €)</p>

              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {Array.from({ length: 30 }, (_, i) => {
                  const day = i + 1;
                  const price = product.priceTable[i] ?? 0;
                  return (
                    <div key={day}>
                      <label className="block text-xs font-heading font-semibold text-brand-muted mb-1 text-center">
                        {day}T
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={price}
                        onChange={(e) => setTableDay(day, parseFloat(e.target.value) || 0)}
                        className="w-full px-1.5 py-2 border border-brand-border rounded-[8px] text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-accent-blue"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 31+ Tage Formel */}
            <div className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-heading font-bold text-sm text-brand-black mb-1">31+ Tage</h2>
              <p className="text-xs font-body text-brand-muted mb-4">
                Preis = Tag-30-Preis + (Tage − 30) × Preis pro Zusatztag
              </p>
              <div className="flex items-end gap-4">
                <div className="w-40">
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Preis pro Zusatztag</label>
                  <div className="relative">
                    <input type="number" min="0" step="0.50" value={product.perDayAfter30}
                      onChange={(e) => setProduct((p) => p && ({ ...p, perDayAfter30: parseFloat(e.target.value) || 0 }))}
                      className="w-full pr-8 pl-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted pointer-events-none">€</span>
                  </div>
                </div>
                <div className="pb-2.5">
                  <p className="text-xs font-body text-brand-muted">Beispiel:</p>
                  <p className="text-sm font-heading font-semibold text-brand-black">
                    31 Tage = {day30Price} € + {product.perDayAfter30} € = {day31Preview} €
                  </p>
                </div>
              </div>
            </div>

            {/* Vorschau */}
            <div className="bg-brand-bg rounded-2xl border border-brand-border p-5">
              <p className="text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider mb-3">Vorschau ausgewählter Tage</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {[1, 2, 3, 7, 14, 30, 31, 45].map((d) => (
                  <span key={d} className="text-sm font-body">
                    <span className="text-brand-muted">{d}T: </span>
                    <span className="font-semibold text-brand-black">{calcPriceFromTable(product, d)} €</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Speichern */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-8 py-3 text-sm font-heading font-semibold rounded-btn transition-colors disabled:opacity-40 ${saved ? 'bg-green-600 text-white' : 'bg-brand-black text-white hover:bg-brand-dark'}`}
              >
                {saving ? 'Speichern…' : saved ? '✓ Gespeichert' : 'Änderungen speichern'}
              </button>
            </div>

          </div>

          {/* Right: Live Preview (sticky) */}
          <div className="hidden xl:block w-80 flex-shrink-0">
            <div className="sticky top-8">
              <ProductPreview
                name={product.name}
                brand={product.brand}
                shortDescription={product.shortDescription}
                description={product.description}
                specs={product.specs}
                product={product}
                hasHaftungsoption={product.hasHaftungsoption}
                kautionTier={product.kautionTier}
                kautionAmount={kautionAmount}
                images={product.images}
                available={product.available}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

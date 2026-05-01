'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBackLink from '@/components/admin/AdminBackLink';
import {
  DEFAULT_KAUTION_TIERS,
  type AdminProduct,
  type AdminProductSpec,
  type KautionTiers,
} from '@/lib/price-config';
import ProductPreview from '@/components/ProductPreview';
import MarkdownEditor from '@/components/MarkdownEditor';
import PriceInput from '@/components/admin/PriceInput';
import BrandSelect from '@/components/admin/BrandSelect';
import { useSpecDefinitions } from '@/components/admin/SpecDefinitions';

function toSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function createEmpty(): AdminProduct {
  return {
    id: '', name: '', brand: 'GoPro', slug: '', shortDescription: '',
    priceTable: Array(30).fill(0),
    perDayAfter30: 3, kautionTier: null, hasHaftungsoption: true,
    available: true, stock: 0,
    model: '', category: 'action-cam', tags: [], deposit: 0,
  };
}

function generateId(existing: Record<string, AdminProduct>): string {
  const numericIds = Object.keys(existing).map(Number).filter((n) => !isNaN(n));
  const max = numericIds.length > 0 ? Math.max(...numericIds) : 0;
  return String(max + 1);
}

export default function AdminNeueKameraPage() {
  const router = useRouter();
  const [product, setProduct] = useState<AdminProduct>(createEmpty());
  const [kautionTiers, setKautionTiers] = useState<KautionTiers>(DEFAULT_KAUTION_TIERS);
  const [allProducts, setAllProducts] = useState<Record<string, AdminProduct>>({});
  const [saving, setSaving] = useState(false);
  const [autoSlug, setAutoSlug] = useState(true);

  const { specs: specDefs } = useSpecDefinitions();

  useEffect(() => {
    fetch('/api/prices').then((r) => r.json()).then((d) => {
      if (d.kautionTiers) setKautionTiers(d.kautionTiers);
    }).catch(() => {});

    fetch('/api/admin/config?key=products')
      .then((r) => r.json())
      .then((data: Record<string, AdminProduct> | null) => {
        const source = data && Object.keys(data).length > 0 ? data : {};
        setAllProducts(source);
      })
      .catch(() => setAllProducts({}));
  }, []);

  function setTableDay(day: number, value: number) {
    setProduct((p) => {
      const t = [...p.priceTable];
      t[day - 1] = value;
      return { ...p, priceTable: t };
    });
  }

  // ── Specs helpers ──────────────────────────────────────────────────────────
  function addSpec() {
    setProduct((p) => {
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
      if (!p.specs) return p;
      const specs = [...p.specs];
      specs[index] = { ...specs[index], ...patch };
      return { ...p, specs };
    });
  }

  function removeSpec(index: number) {
    setProduct((p) => {
      if (!p.specs) return p;
      const specs = p.specs.filter((_, i) => i !== index).map((s, i) => ({ ...s, priority: i }));
      return { ...p, specs };
    });
  }

  function moveSpec(index: number, direction: 'up' | 'down') {
    setProduct((p) => {
      if (!p.specs) return p;
      const specs = [...p.specs];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= specs.length) return p;
      [specs[index], specs[target]] = [specs[target], specs[index]];
      const reindexed = specs.map((s, i) => ({ ...s, priority: i }));
      return { ...p, specs: reindexed };
    });
  }

  async function handleSave() {
    if (!product.name.trim()) {
      alert('Bitte einen Namen eingeben.');
      return;
    }
    setSaving(true);
    try {
      const newId = generateId(allProducts);
      const newProduct: AdminProduct = { ...product, id: newId };
      const updated = { ...allProducts, [newId]: newProduct };
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'products', value: updated }),
      });
      if (!res.ok) throw new Error();
      router.push(`/admin/preise/kameras/${newId}`);
    } catch {
      alert('Fehler beim Speichern.');
      setSaving(false);
    }
  }

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
            <h1 className="font-heading font-bold text-xl text-brand-black">Neue Kamera</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-heading font-semibold rounded-btn transition-colors disabled:opacity-40 bg-brand-black text-white hover:bg-brand-dark"
          >
            {saving ? 'Wird erstellt…' : 'Kamera erstellen'}
          </button>
        </div>

        {/* Two-column layout: Editor + Preview */}
        <div className="flex flex-col xl:flex-row gap-6">

          {/* Left: Editor form */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Stammdaten (aufklappbar) */}
            <details open className="bg-white rounded-2xl border border-brand-border group/main">
              <summary className="cursor-pointer select-none px-6 pt-6 pb-4 list-none flex items-center justify-between">
                <h2 className="font-heading font-bold text-sm text-brand-black">Stammdaten</h2>
                <span className="text-brand-muted text-lg leading-none transition-transform group-open/main:rotate-180">▾</span>
              </summary>
              <div className="px-6 pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Name</label>
                  <input type="text" value={product.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setProduct((p) => ({ ...p, name, ...(autoSlug ? { slug: toSlug(name) } : {}) }));
                    }}
                    placeholder="z.B. GoPro Hero 13 Black"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Marke</label>
                  <BrandSelect value={product.brand} onChange={(brand) => setProduct((p) => ({ ...p, brand }))} />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kurzbeschreibung</label>
                  <input type="text" value={product.shortDescription}
                    onChange={(e) => setProduct((p) => ({ ...p, shortDescription: e.target.value }))}
                    placeholder="z.B. 5.3K60, 27MP, wasserdicht bis 10m"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">URL-Slug</label>
                  <input type="text" value={product.slug}
                    onChange={(e) => { setAutoSlug(false); setProduct((p) => ({ ...p, slug: e.target.value })); }}
                    placeholder="Wird automatisch aus dem Namen generiert"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Modell</label>
                  <input type="text" value={product.model ?? ''}
                    onChange={(e) => setProduct((p) => ({ ...p, model: e.target.value }))}
                    placeholder="z.B. Hero 13"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Kategorie</label>
                  <select value={product.category ?? 'action-cam'}
                    onChange={(e) => setProduct((p) => ({ ...p, category: e.target.value }))}
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
                  <PriceInput value={product.deposit ?? 0}
                    onChange={(v) => setProduct((p) => ({ ...p, deposit: v }))}
                    placeholder="z.B. 150"
                    className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Ausführliche Beschreibung (Markdown)</label>
                  <MarkdownEditor
                    value={product.description ?? ''}
                    onChange={(v) => setProduct((p) => ({ ...p, description: v }))}
                    placeholder="Detaillierte Produktbeschreibung für die Produktseite… (Markdown unterstützt)"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={product.available}
                      onChange={(e) => setProduct((p) => ({ ...p, available: e.target.checked }))}
                      className="w-4 h-4 rounded border-brand-border" />
                    <span className="text-sm font-body text-brand-black">Verfügbar</span>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Bestand (automatisch)</label>
                  <div className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body bg-gray-50 text-brand-muted">
                    0 Kameras — Seriennummern nach dem Speichern hinzufügen
                  </div>
                </div>
              </div>

              {/* Technische Daten (aufklappbar) */}
              <details className="mt-6 group/td">
                <summary className="flex items-center justify-between cursor-pointer select-none py-2 border-t border-brand-border pt-4 list-none">
                  <div>
                    <h3 className="font-heading font-bold text-sm text-brand-black">Technische Daten</h3>
                    <p className="text-xs font-body text-brand-muted mt-0.5">{(product.specs ?? []).length} Spec{(product.specs ?? []).length === 1 ? '' : 's'} · klicken zum Aufklappen</p>
                  </div>
                  <span className="text-brand-muted text-lg leading-none transition-transform group-open/td:rotate-45">+</span>
                </summary>

                <div className="mt-4 space-y-2">
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
              </details>
              </div>
            </details>

            {/* Preise (Tag 1-30 + 31+ Tage) */}
            <div className="bg-white rounded-2xl border border-brand-border p-6">
              <h2 className="font-heading font-bold text-sm text-brand-black mb-1">Preise</h2>
              <p className="text-xs font-body text-brand-muted mb-5">Tag 1–30 einzeln festlegen, ab Tag 31 wird der Zusatztag-Preis verwendet (Gesamtpreis in €).</p>

              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {Array.from({ length: 30 }, (_, i) => {
                  const day = i + 1;
                  const price = product.priceTable[i] ?? 0;
                  return (
                    <div key={day}>
                      <label className="block text-xs font-heading font-semibold text-brand-muted mb-1 text-center">
                        {day}T
                      </label>
                      <PriceInput
                        value={price}
                        onChange={(v) => setTableDay(day, v)}
                        min={0}
                        className="w-full px-1.5 py-2 border border-brand-border rounded-[8px] text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-accent-blue"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 pt-5 border-t border-brand-border">
                <h3 className="font-heading font-semibold text-sm text-brand-black mb-1">31+ Tage</h3>
                <p className="text-xs font-body text-brand-muted mb-3">
                  Preis = Tag-30-Preis + (Tage − 30) × Preis pro Zusatztag
                </p>
                <div className="flex items-end gap-4">
                  <div className="w-40">
                    <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Preis pro Zusatztag</label>
                    <div className="relative">
                      <PriceInput value={product.perDayAfter30}
                        onChange={(v) => setProduct((p) => ({ ...p, perDayAfter30: v }))}
                        placeholder="z.B. 4,50"
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
            </div>

            {/* Erstellen */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-8 py-3 text-sm font-heading font-semibold rounded-btn transition-colors disabled:opacity-40 bg-brand-black text-white hover:bg-brand-dark"
              >
                {saving ? 'Wird erstellt…' : 'Kamera erstellen & speichern'}
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
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

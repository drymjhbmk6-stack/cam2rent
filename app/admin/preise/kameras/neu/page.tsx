'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DEFAULT_ADMIN_PRODUCTS,
  DEFAULT_KAUTION_TIERS,
  type AdminProduct,
  type KautionTiers,
  calcPriceFromTable,
} from '@/lib/price-config';

const BRANDS = ['GoPro', 'DJI', 'Insta360', 'Sonstige'];

function createEmpty(): AdminProduct {
  return {
    id: '', name: '', brand: 'GoPro', slug: '', shortDescription: '',
    priceTable: Array(30).fill(0),
    perDayAfter30: 3, kautionTier: null, hasHaftungsoption: true,
    available: true, stock: 1,
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

  useEffect(() => {
    fetch('/api/prices').then((r) => r.json()).then((d) => {
      if (d.kautionTiers) setKautionTiers(d.kautionTiers);
    }).catch(() => {});

    fetch('/api/admin/config?key=products')
      .then((r) => r.json())
      .then((data: Record<string, AdminProduct> | null) => {
        const source = data && Object.keys(data).length > 0 ? data : DEFAULT_ADMIN_PRODUCTS;
        setAllProducts(source);
      })
      .catch(() => setAllProducts(DEFAULT_ADMIN_PRODUCTS));
  }, []);

  function setTableDay(day: number, value: number) {
    setProduct((p) => {
      const t = [...p.priceTable];
      t[day - 1] = value;
      return { ...p, priceTable: t };
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

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Link href="/admin/preise/kameras" className="text-sm font-body text-brand-muted hover:text-brand-black transition-colors">← Kameras</Link>
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

        <div className="space-y-6">

          {/* Stammdaten */}
          <div className="bg-white rounded-2xl border border-brand-border p-6">
            <h2 className="font-heading font-bold text-sm text-brand-black mb-4">Stammdaten</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Name</label>
                <input type="text" value={product.name}
                  onChange={(e) => setProduct((p) => ({ ...p, name: e.target.value }))}
                  placeholder="z.B. GoPro Hero 13 Black"
                  className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              </div>
              <div>
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Marke</label>
                <select value={product.brand}
                  onChange={(e) => setProduct((p) => ({ ...p, brand: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue">
                  {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
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
                  onChange={(e) => setProduct((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="z.B. gopro-hero-13-black"
                  className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
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
                <label className="block text-xs font-heading font-semibold text-brand-muted mb-1.5">Lagerbestand</label>
                <input type="number" min="0" value={product.stock}
                  onChange={(e) => setProduct((p) => ({ ...p, stock: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2.5 border border-brand-border rounded-[10px] text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              </div>
            </div>
          </div>

          {/* Haftung / Kaution */}
          <div className="bg-white rounded-2xl border border-brand-border p-6">
            <h2 className="font-heading font-bold text-sm text-brand-black mb-1">Haftung & Kaution</h2>
            <p className="text-xs font-body text-brand-muted mb-4">Entweder Haftungsoption (Standard/Premium) oder eine Kaution-Stufe — nicht beides.</p>

            <div className="space-y-3">
              <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${product.hasHaftungsoption ? 'border-accent-blue bg-accent-blue-soft/20' : 'border-brand-border hover:border-brand-muted'}`}>
                <input type="radio" name="liability" checked={product.hasHaftungsoption}
                  onChange={() => setProduct((p) => ({ ...p, hasHaftungsoption: true, kautionTier: null }))}
                  className="sr-only" />
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${product.hasHaftungsoption ? 'border-accent-blue' : 'border-brand-border'}`}>
                  {product.hasHaftungsoption && <div className="w-2 h-2 rounded-full bg-accent-blue" />}
                </div>
                <div>
                  <p className="text-sm font-heading font-semibold text-brand-black">Haftungsoption (Standard / Premium)</p>
                  <p className="text-xs font-body text-brand-muted">Kunden können Standard- oder Premium-Haftungsschutz wählen</p>
                </div>
              </label>

              {([1, 2, 3] as const).map((tier) => (
                <label key={tier} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${!product.hasHaftungsoption && product.kautionTier === tier ? 'border-accent-blue bg-accent-blue-soft/20' : 'border-brand-border hover:border-brand-muted'}`}>
                  <input type="radio" name="liability"
                    checked={!product.hasHaftungsoption && product.kautionTier === tier}
                    onChange={() => setProduct((p) => ({ ...p, hasHaftungsoption: false, kautionTier: tier }))}
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

          {/* Preistabelle Tag 1–30 */}
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
                    onChange={(e) => setProduct((p) => ({ ...p, perDayAfter30: parseFloat(e.target.value) || 0 }))}
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
      </div>
    </div>
  );
}

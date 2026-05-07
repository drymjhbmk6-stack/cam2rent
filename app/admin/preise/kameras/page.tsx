'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AdminBackLink from '@/components/admin/AdminBackLink';
import BrandBadge from '@/components/BrandBadge';
import BrandColorManager from '@/components/admin/BrandColorManager';
import { type AdminProduct } from '@/lib/price-config';

interface UtilizationData {
  id: string;
  utilization: number;
  bookedDays: number;
  totalDays: number;
  revenue: number;
  bookingCount: number;
}

export default function AdminKameraListePage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [allProducts, setAllProducts] = useState<Record<string, AdminProduct>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [utilization, setUtilization] = useState<Record<string, UtilizationData>>({});

  useEffect(() => {
    fetch('/api/admin/config?key=products')
      .then((r) => r.json())
      .then((data: Record<string, AdminProduct> | null) => {
        const source = data && Object.keys(data).length > 0 ? data : {};
        setAllProducts(source);
        setProducts(Object.values(source).sort((a, b) => parseInt(a.id) - parseInt(b.id)));
      })
      .catch(() => {
        setAllProducts({});
        setProducts([]);
      })
      .finally(() => setLoading(false));

    // Auslastungsdaten laden
    fetch('/api/admin/utilization?days=30')
      .then((r) => r.json())
      .then((data: { products: UtilizationData[] }) => {
        const map: Record<string, UtilizationData> = {};
        for (const p of data.products ?? []) {
          map[p.id] = p;
        }
        setUtilization(map);
      })
      .catch(() => { /* Auslastung optional */ });
  }, []);

  async function handleDelete(product: AdminProduct) {
    if (!confirm(`Kamera "${product.name}" wirklich löschen?`)) return;
    setDeletingId(product.id);
    try {
      const updated = { ...allProducts };
      delete updated[product.id];
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'products', value: updated }),
      });
      if (!res.ok) throw new Error();
      setAllProducts(updated);
      setProducts(Object.values(updated).sort((a, b) => parseInt(a.id) - parseInt(b.id)));
    } catch {
      alert('Fehler beim Löschen.');
    } finally {
      setDeletingId(null);
    }
  }

  // brandColor entfernt — BrandBadge-Komponente nutzt dynamische Farben

  // Gruppierung nach Marke
  const groupedProducts = (() => {
    const groups = new Map<string, AdminProduct[]>();
    for (const p of products) {
      const brand = p.brand || 'Sonstige';
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand)!.push(p);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'de'));
  })();

  return (
    <div className="min-h-screen bg-brand-bg">
      <AdminBackLink href="/admin/preise" label="Zurück zu Preise" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading font-bold text-xl text-brand-black">Kameras</h1>
          </div>
          <Link
            href="/admin/preise/kameras/neu"
            className="px-4 py-2 bg-brand-black text-white text-sm font-heading font-semibold rounded-btn hover:bg-brand-dark transition-colors"
          >
            + Neue Kamera
          </Link>
        </div>

        {/* Markenfarben */}
        <div className="mb-6">
          <BrandColorManager />
        </div>

        {loading ? (
          <div className="text-center py-16 text-brand-muted font-body">Lädt…</div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-brand-muted font-body">
            Noch keine Kamera angelegt. Klicke auf &bdquo;+ Neue Kamera&ldquo;.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-brand-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-bg border-b border-brand-border text-left">
                    <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted w-[88px]">Bild</th>
                    <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted">Name</th>
                    <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted hidden lg:table-cell">Auslastung (30 T)</th>
                    <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted text-right whitespace-nowrap hidden md:table-cell">Tag 1 / Tag 30</th>
                    <th className="px-4 py-3 font-heading font-semibold text-[11px] uppercase tracking-wider text-brand-muted text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedProducts.map(([brand, brandProducts]) => (
                    <React.Fragment key={brand}>
                      <tr className="bg-brand-bg/50 border-b border-brand-border">
                        <td colSpan={5} className="px-4 py-2 text-[11px] font-heading font-bold uppercase tracking-wider text-brand-steel">
                          {brand} <span className="text-brand-muted font-body normal-case tracking-normal ml-1">({brandProducts.length} {brandProducts.length === 1 ? 'Kamera' : 'Kameras'})</span>
                        </td>
                      </tr>
                      {brandProducts.map((p) => {
                        const imgSrc = p.imageUrl ?? p.images?.[0] ?? null;
                        return (
                        <tr
                          key={p.id}
                          className="border-b border-brand-border last:border-b-0 transition-colors hover:bg-brand-bg/50"
                        >
                          {/* Bild */}
                          <td className="px-4 py-3 align-top">
                            <Link href={`/admin/preise/kameras/${p.id}`} className="block">
                              {imgSrc ? (
                                <Image
                                  src={imgSrc}
                                  alt={p.name}
                                  width={64}
                                  height={64}
                                  className="w-16 h-16 object-cover rounded-lg border border-brand-border bg-white"
                                  unoptimized={imgSrc.startsWith('data:')}
                                />
                              ) : (
                                <div className="w-16 h-16 rounded-lg border-2 border-dashed border-brand-border flex items-center justify-center text-brand-muted text-[10px]">
                                  Kein Bild
                                </div>
                              )}
                            </Link>
                          </td>
                          {/* Name + Brand */}
                          <td className="px-4 py-3 align-top">
                            <Link href={`/admin/preise/kameras/${p.id}`} className="flex items-center gap-2 flex-wrap group">
                              <BrandBadge brand={p.brand} />
                              <span className="font-heading font-semibold text-sm text-brand-black group-hover:text-accent-blue transition-colors">{p.name}</span>
                              {!p.available && (
                                <span className="text-[10px] font-body text-brand-muted bg-brand-bg px-2 py-0.5 rounded-full">
                                  nicht verfügbar
                                </span>
                              )}
                            </Link>
                            {/* Mobile: Auslastung + Preis unter Name */}
                            <div className="md:hidden mt-2 flex items-center gap-3 text-[11px]">
                              {utilization[p.id] != null && (
                                <span className={`font-heading font-bold ${
                                  utilization[p.id].utilization >= 70
                                    ? 'text-green-600'
                                    : utilization[p.id].utilization >= 40
                                    ? 'text-yellow-600'
                                    : 'text-red-500'
                                }`}>
                                  {utilization[p.id].utilization}% Auslastung
                                </span>
                              )}
                              <span className="font-body text-brand-muted">
                                {p.priceTable[0] ?? '–'} € / {p.priceTable[29] ?? '–'} €
                              </span>
                            </div>
                          </td>
                          {/* Auslastung */}
                          <td className="px-4 py-3 align-middle hidden lg:table-cell">
                            {utilization[p.id] != null ? (
                              <div className="flex flex-col w-32">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className={`text-xs font-heading font-bold ${
                                    utilization[p.id].utilization >= 70
                                      ? 'text-green-600'
                                      : utilization[p.id].utilization >= 40
                                      ? 'text-yellow-600'
                                      : 'text-red-500'
                                  }`}>
                                    {utilization[p.id].utilization}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      utilization[p.id].utilization >= 70
                                        ? 'bg-green-500'
                                        : utilization[p.id].utilization >= 40
                                        ? 'bg-yellow-500'
                                        : 'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.min(100, utilization[p.id].utilization)}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] font-body text-brand-muted italic">–</span>
                            )}
                          </td>
                          {/* Preis Tag 1 / Tag 30 */}
                          <td className="px-4 py-3 align-top text-right whitespace-nowrap tabular-nums hidden md:table-cell">
                            <div className="text-sm font-heading font-semibold text-brand-black">
                              {p.priceTable[0] ?? '–'} € / {p.priceTable[29] ?? '–'} €
                            </div>
                            <div className="text-[10px] font-body text-brand-muted">Tag 1 / Tag 30</div>
                          </td>
                          {/* Aktionen */}
                          <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <Link
                                href={`/admin/preise/kameras/${p.id}`}
                                className="px-3 py-1.5 text-xs font-heading font-semibold text-brand-black border border-brand-border rounded-lg hover:bg-white transition-colors"
                              >
                                Bearbeiten
                              </Link>
                              <button
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(p); }}
                                disabled={deletingId === p.id}
                                className="px-2.5 py-1.5 text-xs font-heading font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                                title="Löschen"
                              >
                                {deletingId === p.id ? '…' : '✕'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

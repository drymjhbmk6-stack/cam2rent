'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

  const brandColor = (brand: string) => {
    if (brand === 'GoPro') return 'bg-accent-blue-soft text-accent-blue';
    if (brand === 'DJI') return 'bg-accent-teal-soft text-accent-teal';
    if (brand === 'Insta360') return 'bg-accent-amber-soft text-accent-amber';
    return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
  };

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-3xl mx-auto px-6 py-8">
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

        {loading ? (
          <div className="text-center py-16 text-brand-muted font-body">Lädt…</div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-brand-muted font-body">
            Noch keine Kamera angelegt. Klicke auf „+ Neue Kamera".
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-white rounded-xl border border-brand-border px-5 py-4 group hover:border-brand-black transition-colors"
              >
                {/* Klickbarer Bereich → Edit-Seite */}
                <Link href={`/admin/preise/kameras/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-heading font-semibold shrink-0 ${brandColor(p.brand)}`}>
                    {p.brand}
                  </span>
                  <span className="font-heading font-semibold text-sm text-brand-black truncate">{p.name}</span>
                  {!p.available && (
                    <span className="text-xs font-body text-brand-muted bg-brand-bg px-2 py-0.5 rounded-full shrink-0">
                      nicht verfügbar
                    </span>
                  )}
                </Link>

                <div className="flex items-center gap-4 shrink-0">
                  {/* Auslastung */}
                  {utilization[p.id] != null && (
                    <div className="hidden sm:flex flex-col items-end w-24">
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
                        <span className="text-[10px] font-body text-brand-muted">Auslastung</span>
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
                  )}

                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-body text-brand-muted">Tag 1 / Tag 30</p>
                    <p className="text-sm font-heading font-semibold text-brand-black">
                      {p.priceTable[0] ?? '–'} € / {p.priceTable[29] ?? '–'} €
                    </p>
                  </div>

                  {/* Löschen */}
                  <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(p); }}
                    disabled={deletingId === p.id}
                    className="px-3 py-1.5 text-xs font-heading font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    {deletingId === p.id ? '…' : 'Löschen'}
                  </button>

                  <Link href={`/admin/preise/kameras/${p.id}`} className="text-brand-muted group-hover:text-brand-black transition-colors">→</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useProducts } from '@/components/ProductsProvider';

interface DayInfo {
  date: string;
  status: 'available' | 'partial' | 'booked' | 'blocked' | 'past';
  available: number;
  total: number;
}

interface ProductAvailability {
  id: string;
  name: string;
  stock: number;
  todayAvailable: number;
  status: 'available' | 'partial' | 'booked' | 'blocked';
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  available: { label: 'Verfügbar', cls: 'bg-emerald-900/30 text-emerald-400' },
  partial: { label: 'Teilweise', cls: 'bg-amber-900/30 text-amber-400' },
  booked: { label: 'Ausgebucht', cls: 'bg-red-900/30 text-red-400' },
  blocked: { label: 'Gesperrt', cls: 'bg-gray-700/30 text-gray-400' },
};

export default function AdminVerfuegbarkeitPage() {
  const { products } = useProducts();
  const [items, setItems] = useState<ProductAvailability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAll() {
      const today = new Date();
      const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const todayStr = `${month}-${String(today.getDate()).padStart(2, '0')}`;

      const results: ProductAvailability[] = [];

      for (const product of products) {
        try {
          const res = await fetch(`/api/availability/${product.id}?month=${month}`);
          if (!res.ok) {
            results.push({
              id: product.id,
              name: product.name,
              stock: product.stock,
              todayAvailable: product.stock,
              status: 'available',
            });
            continue;
          }

          const data: { days: DayInfo[] } = await res.json();
          const todayInfo = data.days.find((d) => d.date === todayStr);

          const avail = todayInfo?.available ?? product.stock;
          let status: ProductAvailability['status'] = 'available';
          if (todayInfo) {
            if (todayInfo.status === 'blocked') status = 'blocked';
            else if (todayInfo.status === 'booked') status = 'booked';
            else if (todayInfo.status === 'partial') status = 'partial';
          }

          results.push({
            id: product.id,
            name: product.name,
            stock: product.stock,
            todayAvailable: avail,
            status,
          });
        } catch {
          results.push({
            id: product.id,
            name: product.name,
            stock: product.stock,
            todayAvailable: product.stock,
            status: 'available',
          });
        }
      }

      setItems(results);
      setLoading(false);
    }

    loadAll();
  }, []);

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: 'white' }}>
        Verfügbarkeit
      </h1>
      <p className="text-sm font-body mb-6" style={{ color: '#64748b' }}>
        Übersicht der aktuellen Produktverfügbarkeit
      </p>

      {loading ? (
        <div className="flex items-center gap-3 py-12 justify-center" style={{ color: '#64748b' }}>
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Lade Verfügbarkeit...
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e293b' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wider" style={{ color: '#64748b' }}>
                  Produkt
                </th>
                <th className="text-center px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wider" style={{ color: '#64748b' }}>
                  Bestand
                </th>
                <th className="text-center px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wider" style={{ color: '#64748b' }}>
                  Heute verfügbar
                </th>
                <th className="text-center px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wider" style={{ color: '#64748b' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const cfg = STATUS_CONFIG[item.status];
                return (
                  <tr
                    key={item.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid #1e293b' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#0f172a'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td className="px-4 py-3">
                      <span className="font-heading font-semibold" style={{ color: '#e2e8f0' }}>
                        {item.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span style={{ color: '#94a3b8' }}>{item.stock}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-heading font-bold" style={{ color: item.todayAvailable > 0 ? '#34d399' : '#f87171' }}>
                        {item.todayAvailable}
                      </span>
                      <span style={{ color: '#475569' }}> / {item.stock}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-heading font-semibold ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

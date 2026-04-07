'use client';

import { useEffect, useState } from 'react';
import { useProducts } from '@/components/ProductsProvider';

interface ItemAvailability {
  id: string;
  name: string;
  stock: number;
  todayAvailable: number;
  status: 'available' | 'partial' | 'booked' | 'blocked';
}

interface Accessory {
  id: string;
  name: string;
  available_qty: number;
  available: boolean;
}

interface RentalSet {
  id: string;
  name: string;
  available: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  available: { label: 'Verfügbar', cls: 'bg-emerald-900/30 text-emerald-400' },
  partial: { label: 'Teilweise', cls: 'bg-amber-900/30 text-amber-400' },
  booked: { label: 'Ausgebucht', cls: 'bg-red-900/30 text-red-400' },
  blocked: { label: 'Gesperrt', cls: 'bg-gray-700/30 text-gray-400' },
};

type Tab = 'kameras' | 'sets' | 'zubehoer';

export default function AdminVerfuegbarkeitPage() {
  const { products, loading: productsLoading } = useProducts();
  const [tab, setTab] = useState<Tab>('kameras');
  const [cameras, setCameras] = useState<ItemAvailability[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [sets, setSets] = useState<RentalSet[]>([]);
  const [loading, setLoading] = useState(true);

  // Kameras laden wenn products sich ändern
  useEffect(() => {
    if (productsLoading || products.length === 0) return;

    async function loadCameras() {
      setLoading(true);
      const today = new Date();
      const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const todayStr = `${month}-${String(today.getDate()).padStart(2, '0')}`;

      const results: ItemAvailability[] = [];
      for (const product of products) {
        try {
          const res = await fetch(`/api/availability/${product.id}?month=${month}`);
          if (!res.ok) throw new Error();
          const data: { days: { date: string; status: string; available: number; total: number }[] } = await res.json();
          const todayInfo = data.days.find((d) => d.date === todayStr);
          const avail = todayInfo?.available ?? product.stock;
          let status: ItemAvailability['status'] = 'available';
          if (todayInfo) {
            if (todayInfo.status === 'blocked') status = 'blocked';
            else if (todayInfo.status === 'booked') status = 'booked';
            else if (todayInfo.status === 'partial') status = 'partial';
          }
          results.push({ id: product.id, name: product.name, stock: product.stock, todayAvailable: avail, status });
        } catch {
          results.push({ id: product.id, name: product.name, stock: product.stock, todayAvailable: product.stock, status: 'available' });
        }
      }
      setCameras(results);
      setLoading(false);
    }

    loadCameras();
  }, [products, productsLoading]);

  // Zubehör laden
  useEffect(() => {
    fetch('/api/admin/accessories')
      .then((r) => r.json())
      .then(({ accessories: data }) => setAccessories(data ?? []))
      .catch(() => {});
  }, []);

  // Sets laden
  useEffect(() => {
    fetch('/api/sets')
      .then((r) => r.json())
      .then((data) => setSets(data?.sets ?? data ?? []))
      .catch(() => setSets([]));
  }, []);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'kameras', label: 'Kameras', count: cameras.length },
    { key: 'sets', label: 'Sets', count: sets.length },
    { key: 'zubehoer', label: 'Zubehör', count: accessories.length },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: 'white' }}>
        Verfügbarkeit
      </h1>
      <p className="text-sm font-body mb-6" style={{ color: '#64748b' }}>
        Übersicht der aktuellen Verfügbarkeit
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-heading font-semibold transition-all ${
              tab === t.key
                ? 'text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            style={tab === t.key ? { background: '#1e293b' } : {}}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Kameras Tab */}
      {tab === 'kameras' && (
        loading ? (
          <div className="flex items-center gap-3 py-12 justify-center" style={{ color: '#64748b' }}>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Lade Verfügbarkeit...
          </div>
        ) : (
          <Table
            headers={['Kamera', 'Bestand', 'Heute verfügbar', 'Status']}
            rows={cameras.map((item) => ({
              key: item.id,
              cells: [
                <span key="n" className="font-heading font-semibold" style={{ color: '#e2e8f0' }}>{item.name}</span>,
                <span key="s" style={{ color: '#94a3b8' }}>{item.stock}</span>,
                <span key="a">
                  <span className="font-heading font-bold" style={{ color: item.todayAvailable > 0 ? '#34d399' : '#f87171' }}>{item.todayAvailable}</span>
                  <span style={{ color: '#475569' }}> / {item.stock}</span>
                </span>,
                <StatusBadge key="b" status={item.status} />,
              ],
            }))}
          />
        )
      )}

      {/* Sets Tab */}
      {tab === 'sets' && (
        sets.length === 0 ? (
          <p className="text-center py-12 text-sm" style={{ color: '#64748b' }}>Keine Sets vorhanden.</p>
        ) : (
          <Table
            headers={['Set', 'Status']}
            rows={sets.map((s) => ({
              key: s.id,
              cells: [
                <span key="n" className="font-heading font-semibold" style={{ color: '#e2e8f0' }}>{s.name}</span>,
                <StatusBadge key="b" status={s.available ? 'available' : 'blocked'} />,
              ],
            }))}
          />
        )
      )}

      {/* Zubehör Tab */}
      {tab === 'zubehoer' && (
        accessories.length === 0 ? (
          <p className="text-center py-12 text-sm" style={{ color: '#64748b' }}>Kein Zubehör vorhanden.</p>
        ) : (
          <Table
            headers={['Zubehör', 'Bestand', 'Status']}
            rows={accessories.map((acc) => ({
              key: acc.id,
              cells: [
                <span key="n" className="font-heading font-semibold" style={{ color: '#e2e8f0' }}>{acc.name}</span>,
                <span key="q" style={{ color: '#94a3b8' }}>{acc.available_qty}</span>,
                <StatusBadge key="b" status={acc.available ? (acc.available_qty > 0 ? 'available' : 'booked') : 'blocked'} />,
              ],
            }))}
          />
        )
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.available;
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-heading font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: { key: string; cells: React.ReactNode[] }[] }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e293b' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
            {headers.map((h, i) => (
              <th key={h} className={`${i === 0 ? 'text-left' : 'text-center'} px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wider`} style={{ color: '#64748b' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="transition-colors"
              style={{ borderBottom: '1px solid #1e293b' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#0f172a'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {row.cells.map((cell, i) => (
                <td key={i} className={`px-4 py-3 ${i === 0 ? '' : 'text-center'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

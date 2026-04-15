'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency, fmtDateShort } from '@/lib/format-utils';
import { getTaxModeLabel } from '@/lib/accounting/tax';
import KpiCard from './shared/KpiCard';
import StatusBadge from './shared/StatusBadge';
import DateRangePicker, { type DateRange } from './shared/DateRangePicker';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';

interface DashboardData {
  kpis: {
    revenue: { current: number; previous: number; trend: number };
    openAmount: number;
    paidCount: number;
    cancelledCount: number;
    cancelledAmount: number;
  };
  revenueChart: Array<{ month: string; revenue: number; net: number }>;
  topProducts: Array<{ name: string; revenue: number; count: number }>;
  recentInvoices: Array<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    customer_name: string;
    gross_amount: number;
    status: string;
  }>;
  openDunning: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    days_overdue: number;
    level: number;
    gross_amount: number;
  }>;
  taxMode: string;
}

interface DashboardTabProps {
  onNavigate: (tab: string, filter?: string) => void;
}

export default function DashboardTab({ onNavigate }: DashboardTabProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });

  const fetchData = useCallback(async (r: DateRange) => {
    if (!r.from || !r.to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/buchhaltung/dashboard?from=${r.from}&to=${r.to}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(err.error || `Fehler ${res.status}`);
      }
    } catch (e) {
      setError(`Netzwerkfehler: ${e instanceof Error ? e.message : 'Unbekannt'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRangeChange = useCallback((r: DateRange) => {
    setRange(r);
    fetchData(r);
  }, [fetchData]);

  useEffect(() => {
    if (range.from && range.to) fetchData(range);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div style={{ background: '#111827', border: '1px solid #ef4444', borderRadius: 12, padding: 24 }}>
        <h3 style={{ color: '#ef4444', fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>Dashboard-Fehler</h3>
        <p style={{ color: '#94a3b8', fontSize: 14, margin: 0, marginBottom: 16 }}>{error}</p>
        <button onClick={() => { if (range.from) fetchData(range); }} style={{ padding: '8px 16px', borderRadius: 8, background: '#06b6d4', color: '#0f172a', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  const kpis = data?.kpis;

  return (
    <div>
      {/* Header mit Zeitraum + Steuermodus */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <DateRangePicker onChange={handleRangeChange} />
        {data?.taxMode && (
          <div style={{ fontSize: 13, color: '#94a3b8', background: '#0f172a', padding: '6px 14px', borderRadius: 8, border: '1px solid #1e293b' }}>
            Steuermodus: <span style={{ color: '#06b6d4', fontWeight: 600 }}>{getTaxModeLabel(data.taxMode as 'kleinunternehmer' | 'regelbesteuerung')}</span>
          </div>
        )}
      </div>

      {/* KPI-Karten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <KpiCard
          label="Umsatz"
          value={formatCurrency(kpis?.revenue.current ?? 0)}
          trend={kpis?.revenue.trend}
          onClick={() => onNavigate('rechnungen')}
        />
        <KpiCard
          label="Offene Posten"
          value={formatCurrency(kpis?.openAmount ?? 0)}
          accentColor="#f59e0b"
          onClick={() => onNavigate('offene-posten')}
        />
        <KpiCard
          label="Bezahlte Rechnungen"
          value={String(kpis?.paidCount ?? 0)}
          onClick={() => onNavigate('rechnungen')}
        />
        <KpiCard
          label="Stornierungen"
          value={String(kpis?.cancelledCount ?? 0)}
          subtitle={kpis?.cancelledAmount ? formatCurrency(kpis.cancelledAmount) : undefined}
          accentColor="#ef4444"
          onClick={() => onNavigate('gutschriften')}
        />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        {/* Umsatzverlauf */}
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, marginTop: 0 }}>Umsatzverlauf (12 Monate)</h3>
          <div style={{ height: 250 }}>
            {data?.revenueChart && data.revenueChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.revenueChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e293b' }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e293b' }} tickFormatter={(v) => `${v} €`} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Umsatz']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>Keine Daten vorhanden</div>
            )}
          </div>
        </div>

        {/* Top 5 Produkte */}
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, marginTop: 0 }}>Top 5 Produkte</h3>
          <div style={{ height: 250 }}>
            {data?.topProducts && data.topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e293b' }} tickFormatter={(v) => `${v} €`} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={120} axisLine={{ stroke: '#1e293b' }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [formatCurrency(Number(value)), 'Umsatz']}
                  />
                  <Bar dataKey="revenue" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>Keine Daten vorhanden</div>
            )}
          </div>
        </div>
      </div>

      {/* Mini-Tabellen */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Letzte Rechnungen */}
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, marginTop: 0 }}>Letzte 10 Rechnungen</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <th style={{ textAlign: 'left', padding: '8px 8px', color: '#64748b', fontWeight: 600 }}>Nr.</th>
                  <th style={{ textAlign: 'left', padding: '8px 8px', color: '#64748b', fontWeight: 600 }}>Datum</th>
                  <th style={{ textAlign: 'left', padding: '8px 8px', color: '#64748b', fontWeight: 600 }}>Kunde</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px', color: '#64748b', fontWeight: 600 }}>Betrag</th>
                  <th style={{ textAlign: 'center', padding: '8px 8px', color: '#64748b', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentInvoices ?? []).map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                    <td style={{ padding: '8px 8px', color: '#06b6d4', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: '8px 8px', color: '#94a3b8' }}>{inv.invoice_date ? fmtDateShort(inv.invoice_date) : '—'}</td>
                    <td style={{ padding: '8px 8px', color: '#e2e8f0' }}>{inv.customer_name || '—'}</td>
                    <td style={{ padding: '8px 8px', color: '#e2e8f0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(inv.gross_amount)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'center' }}><StatusBadge status={inv.status || 'paid'} /></td>
                  </tr>
                ))}
                {(!data?.recentInvoices || data.recentInvoices.length === 0) && (
                  <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>Keine Rechnungen vorhanden</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Offene Mahnungen */}
        <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, marginTop: 0 }}>Offene Mahnungen</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <th style={{ textAlign: 'left', padding: '8px 8px', color: '#64748b', fontWeight: 600 }}>Rechnung</th>
                  <th style={{ textAlign: 'left', padding: '8px 8px', color: '#64748b', fontWeight: 600 }}>Kunde</th>
                  <th style={{ textAlign: 'center', padding: '8px 8px', color: '#64748b', fontWeight: 600 }}>Stufe</th>
                  <th style={{ textAlign: 'right', padding: '8px 8px', color: '#64748b', fontWeight: 600 }}>Betrag</th>
                </tr>
              </thead>
              <tbody>
                {(data?.openDunning ?? []).map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #1e293b20' }}>
                    <td style={{ padding: '8px 8px', color: '#06b6d4', fontWeight: 600 }}>{d.invoice_number}</td>
                    <td style={{ padding: '8px 8px', color: '#e2e8f0' }}>{d.customer_name}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        fontSize: 12,
                        fontWeight: 700,
                        background: d.level >= 3 ? 'rgba(239,68,68,0.15)' : d.level >= 2 ? 'rgba(249,115,22,0.15)' : 'rgba(245,158,11,0.15)',
                        color: d.level >= 3 ? '#ef4444' : d.level >= 2 ? '#f97316' : '#f59e0b',
                      }}>
                        {d.level}
                      </span>
                    </td>
                    <td style={{ padding: '8px 8px', color: '#e2e8f0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(d.gross_amount)}</td>
                  </tr>
                ))}
                {(!data?.openDunning || data.openDunning.length === 0) && (
                  <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>Keine offenen Mahnungen</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  const shimmer: React.CSSProperties = { background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: 8 };
  return (
    <div>
      <div style={{ height: 40, marginBottom: 24, ...shimmer, maxWidth: 400 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 100, ...shimmer }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ height: 300, ...shimmer }} />
        <div style={{ height: 300, ...shimmer }} />
      </div>
      <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </div>
  );
}

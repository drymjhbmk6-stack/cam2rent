'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0f1e',
  card: '#111827',
  border: '#1e293b',
  cyan: '#06b6d4',
  cyanLight: '#22d3ee',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  purpleLight: '#a78bfa',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  textDark: '#475569',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface LiveData {
  active_count: number;
  visitors: { visitor_id: string; current_page: string; device: string; browser: string; referrer: string; last_seen: string; page_count: number }[];
  total_views: number;
  unique_visitors: number;
  avg_pages_per_session: number;
}
interface TodayData {
  total_views: number; unique_visitors: number; sessions: number;
  hourly: number[]; top_pages: { path: string; views: number }[];
  devices: { desktop: number; mobile: number; tablet: number };
}
interface HistoryData { history: { date: string; views: number; unique_visitors: number; sessions: number }[] }
interface FunnelData { funnel: { step: string; count: number; pct: number }[] }
interface TrafficData {
  sources: { source: string; count: number; pct: number }[];
  browsers: { browser: string; count: number; pct: number }[];
  devices: { desktop: number; mobile: number; tablet: number };
  bounce_rate: number; new_visitors: number; returning_visitors: number; total_sessions: number;
}
interface BookingsData {
  today_bookings: number; today_revenue: number; conversion_rate: number; avg_booking_value: number;
  trend: { date: string; count: number; revenue: number }[];
}
interface ProductsData { products: { slug: string; views: number; bookings: number; revenue: number; utilization: number }[] }

type Tab = 'live' | 'bookings' | 'traffic' | 'customers';

// ─── Helper Components ────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px', ...style }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color = C.text }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card>
      <div style={{ fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: '-1px', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

function BarChart({ data, color = C.cyan, height = 80 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div
            style={{
              width: '100%',
              height: Math.max(2, (v / max) * (height - 16)),
              background: `linear-gradient(180deg, ${color}, ${color}88)`,
              borderRadius: '3px 3px 0 0',
              transition: 'height 0.3s ease',
            }}
          />
        </div>
      ))}
    </div>
  );
}

function HourlyChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const h = 100;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: h }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div
              style={{
                width: '100%',
                height: Math.max(2, (v / max) * h),
                background: `linear-gradient(180deg, ${C.cyan}, ${C.cyan}55)`,
                borderRadius: '3px 3px 0 0',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 4 }}>
        {data.map((_, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: C.textDark }}>
            {i % 3 === 0 ? i : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ pct, color = C.cyan, height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ background: C.border, borderRadius: height, height, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height, background: `linear-gradient(90deg, ${color}, ${color}bb)`, borderRadius: height, transition: 'width 0.5s ease' }} />
    </div>
  );
}

function PulseDot() {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: C.cyanLight, animation: 'pulse-dot 2s infinite',
    }} />
  );
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `vor ${diff}s`;
  if (diff < 3600) return `vor ${Math.floor(diff / 60)}m`;
  return `vor ${Math.floor(diff / 3600)}h`;
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function deviceEmoji(d: string): string {
  if (d === 'mobile') return '📱';
  if (d === 'tablet') return '📟';
  return '🖥';
}

function utilizationColor(pct: number): string {
  if (pct > 80) return C.green;
  if (pct > 50) return C.cyan;
  if (pct > 30) return C.yellow;
  return C.red;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('live');
  const [clock, setClock] = useState('');
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficData | null>(null);
  const [bookingsData, setBookingsData] = useState<BookingsData | null>(null);
  const [productsData, setProductsData] = useState<ProductsData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const fetchLive = useCallback(async () => {
    const [liveRes, todayRes] = await Promise.all([
      fetch('/api/admin/analytics?type=live').then((r) => r.json()),
      fetch('/api/admin/analytics?type=today').then((r) => r.json()),
    ]);
    setLiveData(liveRes);
    setTodayData(todayRes);
  }, []);

  const fetchHistory = useCallback(async () => {
    if (historyData) return;
    const res = await fetch('/api/admin/analytics?type=history').then((r) => r.json());
    setHistoryData(res);
  }, [historyData]);

  const fetchBookings = useCallback(async () => {
    if (bookingsData && funnelData && productsData) return;
    const [b, f, p] = await Promise.all([
      fetch('/api/admin/analytics?type=bookings').then((r) => r.json()),
      fetch('/api/admin/analytics?type=funnel').then((r) => r.json()),
      fetch('/api/admin/analytics?type=products').then((r) => r.json()),
    ]);
    setBookingsData(b);
    setFunnelData(f);
    setProductsData(p);
  }, [bookingsData, funnelData, productsData]);

  const fetchTraffic = useCallback(async () => {
    if (trafficData) return;
    const res = await fetch('/api/admin/analytics?type=traffic').then((r) => r.json());
    setTrafficData(res);
  }, [trafficData]);

  // Initial load + auto-refresh
  useEffect(() => { fetchLive(); }, [fetchLive]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (activeTab === 'live') {
      intervalRef.current = setInterval(fetchLive, 10000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeTab, fetchLive]);

  useEffect(() => {
    if (activeTab === 'bookings') fetchBookings();
    if (activeTab === 'traffic') fetchTraffic();
    if (activeTab === 'traffic') fetchHistory();
    if (activeTab === 'customers') {
      fetchTraffic();
      fetchHistory();
    }
  }, [activeTab, fetchBookings, fetchTraffic, fetchHistory]);

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'live', label: 'Live', icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      id: 'bookings', label: 'Buchungen & Umsatz', icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'traffic', label: 'Traffic & Marketing', icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
        </svg>
      ),
    },
    {
      id: 'customers', label: 'Kunden & Verhalten', icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ color: C.text, fontFamily: 'Inter, system-ui, sans-serif', padding: '20px 16px' }}>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .tab-content { animation: fadeIn 0.3s ease; }
        .row-fade { animation: fadeIn 0.3s ease both; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: C.text }}>cam</span>
            <span style={{ color: C.cyan }}>2</span>
            <span style={{ color: C.text }}>rent</span>
            <span style={{ color: C.textDark }}> / Analytics</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PulseDot />
          <span style={{ fontSize: 12, color: C.cyanLight, fontWeight: 600 }}>LIVE</span>
          <span style={{ fontSize: 12, color: C.textDim, fontFamily: 'monospace' }}>{clock}</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ background: C.card, borderRadius: 12, padding: 4, display: 'flex', gap: 2, marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
              background: activeTab === tab.id ? C.border : 'transparent',
              color: activeTab === tab.id ? C.cyanLight : C.textDim,
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: 13,
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: LIVE ─────────────────────────────────────────────────────── */}
      {activeTab === 'live' && (
        <div className="tab-content">
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="Gerade online" value={liveData?.active_count ?? '–'} sub="aktive Besucher" color={C.cyanLight} />
            <StatCard label="Heute" value={liveData?.total_views ?? todayData?.total_views ?? '–'} sub="Seitenaufrufe" />
            <StatCard label="Besucher heute" value={liveData?.unique_visitors ?? todayData?.unique_visitors ?? '–'} sub="Unique Visitors" />
            <StatCard label="Seiten / Session" value={liveData?.avg_pages_per_session ?? '–'} sub="Durchschnitt" />
          </div>

          {/* Active Visitors Table */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <PulseDot />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Aktive Besucher — Echtzeit</span>
            </div>
            {!liveData || (liveData.visitors ?? []).length === 0 ? (
              <div style={{ textAlign: 'center', color: C.textDim, padding: '32px 0', fontSize: 14 }}>
                Gerade niemand auf der Seite
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Besucher', 'Aktuelle Seite', 'Gerät', 'Herkunft', 'Seiten', 'Zuletzt'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(liveData.visitors ?? []).map((v, i) => (
                      <tr key={i} className="row-fade" style={{ borderBottom: `1px solid ${C.border}22`, animationDelay: `${i * 50}ms` }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: C.textMuted }}>{v.visitor_id}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: `${C.cyan}18`, color: C.cyanLight, borderRadius: 6, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11 }}>{v.current_page}</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            background: v.device === 'mobile' ? `${C.purple}22` : v.device === 'tablet' ? `${C.yellow}22` : `${C.cyan}22`,
                            color: v.device === 'mobile' ? C.purpleLight : v.device === 'tablet' ? C.yellow : C.cyanLight,
                            borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                          }}>
                            {deviceEmoji(v.device)} {v.device}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: v.referrer === 'direkt' ? C.textDark : C.textMuted }}>{v.referrer}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: C.text }}>{v.page_count}</td>
                        <td style={{ padding: '10px 12px', color: C.textDim }}>{timeAgo(v.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Hourly Chart */}
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Aufrufe heute nach Stunde</div>
            {todayData ? <HourlyChart data={todayData.hourly ?? Array(24).fill(0)} /> : (
              <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim }}>Laden…</div>
            )}
          </Card>
        </div>
      )}

      {/* ── TAB 2: BUCHUNGEN & UMSATZ ────────────────────────────────────────── */}
      {activeTab === 'bookings' && (
        <div className="tab-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="Buchungen heute" value={bookingsData?.today_bookings ?? '–'} color={C.green} />
            <StatCard label="Umsatz heute" value={bookingsData ? fmtEur(bookingsData.today_revenue) : '–'} color={C.cyanLight} />
            <StatCard label="Conversion Rate" value={bookingsData ? `${bookingsData.conversion_rate}%` : '–'} color={C.yellow} />
            <StatCard label="Ø Buchungswert" value={bookingsData ? fmtEur(bookingsData.avg_booking_value) : '–'} />
          </div>

          {/* Conversion Funnel */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Conversion Funnel — Letzte 30 Tage</div>
            {funnelData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(funnelData.funnel ?? []).map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 160, textAlign: 'right', fontSize: 13, color: '#cbd5e1', flexShrink: 0 }}>{step.step}</div>
                    <div style={{ flex: 1, background: C.border, borderRadius: 6, height: 28, overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        width: `${Math.max(2, step.pct)}%`, height: '100%',
                        background: i === (funnelData.funnel ?? []).length - 1
                          ? `linear-gradient(90deg, ${C.green}, #059669)`
                          : `linear-gradient(90deg, ${C.cyan}, #0891b2)`,
                        display: 'flex', alignItems: 'center', paddingLeft: 10, transition: 'width 0.5s ease',
                      }}>
                        <span style={{ color: 'white', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {step.count} ({step.pct}%)
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div style={{ color: C.textDim, padding: '20px 0' }}>Laden…</div>}
          </Card>

          {/* Booking Trend Chart */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Buchungstrend — 30 Tage</div>
            {bookingsData ? (
              <BarChart data={(bookingsData.trend ?? []).map((d) => d.count)} color={C.green} height={100} />
            ) : <div style={{ color: C.textDim }}>Laden…</div>}
          </Card>

          {/* Camera Performance */}
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Kamera-Performance — 30 Tage</div>
            {productsData ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Kamera', 'Views', 'Buchungen', 'Umsatz', 'Auslastung'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(productsData.products ?? []).map((p, i) => (
                      <tr key={i} className="row-fade" style={{ borderBottom: `1px solid ${C.border}22`, animationDelay: `${i * 40}ms` }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: C.text }}>{p.slug}</td>
                        <td style={{ padding: '10px 12px', color: C.textMuted }}>{p.views}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: C.green }}>{p.bookings}</td>
                        <td style={{ padding: '10px 12px', color: C.cyanLight }}>{fmtEur(p.revenue)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 60, background: C.border, borderRadius: 3, height: 6, overflow: 'hidden' }}>
                              <div style={{ width: `${p.utilization}%`, height: 6, background: utilizationColor(p.utilization), borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, color: utilizationColor(p.utilization), fontWeight: 600 }}>{p.utilization}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div style={{ color: C.textDim }}>Laden…</div>}
          </Card>
        </div>
      )}

      {/* ── TAB 3: TRAFFIC & MARKETING ───────────────────────────────────────── */}
      {activeTab === 'traffic' && (
        <div className="tab-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
            {/* Traffic Sources */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Traffic-Quellen — 30 Tage</div>
              {trafficData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(trafficData.sources ?? []).map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 100, fontSize: 13, color: '#cbd5e1', flexShrink: 0 }}>{s.source}</div>
                      <div style={{ flex: 1, background: C.border, borderRadius: 6, height: 22, overflow: 'hidden' }}>
                        <div style={{
                          width: `${s.pct}%`, height: 22, borderRadius: 6,
                          background: `linear-gradient(90deg, ${C.cyan}, ${C.cyan}88)`,
                          display: 'flex', alignItems: 'center', paddingLeft: 8,
                        }}>
                          <span style={{ color: 'white', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {s.count} ({s.pct}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: C.textDim }}>Laden…</div>}
            </Card>

            {/* Top Pages */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Top Seiten — 30 Tage</div>
              {todayData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(todayData.top_pages ?? []).map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ background: `${C.cyan}18`, color: C.cyanLight, borderRadius: 6, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
                      <span style={{ color: C.text, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{p.views}</span>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: C.textDim }}>Laden…</div>}
            </Card>
          </div>

          {/* Visitor History */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Besucher-Verlauf — 30 Tage</div>
            {historyData ? (
              <BarChart data={(historyData.history ?? []).map((d) => d.views)} color={C.cyan} height={100} />
            ) : <div style={{ color: C.textDim }}>Laden…</div>}
          </Card>

          {/* UTM Info */}
          <Card style={{ background: `${C.cyan}08`, border: `1px solid ${C.cyan}33` }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.cyanLight, marginBottom: 8 }}>UTM-Tracking einrichten</div>
            <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
              Füge UTM-Parameter zu deinen Links hinzu, um Traffic-Quellen genau zuzuordnen.
            </p>
            <code style={{ display: 'block', background: C.border, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: C.cyanLight, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {'https://cam2rent.de/?utm_source=instagram&utm_medium=social&utm_campaign=hero13-launch'}
            </code>
          </Card>
        </div>
      )}

      {/* ── TAB 4: KUNDEN & VERHALTEN ────────────────────────────────────────── */}
      {activeTab === 'customers' && (
        <div className="tab-content">
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            {/* New vs Returning */}
            <Card>
              <div style={{ fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Neu vs. Wiederkehrend</div>
              {trafficData ? (
                <>
                  <div style={{ background: C.border, borderRadius: 6, height: 8, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
                    <div style={{ width: `${Math.round((trafficData.new_visitors ?? 0) / (((trafficData.new_visitors ?? 0) + (trafficData.returning_visitors ?? 0)) || 1) * 100)}%`, height: 8, background: C.cyan }} />
                    <div style={{ flex: 1, height: 8, background: C.purple }} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <span style={{ color: C.cyan }}>Neu {Math.round((trafficData.new_visitors ?? 0) / (((trafficData.new_visitors ?? 0) + (trafficData.returning_visitors ?? 0)) || 1) * 100)}%</span>
                    <span style={{ color: C.purpleLight }}>Wieder {Math.round((trafficData.returning_visitors ?? 0) / (((trafficData.new_visitors ?? 0) + (trafficData.returning_visitors ?? 0)) || 1) * 100)}%</span>
                  </div>
                </>
              ) : <div style={{ color: C.textDim }}>–</div>}
            </Card>

            <StatCard label="Absprungrate" value={trafficData ? `${trafficData.bounce_rate}%` : '–'} color={C.yellow} />
            <StatCard label="Sessions (30 Tage)" value={trafficData?.total_sessions ?? '–'} color={C.text} />
            <StatCard label="Unique Visitors (heute)" value={todayData?.unique_visitors ?? '–'} color={C.cyanLight} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Device Distribution */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Geräte-Verteilung — 30 Tage</div>
              {trafficData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Desktop', emoji: '🖥', pct: trafficData.devices?.desktop ?? 0, color: C.cyan },
                    { label: 'Mobile', emoji: '📱', pct: trafficData.devices?.mobile ?? 0, color: C.purple },
                    { label: 'Tablet', emoji: '📟', pct: trafficData.devices?.tablet ?? 0, color: C.yellow },
                  ].map((d) => (
                    <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 24 }}>{d.emoji}</span>
                      <span style={{ width: 60, fontSize: 13, color: '#cbd5e1' }}>{d.label}</span>
                      <ProgressBar pct={d.pct} color={d.color} height={8} />
                      <span style={{ width: 40, textAlign: 'right', fontSize: 13, color: d.color, fontWeight: 600 }}>{d.pct}%</span>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: C.textDim }}>Laden…</div>}
            </Card>

            {/* Browser Distribution */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Browser — 30 Tage</div>
              {trafficData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(trafficData.browsers ?? []).slice(0, 5).map((b, i) => {
                    const bColors: Record<string, string> = { Chrome: C.cyan, Safari: C.green, Firefox: C.yellow, Edge: C.purple };
                    const color = bColors[b.browser] ?? C.textDim;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 70, fontSize: 13, color: '#cbd5e1' }}>{b.browser}</span>
                        <ProgressBar pct={b.pct} color={color} height={8} />
                        <span style={{ width: 40, textAlign: 'right', fontSize: 13, color, fontWeight: 600 }}>{b.pct}%</span>
                      </div>
                    );
                  })}
                </div>
              ) : <div style={{ color: C.textDim }}>Laden…</div>}
            </Card>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'center', color: C.textDark, fontSize: 11, marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
        cam2rent Analytics — Self-Hosted · DSGVO-konform · Keine Cookies · Alle Daten auf deinem Server
      </div>
    </div>
  );
}

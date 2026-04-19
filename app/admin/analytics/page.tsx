'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { formatCurrency } from '@/lib/format-utils';

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

type Tab = 'live' | 'bookings' | 'traffic' | 'customers' | 'blog';

type TimeRange = 'heute' | '7tage' | '30tage' | 'monat' | 'jahr' | 'custom';
type StatusFilter = 'alle' | 'aktiv' | 'abgeschlossen' | 'storniert';

interface FilterState {
  timeRange: TimeRange;
  customFrom: string;
  customTo: string;
  product: string;
  status: StatusFilter;
}

interface FilterPreset {
  name: string;
  filters: FilterState;
}

const DEFAULT_FILTERS: FilterState = {
  timeRange: 'heute',
  customFrom: '',
  customTo: '',
  product: 'alle',
  status: 'alle',
};

// ─── Helper Components ────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px', ...style }}>
      {children}
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: `${C.cyan}22`,
        color: C.cyanLight,
        fontSize: 10,
        cursor: 'help',
        marginLeft: 6,
        verticalAlign: 'middle',
        fontStyle: 'normal',
        lineHeight: 1,
      }}
    >
      i
    </span>
  );
}

function StatCard({ label, value, sub, color = C.text, tooltip }: { label: string; value: string | number; sub?: string; color?: string; tooltip?: string }) {
  return (
    <Card>
      <div style={{ fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
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
  const h = 120;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: h }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {v > 0 && (
              <div style={{ fontSize: 9, fontWeight: 700, color: C.cyan, lineHeight: 1 }}>{v}</div>
            )}
            <div
              style={{
                width: '100%',
                height: Math.max(2, (v / max) * (h - 16)),
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

/**
 * Balkendiagramm mit Label pro Balken. Labels werden nur an jedem N-ten
 * Tick gezeigt, damit es bei 30 Tagen nicht eng wird.
 */
function LabeledBarChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const h = 120;
  const step = items.length > 15 ? Math.ceil(items.length / 10) : 1;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: items.length > 20 ? 1 : 3, height: h }}>
        {items.map((it, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
            {it.value > 0 && (
              <div style={{ fontSize: 9, fontWeight: 700, color: C.cyan, lineHeight: 1 }}>{it.value}</div>
            )}
            <div
              title={`${it.label}: ${it.value}`}
              style={{
                width: '100%',
                height: Math.max(2, (it.value / max) * (h - 16)),
                background: `linear-gradient(180deg, ${C.cyan}, ${C.cyan}55)`,
                borderRadius: '3px 3px 0 0',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 4 }}>
        {items.map((it, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: C.textDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {i % step === 0 ? it.label : ''}
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

const fmtEur = formatCurrency;

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

// ─── Filter Helpers ──────────────────────────────────────────────────────────
function getTimeRangeLabel(tr: TimeRange): string {
  const labels: Record<TimeRange, string> = {
    heute: 'Heute',
    '7tage': '7 Tage',
    '30tage': '30 Tage',
    monat: 'Dieser Monat',
    jahr: 'Dieses Jahr',
    custom: 'Benutzerdefiniert',
  };
  return labels[tr];
}

function getViewsChartTitle(tr: TimeRange): string {
  switch (tr) {
    case 'heute': return 'Aufrufe heute nach Stunde';
    case '7tage': return 'Aufrufe der letzten 7 Tage';
    case '30tage': return 'Aufrufe der letzten 30 Tage';
    case 'monat': return 'Aufrufe diesen Monat';
    case 'jahr': return 'Aufrufe dieses Jahr (nach Monat)';
    case 'custom': return 'Aufrufe im gewählten Zeitraum';
  }
}

/**
 * Wandelt die History-API-Daten in Chart-Items um, passend zum Filter.
 * - 7/30tage: letzte N Tage, ein Balken pro Tag (Label "DD.MM")
 * - monat:    nur Tage des aktuellen Monats
 * - jahr:     12 Monats-Balken (Label "Jan", "Feb", ...)
 * - custom:   Fallback auf 30 Tage
 */
function buildFilteredViews(tr: TimeRange, history: Array<{ date: string; views: number }>): Array<{ label: string; value: number }> {
  const byDate = new Map<string, number>();
  for (const h of history) byDate.set(h.date, (byDate.get(h.date) ?? 0) + h.views);

  const now = new Date();
  const fmtDay = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}`;
  };
  const isoDay = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  if (tr === 'jahr') {
    // 12 Monats-Buckets vom aktuellen Jahr
    const monthNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const currentYear = now.getFullYear();
    const buckets = Array.from({ length: 12 }, (_, i) => ({ label: monthNames[i], value: 0 }));
    for (const h of history) {
      const d = new Date(h.date);
      if (d.getFullYear() === currentYear) buckets[d.getMonth()].value += h.views;
    }
    return buckets;
  }

  let days: number;
  let start: Date;
  if (tr === 'monat') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    days = now.getDate();
  } else if (tr === '7tage') {
    days = 7;
    start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
  } else {
    days = 30;
    start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
  }

  const out: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({ label: fmtDay(d), value: byDate.get(isoDay(d)) ?? 0 });
  }
  return out;
}

function getStatusLabel(s: StatusFilter): string {
  const labels: Record<StatusFilter, string> = {
    alle: 'Alle',
    aktiv: 'Aktiv',
    abgeschlossen: 'Abgeschlossen',
    storniert: 'Storniert',
  };
  return labels[s];
}

function loadPresets(): FilterPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('cam2rent_analytics_presets');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: FilterPreset[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('cam2rent_analytics_presets', JSON.stringify(presets));
}

function filtersAreDefault(f: FilterState): boolean {
  return f.timeRange === DEFAULT_FILTERS.timeRange
    && f.product === DEFAULT_FILTERS.product
    && f.status === DEFAULT_FILTERS.status
    && f.customFrom === DEFAULT_FILTERS.customFrom
    && f.customTo === DEFAULT_FILTERS.customTo;
}

function getActiveFilterChips(f: FilterState): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];
  if (f.timeRange !== DEFAULT_FILTERS.timeRange) {
    let label = getTimeRangeLabel(f.timeRange);
    if (f.timeRange === 'custom' && f.customFrom && f.customTo) {
      label = `${f.customFrom} – ${f.customTo}`;
    }
    chips.push({ key: 'timeRange', label: `Zeitraum: ${label}` });
  }
  if (f.product !== 'alle') {
    chips.push({ key: 'product', label: `Produkt: ${f.product}` });
  }
  if (f.status !== 'alle') {
    chips.push({ key: 'status', label: `Status: ${getStatusLabel(f.status)}` });
  }
  return chips;
}

// ─── CSV Export ──────────────────────────────────────────────────────────────
function generateCSV(
  activeTab: Tab,
  liveData: LiveData | null,
  todayData: TodayData | null,
  historyData: HistoryData | null,
  bookingsData: BookingsData | null,
  productsData: ProductsData | null,
  trafficData: TrafficData | null,
  funnelData: FunnelData | null,
): string {
  const rows: string[][] = [];

  if (activeTab === 'live') {
    rows.push(['Metrik', 'Wert']);
    rows.push(['Gerade online', String(liveData?.active_count ?? 0)]);
    rows.push(['Seitenaufrufe heute', String(liveData?.total_views ?? todayData?.total_views ?? 0)]);
    rows.push(['Einzelne Besucher heute', String(liveData?.unique_visitors ?? todayData?.unique_visitors ?? 0)]);
    rows.push(['Seiten pro Besuch', String(liveData?.avg_pages_per_session ?? 0)]);
    if (liveData?.visitors?.length) {
      rows.push([]);
      rows.push(['Besucher-ID', 'Aktuelle Seite', 'Gerät', 'Browser', 'Herkunft', 'Seiten', 'Zuletzt gesehen']);
      for (const v of liveData.visitors) {
        rows.push([v.visitor_id, v.current_page, v.device, v.browser, v.referrer, String(v.page_count), v.last_seen]);
      }
    }
    if (todayData?.hourly) {
      rows.push([]);
      rows.push(['Stunde', 'Aufrufe']);
      todayData.hourly.forEach((val, i) => rows.push([String(i), String(val)]));
    }
  }

  if (activeTab === 'bookings') {
    rows.push(['Metrik', 'Wert']);
    rows.push(['Buchungen heute', String(bookingsData?.today_bookings ?? 0)]);
    rows.push(['Umsatz heute', String(bookingsData?.today_revenue ?? 0)]);
    rows.push(['Abschlussquote', `${bookingsData?.conversion_rate ?? 0}%`]);
    rows.push(['Durchschnittlicher Buchungswert', String(bookingsData?.avg_booking_value ?? 0)]);
    if (funnelData?.funnel?.length) {
      rows.push([]);
      rows.push(['Funnel-Schritt', 'Anzahl', 'Prozent']);
      for (const s of funnelData.funnel) {
        rows.push([s.step, String(s.count), `${s.pct}%`]);
      }
    }
    if (bookingsData?.trend?.length) {
      rows.push([]);
      rows.push(['Datum', 'Buchungen', 'Umsatz']);
      for (const t of bookingsData.trend) {
        rows.push([t.date, String(t.count), String(t.revenue)]);
      }
    }
    if (productsData?.products?.length) {
      rows.push([]);
      rows.push(['Kamera', 'Seitenaufrufe', 'Buchungen', 'Umsatz', 'Auslastung']);
      for (const p of productsData.products) {
        rows.push([p.slug, String(p.views), String(p.bookings), String(p.revenue), `${p.utilization}%`]);
      }
    }
  }

  if (activeTab === 'traffic') {
    if (trafficData?.sources?.length) {
      rows.push(['Quelle', 'Aufrufe', 'Prozent']);
      for (const s of trafficData.sources) {
        rows.push([s.source, String(s.count), `${s.pct}%`]);
      }
    }
    if (todayData?.top_pages?.length) {
      rows.push([]);
      rows.push(['Seite', 'Aufrufe']);
      for (const p of todayData.top_pages) {
        rows.push([p.path, String(p.views)]);
      }
    }
    if (historyData?.history?.length) {
      rows.push([]);
      rows.push(['Datum', 'Seitenaufrufe', 'Einzelne Besucher', 'Besuche']);
      for (const h of historyData.history) {
        rows.push([h.date, String(h.views), String(h.unique_visitors), String(h.sessions)]);
      }
    }
  }

  if (activeTab === 'customers') {
    rows.push(['Metrik', 'Wert']);
    rows.push(['Neue Besucher', String(trafficData?.new_visitors ?? 0)]);
    rows.push(['Wiederkehrende Besucher', String(trafficData?.returning_visitors ?? 0)]);
    rows.push(['Absprungrate', `${trafficData?.bounce_rate ?? 0}%`]);
    rows.push(['Besuche (30 Tage)', String(trafficData?.total_sessions ?? 0)]);
    rows.push(['Einzelne Besucher (heute)', String(todayData?.unique_visitors ?? 0)]);
    if (trafficData?.devices) {
      rows.push([]);
      rows.push(['Gerät', 'Prozent']);
      rows.push(['Desktop', `${trafficData.devices.desktop}%`]);
      rows.push(['Mobile', `${trafficData.devices.mobile}%`]);
      rows.push(['Tablet', `${trafficData.devices.tablet}%`]);
    }
    if (trafficData?.browsers?.length) {
      rows.push([]);
      rows.push(['Browser', 'Aufrufe', 'Prozent']);
      for (const b of trafficData.browsers) {
        rows.push([b.browser, String(b.count), `${b.pct}%`]);
      }
    }
  }

  if (rows.length === 0) {
    rows.push(['Keine Daten verfügbar']);
  }

  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
}

function downloadCSV(csv: string) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `cam2rent-analytics-${dateStr}.csv`;
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  const [customersData, setCustomersData] = useState<{
    totalCustomers: number; repeatCustomers: number; repeatRate: number;
    avgLifetimeValue: number; avgOrderValue: number; newCustomers30d: number;
    abandonedCarts: number; recoveredCarts: number; recoveryRate: number;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [blogData, setBlogData] = useState<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filters
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  // Load presets on mount
  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Mappt UI-TimeRange auf API-range-Parameter
  const apiRange = (() => {
    if (filters.timeRange === 'heute') return 'today';
    if (filters.timeRange === '7tage') return '7d';
    if (filters.timeRange === '30tage') return '30d';
    if (filters.timeRange === 'monat') return 'month';
    return 'today'; // jahr/custom fallback
  })();

  const fetchLive = useCallback(async () => {
    const [liveRes, todayRes] = await Promise.all([
      fetch(`/api/admin/analytics?type=live&range=${apiRange}`).then((r) => r.json()),
      fetch('/api/admin/analytics?type=today').then((r) => r.json()),
    ]);
    setLiveData(liveRes);
    setTodayData(todayRes);
  }, [apiRange]);

  // Tage fuer History-Fetch aus dem aktuellen Filter ableiten —
  // heute: 0 (kein History-Fetch noetig), 7/30 direkt, monat: bis heute vom
  // Monatsanfang (max 31), jahr: 365 (fuer Monats-Aggregation).
  const historyDays = (() => {
    const now = new Date();
    if (filters.timeRange === 'heute') return 0;
    if (filters.timeRange === '7tage') return 7;
    if (filters.timeRange === '30tage') return 30;
    if (filters.timeRange === 'monat') return now.getDate();
    if (filters.timeRange === 'jahr') return 365;
    return 30;
  })();

  const fetchHistory = useCallback(async (daysOverride?: number) => {
    const days = daysOverride ?? 30;
    if (days <= 0) return;
    const res = await fetch(`/api/admin/analytics?type=history&days=${days}`).then((r) => r.json());
    setHistoryData(res);
  }, []);

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
    if (activeTab === 'traffic') { fetchTraffic(); fetchHistory(30); }
    if (activeTab === 'customers') {
      fetchTraffic();
      fetchHistory(30);
      if (!customersData) {
        fetch('/api/admin/analytics?type=customers').then((r) => r.json()).then(setCustomersData).catch(() => {});
      }
    }
    if (activeTab === 'blog') {
      if (!blogData) {
        fetch('/api/admin/analytics?type=blog').then((r) => r.json()).then(setBlogData).catch(() => {});
      }
    }
  }, [activeTab, fetchBookings, fetchTraffic, fetchHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live-Tab: History-Range folgt dem Zeitraum-Filter (fuer den dynamischen Chart)
  useEffect(() => {
    if (activeTab !== 'live') return;
    if (historyDays > 0) fetchHistory(historyDays);
  }, [activeTab, historyDays, fetchHistory]);

  // ─── Filter logic (client-side filtering of history/trend data) ───────────
  const getFilteredHistory = useCallback(() => {
    if (!historyData?.history) return [];
    return filterByTimeRange(historyData.history, filters);
  }, [historyData, filters]);

  const getFilteredTrend = useCallback(() => {
    if (!bookingsData?.trend) return [];
    return filterByTimeRange(bookingsData.trend, filters);
  }, [bookingsData, filters]);

  // Preset actions
  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const newPresets = [...presets, { name: presetName.trim(), filters: { ...filters } }];
    setPresets(newPresets);
    savePresets(newPresets);
    setPresetName('');
    setShowPresetModal(false);
  };

  const handleDeletePreset = (idx: number) => {
    const newPresets = presets.filter((_, i) => i !== idx);
    setPresets(newPresets);
    savePresets(newPresets);
  };

  const handleApplyPreset = (preset: FilterPreset) => {
    setFilters({ ...preset.filters });
  };

  const removeFilterChip = (key: string) => {
    setFilters(prev => {
      const next = { ...prev };
      if (key === 'timeRange') { next.timeRange = DEFAULT_FILTERS.timeRange; next.customFrom = ''; next.customTo = ''; }
      if (key === 'product') next.product = 'alle';
      if (key === 'status') next.status = 'alle';
      return next;
    });
  };

  const handleExportCSV = () => {
    const csv = generateCSV(activeTab, liveData, todayData, historyData, bookingsData, productsData, trafficData, funnelData);
    downloadCSV(csv);
    setShowExportDropdown(false);
  };

  // Get unique product slugs for filter dropdown
  const productSlugs = productsData?.products?.map(p => p.slug) ?? [];

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
    {
      id: 'blog', label: 'Blog', icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
    },
  ];

  const activeFilterChips = getActiveFilterChips(filters);

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? C.cyan : C.border,
    color: active ? '#0f172a' : C.textMuted,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  const selectStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.card,
    color: C.text,
    fontSize: 12,
    cursor: 'pointer',
    outline: 'none',
  };

  const dateInputStyle: React.CSSProperties = {
    padding: '5px 10px',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.card,
    color: C.text,
    fontSize: 12,
    outline: 'none',
    colorScheme: 'dark',
  };

  return (
    <div style={{ color: C.text, fontFamily: 'Inter, system-ui, sans-serif', padding: '20px 16px' }}>
      <AdminBackLink label="Zurück" />
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .tab-content { animation: fadeIn 0.3s ease; }
        .row-fade { animation: fadeIn 0.3s ease both; }
        .preset-modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
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
          {/* CSV Export */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`,
                background: C.card, color: C.textMuted, fontSize: 12, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
            {showExportDropdown && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4,
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 100, minWidth: 180, overflow: 'hidden',
              }}>
                <button
                  onClick={handleExportCSV}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', border: 'none', background: 'transparent',
                    color: C.text, fontSize: 12, cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.border)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Als CSV exportieren
                </button>
              </div>
            )}
          </div>
          <PulseDot />
          <span style={{ fontSize: 12, color: C.cyanLight, fontWeight: 600 }}>LIVE</span>
          <span style={{ fontSize: 12, color: C.textDim, fontFamily: 'monospace' }}>{clock}</span>
        </div>
      </div>

      {/* Close export dropdown on outside click */}
      {showExportDropdown && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
          onClick={() => setShowExportDropdown(false)}
        />
      )}

      {/* Tab Navigation */}
      <div style={{ background: C.card, borderRadius: 12, padding: 4, display: 'flex', gap: 2, marginBottom: 16, overflowX: 'auto' }}>
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

      {/* ── FILTER BAR ─────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16, padding: '16px 20px' }}>
        {/* Presets */}
        {presets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: C.textDim, marginRight: 4 }}>Vorlagen:</span>
            {presets.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button
                  onClick={() => handleApplyPreset(p)}
                  style={{
                    padding: '4px 10px', borderRadius: '6px 0 0 6px', border: `1px solid ${C.cyan}44`,
                    background: `${C.cyan}15`, color: C.cyanLight, fontSize: 11, cursor: 'pointer',
                  }}
                >
                  {p.name}
                </button>
                <button
                  onClick={() => handleDeletePreset(idx)}
                  style={{
                    padding: '4px 6px', borderRadius: '0 6px 6px 0', border: `1px solid ${C.cyan}44`, borderLeft: 'none',
                    background: `${C.red}15`, color: C.red, fontSize: 11, cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Time range pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: C.textDim, marginRight: 4 }}>Zeitraum:</span>
            {(['heute', '7tage', '30tage', 'monat', 'jahr', 'custom'] as TimeRange[]).map(tr => (
              <button
                key={tr}
                onClick={() => setFilters(f => ({ ...f, timeRange: tr }))}
                style={pillStyle(filters.timeRange === tr)}
              >
                {getTimeRangeLabel(tr)}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          {filters.timeRange === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                value={filters.customFrom}
                onChange={e => setFilters(f => ({ ...f, customFrom: e.target.value }))}
                style={dateInputStyle}
              />
              <span style={{ color: C.textDim, fontSize: 12 }}>bis</span>
              <input
                type="date"
                value={filters.customTo}
                onChange={e => setFilters(f => ({ ...f, customTo: e.target.value }))}
                style={dateInputStyle}
              />
            </div>
          )}

          {/* Product filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.textDim }}>Produkt:</span>
            <select
              value={filters.product}
              onChange={e => setFilters(f => ({ ...f, product: e.target.value }))}
              style={selectStyle}
            >
              <option value="alle">Alle Produkte</option>
              {productSlugs.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Status filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: C.textDim }}>Status:</span>
            <select
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value as StatusFilter }))}
              style={selectStyle}
            >
              <option value="alle">Alle</option>
              <option value="aktiv">Aktiv</option>
              <option value="abgeschlossen">Abgeschlossen</option>
              <option value="storniert">Storniert</option>
            </select>
          </div>

          {/* Save preset */}
          <button
            onClick={() => setShowPresetModal(true)}
            style={{
              padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
              background: 'transparent', color: C.textMuted, fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Filter speichern
          </button>
        </div>

        {/* Active filter chips */}
        {activeFilterChips.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {activeFilterChips.map(chip => (
              <span
                key={chip.key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 20,
                  background: `${C.cyan}18`, color: C.cyanLight, fontSize: 11,
                }}
              >
                {chip.label}
                <button
                  onClick={() => removeFilterChip(chip.key)}
                  style={{
                    background: 'transparent', border: 'none', color: C.cyanLight,
                    cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1, fontWeight: 700,
                  }}
                >
                  x
                </button>
              </span>
            ))}
            {!filtersAreDefault(filters) && (
              <button
                onClick={() => setFilters({ ...DEFAULT_FILTERS })}
                style={{
                  background: 'transparent', border: 'none', color: C.red,
                  cursor: 'pointer', fontSize: 11, textDecoration: 'underline', padding: '4px 0',
                }}
              >
                Alle Filter zurücksetzen
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Preset Save Modal */}
      {showPresetModal && (
        <div className="preset-modal-overlay" onClick={() => setShowPresetModal(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
              padding: 24, width: 360, maxWidth: '90vw',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, color: C.text }}>
              Filter-Vorlage speichern
            </div>
            <input
              type="text"
              placeholder="Name der Vorlage..."
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
              autoFocus
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.bg, color: C.text,
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPresetModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
                  background: 'transparent', color: C.textMuted, fontSize: 12, cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: presetName.trim() ? C.cyan : C.border,
                  color: presetName.trim() ? '#0f172a' : C.textDim,
                  fontSize: 12, fontWeight: 600, cursor: presetName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 1: LIVE ─────────────────────────────────────────────────────── */}
      {activeTab === 'live' && (
        <div className="tab-content">
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard
              label="Gerade online"
              value={liveData?.active_count ?? '–'}
              sub="aktive Besucher (letzte 5 Min)"
              color={C.cyanLight}
              tooltip="Anzahl der Besucher, die in den letzten 5 Minuten aktiv auf der Seite waren. Unabhängig vom Zeitraum-Filter."
            />
            <StatCard
              label={`Seitenaufrufe — ${getTimeRangeLabel(filters.timeRange)}`}
              value={liveData?.total_views ?? '–'}
              sub="Seitenaufrufe"
              tooltip="Gesamtanzahl aller aufgerufenen Seiten im gewählten Zeitraum."
            />
            <StatCard
              label={`Einzelne Besucher — ${getTimeRangeLabel(filters.timeRange)}`}
              value={liveData?.unique_visitors ?? '–'}
              sub="Einzelne Besucher"
              tooltip="Anzahl verschiedener Personen, die im gewählten Zeitraum die Seite besucht haben. Mehrfachbesuche derselben Person werden nur einmal gezählt."
            />
            <StatCard
              label="Seiten pro Besuch"
              value={liveData?.avg_pages_per_session ?? '–'}
              sub="Durchschnitt"
              tooltip="Durchschnittliche Anzahl der Seiten, die ein Besucher pro Sitzung aufruft. Je höher, desto interessierter sind die Besucher."
            />
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

          {/* Aufrufe-Chart: dynamisch nach Zeitraum-Filter */}
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>{getViewsChartTitle(filters.timeRange)}</div>
            {filters.timeRange === 'heute' ? (
              todayData ? (
                <HourlyChart data={todayData.hourly ?? Array(24).fill(0)} />
              ) : (
                <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim }}>Laden...</div>
              )
            ) : (
              historyData ? (
                <LabeledBarChart items={buildFilteredViews(filters.timeRange, historyData.history ?? [])} />
              ) : (
                <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim }}>Laden...</div>
              )
            )}
          </Card>
        </div>
      )}

      {/* ── TAB 2: BUCHUNGEN & UMSATZ ────────────────────────────────────────── */}
      {activeTab === 'bookings' && (
        <div className="tab-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard
              label="Buchungen heute"
              value={bookingsData?.today_bookings ?? '–'}
              color={C.green}
              tooltip="Anzahl der heute eingegangenen Buchungen (ohne stornierte)."
            />
            <StatCard
              label="Umsatz heute"
              value={bookingsData ? fmtEur(bookingsData.today_revenue) : '–'}
              color={C.cyanLight}
              tooltip="Gesamtumsatz aller heutigen Buchungen in Euro."
            />
            <StatCard
              label="Abschlussquote"
              value={bookingsData ? `${bookingsData.conversion_rate}%` : '–'}
              color={C.yellow}
              tooltip="Anteil der Besucher, die tatsächlich eine Buchung abgeschlossen haben. Berechnet als Buchungen geteilt durch Besuche."
            />
            <StatCard
              label="Durchschnittl. Buchungswert"
              value={bookingsData ? fmtEur(bookingsData.avg_booking_value) : '–'}
              tooltip="Durchschnittlicher Betrag pro Buchung. Berechnet als Gesamtumsatz geteilt durch Anzahl der Buchungen."
            />
          </div>

          {/* Conversion Funnel */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
              Buchungstrichter — Letzte 30 Tage
              <InfoTooltip text="Zeigt, wie viele Besucher jeden Schritt des Buchungsprozesses erreichen. So siehst du, wo Besucher abspringen." />
            </div>
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
            ) : <div style={{ color: C.textDim, padding: '20px 0' }}>Laden...</div>}
          </Card>

          {/* Booking Trend Chart */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
              Buchungstrend — {getTimeRangeLabel(filters.timeRange)}
              <InfoTooltip text="Anzahl der Buchungen pro Tag im gewählten Zeitraum." />
            </div>
            {bookingsData ? (
              <BarChart data={getFilteredTrend().map((d) => d.count)} color={C.green} height={100} />
            ) : <div style={{ color: C.textDim }}>Laden...</div>}
          </Card>

          {/* Camera Performance */}
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
              Kamera-Performance — 30 Tage
              <InfoTooltip text="Übersicht über Aufrufe, Buchungen, Umsatz und Auslastung je Kamera." />
            </div>
            {productsData ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Kamera', 'Seitenaufrufe', 'Buchungen', 'Umsatz', 'Auslastung'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(filters.product !== 'alle'
                      ? (productsData.products ?? []).filter(p => p.slug === filters.product)
                      : productsData.products ?? []
                    ).map((p, i) => (
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
            ) : <div style={{ color: C.textDim }}>Laden...</div>}
          </Card>
        </div>
      )}

      {/* ── TAB 3: TRAFFIC & MARKETING ───────────────────────────────────────── */}
      {activeTab === 'traffic' && (
        <div className="tab-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
            {/* Traffic Sources */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
                Traffic-Quellen — 30 Tage
                <InfoTooltip text="Zeigt, woher deine Besucher kommen (z.B. Google, Instagram, direkte Eingabe)." />
              </div>
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
              ) : <div style={{ color: C.textDim }}>Laden...</div>}
            </Card>

            {/* Top Pages */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
                Top Seiten — Heute
                <InfoTooltip text="Die meistbesuchten Seiten deines Shops heute." />
              </div>
              {todayData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(todayData.top_pages ?? []).map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ background: `${C.cyan}18`, color: C.cyanLight, borderRadius: 6, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
                      <span style={{ color: C.text, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{p.views}</span>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: C.textDim }}>Laden...</div>}
            </Card>
          </div>

          {/* Visitor History */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
              Besucher-Verlauf — {getTimeRangeLabel(filters.timeRange)}
              <InfoTooltip text="Seitenaufrufe pro Tag im gewählten Zeitraum." />
            </div>
            {historyData ? (
              <BarChart data={getFilteredHistory().map((d) => d.views)} color={C.cyan} height={100} />
            ) : <div style={{ color: C.textDim }}>Laden...</div>}
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
          {/* Kundenwert + Warenkorbabbrüche */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="Kunden gesamt" value={customersData?.totalCustomers ?? '–'} color={C.cyan} tooltip="Gesamtanzahl aller Kunden die mindestens eine Buchung haben." />
            <StatCard label="Wiederbuchungen" value={customersData ? `${customersData.repeatRate}%` : '–'} color={C.purple} tooltip="Anteil der Kunden die mehr als einmal gebucht haben." />
            <StatCard label="Durchschn. Kundenwert" value={customersData ? `${customersData.avgLifetimeValue.toFixed(2)} €` : '–'} color={C.green} tooltip="Durchschnittlicher Gesamtumsatz pro Kunde über alle Buchungen." />
            <StatCard label="Durchschn. Bestellwert" value={customersData ? `${customersData.avgOrderValue.toFixed(2)} €` : '–'} color={C.cyanLight} tooltip="Durchschnittlicher Umsatz pro einzelne Buchung." />
            <StatCard label="Neue Kunden (30 Tage)" value={customersData?.newCustomers30d ?? '–'} color={C.yellow} tooltip="Anzahl neuer Kunden in den letzten 30 Tagen." />
            <StatCard label="Warenkorbabbrüche" value={customersData?.abandonedCarts ?? '–'} color={C.red} tooltip="Anzahl abgebrochener Warenkörbe in den letzten 30 Tagen." />
            <StatCard label="Zurückgewonnen" value={customersData ? `${customersData.recoveryRate}%` : '–'} color={C.green} tooltip="Anteil der abgebrochenen Warenkörbe die durch Erinnerungs-Emails zurückgewonnen wurden." />
          </div>

          {/* Traffic Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            {/* New vs Returning */}
            <Card>
              <div style={{ fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Neu vs. Wiederkehrend
                <InfoTooltip text="Verhältnis zwischen Erstbesuchern und wiederkehrenden Besuchern in den letzten 30 Tagen." />
              </div>
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

            <StatCard
              label="Absprungrate"
              value={trafficData ? `${trafficData.bounce_rate}%` : '–'}
              color={C.yellow}
              tooltip="Anteil der Besucher, die nur eine einzige Seite aufrufen und dann die Website verlassen. Ein niedriger Wert ist besser."
            />
            <StatCard
              label="Besuche (30 Tage)"
              value={trafficData?.total_sessions ?? '–'}
              color={C.text}
              tooltip="Gesamtanzahl aller Sitzungen in den letzten 30 Tagen. Eine Sitzung ist ein zusammenhängender Besuch auf der Website."
            />
            <StatCard
              label="Einzelne Besucher (heute)"
              value={todayData?.unique_visitors ?? '–'}
              color={C.cyanLight}
              tooltip="Anzahl verschiedener Besucher heute. Jede Person wird nur einmal gezählt, auch bei mehreren Besuchen."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Device Distribution */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
                Geräte-Verteilung — 30 Tage
                <InfoTooltip text="Zeigt, mit welchen Geräten deine Besucher die Website aufrufen." />
              </div>
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
              ) : <div style={{ color: C.textDim }}>Laden...</div>}
            </Card>

            {/* Browser Distribution */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
                Browser — 30 Tage
                <InfoTooltip text="Welche Browser deine Besucher verwenden." />
              </div>
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
              ) : <div style={{ color: C.textDim }}>Laden...</div>}
            </Card>
          </div>
        </div>
      )}

      {/* ── TAB 5: BLOG ────────────────────────────────────────────────────── */}
      {activeTab === 'blog' && (
        <div className="tab-content">
          {/* KPI-Karten */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="Artikel gesamt" value={blogData?.totalPosts ?? '–'} color={C.cyan} tooltip="Gesamtanzahl aller Blog-Artikel (veröffentlicht + Entwürfe)." />
            <StatCard label="Veröffentlicht" value={blogData?.publishedPosts ?? '–'} color={C.green} tooltip="Anzahl veröffentlichter Artikel." />
            <StatCard label="Entwürfe" value={blogData?.draftPosts ?? '–'} color={C.yellow} tooltip="Anzahl noch nicht veröffentlichter Entwürfe." />
            <StatCard label="Neu (30 Tage)" value={blogData?.recentPosts ?? '–'} color={C.purple} tooltip="Artikel die in den letzten 30 Tagen erstellt wurden." />
            <StatCard label="Blog-Aufrufe (30 Tage)" value={blogData?.blogPageViews30d ?? '–'} color={C.cyanLight} tooltip="Seitenaufrufe auf Blog-Seiten in den letzten 30 Tagen." />
            <StatCard label="Kommentare gesamt" value={blogData?.totalComments ?? '–'} tooltip="Gesamtanzahl aller Blog-Kommentare." />
            <StatCard label="Neue Kommentare" value={blogData?.recentComments ?? '–'} color={C.cyan} tooltip="Kommentare der letzten 30 Tage." />
            <StatCard label="Im Zeitplan" value={blogData?.scheduledCount ?? '–'} color={C.yellow} tooltip="Artikel die im Redaktionsplan stehen und noch nicht generiert wurden." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Top Blog-Artikel nach Aufrufen */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
                Top Blog-Artikel — Aufrufe (30 Tage)
                <InfoTooltip text="Die meistbesuchten Blog-Artikel der letzten 30 Tage (gemessen an Seitenaufrufen)." />
              </div>
              {blogData?.topBlogPages?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(blogData.topBlogPages as { slug: string; title: string; views: number }[]).map((p, i) => (
                    <div key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 20, fontSize: 12, color: C.textDim, fontWeight: 700, textAlign: 'right' }}>
                        {i + 1}.
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.title}
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.cyan, flexShrink: 0 }}>{p.views}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: C.textDim, fontSize: 13 }}>Noch keine Blog-Aufrufe</div>
              )}
            </Card>

            {/* Blog-Aufrufe Trend */}
            <Card>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
                Blog-Aufrufe pro Tag — 30 Tage
                <InfoTooltip text="Tägliche Seitenaufrufe auf Blog-Seiten." />
              </div>
              {blogData?.viewTrend?.length > 0 ? (
                <HourlyChart data={(() => {
                  const trend = blogData.viewTrend as { date: string; views: number }[];
                  const last14 = trend.slice(-14);
                  return last14.map((d: { views: number }) => d.views);
                })()} />
              ) : (
                <div style={{ color: C.textDim, fontSize: 13 }}>Noch keine Daten</div>
              )}
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

// ─── Client-side filter helper for date-based arrays ─────────────────────────
function filterByTimeRange<T extends { date: string }>(data: T[], filters: FilterState): T[] {
  const now = new Date();
  let fromDate: Date;
  let toDate: Date = now;

  switch (filters.timeRange) {
    case 'heute':
      fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7tage':
      fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30tage':
      fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'monat':
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'jahr':
      fromDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'custom':
      if (filters.customFrom && filters.customTo) {
        fromDate = new Date(filters.customFrom);
        toDate = new Date(filters.customTo + 'T23:59:59');
      } else {
        return data;
      }
      break;
    default:
      fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  return data.filter(item => item.date >= fromStr && item.date <= toStr);
}

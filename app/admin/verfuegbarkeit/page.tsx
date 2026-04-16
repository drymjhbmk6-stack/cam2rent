'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useProducts } from '@/components/ProductsProvider';
import AdminBackLink from '@/components/admin/AdminBackLink';

/* ─── Typen ─────────────────────────────────────────────────────────────── */

interface GanttUnit {
  id: string;
  serial_number: string;
  label: string | null;
  status: 'available' | 'rented' | 'maintenance' | 'retired';
}

interface GanttBooking {
  id: string;
  rental_from: string;
  rental_to: string;
  customer_name: string;
  delivery_mode: string;
  status: string;
  unit_id: string | null;
}

interface GanttBlocked {
  start_date: string;
  end_date: string;
  reason?: string;
}

interface GanttProduct {
  id: string;
  name: string;
  stock: number;
  units: GanttUnit[];
  bookings: GanttBooking[];
  blocked: GanttBlocked[];
}

interface BufferDays {
  versand_before: number;
  versand_after: number;
  abholung_before: number;
  abholung_after: number;
}

interface GanttData {
  month: string;
  daysInMonth: number;
  bufferDays: BufferDays;
  products: GanttProduct[];
  accessories: GanttAccessory[];
  sets: GanttSet[];
}

interface GanttAccessory {
  id: string;
  name: string;
  category: string;
  available_qty: number;
  bookings: GanttSimpleBooking[];
}

interface GanttSimpleBooking {
  id: string;
  rental_from: string;
  rental_to: string;
  customer_name: string;
  delivery_mode: string;
}

interface GanttSet {
  id: string;
  name: string;
  badge: string | null;
  available: boolean;
  accessory_items: { accessory_id: string; qty: number }[];
  bookings: GanttSimpleBooking[];
}

type DayCellType = 'free' | 'booked' | 'buffer-hin' | 'buffer-rueck' | 'maintenance' | 'retired' | 'blocked' | 'past';

interface DayCellInfo {
  type: DayCellType;
  booking?: GanttBooking;
  bufferLabel?: string;
}

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

type Tab = 'kameras' | 'sets' | 'zubehoer';

/* ─── Haupt-Komponente ──────────────────────────────────────────────────── */

export default function AdminVerfuegbarkeitPage() {
  const { products: shopProducts } = useProducts();
  const [tab, setTab] = useState<Tab>('kameras');

  // Gantt-State — durchgehend scrollbar (3 Monate zurück + 6 Monate voraus)
  const MONTHS_BACK = 3;
  const MONTHS_FORWARD = 6;
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [ganttLoading, setGanttLoading] = useState(true);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const todayColRef = useRef<HTMLTableCellElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Zeitraum berechnen
  const { rangeFrom, rangeTo } = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + MONTHS_FORWARD + 1, 0);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { rangeFrom: fmt(from), rangeTo: fmt(to) };
  }, []);

  // Gantt-Daten laden (gesamter Zeitraum)
  const loadGantt = useCallback(async () => {
    setGanttLoading(true);
    try {
      const res = await fetch(`/api/admin/availability-gantt?from=${rangeFrom}&to=${rangeTo}`);
      const data = await res.json();
      setGanttData(data);
      if (data.products) {
        setExpandedProducts(new Set(data.products.filter((p: GanttProduct) => p.units.length > 0).map((p: GanttProduct) => p.id)));
      }
    } catch {
      setGanttData(null);
    } finally {
      setGanttLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => { loadGantt(); }, [loadGantt]);

  // Zum heutigen Tag scrollen nach Laden
  const scrolledToToday = useRef(false);
  useEffect(() => {
    if (!ganttLoading && ganttData && todayColRef.current && !scrolledToToday.current) {
      scrolledToToday.current = true;
      setTimeout(() => {
        todayColRef.current?.scrollIntoView({ inline: 'center', behavior: 'auto' });
      }, 100);
    }
  }, [ganttLoading, ganttData]);

  function scrollToToday() {
    todayColRef.current?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
  }

  // ISO-Kalenderwoche berechnen
  function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  // Heutiges Datum als String
  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  // Alle Tage im Zeitraum generieren
  const days = useMemo(() => {
    if (!ganttData) return [];
    const result: { day: number; dateStr: string; dayName: string; isWeekend: boolean; kw: number; isToday: boolean; month: number; year: number; isFirstOfMonth: boolean }[] = [];
    const start = new Date(rangeFrom);
    const end = new Date(rangeTo);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      result.push({
        day: d.getDate(),
        dateStr,
        dayName: DAY_NAMES[d.getDay()],
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
        kw: getISOWeek(new Date(d)),
        isToday: dateStr === todayStr,
        month: d.getMonth(),
        year: d.getFullYear(),
        isFirstOfMonth: d.getDate() === 1,
      });
    }
    return result;
  }, [ganttData, rangeFrom, rangeTo, todayStr]);

  // Monats-Gruppen für Top-Header
  const monthGroups = useMemo(() => {
    const groups: { label: string; span: number }[] = [];
    for (const d of days) {
      const label = `${MONTH_NAMES[d.month]} ${d.year}`;
      if (groups.length === 0 || groups[groups.length - 1].label !== label) {
        groups.push({ label, span: 1 });
      } else {
        groups[groups.length - 1].span++;
      }
    }
    return groups;
  }, [days]);

  // KW-Gruppen für den Header-Balken
  const kwGroups = useMemo(() => {
    const groups: { kw: number; span: number }[] = [];
    for (const d of days) {
      if (groups.length === 0 || groups[groups.length - 1].kw !== d.kw) {
        groups.push({ kw: d.kw, span: 1 });
      } else {
        groups[groups.length - 1].span++;
      }
    }
    return groups;
  }, [days]);

  function toggleProduct(productId: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  // Berechne Zellentyp für eine Unit an einem bestimmten Tag
  function getCellInfo(unit: GanttUnit, dateStr: string, product: GanttProduct, buf: BufferDays): DayCellInfo {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cellDate = new Date(dateStr);

    const isPast = cellDate < today;
    if (unit.status === 'retired') return { type: 'retired' };
    if (unit.status === 'maintenance') return { type: 'maintenance' };

    // Blockierungen prüfen
    for (const bl of product.blocked) {
      if (dateStr >= bl.start_date && dateStr <= bl.end_date) {
        return { type: 'blocked' };
      }
    }

    // Buchungen für diese Unit prüfen
    const unitBookings = product.bookings.filter((b) => b.unit_id === unit.id);
    for (const b of unitBookings) {
      const bMode = b.delivery_mode ?? 'versand';
      const before = bMode === 'abholung' ? buf.abholung_before : buf.versand_before;
      const after = bMode === 'abholung' ? buf.abholung_after : buf.versand_after;

      // Puffertage berechnen
      const fromDate = new Date(b.rental_from);
      const toDate = new Date(b.rental_to);
      const bufferStart = new Date(fromDate);
      bufferStart.setDate(bufferStart.getDate() - before);
      const bufferEnd = new Date(toDate);
      bufferEnd.setDate(bufferEnd.getDate() + after);

      const bufStartStr = bufferStart.toISOString().split('T')[0];
      const bufEndStr = bufferEnd.toISOString().split('T')[0];

      // Innerhalb der Buchung
      if (dateStr >= b.rental_from && dateStr <= b.rental_to) {
        return { type: 'booked', booking: b };
      }

      // Puffer davor (Hinversand / Abholung)
      if (dateStr >= bufStartStr && dateStr < b.rental_from) {
        const label = bMode === 'abholung' ? 'Abholung' : 'Hinversand';
        return { type: 'buffer-hin', booking: b, bufferLabel: label };
      }

      // Puffer danach (Rückversand / Rückgabe)
      if (dateStr > b.rental_to && dateStr <= bufEndStr) {
        const label = bMode === 'abholung' ? 'Rückgabe' : 'Rückversand';
        return { type: 'buffer-rueck', booking: b, bufferLabel: label };
      }
    }

    // Auch nicht zugeordnete Buchungen prüfen (Fallback wenn keine Units zugeordnet)
    const unassignedBookings = product.bookings.filter((b) => !b.unit_id);
    for (const b of unassignedBookings) {
      const bMode = b.delivery_mode ?? 'versand';
      const before = bMode === 'abholung' ? buf.abholung_before : buf.versand_before;
      const after = bMode === 'abholung' ? buf.abholung_after : buf.versand_after;

      const fromDate = new Date(b.rental_from);
      const toDate = new Date(b.rental_to);
      const bufferStart = new Date(fromDate);
      bufferStart.setDate(bufferStart.getDate() - before);
      const bufferEnd = new Date(toDate);
      bufferEnd.setDate(bufferEnd.getDate() + after);
      const bufStartStr = bufferStart.toISOString().split('T')[0];
      const bufEndStr = bufferEnd.toISOString().split('T')[0];

      if (dateStr >= b.rental_from && dateStr <= b.rental_to) {
        return { type: 'booked', booking: b };
      }
      if (dateStr >= bufStartStr && dateStr < b.rental_from) {
        const label = bMode === 'abholung' ? 'Abholung' : 'Hinversand';
        return { type: 'buffer-hin', booking: b, bufferLabel: label };
      }
      if (dateStr > b.rental_to && dateStr <= bufEndStr) {
        const label = bMode === 'abholung' ? 'Rückgabe' : 'Rückversand';
        return { type: 'buffer-rueck', booking: b, bufferLabel: label };
      }
    }

    return { type: isPast ? 'past' : 'free' };
  }

  // Zellenfarbe — kräftige, gut unterscheidbare Farben auf dunklem Hintergrund
  function cellStyle(info: DayCellInfo): React.CSSProperties {
    switch (info.type) {
      case 'free': return { background: '#065f46', color: '#6ee7b7' };           // kräftiges Grün
      case 'booked': return { background: '#1d4ed8', color: '#ffffff' };          // kräftiges Blau
      case 'buffer-hin': return { background: '#a16207', color: '#fef3c7' };      // kräftiges Gelb/Gold
      case 'buffer-rueck': return { background: '#c2410c', color: '#fed7aa' };    // kräftiges Orange
      case 'maintenance': return { background: '#991b1b', color: '#fca5a5' };     // kräftiges Rot
      case 'retired': return { background: '#374151', color: '#9ca3af' };         // Grau
      case 'blocked': return { background: '#7f1d1d', color: '#fca5a5' };         // Dunkelrot
      case 'past': return { background: '#1e293b', color: '#475569' };            // Dezent dunkel
      default: return {};
    }
  }

  function handleCellHover(e: React.MouseEvent, info: DayCellInfo, dateStr: string) {
    if (info.type === 'free' || info.type === 'past' || info.type === 'retired') {
      setTooltip(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let content = '';
    const fmtDate = (d: string) => {
      const [y, m, day] = d.split('-');
      return `${day}.${m}.${y}`;
    };

    if (info.booking) {
      content = `${info.booking.id}\n${info.booking.customer_name || 'Unbekannt'}\n${fmtDate(info.booking.rental_from)} – ${fmtDate(info.booking.rental_to)}\n${info.booking.delivery_mode === 'abholung' ? 'Abholung' : 'Versand'}`;
      if (info.bufferLabel) content = `${info.bufferLabel}\n${content}`;
    } else if (info.type === 'maintenance') {
      content = 'Wartung';
    } else if (info.type === 'blocked') {
      content = `Gesperrt am ${fmtDate(dateStr)}`;
    }

    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, content });
  }

  // Zubehör-Zellinfo
  function getAccCellInfo(acc: GanttAccessory, dateStr: string, buf: BufferDays): { type: string; count: number; total: number; bookings: GanttSimpleBooking[] } {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isPast = new Date(dateStr) < today;

    const matchedBookings: GanttSimpleBooking[] = [];
    for (const b of acc.bookings) {
      const bMode = b.delivery_mode ?? 'versand';
      const before = bMode === 'abholung' ? buf.abholung_before : buf.versand_before;
      const after = bMode === 'abholung' ? buf.abholung_after : buf.versand_after;
      const fromDate = new Date(b.rental_from);
      const toDate = new Date(b.rental_to);
      fromDate.setDate(fromDate.getDate() - before);
      toDate.setDate(toDate.getDate() + after);
      const effFrom = fromDate.toISOString().split('T')[0];
      const effTo = toDate.toISOString().split('T')[0];
      if (effFrom <= dateStr && effTo >= dateStr) matchedBookings.push(b);
    }

    const count = matchedBookings.length;
    const free = acc.available_qty - count;
    let type = 'free';
    if (free <= 0) type = 'booked';
    else if (count > 0) type = 'partial';
    if (isPast && count === 0) type = 'past';
    return { type, count, total: acc.available_qty, bookings: matchedBookings };
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'kameras', label: 'Kameras', count: ganttData?.products?.length ?? shopProducts.length },
    { key: 'sets', label: 'Sets', count: ganttData?.sets?.length ?? 0 },
    { key: 'zubehoer', label: 'Zubehör', count: ganttData?.accessories?.length ?? 0 },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-full">
      <AdminBackLink label="Zurück" />
      <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: 'white' }}>
        Verfügbarkeit
      </h1>
      <p className="text-sm font-body mb-6" style={{ color: '#64748b' }}>
        Einzelkamera-Tracking mit Gantt-Kalender
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl max-w-md" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-heading font-semibold transition-all ${
              tab === t.key ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
            style={tab === t.key ? { background: '#1e293b' } : {}}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* ──────── Kameras Tab: Gantt-Kalender ──────── */}
      {tab === 'kameras' && (
        <>
          {/* Heute-Button */}
          <div className="flex items-center justify-end mb-3">
            <button onClick={scrollToToday}
              className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-gray-700"
              style={{ color: '#06b6d4', border: '1px solid #334155' }}>
              → Heute
            </button>
          </div>

          {ganttLoading ? (
            <div className="flex items-center gap-3 py-12 justify-center" style={{ color: '#64748b' }}>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Lade Verfügbarkeit…
            </div>
          ) : !ganttData || ganttData.products.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: '#64748b' }}>Keine Kameras vorhanden.</p>
          ) : (
            <div className="space-y-3">
              {/* Legende */}
              <div className="flex flex-wrap gap-4 text-[11px] font-body font-semibold mb-2" style={{ color: '#cbd5e1' }}>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#065f46' }} /> Frei</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#1d4ed8' }} /> Gebucht</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#a16207' }} /> Hinversand</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#c2410c' }} /> Rückversand</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#991b1b' }} /> Wartung</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#374151' }} /> Ausgemustert</span>
              </div>

              {ganttData.products.map((product) => {
                const isExpanded = expandedProducts.has(product.id);
                const activeUnits = product.units.filter((u) => u.status !== 'retired');
                const unitCount = activeUnits.length;

                return (
                  <div key={product.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e293b', background: '#0f172a' }}>
                    {/* Produkt-Header */}
                    <button
                      onClick={() => toggleProduct(product.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
                    >
                      <span className="text-xs transition-transform" style={{ color: '#64748b', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      <span className="font-heading font-bold text-sm" style={{ color: '#e2e8f0' }}>{product.name}</span>
                      <span className="text-xs font-body" style={{ color: '#64748b' }}>
                        ({unitCount} {unitCount === 1 ? 'Kamera' : 'Kameras'})
                      </span>
                      {product.units.length === 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400 font-semibold">
                          Keine Seriennummern
                        </span>
                      )}
                    </button>

                    {/* Gantt-Tabelle */}
                    {isExpanded && (
                      <div className="overflow-x-auto" style={{ borderTop: '1px solid #1e293b' }}>
                        {product.units.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs" style={{ color: '#64748b' }}>
                            Noch keine Kameras mit Seriennummern angelegt.
                            <br />
                            <a href={`/admin/preise/kameras/${product.id}`} className="text-blue-400 hover:underline mt-1 inline-block">
                              → Seriennummern im Kamera-Editor anlegen
                            </a>
                          </div>
                        ) : (
                          <table className="w-full text-[11px]" style={{ minWidth: `${180 + days.length * 34}px`, borderCollapse: 'collapse' }}>
                            <thead>
                              {/* Monats-Balken */}
                              <tr>
                                <th rowSpan={3} className="text-left px-3 py-2 font-heading font-semibold sticky left-0 z-20"
                                  style={{ color: '#64748b', background: '#0f172a', minWidth: '160px', borderBottom: '1px solid #1e293b' }}>
                                  Seriennummer
                                </th>
                                {monthGroups.map((g, gi) => (
                                  <th key={`m-${g.label}`} colSpan={g.span}
                                    className="text-center font-heading font-bold text-[10px] py-1.5"
                                    style={{
                                      color: '#e2e8f0',
                                      background: gi % 2 === 0 ? '#1e293b' : '#0f172a',
                                      borderLeft: gi > 0 ? '2px solid #334155' : 'none',
                                    }}>
                                    {g.label}
                                  </th>
                                ))}
                              </tr>
                              {/* KW-Balken */}
                              <tr>
                                {kwGroups.map((g, gi) => (
                                  <th key={`kw-${g.kw}-${gi}`} colSpan={g.span}
                                    className="text-center font-heading font-bold text-[9px] py-1"
                                    style={{
                                      color: gi % 2 === 0 ? '#94a3b8' : '#64748b',
                                      background: gi % 2 === 0 ? '#0f172a' : '#131c2e',
                                      borderLeft: gi > 0 ? '1px solid #334155' : 'none',
                                    }}>
                                    KW {g.kw}
                                  </th>
                                ))}
                              </tr>
                              {/* Tage */}
                              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                                {days.map((d) => {
                                  const kwIdx = kwGroups.findIndex((g) => g.kw === d.kw);
                                  const weekBg = kwIdx % 2 === 0 ? '#0f172a' : '#131c2e';
                                  return (
                                    <th key={d.dateStr}
                                      ref={d.isToday ? todayColRef : undefined}
                                      className="text-center px-0 py-1 font-heading font-semibold"
                                      style={{
                                        color: d.isToday ? '#f59e0b' : d.isWeekend ? '#475569' : '#64748b',
                                        minWidth: '34px',
                                        background: weekBg,
                                        borderBottom: d.isToday ? '2px solid #f59e0b' : '1px solid #1e293b',
                                        borderLeft: d.isFirstOfMonth ? '2px solid #334155' : 'none',
                                      }}>
                                      <div className="text-[9px]">{d.dayName}</div>
                                      <div style={{ fontWeight: d.isToday ? 800 : 600 }}>{d.day}</div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {product.units.map((unit) => (
                                <tr key={unit.id} style={{ borderBottom: '1px solid #1e293b/50' }}>
                                  <td className="px-3 py-1.5 font-mono font-semibold sticky left-0 z-10 whitespace-nowrap"
                                    style={{ color: unit.status === 'retired' ? '#475569' : '#cbd5e1', background: '#0f172a' }}>
                                    {unit.serial_number}
                                    {unit.label && <span className="ml-1 text-[9px] font-normal" style={{ color: '#64748b' }}>({unit.label})</span>}
                                    {unit.status === 'maintenance' && <span className="ml-1 text-[9px] text-red-400">⚠</span>}
                                    {unit.status === 'retired' && <span className="ml-1 text-[9px] text-gray-500">✕</span>}
                                  </td>
                                  {days.map((d) => {
                                    const info = getCellInfo(unit, d.dateStr, product, ganttData.bufferDays);
                                    const cs = cellStyle(info);
                                    return (
                                      <td
                                        key={d.dateStr}
                                        className="px-0 py-0.5 text-center"
                                        onMouseEnter={(e) => handleCellHover(e, info, d.dateStr)}
                                        onMouseLeave={() => setTooltip(null)}
                                        onClick={() => {
                                          if (info.booking) {
                                            window.open(`/admin/buchungen/${info.booking.id}`, '_blank');
                                          }
                                        }}
                                        style={{
                                          ...cs,
                                          cursor: info.booking ? 'pointer' : 'default',
                                          boxShadow: d.isToday ? 'inset 0 0 0 1.5px #f59e0b' : 'none',
                                        }}
                                      >
                                        <div className="text-[9px] leading-tight truncate px-0.5" style={{ color: cs.color }}>
                                          {info.type === 'booked' && info.booking && (
                                            <span title={info.booking.customer_name}>
                                              {info.booking.customer_name?.split(' ')[0]?.slice(0, 6) || '…'}
                                            </span>
                                          )}
                                          {info.type === 'buffer-hin' && <span style={{ fontSize: '8px' }}>▼ HIN</span>}
                                          {info.type === 'buffer-rueck' && <span style={{ fontSize: '8px' }}>▲ RÜ</span>}
                                          {info.type === 'maintenance' && <span style={{ fontSize: '8px' }}>⚠</span>}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ──────── Zubehör Tab: Gantt ──────── */}
      {tab === 'zubehoer' && (
        <>
          {/* Heute-Button */}
          <div className="flex items-center justify-end mb-3">
            <button onClick={scrollToToday}
              className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-gray-700"
              style={{ color: '#06b6d4', border: '1px solid #334155' }}>
              → Heute
            </button>
          </div>

          {ganttLoading ? (
            <div className="flex items-center gap-3 py-12 justify-center" style={{ color: '#64748b' }}>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Lade Verfügbarkeit…
            </div>
          ) : !ganttData || ganttData.accessories.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: '#64748b' }}>Kein Zubehör vorhanden.</p>
          ) : (
            <div className="space-y-3">
              {/* Legende */}
              <div className="flex flex-wrap gap-4 text-[11px] font-body font-semibold mb-2" style={{ color: '#cbd5e1' }}>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#065f46' }} /> Alle frei</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#a16207' }} /> Teilweise belegt</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#1d4ed8' }} /> Ausgebucht</span>
              </div>

              {ganttData.accessories.map((acc) => (
                <div key={acc.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e293b', background: '#0f172a' }}>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <span className="font-heading font-bold text-sm" style={{ color: '#e2e8f0' }}>{acc.name}</span>
                    <span className="text-xs font-body" style={{ color: '#64748b' }}>({acc.available_qty} Stück)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#1e293b', color: '#94a3b8' }}>{acc.category}</span>
                  </div>
                  <div className="overflow-x-auto" style={{ borderTop: '1px solid #1e293b' }}>
                    <table className="w-full text-[11px]" style={{ minWidth: `${80 + days.length * 36}px`, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th className="text-left px-3 py-1 font-heading font-semibold sticky left-0 z-10" style={{ color: '#64748b', background: '#0f172a', minWidth: '70px' }}></th>
                          {kwGroups.map((g, gi) => (
                            <th key={`kw-${g.kw}-${gi}`} colSpan={g.span} className="text-center font-heading font-bold text-[9px] py-1"
                              style={{ color: gi % 2 === 0 ? '#94a3b8' : '#64748b', background: gi % 2 === 0 ? '#0f172a' : '#131c2e', borderLeft: gi > 0 ? '1px solid #334155' : 'none' }}>
                              KW {g.kw}
                            </th>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #1e293b' }}>
                          <th className="sticky left-0 z-10" style={{ background: '#0f172a' }}></th>
                          {days.map((d) => (
                            <th key={d.dateStr} className="text-center px-0 py-1 font-heading font-semibold"
                              style={{ color: d.isToday ? '#f59e0b' : d.isWeekend ? '#475569' : '#64748b', minWidth: '34px', borderBottom: d.isToday ? '2px solid #f59e0b' : '1px solid #1e293b' }}>
                              <div className="text-[9px]">{d.dayName}</div>
                              <div style={{ fontWeight: d.isToday ? 800 : 600 }}>{d.day}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-3 py-1.5 font-semibold sticky left-0 z-10 whitespace-nowrap text-[10px]" style={{ color: '#94a3b8', background: '#0f172a' }}>
                            Belegt
                          </td>
                          {days.map((d) => {
                            const info = getAccCellInfo(acc, d.dateStr, ganttData.bufferDays);
                            const bg = info.type === 'past' ? '#1e293b'
                              : info.type === 'booked' ? '#1d4ed8'
                              : info.count > 0 ? '#a16207'
                              : '#065f46';
                            const color = info.type === 'past' ? '#475569'
                              : info.type === 'booked' ? '#ffffff'
                              : info.count > 0 ? '#fef3c7'
                              : '#6ee7b7';
                            return (
                              <td key={d.dateStr} className="px-0 py-0.5 text-center"
                                onMouseEnter={(e) => {
                                  if (info.type === 'past' || info.count === 0) { setTooltip(null); return; }
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const names = info.bookings.map((b) => b.customer_name || '–').join(', ');
                                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, content: `${info.count} von ${info.total} belegt\n${names}` });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                                style={{ background: bg, color, boxShadow: d.isToday ? 'inset 0 0 0 1.5px #f59e0b' : 'none' }}>
                                <div className="text-[9px] leading-tight font-semibold">
                                  {info.type !== 'past' && info.count > 0 ? `${info.count}/${info.total}` : ''}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ──────── Sets Tab: Gantt ──────── */}
      {tab === 'sets' && (
        <>
          <div className="flex items-center justify-end mb-3">
            <button onClick={scrollToToday}
              className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-gray-700"
              style={{ color: '#06b6d4', border: '1px solid #334155' }}>
              → Heute
            </button>
          </div>

          {ganttLoading ? (
            <div className="flex items-center gap-3 py-12 justify-center" style={{ color: '#64748b' }}>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Lade Verfügbarkeit…
            </div>
          ) : !ganttData || ganttData.sets.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: '#64748b' }}>Keine Sets vorhanden.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 text-[11px] font-body font-semibold mb-2" style={{ color: '#cbd5e1' }}>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#065f46' }} /> Frei</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#1d4ed8' }} /> Gebucht</span>
              </div>

              {ganttData.sets.map((s) => (
                <div key={s.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e293b', background: '#0f172a' }}>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <span className="font-heading font-bold text-sm" style={{ color: '#e2e8f0' }}>{s.name}</span>
                    {s.badge && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#1e293b', color: '#94a3b8' }}>{s.badge}</span>}
                    <span className="text-xs font-body" style={{ color: '#64748b' }}>({s.bookings.length} Buchungen)</span>
                  </div>
                  <div className="overflow-x-auto" style={{ borderTop: '1px solid #1e293b' }}>
                    <table className="w-full text-[11px]" style={{ minWidth: `${80 + days.length * 36}px`, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th className="text-left px-3 py-1 font-heading font-semibold sticky left-0 z-10" style={{ color: '#64748b', background: '#0f172a', minWidth: '70px' }}></th>
                          {kwGroups.map((g, gi) => (
                            <th key={`kw-${g.kw}-${gi}`} colSpan={g.span} className="text-center font-heading font-bold text-[9px] py-1"
                              style={{ color: gi % 2 === 0 ? '#94a3b8' : '#64748b', background: gi % 2 === 0 ? '#0f172a' : '#131c2e', borderLeft: gi > 0 ? '1px solid #334155' : 'none' }}>
                              KW {g.kw}
                            </th>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #1e293b' }}>
                          <th className="sticky left-0 z-10" style={{ background: '#0f172a' }}></th>
                          {days.map((d) => (
                            <th key={d.dateStr} className="text-center px-0 py-1 font-heading font-semibold"
                              style={{ color: d.isToday ? '#f59e0b' : d.isWeekend ? '#475569' : '#64748b', minWidth: '34px', borderBottom: d.isToday ? '2px solid #f59e0b' : '1px solid #1e293b' }}>
                              <div className="text-[9px]">{d.dayName}</div>
                              <div style={{ fontWeight: d.isToday ? 800 : 600 }}>{d.day}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-3 py-1.5 font-semibold sticky left-0 z-10 whitespace-nowrap text-[10px]" style={{ color: '#94a3b8', background: '#0f172a' }}>
                            Status
                          </td>
                          {days.map((d) => {
                            const today = new Date(); today.setHours(0, 0, 0, 0);
                            const isPast = new Date(d.dateStr) < today;
                            let isBooked = false;
                            const matchedBookings: GanttSimpleBooking[] = [];
                            for (const b of s.bookings) {
                              const bMode = b.delivery_mode ?? 'versand';
                              const before = bMode === 'abholung' ? ganttData.bufferDays.abholung_before : ganttData.bufferDays.versand_before;
                              const after = bMode === 'abholung' ? ganttData.bufferDays.abholung_after : ganttData.bufferDays.versand_after;
                              const fromDate = new Date(b.rental_from); fromDate.setDate(fromDate.getDate() - before);
                              const toDate = new Date(b.rental_to); toDate.setDate(toDate.getDate() + after);
                              if (fromDate.toISOString().split('T')[0] <= d.dateStr && toDate.toISOString().split('T')[0] >= d.dateStr) {
                                isBooked = true;
                                matchedBookings.push(b);
                              }
                            }
                            const bg = isPast && !isBooked ? '#1e293b' : isBooked ? (isPast ? '#1e3a5f' : '#1d4ed8') : '#065f46';
                            const color = isPast && !isBooked ? '#475569' : isBooked ? '#ffffff' : '#6ee7b7';
                            return (
                              <td key={d.dateStr} className="px-0 py-0.5 text-center"
                                onMouseEnter={(e) => {
                                  if (isPast || !isBooked) { setTooltip(null); return; }
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const names = matchedBookings.map((b) => b.customer_name || '–').join(', ');
                                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, content: `${s.name}\n${names}` });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                                style={{ background: bg, color, boxShadow: d.isToday ? 'inset 0 0 0 1.5px #f59e0b' : 'none' }}>
                                <div className="text-[9px] leading-tight font-semibold">
                                  {!isPast && isBooked ? matchedBookings.length.toString() : ''}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 rounded-lg text-[11px] font-body shadow-xl pointer-events-none whitespace-pre-line"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}


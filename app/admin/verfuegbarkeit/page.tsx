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
  is_test?: boolean;
  /** Individuelle Override-Datumsfelder (haben Vorrang vor bufferDays). */
  ship_date_override?: string | null;
  return_due_date_override?: string | null;
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
  /** product_ids dieser Kameras, mit denen das Zubehoer kompatibel ist.
   *  Leeres Array = mit allen Kameras kompatibel. */
  compatible_product_ids?: string[];
  compatible_product_names?: string[];
  bookings: GanttSimpleBooking[];
}

interface GanttSimpleBooking {
  id: string;
  rental_from: string;
  rental_to: string;
  customer_name: string;
  delivery_mode: string;
  status?: string;
  /** Anzahl belegter Exemplare dieser Buchung (qty-aware). Sets/Legacy = 1. */
  qty?: number;
}

interface GanttSet {
  id: string;
  name: string;
  badge: string | null;
  available: boolean;
  accessory_items: { accessory_id: string; qty: number }[];
  product_ids?: string[];
  product_names?: string[];
  bookings: GanttSimpleBooking[];
}

type DayCellType =
  | 'free'
  | 'booked'
  | 'booked-pending'
  | 'buffer-hin'
  | 'buffer-hin-pending'
  | 'buffer-rueck'
  | 'buffer-rueck-pending'
  | 'maintenance'
  | 'retired'
  | 'blocked'
  | 'past';

interface DayCellInfo {
  type: DayCellType;
  booking?: GanttBooking;
  bufferLabel?: string;
}

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

type Tab = 'kameras' | 'sets' | 'zubehoer';

// Gepufferte Gesamtspanne einer Buchung [Versand/Abholung … Rückversand/Rückgabe]
// als YYYY-MM-DD-Strings. Override-Datum hat Vorrang vor bufferDays.
function getBookingSpan(b: GanttBooking, buf: BufferDays): { start: string; end: string } {
  const bMode = b.delivery_mode ?? 'versand';
  const before = bMode === 'abholung' ? buf.abholung_before : buf.versand_before;
  const after = bMode === 'abholung' ? buf.abholung_after : buf.versand_after;

  let start: string;
  if (b.ship_date_override) {
    start = b.ship_date_override.slice(0, 10);
  } else {
    const d = new Date(b.rental_from);
    d.setDate(d.getDate() - before);
    start = d.toISOString().split('T')[0];
  }
  let end: string;
  if (b.return_due_date_override) {
    end = b.return_due_date_override.slice(0, 10);
  } else {
    const d = new Date(b.rental_to);
    d.setDate(d.getDate() + after);
    end = d.toISOString().split('T')[0];
  }
  return { start, end };
}

/* ─── Haupt-Komponente ──────────────────────────────────────────────────── */

export default function AdminVerfuegbarkeitPage() {
  const { products: shopProducts } = useProducts();
  const [tab, setTab] = useState<Tab>('kameras');
  // Kamera-Filter fuer Sets-/Zubehoer-Tab. Leerstring = alle Kameras.
  const [cameraFilter, setCameraFilter] = useState<string>('');

  // Gantt-State — durchgehend scrollbar (3 Monate zurück + 6 Monate voraus)
  const MONTHS_BACK = 3;
  const MONTHS_FORWARD = 6;
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [ganttLoading, setGanttLoading] = useState(true);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

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

  // Zum heutigen Tag scrollen — alle overflow-Container des aktiven Tabs.
  // Sets-/Zubehoer-Tab werden conditional gerendert und existieren beim
  // Initial-Load noch nicht im DOM, daher pro Tab einmal scrollen, sobald
  // er sichtbar wird.
  const scrolledTabs = useRef<Set<Tab>>(new Set());
  useEffect(() => {
    if (ganttLoading || !ganttData) return;
    if (scrolledTabs.current.has(tab)) return;
    scrolledTabs.current.add(tab);
    // 200ms reichen, bis die neu eingehängten data-gantt-scroll-Container
    // im DOM sind. setTimeout-Handle wird aufgeräumt, falls der Tab vorher
    // wieder wechselt.
    const t = setTimeout(() => scrollToTodayAll(), 200);
    return () => clearTimeout(t);
  }, [ganttLoading, ganttData, tab]);

  function scrollToTodayAll() {
    // Alle Zellen mit dem heutigen Datum finden (über data-attribute)
    const todayCells = document.querySelectorAll('[data-today="true"]');
    const scrollContainers = document.querySelectorAll('[data-gantt-scroll]');

    // Jeden Scroll-Container zum heutigen Tag zentrieren
    scrollContainers.forEach((container) => {
      const todayCell = container.querySelector('[data-today="true"]') as HTMLElement | null;
      if (todayCell) {
        const containerRect = container.getBoundingClientRect();
        const cellRect = todayCell.getBoundingClientRect();
        const scrollLeft = container.scrollLeft + (cellRect.left - containerRect.left) - (containerRect.width / 2) + (cellRect.width / 2);
        container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
      }
    });

    // Falls keine Container gefunden, Fallback auf scrollIntoView
    if (scrollContainers.length === 0 && todayCells.length > 0) {
      todayCells[0]?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
    }
  }

  function scrollToToday() {
    scrollToTodayAll();
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

  // Virtuelle Unit-Zuteilung pro Produkt: nicht zugeordnete Buchungen
  // (unit_id === null) werden per Greedy-Interval-Packing auf konkrete
  // Unit-Zeilen verteilt — jeder Eintrag belegt genau EINE freie Zeile statt
  // (wie früher) auf allen Zeilen zu erscheinen. So stimmt der Gantt mit dem
  // Kunden-Kalender überein (1 belegt = 1 Zeile belegt). Echte Überbuchungen,
  // für die keine freie Zeile bleibt, landen in `leftovers` (Konflikt-Fallback).
  const cameraAssignment = useMemo(() => {
    const result = new Map<string, { byUnit: Map<string, GanttBooking[]>; leftovers: GanttBooking[] }>();
    if (!ganttData) return result;
    const buf = ganttData.bufferDays;
    for (const product of ganttData.products) {
      const byUnit = new Map<string, GanttBooking[]>();
      const occupied: Record<string, { start: string; end: string }[]> = {};
      const pushBooking = (unitId: string, b: GanttBooking) => {
        const arr = byUnit.get(unitId);
        if (arr) arr.push(b);
        else byUnit.set(unitId, [b]);
      };

      // Bereits zugewiesene Buchungen seeden.
      for (const b of product.bookings) {
        if (!b.unit_id) continue;
        pushBooking(b.unit_id, b);
        (occupied[b.unit_id] ||= []).push(getBookingSpan(b, buf));
      }

      // Unzugeordnete Einträge der Reihe nach (nach Mietbeginn) auf die erste
      // Unit-Zeile legen, deren belegte Spannen nicht überlappen.
      const usableUnits = product.units.filter(
        (u) => u.status !== 'retired' && u.status !== 'maintenance',
      );
      const leftovers: GanttBooking[] = [];
      const unassigned = product.bookings
        .filter((b) => !b.unit_id)
        .slice()
        .sort((a, b) => (a.rental_from < b.rental_from ? -1 : a.rental_from > b.rental_from ? 1 : 0));
      for (const b of unassigned) {
        const span = getBookingSpan(b, buf);
        let placed = false;
        for (const u of usableUnits) {
          const occ = (occupied[u.id] ||= []);
          const overlaps = occ.some((o) => o.start <= span.end && span.start <= o.end);
          if (!overlaps) {
            occ.push(span);
            pushBooking(u.id, b);
            placed = true;
            break;
          }
        }
        if (!placed) leftovers.push(b);
      }

      result.set(product.id, { byUnit, leftovers });
    }
    return result;
  }, [ganttData]);

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

    // Real + virtuell dieser Unit zugewiesene Buchungen prüfen
    // (cameraAssignment verteilt unzugeordnete Buchungen auf genau eine Zeile).
    const assignment = cameraAssignment.get(product.id);
    const unitBookings = assignment?.byUnit.get(unit.id) ?? [];
    for (const b of unitBookings) {
      const hit = matchBookingDay(b, dateStr, buf);
      if (hit) return hit;
    }

    // Nur echte Überbuchungen (keine freie Zeile gefunden) auf allen Zeilen
    // sichtbar machen — als Konflikt-Hinweis.
    for (const b of assignment?.leftovers ?? []) {
      const hit = matchBookingDay(b, dateStr, buf);
      if (hit) return hit;
    }

    return { type: isPast ? 'past' : 'free' };
  }

  function matchBookingDay(b: GanttBooking, dateStr: string, buf: BufferDays): DayCellInfo | null {
    const bMode = b.delivery_mode ?? 'versand';
    const { start: bufStartStr, end: bufEndStr } = getBookingSpan(b, buf);

    const isPending = b.status === 'awaiting_payment';

    if (dateStr >= b.rental_from && dateStr <= b.rental_to) {
      return { type: isPending ? 'booked-pending' : 'booked', booking: b };
    }
    if (dateStr >= bufStartStr && dateStr < b.rental_from) {
      const label = bMode === 'abholung' ? 'Abholung' : 'Hinversand';
      return { type: isPending ? 'buffer-hin-pending' : 'buffer-hin', booking: b, bufferLabel: label };
    }
    if (dateStr > b.rental_to && dateStr <= bufEndStr) {
      const label = bMode === 'abholung' ? 'Rückgabe' : 'Rückversand';
      return { type: isPending ? 'buffer-rueck-pending' : 'buffer-rueck', booking: b, bufferLabel: label };
    }
    return null;
  }

  // Zellenfarbe — kräftige, gut unterscheidbare Farben auf dunklem Hintergrund
  function cellStyle(info: DayCellInfo): React.CSSProperties {
    const base: React.CSSProperties = (() => {
      switch (info.type) {
        case 'free': return { background: '#065f46', color: '#6ee7b7' };           // kräftiges Grün
        case 'booked': return { background: '#1d4ed8', color: '#ffffff' };          // kräftiges Blau
        case 'booked-pending': return { background: '#7c3aed', color: '#ffffff' }; // Lila (Zahlung offen)
        case 'buffer-hin': return { background: '#a16207', color: '#fef3c7' };      // kräftiges Gelb/Gold
        case 'buffer-hin-pending': return { background: '#6d28d9', color: '#ddd6fe' }; // Lila (Hinversand, Zahlung offen)
        case 'buffer-rueck': return { background: '#c2410c', color: '#fed7aa' };    // kräftiges Orange
        case 'buffer-rueck-pending': return { background: '#5b21b6', color: '#ddd6fe' }; // Lila (Rückversand, Zahlung offen)
        case 'maintenance': return { background: '#991b1b', color: '#fca5a5' };     // kräftiges Rot
        case 'retired': return { background: '#374151', color: '#9ca3af' };         // Grau
        case 'blocked': return { background: '#7f1d1d', color: '#fca5a5' };         // Dunkelrot
        case 'past': return { background: '#1e293b', color: '#475569' };            // Dezent dunkel
        default: return {};
      }
    })();
    // Test-Buchungen visuell markieren: pinker outline + diagonales Streifen-Overlay.
    if (info.booking?.is_test) {
      return {
        ...base,
        outline: '2px dashed #ec4899',
        outlineOffset: '-2px',
        backgroundImage: `${base.background ? '' : ''}repeating-linear-gradient(45deg, transparent 0 6px, rgba(236,72,153,0.18) 6px 12px)`,
      };
    }
    return base;
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
      const pendingPrefix = info.booking.status === 'awaiting_payment' ? '⏳ Zahlung ausstehend\n' : '';
      content = `${pendingPrefix}${info.booking.id}${info.booking.is_test ? ' [TEST]' : ''}\n${info.booking.customer_name || 'Unbekannt'}\n${fmtDate(info.booking.rental_from)} – ${fmtDate(info.booking.rental_to)}\n${info.booking.delivery_mode === 'abholung' ? 'Abholung' : 'Versand'}`;
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

    // qty-aware: eine Buchung kann mehrere Exemplare belegen (Mengen-/
    // Multi-Kamera-Buchung). Fallback 1 fuer Legacy-/Set-Eintraege ohne qty.
    const count = matchedBookings.reduce((sum, b) => sum + (b.qty ?? 1), 0);
    const free = acc.available_qty - count;
    let type = 'free';
    if (free <= 0) type = 'booked';
    else if (count > 0) type = 'partial';
    if (isPast && count === 0) type = 'past';
    return { type, count, total: acc.available_qty, bookings: matchedBookings };
  }

  // Gefilterte Sets/Zubehoer nach Kamera-Auswahl.
  // - Sets: matcht ueber `product_ids` (Sets ohne Kamera-Zuordnung fallen raus,
  //   weil sie ohnehin keiner Kamera helfen).
  // - Zubehoer: matcht ueber `compatible_product_ids` ODER leere Liste (= mit
  //   allen Kameras kompatibel, immer anzeigen).
  const filteredSets = useMemo(() => {
    if (!ganttData) return [];
    if (!cameraFilter) return ganttData.sets;
    return ganttData.sets.filter((s) =>
      Array.isArray(s.product_ids) && s.product_ids.includes(cameraFilter),
    );
  }, [ganttData, cameraFilter]);

  const filteredAccessories = useMemo(() => {
    if (!ganttData) return [];
    if (!cameraFilter) return ganttData.accessories;
    return ganttData.accessories.filter((a) => {
      const ids = a.compatible_product_ids;
      if (!Array.isArray(ids) || ids.length === 0) return true; // alle Kameras kompatibel
      return ids.includes(cameraFilter);
    });
  }, [ganttData, cameraFilter]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'kameras', label: 'Kameras', count: ganttData?.products?.length ?? shopProducts.length },
    { key: 'sets', label: 'Sets', count: cameraFilter ? filteredSets.length : (ganttData?.sets?.length ?? 0) },
    { key: 'zubehoer', label: 'Zubehör', count: cameraFilter ? filteredAccessories.length : (ganttData?.accessories?.length ?? 0) },
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

      {/* Kamera-Filter (nur Sets-/Zubehoer-Tab). Zeigt nur Eintraege, die zur
          gewaehlten Kamera passen. Bei Zubehoer: leeres compatible_product_ids
          = mit allen Kameras kompatibel, wird also nie weggefiltert. */}
      {(tab === 'sets' || tab === 'zubehoer') && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-xs font-heading font-semibold" style={{ color: '#94a3b8' }}>
            Filter nach Kamera:
          </label>
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-body"
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #334155',
              minWidth: '220px',
            }}
          >
            <option value="">Alle Kameras</option>
            {shopProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {cameraFilter && (
            <button
              type="button"
              onClick={() => setCameraFilter('')}
              className="px-2.5 py-1 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-gray-700"
              style={{ color: '#cbd5e1', border: '1px solid #334155' }}
            >
              ✕ Filter zurücksetzen
            </button>
          )}
        </div>
      )}

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
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#7c3aed' }} /> ⏳ Zahlung offen</span>
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
                      <div className="overflow-x-auto" data-gantt-scroll style={{ borderTop: '1px solid #1e293b' }}>
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
                                      data-today={d.isToday || undefined}
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
                                          {(info.type === 'booked' || info.type === 'booked-pending') && info.booking && (
                                            <span title={info.booking.customer_name}>
                                              {info.type === 'booked-pending' && '⏳ '}
                                              {info.booking.customer_name?.split(' ')[0]?.slice(0, 6) || '…'}
                                            </span>
                                          )}
                                          {(info.type === 'buffer-hin' || info.type === 'buffer-hin-pending') && <span style={{ fontSize: '8px' }}>▼ HIN</span>}
                                          {(info.type === 'buffer-rueck' || info.type === 'buffer-rueck-pending') && <span style={{ fontSize: '8px' }}>▲ RÜ</span>}
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
          ) : filteredAccessories.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: '#64748b' }}>
              Für die ausgewählte Kamera gibt es kein kompatibles Zubehör.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Legende */}
              <div className="flex flex-wrap gap-4 text-[11px] font-body font-semibold mb-2" style={{ color: '#cbd5e1' }}>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#065f46' }} /> Alle frei</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#a16207' }} /> Teilweise belegt</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#1d4ed8' }} /> Ausgebucht</span>
              </div>

              {filteredAccessories.map((acc) => (
                <div key={acc.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e293b', background: '#0f172a' }}>
                  <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-heading font-bold text-sm" style={{ color: '#e2e8f0' }}>{acc.name}</span>
                    <span className="text-xs font-body" style={{ color: '#64748b' }}>({acc.available_qty} Stück)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#1e293b', color: '#94a3b8' }}>{acc.category}</span>
                    {/* Kompatible Kameras: leere/fehlende Liste = mit allen
                        Kameras kompatibel (gleiche Semantik wie im Buchungs-
                        flow). Sonst eine Pill pro kompatibler Kamera. */}
                    {acc.compatible_product_names && acc.compatible_product_names.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {acc.compatible_product_names.map((pn) => (
                          <span
                            key={pn}
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: '#0c4a6e', color: '#7dd3fc' }}
                          >
                            {pn}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: '#0f3a2a', color: '#6ee7b7' }}
                      >
                        Alle Kameras
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto" data-gantt-scroll style={{ borderTop: '1px solid #1e293b' }}>
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
                            <th key={d.dateStr} data-today={d.isToday || undefined} className="text-center px-0 py-1 font-heading font-semibold"
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
                                  const names = info.bookings.map((b) => `${b.status === 'awaiting_payment' ? '⏳ ' : ''}${b.customer_name || '–'}`).join(', ');
                                  const pendingCount = info.bookings.reduce((n, b) => n + (b.status === 'awaiting_payment' ? (b.qty ?? 1) : 0), 0);
                                  const pendingLine = pendingCount > 0 ? `\n${pendingCount} davon Zahlung ausstehend` : '';
                                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, content: `${info.count} von ${info.total} belegt${pendingLine}\n${names}` });
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
          ) : filteredSets.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: '#64748b' }}>
              Für die ausgewählte Kamera gibt es keine Sets.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 text-[11px] font-body font-semibold mb-2" style={{ color: '#cbd5e1' }}>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#065f46' }} /> Frei</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#1d4ed8' }} /> Gebucht</span>
              </div>

              {filteredSets.map((s) => (
                <div key={s.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e293b', background: '#0f172a' }}>
                  <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-heading font-bold text-sm" style={{ color: '#e2e8f0' }}>{s.name}</span>
                    {s.badge && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#1e293b', color: '#94a3b8' }}>{s.badge}</span>}
                    {s.product_names && s.product_names.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {s.product_names.map((pn) => (
                          <span
                            key={pn}
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: '#0c4a6e', color: '#7dd3fc' }}
                          >
                            {pn}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: '#1e293b', color: '#64748b' }}
                      >
                        Keine Kamera zugeordnet
                      </span>
                    )}
                    <span className="text-xs font-body" style={{ color: '#64748b' }}>({s.bookings.length} Buchungen)</span>
                  </div>
                  <div className="overflow-x-auto" data-gantt-scroll style={{ borderTop: '1px solid #1e293b' }}>
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
                            <th key={d.dateStr} data-today={d.isToday || undefined} className="text-center px-0 py-1 font-heading font-semibold"
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
                                  const names = matchedBookings.map((b) => `${b.status === 'awaiting_payment' ? '⏳ ' : ''}${b.customer_name || '–'}`).join(', ');
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


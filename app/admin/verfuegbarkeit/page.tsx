'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useProducts } from '@/components/ProductsProvider';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { Modal } from '@/components/admin/ui/Modal';
import { fmtDateWeekday } from '@/lib/format-utils';
import { getCached, setCached } from '@/lib/use-cached-fetch';
import { usePersistentState } from '@/lib/use-persistent-state';

const GANTT_CACHE_KEY = 'admin:availability-gantt';

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
  /** false = nicht einzeln buchbar (z.B. set-internes Zubehoer). Der
   *  Zubehoer-Tab blendet diese aus; die Set-Berechnung braucht sie. */
  available?: boolean;
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

/** Ein Bestandteil eines Sets an einem konkreten Tag. */
interface SetComponentInfo {
  accessoryId: string;
  name: string;
  /** Wie viele Stueck das Set von diesem Teil braucht. */
  needed: number;
  /** Wie viele Stueck an dem Tag frei sind (Gesamtbestand minus Belegung). */
  free: number;
  /** Wie viele Stueck an dem Tag durch Buchungen belegt sind. */
  used: number;
  /** Gesamtbestand des Teils. */
  total: number;
  /** true = Teil konnte nicht aufgeloest werden → Bestand unbekannt, gilt
   *  bewusst NICHT als „fehlt" (kein Fehlalarm bei Datenluecken). */
  unknown: boolean;
  /** Buchungen, die dieses Teil an dem Tag belegen (fuer das Detail-Fenster). */
  blockingBookings: GanttSimpleBooking[];
}

interface SetCellInfo {
  /** Wie viele komplette Sets aus dem freien Bestand noch baubar sind.
   *  null = kein Bestandteil aufloesbar → keine Aussage moeglich. */
  buildable: number | null;
  /** Bestandteile, von denen zu wenige frei sind (= kein weiteres Set baubar). */
  missing: SetComponentInfo[];
  /** Bestandteile, die MEHR belegt sind als vorhanden — echte Ueberbuchung:
   *  die bereits bestehenden Buchungen koennen nicht bedient werden. */
  overbooked: SetComponentInfo[];
  /** Alle Bestandteile (fuer das Detail-Fenster). */
  components: SetComponentInfo[];
}

type DayCellType =
  | 'free'
  | 'booked'
  | 'booked-pending'
  | 'reserved'
  | 'buffer-hin'
  | 'buffer-hin-pending'
  | 'buffer-hin-reserved'
  | 'buffer-rueck'
  | 'buffer-rueck-pending'
  | 'buffer-rueck-reserved'
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

/**
 * Gepufferte Spanne einer Zubehoer-/Set-Buchung als YYYY-MM-DD-Strings.
 * Bewusst OHNE Override-Datumsfelder: die Gantt-API liefert `ship_date_override`
 * / `return_due_date_override` nur fuer Kamera-Buchungen mit (Zubehoer-/Set-
 * Overlays haben sie nicht) — identisch zum bisherigen Verhalten.
 */
function getSimpleBookingSpan(b: GanttSimpleBooking, buf: BufferDays): { start: string; end: string } {
  const bMode = b.delivery_mode ?? 'versand';
  const before = bMode === 'abholung' ? buf.abholung_before : buf.versand_before;
  const after = bMode === 'abholung' ? buf.abholung_after : buf.versand_after;
  // WICHTIG `setUTCDate` statt `setDate`: `new Date('YYYY-MM-DD')` ist
  // UTC-Mitternacht. Lokale Tagesarithmetik darauf verschiebt das Ergebnis um
  // einen Tag, sobald die Spanne ueber eine Sommer-/Winterzeit-Umstellung
  // laeuft (z.B. rental_from 26.10. minus 2 Puffertage ergab den 23.10. statt
  // den 24.10.) — der Puffer war dann einen Tag zu frueh als belegt markiert.
  const from = new Date(b.rental_from);
  from.setUTCDate(from.getUTCDate() - before);
  const to = new Date(b.rental_to);
  to.setUTCDate(to.getUTCDate() + after);
  return { start: from.toISOString().split('T')[0], end: to.toISOString().split('T')[0] };
}

/* ─── Haupt-Komponente ──────────────────────────────────────────────────── */

export default function AdminVerfuegbarkeitPage() {
  const { products: shopProducts } = useProducts();
  const [tab, setTab] = usePersistentState<Tab>('admin:verfuegbarkeit:tab', 'kameras');
  // Kamera-Filter fuer Sets-/Zubehoer-Tab. Leerstring = alle Kameras.
  const [cameraFilter, setCameraFilter] = usePersistentState<string>('admin:verfuegbarkeit:cameraFilter', '');
  // Freitext-Suche (pro aktivem Tab angewendet).
  const [search, setSearch] = usePersistentState('admin:verfuegbarkeit:search', '');
  // Mehrfach-Auswahl-Filter (leer = alle). Pro Tab eigene Menge.
  // NICHT persistiert: Set<string> → JSON.stringify(Set) = {} (nicht wiederherstellbar).
  const [camModelFilter, setCamModelFilter] = useState<Set<string>>(new Set());
  const [accCategoryFilter, setAccCategoryFilter] = useState<Set<string>>(new Set());
  const [setBadgeFilter, setSetBadgeFilter] = useState<Set<string>>(new Set());
  // Pro Zeile aufgeklappte Kamera-Pills (sonst auf eine Zeile geklemmt, damit
  // alle Zeilen gleich hoch sind).
  const [expandedAccRows, setExpandedAccRows] = useState<Set<string>>(new Set());
  const [expandedSetRows, setExpandedSetRows] = useState<Set<string>>(new Set());

  // Gantt-State — durchgehend scrollbar (3 Monate zurück + 6 Monate voraus)
  const MONTHS_BACK = 3;
  const MONTHS_FORWARD = 6;
  const [ganttData, setGanttData] = useState<GanttData | null>(() => getCached<GanttData>(GANTT_CACHE_KEY) ?? null);
  const [ganttLoading, setGanttLoading] = useState(() => getCached<GanttData>(GANTT_CACHE_KEY) === undefined);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  // Detail-Fenster: alle Bestandteile eines Sets an einem konkreten Tag.
  const [setModal, setSetModal] = useState<{ set: GanttSet; dateStr: string } | null>(null);

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
    // Spinner nur beim ersten Laden (kein Cache) — Wiederbesuch zeigt sofort.
    if (getCached<GanttData>(GANTT_CACHE_KEY) === undefined) setGanttLoading(true);
    try {
      const res = await fetch(`/api/admin/availability-gantt?from=${rangeFrom}&to=${rangeTo}`);
      const data = await res.json();
      setGanttData(data);
      setCached(GANTT_CACHE_KEY, data);
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

  // Kameras mit Seriennummern (erscheinen als Zeilen im gemeinsamen Kalender)
  // bzw. ohne (werden nur als Hinweis unter dem Kalender gelistet).
  const cameraProducts = useMemo(
    () => (ganttData?.products ?? []).filter((p) => p.units.length > 0),
    [ganttData],
  );
  const emptyCameraProducts = useMemo(
    () => (ganttData?.products ?? []).filter((p) => p.units.length === 0),
    [ganttData],
  );

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

    const isReserved = b.status === 'reserved';
    const isPending = b.status === 'awaiting_payment' || b.status === 'pending_verification';

    if (dateStr >= b.rental_from && dateStr <= b.rental_to) {
      return { type: isReserved ? 'reserved' : isPending ? 'booked-pending' : 'booked', booking: b };
    }
    if (dateStr >= bufStartStr && dateStr < b.rental_from) {
      const label = bMode === 'abholung' ? 'Abholung' : 'Hinversand';
      return { type: isReserved ? 'buffer-hin-reserved' : isPending ? 'buffer-hin-pending' : 'buffer-hin', booking: b, bufferLabel: label };
    }
    if (dateStr > b.rental_to && dateStr <= bufEndStr) {
      const label = bMode === 'abholung' ? 'Rückgabe' : 'Rückversand';
      return { type: isReserved ? 'buffer-rueck-reserved' : isPending ? 'buffer-rueck-pending' : 'buffer-rueck', booking: b, bufferLabel: label };
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
        case 'reserved': return { background: '#0891b2', color: '#ecfeff' };        // Cyan (48h-Reservierung)
        case 'buffer-hin': return { background: '#a16207', color: '#fef3c7' };      // kräftiges Gelb/Gold
        case 'buffer-hin-pending': return { background: '#6d28d9', color: '#ddd6fe' }; // Lila (Hinversand, Zahlung offen)
        case 'buffer-hin-reserved': return { background: '#155e75', color: '#cffafe' }; // Cyan (Hinversand, reserviert)
        case 'buffer-rueck': return { background: '#c2410c', color: '#fed7aa' };    // kräftiges Orange
        case 'buffer-rueck-pending': return { background: '#5b21b6', color: '#ddd6fe' }; // Lila (Rückversand, Zahlung offen)
        case 'buffer-rueck-reserved': return { background: '#164e63', color: '#cffafe' }; // Cyan (Rückversand, reserviert)
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

    if (info.booking && info.booking.status === 'reserved') {
      content = `🔒 Reserviert (48h)${info.booking.is_test ? ' [TEST]' : ''}\n${info.booking.customer_name || 'Kunde'}\n${fmtDate(info.booking.rental_from)} – ${fmtDate(info.booking.rental_to)}\n${info.booking.delivery_mode === 'abholung' ? 'Abholung' : 'Versand'}`;
      if (info.bufferLabel) content = `${info.bufferLabel}\n${content}`;
    } else if (info.booking) {
      const pendingPrefix = info.booking.status === 'awaiting_payment' ? '⏳ Zahlung ausstehend\n'
        : info.booking.status === 'pending_verification' ? '⏳ Wartet auf Freigabe\n' : '';
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
      const { start, end } = getSimpleBookingSpan(b, buf);
      if (start <= dateStr && end >= dateStr) matchedBookings.push(b);
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

  /* ─── Set-Verfuegbarkeit: kann das Set an einem Tag gebaut werden? ──────
   * Ein Set ist nur so verfuegbar wie sein knappstes Bestandteil. Die
   * Set-Zeile im Kalender war bisher blind dafuer (nur „gebucht ja/nein") —
   * ein gruenes Set konnte in Wahrheit unbaubar sein, weil z.B. die Karte
   * durch andere Buchungen weg war. Die Buchungen pro Zubehoer sind in der
   * Gantt-Antwort bereits qty-aware UND set-aufgeloest (Route: `addAcc`),
   * also die richtige Grundlage.
   */

  // Zubehoer-Lookup (enthaelt auch set-internes Zubehoer, siehe Route).
  const accById = useMemo(() => {
    const m = new Map<string, GanttAccessory>();
    for (const a of ganttData?.accessories ?? []) m.set(a.id, a);
    return m;
  }, [ganttData]);

  // Belegung pro Zubehoer und Tag EINMAL vorberechnen. Sonst waere die
  // Set-Zelle O(Sets × Tage × Teile × Buchungen) — bei ~270 Tagen spuerbar.
  const accUsageByDay = useMemo(() => {
    const usage = new Map<string, Map<string, number>>();
    if (!ganttData) return usage;
    const buf = ganttData.bufferDays;
    for (const acc of ganttData.accessories) {
      if (!acc.bookings || acc.bookings.length === 0) continue;
      const perDay = new Map<string, number>();
      for (const b of acc.bookings) {
        const { start, end } = getSimpleBookingSpan(b, buf);
        // Auf den geladenen Zeitraum klemmen — Buchungen ragen darueber hinaus.
        const startStr = start < rangeFrom ? rangeFrom : start;
        const endStr = end > rangeTo ? rangeTo : end;
        if (startStr > endStr) continue;
        const qty = b.qty ?? 1;
        const cur = new Date(startStr);
        for (let guard = 0; guard < 800; guard++) {
          const ds = cur.toISOString().split('T')[0];
          if (ds > endStr) break;
          perDay.set(ds, (perDay.get(ds) ?? 0) + qty);
          cur.setUTCDate(cur.getUTCDate() + 1); // UTC — siehe getSimpleBookingSpan
        }
      }
      usage.set(acc.id, perDay);
    }
    return usage;
  }, [ganttData, rangeFrom, rangeTo]);

  // Set-Zellinfo: wie viele komplette Sets sind an dem Tag noch baubar und
  // welche Bestandteile fehlen?
  const getSetCellInfo = useCallback((set: GanttSet, dateStr: string, withBookings = false): SetCellInfo => {
    const rawItems = Array.isArray(set.accessory_items) ? set.accessory_items : [];
    const buf = ganttData?.bufferDays;
    const components: SetComponentInfo[] = [];
    let buildable: number | null = null;

    // Mengen pro accessory_id zusammenfassen — ein Set kann dasselbe Teil in
    // mehreren Eintraegen fuehren; einzeln geprueft waere der Bedarf zu
    // optimistisch (jeder Eintrag rechnete gegen den vollen freien Bestand).
    // Gleiche Aggregation wie `addAcc` in der Gantt-Route.
    const neededById = new Map<string, number>();
    for (const item of rawItems) {
      if (!item?.accessory_id) continue;
      const q = typeof item.qty === 'number' && item.qty > 0 ? Math.floor(item.qty) : 1;
      neededById.set(item.accessory_id, (neededById.get(item.accessory_id) ?? 0) + q);
    }

    for (const [accessoryId, needed] of neededById) {
      const acc = accById.get(accessoryId);

      // Teil nicht aufloesbar (geloescht / Datenluecke) → „unbekannt", NICHT
      // „fehlt". Ein Fehlalarm waere schlimmer als eine fehlende Warnung.
      if (!acc) {
        components.push({
          accessoryId, name: accessoryId,
          needed, free: 0, used: 0, total: 0, unknown: true, blockingBookings: [],
        });
        continue;
      }

      const total = acc.available_qty ?? 0;
      const used = accUsageByDay.get(acc.id)?.get(dateStr) ?? 0;
      const free = Math.max(0, total - used);
      // Die belegenden Buchungen braucht nur das Detail-Fenster. Im Kalender
      // (Sets × Tage Zellen) waere der Filter ueber alle Buchungen zu teuer.
      const blockingBookings = withBookings && used > 0 && buf
        ? acc.bookings.filter((b) => {
            const { start, end } = getSimpleBookingSpan(b, buf);
            return start <= dateStr && end >= dateStr;
          })
        : [];

      components.push({ accessoryId: acc.id, name: acc.name, needed, free, used, total, unknown: false, blockingBookings });
      const possible = Math.floor(free / needed);
      buildable = buildable === null ? possible : Math.min(buildable, possible);
    }

    return {
      buildable,
      missing: components.filter((c) => !c.unknown && c.free < c.needed),
      overbooked: components.filter((c) => !c.unknown && c.used > c.total),
      components,
    };
  }, [accById, accUsageByDay, ganttData]);

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

  // Der Zubehoer-Tab zeigt weiterhin NUR einzeln buchbares Zubehoer. Die
  // Gantt-Route liefert seit der Set-Verfuegbarkeit auch set-internes Zubehoer
  // (available=false) mit — das wird hier ausgefiltert, damit der Tab
  // unveraendert bleibt.
  const bookableAccessories = useMemo(
    () => (ganttData?.accessories ?? []).filter((a) => a.available !== false),
    [ganttData],
  );

  const filteredAccessories = useMemo(() => {
    if (!cameraFilter) return bookableAccessories;
    return bookableAccessories.filter((a) => {
      const ids = a.compatible_product_ids;
      if (!Array.isArray(ids) || ids.length === 0) return true; // alle Kameras kompatibel
      return ids.includes(cameraFilter);
    });
  }, [bookableAccessories, cameraFilter]);

  // Mehrfach-Auswahl umschalten (Chip an/aus).
  function toggleFilter(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  // Auswahl-Optionen fuer die Multi-Select-Chips pro Tab.
  const camModelOptions = useMemo(
    () => cameraProducts.map((p) => ({ id: p.id, name: p.name })),
    [cameraProducts],
  );
  const accCategoryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of bookableAccessories) if (a.category) s.add(a.category);
    return [...s].sort((a, b) => a.localeCompare(b, 'de'));
  }, [bookableAccessories]);
  const setBadgeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const x of ganttData?.sets ?? []) if (x.badge) s.add(x.badge);
    return [...s].sort((a, b) => a.localeCompare(b, 'de'));
  }, [ganttData]);

  // ── Sichtbare (gefilterte) Listen: Freitext + Multi-Select kombiniert ──
  // Kameras: Modell-Multiselect + Freitext (Modellname ODER Seriennummer/Label).
  const visibleCameraGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { product: GanttProduct; units: GanttUnit[] }[] = [];
    for (const p of cameraProducts) {
      if (camModelFilter.size > 0 && !camModelFilter.has(p.id)) continue;
      const nameMatch = !q || p.name.toLowerCase().includes(q);
      const units = p.units.filter((u) => {
        if (!q || nameMatch) return true;
        return (
          (u.serial_number?.toLowerCase().includes(q) ?? false) ||
          (u.label?.toLowerCase().includes(q) ?? false)
        );
      });
      if (units.length === 0) continue;
      out.push({ product: p, units });
    }
    return out;
  }, [cameraProducts, camModelFilter, search]);

  const visibleAccessories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filteredAccessories.filter((a) => {
      if (accCategoryFilter.size > 0 && !accCategoryFilter.has(a.category)) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filteredAccessories, accCategoryFilter, search]);

  const visibleSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filteredSets.filter((s) => {
      if (setBadgeFilter.size > 0 && !(s.badge && setBadgeFilter.has(s.badge))) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filteredSets, setBadgeFilter, search]);

  // Sets nach Kamera gruppieren (wie der Kameras-Tab). Ein Set erscheint unter
  // jeder Kamera, der es zugeordnet ist (Mehrfach-Kamera-Sets stehen in mehreren
  // Gruppen). Sets ohne Kamera-Zuordnung kommen in eine eigene Gruppe ans Ende.
  // Gruppen-Reihenfolge folgt der Shop-Kamera-Reihenfolge.
  const groupedSets = useMemo(() => {
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
    const order = new Map<string, number>();
    shopProducts.forEach((p, i) => order.set(norm(p.name), i));
    const NO_CAM = '__none__';
    const groups = new Map<string, { label: string; order: number; sets: GanttSet[] }>();
    for (const s of visibleSets) {
      const names = s.product_names && s.product_names.length > 0 ? s.product_names : [NO_CAM];
      for (const nm of names) {
        let g = groups.get(nm);
        if (!g) {
          g = {
            label: nm === NO_CAM ? 'Ohne Kamera-Zuordnung' : nm,
            order: nm === NO_CAM ? 1e9 : (order.get(norm(nm)) ?? 1e8),
            sets: [],
          };
          groups.set(nm, g);
        }
        g.sets.push(s);
      }
    }
    return [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'de'));
  }, [visibleSets, shopProducts]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'kameras', label: 'Kameras', count: ganttData ? visibleCameraGroups.length : shopProducts.length },
    { key: 'sets', label: 'Sets', count: ganttData ? visibleSets.length : 0 },
    { key: 'zubehoer', label: 'Zubehör', count: ganttData ? visibleAccessories.length : 0 },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-full">
      <AdminBackLink label="Zurück" />
      <h1 className="font-heading font-bold text-2xl mb-1" style={{ color: 'var(--admin-heading)' }}>
        Verfügbarkeit
      </h1>
      <p className="text-sm font-body mb-6" style={{ color: 'var(--admin-text-dim)' }}>
        Einzelkamera-Tracking mit Gantt-Kalender
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl max-w-md" style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-heading font-semibold transition-all ${
              tab === t.key ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
            style={tab === t.key ? { background: 'var(--admin-surface-2)' } : {}}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* ──────── Filter-Leiste (in jedem Tab) ──────── */}
      {(() => {
        // Tab-abhaengige Multi-Select-Quelle + Beschriftung.
        const chips =
          tab === 'kameras'
            ? { label: 'Modell', sel: camModelFilter, set: setCamModelFilter,
                opts: camModelOptions.map((o) => ({ value: o.id, label: o.name })) }
            : tab === 'zubehoer'
            ? { label: 'Kategorie', sel: accCategoryFilter, set: setAccCategoryFilter,
                opts: accCategoryOptions.map((c) => ({ value: c, label: c })) }
            : { label: 'Badge', sel: setBadgeFilter, set: setSetBadgeFilter,
                opts: setBadgeOptions.map((b) => ({ value: b, label: b })) };
        const searchPlaceholder =
          tab === 'kameras' ? 'Modell oder Seriennummer suchen…'
          : tab === 'zubehoer' ? 'Zubehör suchen…'
          : 'Set suchen…';
        const anyActive =
          search.trim() !== '' || chips.sel.size > 0 || ((tab === 'sets' || tab === 'zubehoer') && cameraFilter !== '');
        return (
          <div className="mb-4 space-y-2.5">
            <div className="flex flex-wrap items-center gap-3">
              {/* Freitext */}
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="px-3 py-1.5 rounded-lg text-sm font-body"
                  style={{ background: 'var(--admin-input-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-input-border)', minWidth: '240px' }}
                />
              </div>
              {/* Kamera-Kompatibilitaets-Filter (nur Sets/Zubehoer) */}
              {(tab === 'sets' || tab === 'zubehoer') && (
                <select
                  value={cameraFilter}
                  onChange={(e) => setCameraFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-body"
                  style={{ background: 'var(--admin-input-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-input-border)', minWidth: '200px' }}
                >
                  <option value="">Alle Kameras</option>
                  {shopProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              {anyActive && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); chips.set(new Set()); setCameraFilter(''); }}
                  className="px-2.5 py-1 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-gray-700"
                  style={{ color: 'var(--admin-text-2)', border: '1px solid var(--admin-faint)' }}
                >
                  ✕ Filter zurücksetzen
                </button>
              )}
            </div>
            {/* Multi-Select-Chips (mehrere gleichzeitig waehlbar) */}
            {chips.opts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-heading font-semibold mr-1" style={{ color: 'var(--admin-muted)' }}>
                  {chips.label}:
                </span>
                {chips.opts.map((o) => {
                  const active = chips.sel.has(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleFilter(chips.set, o.value)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-heading font-semibold transition-colors"
                      style={
                        active
                          ? { background: '#0c4a6e', color: '#7dd3fc', border: '1px solid #0ea5e9' }
                          : { background: 'var(--admin-surface)', color: 'var(--admin-muted)', border: '1px solid var(--admin-faint)' }
                      }
                    >
                      {active ? '✓ ' : ''}{o.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ──────── Kameras Tab: Gantt-Kalender ──────── */}
      {tab === 'kameras' && (
        <>
          {/* Heute-Button */}
          <div className="flex items-center justify-end mb-3">
            <button onClick={scrollToToday}
              className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-colors hover:bg-gray-700"
              style={{ color: 'var(--admin-accent)', border: '1px solid var(--admin-faint)' }}>
              → Heute
            </button>
          </div>

          {ganttLoading ? (
            <div className="flex items-center gap-3 py-12 justify-center" style={{ color: 'var(--admin-text-dim)' }}>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Lade Verfügbarkeit…
            </div>
          ) : !ganttData || ganttData.products.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--admin-text-dim)' }}>Keine Kameras vorhanden.</p>
          ) : (
            <div className="space-y-3">
              {/* Legende */}
              <div className="flex flex-wrap gap-4 text-[11px] font-body font-semibold mb-2" style={{ color: 'var(--admin-text-2)' }}>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#065f46' }} /> Frei</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#1d4ed8' }} /> Gebucht</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#7c3aed' }} /> ⏳ Zahlung offen</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#0891b2' }} /> 🔒 Reserviert (48h)</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#a16207' }} /> Hinversand</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#c2410c' }} /> Rückversand</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#991b1b' }} /> Wartung</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#374151' }} /> Ausgemustert</span>
              </div>

              {/* EIN gemeinsamer Kalender für ALLE Kameras. Jede Zeile = ein
                  physisches Exemplar (Seriennummer), gruppiert nach Modell.
                  Eine Buchung belegt nur so viele Zeilen wie Kameras sie
                  tatsächlich enthält (Greedy-Zuteilung in cameraAssignment). */}
              {cameraProducts.length === 0 ? (
                <p className="text-center py-12 text-sm" style={{ color: 'var(--admin-text-dim)' }}>
                  Noch keine Kameras mit Seriennummern angelegt.
                </p>
              ) : visibleCameraGroups.length === 0 ? (
                <p className="text-center py-12 text-sm" style={{ color: 'var(--admin-text-dim)' }}>
                  Keine Treffer für die aktiven Filter.
                </p>
              ) : (
                <div className="rounded-xl overflow-x-auto" data-gantt-scroll style={{ border: '1px solid var(--admin-border)', background: 'var(--admin-surface)' }}>
                  <table className="w-full text-[11px]" style={{ minWidth: `${200 + days.length * 34}px`, borderCollapse: 'collapse' }}>
                    <thead>
                      {/* Monats-Balken */}
                      <tr>
                        <th rowSpan={3} className="text-left px-3 py-2 font-heading font-semibold sticky left-0 z-20"
                          style={{ color: '#64748b', background: '#0f172a', minWidth: '200px', borderBottom: '1px solid #1e293b' }}>
                          Kamera
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
                    {visibleCameraGroups.map(({ product, units }) => {
                      const activeUnits = units.filter((u) => u.status !== 'retired');
                      return (
                        <tbody key={product.id}>
                          {/* Modell-Gruppenkopf — trennt die Kameratypen optisch,
                              bleibt aber im selben (einen) Kalender. */}
                          <tr>
                            <td className="px-3 py-1.5 sticky left-0 z-10 font-heading font-bold whitespace-nowrap"
                              style={{ background: '#16233f', color: '#e2e8f0', borderTop: '2px solid #1e293b' }}>
                              {product.name}
                              <span className="ml-1.5 text-[10px] font-normal" style={{ color: '#64748b' }}>
                                ({activeUnits.length} {activeUnits.length === 1 ? 'Kamera' : 'Kameras'})
                              </span>
                            </td>
                            <td colSpan={days.length} style={{ background: '#16233f', borderTop: '2px solid #1e293b' }} />
                          </tr>
                          {units.map((unit) => (
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
                                        if (info.booking.status === 'reserved') {
                                          window.open('/admin/reservierungen', '_blank');
                                        } else {
                                          window.open(`/admin/buchungen/${info.booking.id}`, '_blank');
                                        }
                                      }
                                    }}
                                    style={{
                                      ...cs,
                                      cursor: info.booking ? 'pointer' : 'default',
                                      boxShadow: d.isToday ? 'inset 0 0 0 1.5px #f59e0b' : 'none',
                                    }}
                                  >
                                    <div className="text-[9px] leading-tight truncate px-0.5" style={{ color: cs.color }}>
                                      {(info.type === 'booked' || info.type === 'booked-pending' || info.type === 'reserved') && info.booking && (
                                        <span title={info.type === 'reserved' ? `Reserviert — ${info.booking.customer_name}` : info.booking.customer_name}>
                                          {info.type === 'booked-pending' && '⏳ '}
                                          {info.type === 'reserved' && '🔒 '}
                                          {info.booking.customer_name?.split(' ')[0]?.slice(0, 6) || '…'}
                                        </span>
                                      )}
                                      {(info.type === 'buffer-hin' || info.type === 'buffer-hin-pending' || info.type === 'buffer-hin-reserved') && <span style={{ fontSize: '8px' }}>▼ HIN</span>}
                                      {(info.type === 'buffer-rueck' || info.type === 'buffer-rueck-pending' || info.type === 'buffer-rueck-reserved') && <span style={{ fontSize: '8px' }}>▲ RÜ</span>}
                                      {info.type === 'maintenance' && <span style={{ fontSize: '8px' }}>⚠</span>}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      );
                    })}
                  </table>
                </div>
              )}

              {/* Kameras ohne Seriennummern — als Hinweis unter dem Kalender. */}
              {emptyCameraProducts.length > 0 && (
                <div className="rounded-xl px-4 py-3 text-xs" style={{ border: '1px solid var(--admin-border)', background: 'var(--admin-surface)', color: 'var(--admin-text-dim)' }}>
                  <span className="font-heading font-semibold" style={{ color: 'var(--admin-muted)' }}>Ohne Seriennummern (nicht im Kalender):</span>
                  <span className="ml-2">
                    {emptyCameraProducts.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && ', '}
                        <a href={`/admin/preise/kameras/${p.id}`} className="text-blue-400 hover:underline">{p.name}</a>
                      </span>
                    ))}
                  </span>
                </div>
              )}
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
              style={{ color: 'var(--admin-accent)', border: '1px solid var(--admin-faint)' }}>
              → Heute
            </button>
          </div>

          {ganttLoading ? (
            <div className="flex items-center gap-3 py-12 justify-center" style={{ color: 'var(--admin-text-dim)' }}>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Lade Verfügbarkeit…
            </div>
          ) : !ganttData || bookableAccessories.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--admin-text-dim)' }}>Kein Zubehör vorhanden.</p>
          ) : visibleAccessories.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--admin-text-dim)' }}>
              Keine Treffer für die aktiven Filter.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Legende */}
              <div className="flex flex-wrap gap-4 text-[11px] font-body font-semibold mb-2" style={{ color: 'var(--admin-text-2)' }}>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#065f46' }} /> Alle frei</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#a16207' }} /> Teilweise belegt</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#1d4ed8' }} /> Ausgebucht</span>
              </div>

              {/* EIN gemeinsamer Kalender für ALLES Zubehör. Eine Zeile pro
                  Zubehörteil, gemeinsamer Datums-Header + ein Scrollbalken. */}
              <div className="rounded-xl overflow-x-auto" data-gantt-scroll style={{ border: '1px solid #1e293b', background: '#0f172a' }}>
                <table className="w-full text-[11px]" style={{ minWidth: `${240 + days.length * 34}px`, borderCollapse: 'collapse' }}>
                  <thead>
                    {/* Monats-Balken */}
                    <tr>
                      <th rowSpan={3} className="text-left px-3 py-2 font-heading font-semibold sticky left-0 z-20"
                        style={{ color: '#64748b', background: '#0f172a', minWidth: '240px', borderBottom: '1px solid #1e293b' }}>
                        Zubehör
                      </th>
                      {monthGroups.map((g, gi) => (
                        <th key={`m-${g.label}`} colSpan={g.span}
                          className="text-center font-heading font-bold text-[10px] py-1.5"
                          style={{ color: '#e2e8f0', background: gi % 2 === 0 ? '#1e293b' : '#0f172a', borderLeft: gi > 0 ? '2px solid #334155' : 'none' }}>
                          {g.label}
                        </th>
                      ))}
                    </tr>
                    {/* KW-Balken */}
                    <tr>
                      {kwGroups.map((g, gi) => (
                        <th key={`kw-${g.kw}-${gi}`} colSpan={g.span} className="text-center font-heading font-bold text-[9px] py-1"
                          style={{ color: gi % 2 === 0 ? '#94a3b8' : '#64748b', background: gi % 2 === 0 ? '#0f172a' : '#131c2e', borderLeft: gi > 0 ? '1px solid #334155' : 'none' }}>
                          KW {g.kw}
                        </th>
                      ))}
                    </tr>
                    {/* Tage */}
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      {days.map((d) => (
                        <th key={d.dateStr} data-today={d.isToday || undefined} className="text-center px-0 py-1 font-heading font-semibold"
                          style={{ color: d.isToday ? '#f59e0b' : d.isWeekend ? '#475569' : '#64748b', minWidth: '34px', borderBottom: d.isToday ? '2px solid #f59e0b' : '1px solid #1e293b', borderLeft: d.isFirstOfMonth ? '2px solid #334155' : 'none' }}>
                          <div className="text-[9px]">{d.dayName}</div>
                          <div style={{ fontWeight: d.isToday ? 800 : 600 }}>{d.day}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAccessories.map((acc) => {
                      const accExpanded = expandedAccRows.has(acc.id);
                      const manyCams = (acc.compatible_product_names?.length ?? 0) >= 2;
                      return (
                      <tr key={acc.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td className="px-3 py-1.5 sticky left-0 z-10 align-top" style={{ background: '#0f172a' }}>
                          <div className="flex items-start gap-1">
                            <div className="min-w-0 flex-1">
                              <div className="font-heading font-bold whitespace-nowrap" style={{ color: '#e2e8f0' }}>{acc.name}</div>
                              <div className="flex flex-wrap items-center gap-1 mt-0.5" style={manyCams && !accExpanded ? { maxHeight: 20, overflow: 'hidden' } : undefined}>
                                <span className="text-[10px]" style={{ color: '#64748b' }}>{acc.available_qty} Stück</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#1e293b', color: '#94a3b8' }}>{acc.category}</span>
                                {acc.compatible_product_names && acc.compatible_product_names.length > 0 ? (
                                  acc.compatible_product_names.map((pn) => (
                                    <span key={pn} className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ background: '#0c4a6e', color: '#7dd3fc' }}>{pn}</span>
                                  ))
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#0f3a2a', color: '#6ee7b7' }}>Alle Kameras</span>
                                )}
                              </div>
                            </div>
                            {manyCams && (
                              <button
                                type="button"
                                onClick={() => toggleFilter(setExpandedAccRows, acc.id)}
                                className="shrink-0 mt-3 text-[10px] leading-none px-1 py-0.5 rounded transition-colors hover:bg-slate-700"
                                style={{ color: '#7dd3fc', border: '1px solid #334155' }}
                                title={accExpanded ? 'Einklappen' : `Alle ${acc.compatible_product_names?.length} Kameras zeigen`}
                              >
                                {accExpanded ? '▴' : '▾'}
                              </button>
                            )}
                          </div>
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
                                setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, content: `${acc.name}\n${info.count} von ${info.total} belegt${pendingLine}\n${names}` });
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
              style={{ color: 'var(--admin-accent)', border: '1px solid var(--admin-faint)' }}>
              → Heute
            </button>
          </div>

          {ganttLoading ? (
            <div className="flex items-center gap-3 py-12 justify-center" style={{ color: 'var(--admin-text-dim)' }}>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Lade Verfügbarkeit…
            </div>
          ) : !ganttData || ganttData.sets.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--admin-text-dim)' }}>Keine Sets vorhanden.</p>
          ) : visibleSets.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--admin-text-dim)' }}>
              Keine Treffer für die aktiven Filter.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 text-[11px] font-body font-semibold mb-2" style={{ color: 'var(--admin-text-2)' }}>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#065f46' }} /> Frei (Zahl = baubare Sets)</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#7f1d1d' }} /> Zubehör fehlt</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#1d4ed8' }} /> Gebucht</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded" style={{ background: '#1d4ed8', boxShadow: 'inset 0 0 0 2px #ef4444' }} /> Überbucht (Bestand reicht nicht)</span>
                <span style={{ color: 'var(--admin-text-dim)' }}>Klick auf einen Tag zeigt alle Bestandteile.</span>
              </div>

              {/* EIN gemeinsamer Kalender für ALLE Sets. Eine Zeile pro Set,
                  gemeinsamer Datums-Header + ein Scrollbalken. */}
              <div className="rounded-xl overflow-x-auto" data-gantt-scroll style={{ border: '1px solid #1e293b', background: '#0f172a' }}>
                <table className="w-full text-[11px]" style={{ minWidth: `${240 + days.length * 34}px`, borderCollapse: 'collapse' }}>
                  <thead>
                    {/* Monats-Balken */}
                    <tr>
                      <th rowSpan={3} className="text-left px-3 py-2 font-heading font-semibold sticky left-0 z-20"
                        style={{ color: '#64748b', background: '#0f172a', minWidth: '240px', borderBottom: '1px solid #1e293b' }}>
                        Set
                      </th>
                      {monthGroups.map((g, gi) => (
                        <th key={`m-${g.label}`} colSpan={g.span}
                          className="text-center font-heading font-bold text-[10px] py-1.5"
                          style={{ color: '#e2e8f0', background: gi % 2 === 0 ? '#1e293b' : '#0f172a', borderLeft: gi > 0 ? '2px solid #334155' : 'none' }}>
                          {g.label}
                        </th>
                      ))}
                    </tr>
                    {/* KW-Balken */}
                    <tr>
                      {kwGroups.map((g, gi) => (
                        <th key={`kw-${g.kw}-${gi}`} colSpan={g.span} className="text-center font-heading font-bold text-[9px] py-1"
                          style={{ color: gi % 2 === 0 ? '#94a3b8' : '#64748b', background: gi % 2 === 0 ? '#0f172a' : '#131c2e', borderLeft: gi > 0 ? '1px solid #334155' : 'none' }}>
                          KW {g.kw}
                        </th>
                      ))}
                    </tr>
                    {/* Tage */}
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      {days.map((d) => (
                        <th key={d.dateStr} data-today={d.isToday || undefined} className="text-center px-0 py-1 font-heading font-semibold"
                          style={{ color: d.isToday ? '#f59e0b' : d.isWeekend ? '#475569' : '#64748b', minWidth: '34px', borderBottom: d.isToday ? '2px solid #f59e0b' : '1px solid #1e293b', borderLeft: d.isFirstOfMonth ? '2px solid #334155' : 'none' }}>
                          <div className="text-[9px]">{d.dayName}</div>
                          <div style={{ fontWeight: d.isToday ? 800 : 600 }}>{d.day}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {groupedSets.map((group) => (
                    <tbody key={group.label}>
                      {/* Kamera-Gruppenkopf — Sets nach Kamera gruppiert, im
                          selben (einen) Kalender. */}
                      <tr>
                        <td className="px-3 py-1.5 sticky left-0 z-10 font-heading font-bold whitespace-nowrap"
                          style={{ background: '#16233f', color: '#e2e8f0', borderTop: '2px solid #1e293b' }}>
                          {group.label}
                          <span className="ml-1.5 text-[10px] font-normal" style={{ color: '#64748b' }}>
                            ({group.sets.length} {group.sets.length === 1 ? 'Set' : 'Sets'})
                          </span>
                        </td>
                        <td colSpan={days.length} style={{ background: '#16233f', borderTop: '2px solid #1e293b' }} />
                      </tr>
                      {group.sets.map((s) => {
                      const setExpanded = expandedSetRows.has(`${group.label}-${s.id}`);
                      const manyCams = (s.product_names?.length ?? 0) >= 2;
                      return (
                      <tr key={`${group.label}-${s.id}`} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td className="px-3 py-1.5 sticky left-0 z-10 align-top" style={{ background: '#0f172a' }}>
                          <div className="flex items-start gap-1">
                            <div className="min-w-0 flex-1">
                              <div className="font-heading font-bold whitespace-nowrap" style={{ color: '#e2e8f0' }}>{s.name}</div>
                              <div className="flex flex-wrap items-center gap-1 mt-0.5" style={manyCams && !setExpanded ? { maxHeight: 20, overflow: 'hidden' } : undefined}>
                                {s.badge && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#1e293b', color: '#94a3b8' }}>{s.badge}</span>}
                                {s.product_names && s.product_names.length > 0 ? (
                                  s.product_names.map((pn) => (
                                    <span key={pn} className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ background: '#0c4a6e', color: '#7dd3fc' }}>{pn}</span>
                                  ))
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#1e293b', color: '#64748b' }}>Keine Kamera zugeordnet</span>
                                )}
                              </div>
                            </div>
                            {manyCams && (
                              <button
                                type="button"
                                onClick={() => toggleFilter(setExpandedSetRows, `${group.label}-${s.id}`)}
                                className="shrink-0 mt-3 text-[10px] leading-none px-1 py-0.5 rounded transition-colors hover:bg-slate-700"
                                style={{ color: '#7dd3fc', border: '1px solid #334155' }}
                                title={setExpanded ? 'Einklappen' : `Alle ${s.product_names?.length} Kameras zeigen`}
                              >
                                {setExpanded ? '▴' : '▾'}
                              </button>
                            )}
                          </div>
                        </td>
                        {days.map((d) => {
                          const today = new Date(); today.setHours(0, 0, 0, 0);
                          const isPast = new Date(d.dateStr) < today;
                          let isBooked = false;
                          const matchedBookings: GanttSimpleBooking[] = [];
                          for (const b of s.bookings) {
                            const { start, end } = getSimpleBookingSpan(b, ganttData.bufferDays);
                            if (start <= d.dateStr && end >= d.dateStr) {
                              isBooked = true;
                              matchedBookings.push(b);
                            }
                          }

                          // Zubehoer-Deckung des Sets an diesem Tag (nur fuer
                          // die Zukunft — Vergangenes bleibt neutral grau).
                          const setInfo = isPast ? null : getSetCellInfo(s, d.dateStr);
                          // Freie Zelle: rot, sobald kein KOMPLETTES Set mehr
                          // baubar ist (Bestandteil reicht nicht) → nicht mehr
                          // verkaufbar.
                          const hasMissing = (setInfo?.missing.length ?? 0) > 0;
                          // Gebuchte Zelle: roter Rahmen NUR bei echter
                          // Ueberbuchung (mehr belegt als vorhanden). „Kein
                          // weiteres Set frei" ist bei Bestand 1 der Normalfall
                          // und waere als Dauer-Warnung nur Rauschen.
                          const isOverbooked = (setInfo?.overbooked.length ?? 0) > 0;

                          const bg = isPast && !isBooked ? '#1e293b'
                            : isBooked ? (isPast ? '#1e3a5f' : '#1d4ed8')
                            : hasMissing ? '#7f1d1d'
                            : '#065f46';
                          const color = isPast && !isBooked ? '#475569'
                            : isBooked ? '#ffffff'
                            : hasMissing ? '#fecaca'
                            : '#6ee7b7';

                          // Ringe kombinieren, damit der Heute-Ring erhalten bleibt.
                          const rings: string[] = [];
                          if (isBooked && isOverbooked) rings.push('inset 0 0 0 2px #ef4444');
                          if (d.isToday) rings.push('inset 0 0 0 1.5px #f59e0b');

                          let cellText = '';
                          if (!isPast) {
                            if (isBooked) cellText = `${isOverbooked ? '⚠' : ''}${matchedBookings.length}`;
                            else if (hasMissing) cellText = '0';
                            else if (setInfo && setInfo.buildable !== null) cellText = String(setInfo.buildable);
                          }

                          return (
                            <td key={d.dateStr} className="px-0 py-0.5 text-center"
                              onMouseEnter={(e) => {
                                if (isPast) { setTooltip(null); return; }
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const lines: string[] = [s.name];
                                if (isBooked) {
                                  lines.push(matchedBookings.map((b) => `${b.status === 'awaiting_payment' ? '⏳ ' : ''}${b.customer_name || '–'}`).join(', '));
                                }
                                if (setInfo && isOverbooked) {
                                  lines.push('⚠ Überbucht — Bestand reicht nicht:');
                                  for (const m of setInfo.overbooked) {
                                    lines.push(`• ${m.name} — ${m.used} belegt, nur ${m.total} vorhanden`);
                                  }
                                } else if (setInfo && hasMissing) {
                                  lines.push(isBooked ? 'Kein weiteres Set verfügbar:' : '⚠ Zubehör fehlt:');
                                  for (const m of setInfo.missing) {
                                    lines.push(`• ${m.name} — ${m.needed} benötigt, ${m.free} frei`);
                                  }
                                } else if (setInfo && setInfo.buildable !== null) {
                                  lines.push(`${setInfo.buildable} ${setInfo.buildable === 1 ? 'Set' : 'Sets'} ${isBooked ? 'zusätzlich ' : ''}baubar`);
                                }
                                lines.push('Klicken für Details');
                                setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, content: lines.join('\n') });
                              }}
                              onMouseLeave={() => setTooltip(null)}
                              onClick={() => { setTooltip(null); setSetModal({ set: s, dateStr: d.dateStr }); }}
                              style={{ background: bg, color, cursor: 'pointer', boxShadow: rings.length > 0 ? rings.join(', ') : 'none' }}>
                              <div className="text-[9px] leading-tight font-semibold">
                                {cellText}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail-Fenster: alle Bestandteile eines Sets an einem Tag */}
      {setModal && (() => {
        const info = getSetCellInfo(setModal.set, setModal.dateStr, true);
        const missingCount = info.missing.length;
        const overbookedCount = info.overbooked.length;
        return (
          <Modal
            open
            onClose={() => setSetModal(null)}
            title={`${setModal.set.name} — ${fmtDateWeekday(setModal.dateStr)}`}
            maxWidth={620}
          >
            {/* Kopfzeile: Ueberbuchung > ausverkauft > verfuegbar */}
            {overbookedCount > 0 ? (
              <div style={{ background: 'rgba(220,38,38,0.16)', border: '1px solid rgba(220,38,38,0.6)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                <div className="font-heading font-bold" style={{ color: '#f87171', fontSize: 14 }}>
                  ⚠ Überbucht — bestehende Buchungen nicht gedeckt
                </div>
                <div className="font-body" style={{ color: 'var(--admin-text-2)', fontSize: 12, marginTop: 2 }}>
                  {overbookedCount === 1
                    ? 'Von einem Bestandteil sind mehr Stücke belegt als vorhanden.'
                    : `Von ${overbookedCount} Bestandteilen sind mehr Stücke belegt als vorhanden.`}
                </div>
              </div>
            ) : missingCount > 0 ? (
              <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.45)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                <div className="font-heading font-bold" style={{ color: '#f87171', fontSize: 14 }}>
                  ✕ Kein komplettes Set mehr verfügbar
                </div>
                <div className="font-body" style={{ color: 'var(--admin-text-2)', fontSize: 12, marginTop: 2 }}>
                  {missingCount === 1 ? 'Ein Bestandteil reicht nicht' : `${missingCount} Bestandteile reichen nicht`}
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.45)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                <div className="font-heading font-bold" style={{ color: '#34d399', fontSize: 14 }}>
                  ✓ Set vollständig verfügbar
                </div>
                <div className="font-body" style={{ color: 'var(--admin-text-2)', fontSize: 12, marginTop: 2 }}>
                  {info.buildable !== null
                    ? `${info.buildable} ${info.buildable === 1 ? 'komplettes Set' : 'komplette Sets'} aus dem freien Bestand baubar`
                    : 'Keine Bestandteile hinterlegt'}
                </div>
              </div>
            )}

            {info.components.length === 0 ? (
              <p className="font-body" style={{ color: 'var(--admin-text-dim)', fontSize: 13 }}>
                Für dieses Set ist kein Zubehör hinterlegt.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {info.components.map((c) => {
                  const isMissing = !c.unknown && c.free < c.needed;
                  const border = c.unknown ? 'var(--admin-border)' : isMissing ? 'rgba(220,38,38,0.45)' : 'rgba(16,185,129,0.35)';
                  const bg = c.unknown ? 'transparent' : isMissing ? 'rgba(220,38,38,0.08)' : 'rgba(16,185,129,0.07)';
                  return (
                    <div key={c.accessoryId} style={{ border: `1px solid ${border}`, background: bg, borderRadius: 9, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                        <div className="font-heading font-semibold" style={{ fontSize: 13, color: 'var(--admin-text)' }}>
                          <span style={{ color: c.unknown ? 'var(--admin-muted)' : isMissing ? '#f87171' : '#34d399', marginRight: 6 }}>
                            {c.unknown ? '?' : isMissing ? '✕' : '✓'}
                          </span>
                          {c.name}
                        </div>
                        <div className="font-body whitespace-nowrap" style={{ fontSize: 12, color: c.unknown ? 'var(--admin-muted)' : isMissing ? '#f87171' : 'var(--admin-text-2)' }}>
                          {c.unknown
                            ? 'Bestand unbekannt'
                            : c.used > c.total
                              ? `${c.needed}× benötigt · ${c.used} belegt bei nur ${c.total} vorhanden`
                              : `${c.needed}× benötigt · ${c.free} von ${c.total} frei`}
                        </div>
                      </div>
                      {isMissing && c.blockingBookings.length > 0 && (
                        <div className="font-body" style={{ fontSize: 11, color: 'var(--admin-text-dim)', marginTop: 5 }}>
                          Belegt durch:{' '}
                          {c.blockingBookings.map((b, i) => (
                            <span key={b.id}>
                              {i > 0 && ', '}
                              <a href={`/admin/buchungen/${b.id}`} target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--admin-accent)', textDecoration: 'underline' }}>
                                {b.status === 'awaiting_payment' ? '⏳ ' : ''}{b.customer_name || b.id}
                              </a>
                              {(b.qty ?? 1) > 1 ? ` (${b.qty}×)` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      {c.unknown && (
                        <div className="font-body" style={{ fontSize: 11, color: 'var(--admin-text-dim)', marginTop: 5 }}>
                          Dieses Teil konnte nicht aufgelöst werden (gelöscht oder nicht mehr im Katalog) und wird
                          bei der Verfügbarkeit nicht mitgerechnet.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Modal>
        );
      })()}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 rounded-lg text-[11px] font-body shadow-xl pointer-events-none whitespace-pre-line"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            background: 'var(--admin-surface-2)',
            color: 'var(--admin-text)',
            border: '1px solid var(--admin-faint)',
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}


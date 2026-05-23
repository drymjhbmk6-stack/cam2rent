'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';
import { getGermanHolidayMap } from '@/lib/german-holidays';

// ============================================================
// Typen
// ============================================================

interface Booking {
  id: string;
  product_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  rental_from: string;
  rental_to: string;
  days: number | null;
  status: string;
  delivery_mode: 'versand' | 'abholung';
  shipping_method: string | null;
  tracking_number: string | null;
  price_total: number | null;
  is_test: boolean;
  ship_date: string;
  return_date: string;
}

interface CalendarNote {
  id: string;
  note_date: string;
  text: string;
}

type ViewMode = 'monat' | 'agenda';

// ============================================================
// Farben (dunkelblaues Admin-Theme)
// ============================================================

const C = {
  card: '#1e293b',
  panel: '#0f172a',
  cellNormal: '#1e293b',
  cellOther: '#162133',
  cellSpecial: '#3a2530',
  cellToday: '#1e3a52',
  border: '#334155',
};

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  awaiting_payment: { bg: '#8b5cf6', label: 'Zahlung offen' },
  confirmed: { bg: '#0ea5b7', label: 'Bestätigt' },
  preparing_shipment: { bg: '#f59e0b', label: 'Wird versendet' },
  awaiting_pickup: { bg: '#14b8a6', label: 'Warten auf Abholung' },
  shipped: { bg: '#e0961f', label: 'Versendet' },
  delivered: { bg: '#22c55e', label: 'Zugestellt' },
  picked_up: { bg: '#22c55e', label: 'Abgeholt' },
  returned: { bg: '#64748b', label: 'Zurückgegeben' },
  completed: { bg: '#16a34a', label: 'Abgeschlossen' },
};

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Farben für die Aktions-Balken — gruppiert nach Lieferart, schraffiert + leicht
// transparent dargestellt. Versand (Hin- + Rückversand) = amber, Abholung
// (Übergabe + Rückgabe) = indigo.
const ACTION_COLORS = {
  versand: { a: 'rgba(245,158,11,0.78)', b: 'rgba(217,127,8,0.78)' },
  abholung: { a: 'rgba(99,102,241,0.78)', b: 'rgba(67,56,202,0.78)' },
};
function stripedBg(c: { a: string; b: string }): string {
  return `repeating-linear-gradient(45deg, ${c.a} 0, ${c.a} 7px, ${c.b} 7px, ${c.b} 14px)`;
}
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addD(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
}
function dObjOf(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}
function fmtDayShort(dateStr: string): string {
  const d = dObjOf(dateStr);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}
function fmtPeriod(b: Booking): string {
  return `${fmtDayShort(b.rental_from)} – ${fmtDayShort(b.rental_to)}`;
}
function statusStyle(status: string) {
  return STATUS_STYLE[status] ?? { bg: '#64748b', label: status };
}
function todayStr(): string {
  return ymd(new Date());
}

// ============================================================
// Hauptkomponente
// ============================================================

export default function AuftragskalenderPage() {
  const router = useRouter();
  const now = new Date();

  const [view, setView] = useState<ViewMode>('monat');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(true);
  const [noteModalDate, setNoteModalDate] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('admin_auftragskalender_view');
    if (saved === 'agenda' || saved === 'monat') setView(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem('admin_auftragskalender_view', view);
  }, [view]);

  const gridStart = useMemo(() => {
    const first = `${year}-${pad(month + 1)}-01`;
    const dow = dObjOf(first).getDay();
    const offset = (dow + 6) % 7;
    return addD(first, -offset);
  }, [year, month]);
  const gridEnd = useMemo(() => addD(gridStart, 41), [gridStart]);

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    const years = new Set([dObjOf(gridStart).getFullYear(), dObjOf(gridEnd).getFullYear()]);
    for (const y of years) {
      for (const [k, v] of getGermanHolidayMap(y)) map.set(k, v);
    }
    return map;
  }, [gridStart, gridEnd]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bRes, nRes] = await Promise.all([
        fetch(`/api/admin/auftragskalender?from=${gridStart}&to=${gridEnd}`),
        fetch(`/api/admin/calendar-notes?from=${gridStart}&to=${gridEnd}`),
      ]);
      if (!bRes.ok) throw new Error('Laden fehlgeschlagen');
      const bJson = await bRes.json();
      setBookings(Array.isArray(bJson.bookings) ? bJson.bookings : []);
      if (nRes.ok) {
        const nJson = await nRes.json();
        setNotes(Array.isArray(nJson.notes) ? nJson.notes : []);
      } else {
        setNotes([]);
      }
    } catch {
      setError('Aufträge konnten nicht geladen werden.');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [gridStart, gridEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Nach dem Laden automatisch zum heutigen Tag scrollen (nur im aktuellen Monat)
  useEffect(() => {
    if (loading) return;
    const heute = new Date();
    if (year !== heute.getFullYear() || month !== heute.getMonth()) return;
    const t = setTimeout(() => {
      const el = document.getElementById('ak-today');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      // Agenda-Fallback: erster Tag ab heute
      const heuteStr = todayStr();
      const cards = document.querySelectorAll<HTMLElement>('[data-ak-day]');
      for (const c of cards) {
        if ((c.dataset.akDay ?? '') >= heuteStr) {
          c.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
    }, 120);
    return () => clearTimeout(t);
  }, [loading, view, year, month, bookings, notes]);

  const reloadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/calendar-notes?from=${gridStart}&to=${gridEnd}`);
      if (res.ok) {
        const json = await res.json();
        setNotes(Array.isArray(json.notes) ? json.notes : []);
      }
    } catch {
      /* ignore */
    }
  }, [gridStart, gridEnd]);

  const visibleBookings = useMemo(
    () => (showTest ? bookings : bookings.filter((b) => !b.is_test)),
    [bookings, showTest]
  );

  function goPrev() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }
  function goNext() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }
  function goToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }

  const today = todayStr();
  const monthFrom = `${year}-${pad(month + 1)}-01`;
  const monthTo = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

  const stats = useMemo(() => {
    let shipCount = 0;
    let returnCount = 0;
    const inMonth = new Set<string>();
    for (const b of visibleBookings) {
      if (b.ship_date >= monthFrom && b.ship_date <= monthTo) {
        shipCount++;
        inMonth.add(b.id);
      }
      if (b.return_date >= monthFrom && b.return_date <= monthTo) {
        returnCount++;
        inMonth.add(b.id);
      }
      if (b.rental_from <= monthTo && b.rental_to >= monthFrom) inMonth.add(b.id);
    }
    return { shipCount, returnCount, total: inMonth.size };
  }, [visibleBookings, monthFrom, monthTo]);

  const modalNotes = noteModalDate
    ? notes.filter((n) => n.note_date === noteModalDate)
    : [];

  const navBtn =
    'px-3 py-1.5 rounded text-sm text-slate-200 transition';
  const navBtnStyle = { background: '#1e293b', border: `1px solid ${C.border}` };

  return (
    <div className="px-4 py-6 md:px-8 text-slate-200">
      <div className="max-w-7xl mx-auto">
        <AdminBackLink href="/admin" label="Zurück zum Dashboard" />

        {/* Kopfzeile */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Auftragskalender</h1>
            <p className="text-sm text-slate-400 mt-1">
              Übersicht aller Aufträge — wann was raus muss und wann was zurückkommt.
            </p>
          </div>
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: `1px solid ${C.border}` }}
          >
            <button
              onClick={() => setView('monat')}
              className={`px-4 py-2 text-sm font-medium transition ${
                view === 'monat' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              style={view === 'monat' ? undefined : { background: '#1e293b' }}
            >
              📅 Monat
            </button>
            <button
              onClick={() => setView('agenda')}
              className={`px-4 py-2 text-sm font-medium transition ${
                view === 'agenda' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              style={view === 'agenda' ? undefined : { background: '#1e293b' }}
            >
              ✓ To-do-Liste
            </button>
          </div>
        </div>

        {/* Steuerung */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className={navBtn} style={navBtnStyle}>
              ‹ Zurück
            </button>
            <button onClick={goToday} className={navBtn} style={navBtnStyle}>
              Heute
            </button>
            <button onClick={goNext} className={navBtn} style={navBtnStyle}>
              Weiter ›
            </button>
            <span className="ml-2 text-lg font-semibold text-slate-100">
              {MONTHS[month]} {year}
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showTest}
              onChange={(e) => setShowTest(e.target.checked)}
              className="accent-cyan-500"
            />
            Test-Buchungen anzeigen
          </label>
        </div>

        {/* Kennzahlen */}
        <div className="flex flex-wrap gap-3 mb-5 text-sm">
          {[
            { label: 'Aufträge im Monat', value: stats.total, icon: '' },
            { label: 'Versand/Übergabe', value: stats.shipCount, icon: '📤' },
            { label: 'Rückgaben erwartet', value: stats.returnCount, icon: '📥' },
          ].map((k) => (
            <span
              key={k.label}
              className="px-3 py-1.5 rounded-lg text-slate-300"
              style={{ background: C.card, border: `1px solid ${C.border}` }}
            >
              {k.icon && `${k.icon} `}
              <strong className="text-slate-100">{k.value}</strong> {k.label}
            </span>
          ))}
        </div>

        {error && (
          <div
            className="mb-4 rounded-lg px-4 py-3 text-sm text-red-200"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)' }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-slate-500">Lädt …</div>
        ) : view === 'monat' ? (
          <MonthView
            gridStart={gridStart}
            month={month}
            today={today}
            bookings={visibleBookings}
            notes={notes}
            holidayMap={holidayMap}
            onOpen={(id) => router.push(`/admin/buchungen/${id}`)}
            onDayClick={(d) => setNoteModalDate(d)}
          />
        ) : (
          <AgendaView
            monthFrom={monthFrom}
            monthTo={monthTo}
            today={today}
            bookings={visibleBookings}
            notes={notes}
            holidayMap={holidayMap}
            onOpen={(id) => router.push(`/admin/buchungen/${id}`)}
            onDayClick={(d) => setNoteModalDate(d)}
          />
        )}

        {/* Legende */}
        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400">
          {Object.entries(STATUS_STYLE).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded" style={{ background: v.bg }} />
              {v.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ background: stripedBg(ACTION_COLORS.versand) }}
            />
            📦 Hin-/Rückversand
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ background: stripedBg(ACTION_COLORS.abholung) }}
            />
            🤝 Übergabe/Rückgabe
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ background: C.cellSpecial, border: '1px solid rgba(248,113,113,0.5)' }}
            />
            Sonn-/Feiertag
          </span>
          <span className="flex items-center gap-1.5">
            📦 Versand · 🤝 Abholung · 📝 Notiz
          </span>
        </div>
      </div>

      {noteModalDate && (
        <NoteModal
          date={noteModalDate}
          notes={modalNotes}
          holidayName={holidayMap.get(noteModalDate) ?? null}
          onClose={() => setNoteModalDate(null)}
          onChanged={reloadNotes}
        />
      )}
    </div>
  );
}

// ============================================================
// Monatsansicht
// ============================================================

const HEADER_H = 44;
const LANE_H = 24;

function MonthView({
  gridStart,
  month,
  today,
  bookings,
  notes,
  holidayMap,
  onOpen,
  onDayClick,
}: {
  gridStart: string;
  month: number;
  today: string;
  bookings: Booking[];
  notes: CalendarNote[];
  holidayMap: Map<string, string>;
  onOpen: (id: string) => void;
  onDayClick: (day: string) => void;
}) {
  const weeks = [0, 1, 2, 3, 4, 5];
  const noteCount = (day: string) => notes.filter((n) => n.note_date === day).length;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: C.card, border: `1px solid ${C.border}` }}
    >
      {/* Wochentag-Kopf */}
      <div
        className="grid grid-cols-7"
        style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}
      >
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`px-2 py-2 text-xs font-semibold text-center ${
              i === 6 ? 'text-red-400' : 'text-slate-400'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {weeks.map((w) => {
        const weekStart = addD(gridStart, w * 7);
        const weekEnd = addD(weekStart, 6);

        // Buchungen, deren Gesamtspanne (Versand bis Rückgabe) die Woche berührt
        const inWeek = bookings
          .filter((b) => b.ship_date <= weekEnd && b.return_date >= weekStart)
          .sort(
            (a, b) =>
              a.ship_date.localeCompare(b.ship_date) ||
              b.return_date.localeCompare(a.return_date)
          );

        const lanes: Booking[][] = [];
        const placed = new Map<string, number>();
        for (const b of inWeek) {
          const start = b.ship_date < weekStart ? weekStart : b.ship_date;
          let lane = 0;
          while (true) {
            const laneArr = lanes[lane] ?? [];
            const conflict = laneArr.some((o) => {
              const oEnd = o.return_date > weekEnd ? weekEnd : o.return_date;
              return oEnd >= start;
            });
            if (!conflict) {
              lanes[lane] = [...laneArr, b];
              placed.set(b.id, lane);
              break;
            }
            lane++;
          }
        }
        const rowHeight = HEADER_H + Math.max(1, lanes.length) * LANE_H + 8;

        const weekHasToday = today >= weekStart && today <= weekEnd;

        return (
          <div
            key={w}
            id={weekHasToday ? 'ak-today' : undefined}
            className="relative"
            style={{
              minHeight: rowHeight,
              borderBottom: w < 5 ? `1px solid ${C.border}` : 'none',
            }}
          >
            {/* Hintergrund-Zellen */}
            <div className="grid grid-cols-7 absolute inset-0">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const day = addD(weekStart, d);
                const dObj = dObjOf(day);
                const isOtherMonth = dObj.getMonth() !== month;
                const isToday = day === today;
                const isSunday = dObj.getDay() === 0;
                const holiday = holidayMap.get(day) ?? null;
                const isSpecial = isSunday || !!holiday;
                const nCount = noteCount(day);

                const bg = isToday
                  ? C.cellToday
                  : isSpecial
                  ? C.cellSpecial
                  : isOtherMonth
                  ? C.cellOther
                  : C.cellNormal;

                const numCls = isToday
                  ? 'text-slate-900'
                  : isOtherMonth
                  ? 'text-slate-600'
                  : isSpecial
                  ? 'text-red-300'
                  : 'text-slate-300';

                return (
                  <button
                    key={d}
                    onClick={() => onDayClick(day)}
                    title="Klicken, um eine Notiz hinzuzufügen"
                    className="relative text-left transition group hover:brightness-125"
                    style={{
                      background: bg,
                      borderRight: d < 6 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    {/* Datum oben links — Feiertagsname direkt rechts daneben */}
                    <span
                      className="absolute top-1 left-1.5 flex items-center gap-1.5"
                      style={{
                        maxWidth: nCount > 0 ? 'calc(100% - 40px)' : 'calc(100% - 12px)',
                      }}
                    >
                      <span
                        className={`text-xs font-semibold flex items-center justify-center shrink-0 ${numCls}`}
                        style={
                          isToday
                            ? { background: '#fbbf24', borderRadius: '9999px', width: 20, height: 20 }
                            : undefined
                        }
                      >
                        {dObj.getDate()}
                      </span>
                      {holiday && (
                        <span className="text-[10px] leading-tight text-red-300 truncate">
                          {holiday}
                        </span>
                      )}
                    </span>

                    {/* Notiz-Badge — oben rechts */}
                    <span className="absolute top-1 right-1.5 flex gap-1 items-center">
                      {nCount > 0 && (
                        <span
                          className="text-[10px] px-1 rounded"
                          style={{ background: 'rgba(245,158,11,0.22)', color: '#fcd34d' }}
                          title={`${nCount} Notiz(en)`}
                        >
                          📝{nCount}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500 opacity-0 group-hover:opacity-100 transition">
                        +
                      </span>
                    </span>

                  </button>
                );
              })}
            </div>

            {/* Ein zusammenhängender Balken pro Buchung:
                Versand/Übergabe (schraffiert) + Mietzeitraum (Statusfarbe)
                + Rückversand/Rückgabe (schraffiert) — drei bündig anschließende Stücke. */}
            {inWeek.map((b) => {
              const lane = placed.get(b.id) ?? 0;
              const isAbholung = b.delivery_mode === 'abholung';
              const cust = b.customer_name ?? 'Gast';
              const prod = b.product_name ?? 'Buchung';
              const st = statusStyle(b.status);
              const actionBg = stripedBg(
                isAbholung ? ACTION_COLORS.abholung : ACTION_COLORS.versand
              );

              // Versand-Stück endet am Tag vor Mietbeginn (Vorlauftage); bei Abholung
              // fällt es auf den Mietbeginn (1 Tag). Rückgabe-Stück analog hinten.
              const shipTo =
                b.ship_date < b.rental_from ? addD(b.rental_from, -1) : b.rental_from;
              const retFrom =
                b.return_date > b.rental_to ? addD(b.rental_to, 1) : b.rental_to;

              const pieces = [
                {
                  id: 'ship',
                  from: b.ship_date,
                  to: shipTo,
                  bg: actionBg,
                  z: 2,
                  roundL: true,
                  roundR: false,
                  label: '',
                  tip: `📤 ${isAbholung ? 'Übergabe' : 'Versand'} am ${fmtDayShort(
                    b.ship_date
                  )}\n${prod} · ${cust}`,
                },
                {
                  id: 'rental',
                  from: b.rental_from,
                  to: b.rental_to,
                  bg: st.bg,
                  z: 1,
                  roundL: false,
                  roundR: false,
                  label: `${isAbholung ? '🤝 ' : '📦 '}${b.is_test ? '[TEST] ' : ''}${prod} · ${cust}`,
                  tip: `${prod} · ${cust}\nMiete ${fmtPeriod(b)} · ${st.label}\n${
                    isAbholung ? 'Abholung' : 'Versand'
                  }`,
                },
                {
                  id: 'return',
                  from: retFrom,
                  to: b.return_date,
                  bg: actionBg,
                  z: 2,
                  roundL: false,
                  roundR: true,
                  label: '',
                  tip: `📥 ${isAbholung ? 'Rückgabe' : 'Rückversand'} am ${fmtDayShort(
                    b.return_date
                  )}\n${prod} · ${cust}`,
                },
              ];

              return pieces.map((p) => {
                if (p.from > weekEnd || p.to < weekStart) return null;
                const cFrom = p.from < weekStart ? weekStart : p.from;
                const cTo = p.to > weekEnd ? weekEnd : p.to;
                const startCol = Math.round(
                  (dObjOf(cFrom).getTime() - dObjOf(weekStart).getTime()) / 86400000
                );
                const endCol = Math.round(
                  (dObjOf(cTo).getTime() - dObjOf(weekStart).getTime()) / 86400000
                );
                const span = Math.max(1, endCol - startCol + 1);
                const roundL = p.roundL && p.from >= weekStart;
                const roundR = p.roundR && p.to <= weekEnd;
                // Innenkanten bündig (kein Versatz), nur Außenkanten 3px eingerückt
                const insetL = roundL ? 3 : 0;
                const insetR = roundR ? 3 : 0;
                return (
                  <button
                    key={`${b.id}-${p.id}`}
                    onClick={() => onOpen(b.id)}
                    title={p.tip}
                    className="absolute text-left px-1.5 text-[11px] leading-[18px] font-medium text-white truncate hover:brightness-110 shadow-sm transition"
                    style={{
                      left: `calc(${(startCol / 7) * 100}% + ${insetL}px)`,
                      width: `calc(${(span / 7) * 100}% - ${insetL + insetR}px)`,
                      top: HEADER_H + lane * LANE_H,
                      height: LANE_H - 5,
                      background: p.bg,
                      zIndex: p.z,
                      borderRadius: `${roundL ? 6 : 0}px ${roundR ? 6 : 0}px ${
                        roundR ? 6 : 0
                      }px ${roundL ? 6 : 0}px`,
                      border: b.is_test ? '1px dashed #f9a8d4' : 'none',
                    }}
                  >
                    {p.label}
                  </button>
                );
              });
            })}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Agenda-Ansicht
// ============================================================

function AgendaView({
  monthFrom,
  monthTo,
  today,
  bookings,
  notes,
  holidayMap,
  onOpen,
  onDayClick,
}: {
  monthFrom: string;
  monthTo: string;
  today: string;
  bookings: Booking[];
  notes: CalendarNote[];
  holidayMap: Map<string, string>;
  onOpen: (id: string) => void;
  onDayClick: (day: string) => void;
}) {
  const days: {
    day: string;
    ship: Booking[];
    ret: Booking[];
    dayNotes: CalendarNote[];
  }[] = [];
  let cur = monthFrom;
  while (cur <= monthTo) {
    const ship = bookings.filter((b) => b.ship_date === cur);
    const ret = bookings.filter((b) => b.return_date === cur);
    const dayNotes = notes.filter((n) => n.note_date === cur);
    if (ship.length > 0 || ret.length > 0 || dayNotes.length > 0) {
      days.push({ day: cur, ship, ret, dayNotes });
    }
    cur = addD(cur, 1);
  }

  if (days.length === 0) {
    return (
      <div
        className="py-16 text-center text-slate-500 rounded-xl"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
      >
        Keine anstehenden Aufgaben in diesem Monat.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map(({ day, ship, ret, dayNotes }) => {
        const dObj = dObjOf(day);
        const isToday = day === today;
        const isPast = day < today;
        const isSunday = dObj.getDay() === 0;
        const holiday = holidayMap.get(day) ?? null;
        return (
          <div
            key={day}
            id={isToday ? 'ak-today' : undefined}
            data-ak-day={day}
            className="rounded-xl overflow-hidden"
            style={{
              background: C.card,
              border: `1px solid ${isToday ? '#fbbf24' : C.border}`,
              opacity: isPast ? 0.7 : 1,
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-2 text-sm font-semibold"
              style={{
                background: isToday
                  ? 'rgba(251,191,36,0.15)'
                  : isSunday || holiday
                  ? 'rgba(248,113,113,0.12)'
                  : C.panel,
                color: isToday ? '#fcd34d' : isSunday || holiday ? '#fca5a5' : '#cbd5e1',
              }}
            >
              <span>
                {WEEKDAYS[(dObj.getDay() + 6) % 7]}, {pad(dObj.getDate())}.{' '}
                {MONTHS[dObj.getMonth()]}
                {isToday && ' — heute'}
                {holiday && <span className="ml-2 font-normal text-red-300">· {holiday}</span>}
              </span>
              <button
                onClick={() => onDayClick(day)}
                className="text-xs font-medium px-2 py-1 rounded text-slate-200"
                style={{ background: '#1e293b', border: `1px solid ${C.border}` }}
              >
                + Notiz
              </button>
            </div>
            <div>
              {dayNotes.length > 0 && (
                <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: '#fcd34d' }}>
                    📝 Notizen ({dayNotes.length})
                  </div>
                  <div className="space-y-1.5">
                    {dayNotes.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => onDayClick(day)}
                        className="w-full text-left rounded-lg px-3 py-2 text-sm whitespace-pre-wrap transition hover:brightness-125"
                        style={{
                          background: 'rgba(245,158,11,0.13)',
                          border: '1px solid rgba(245,158,11,0.35)',
                          color: '#fde68a',
                        }}
                      >
                        {n.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {ship.length > 0 && (
                <AgendaGroup
                  title={`📤 Raus / Übergabe (${ship.length})`}
                  accent="#fbbf24"
                  items={ship}
                  onOpen={onOpen}
                />
              )}
              {ret.length > 0 && (
                <AgendaGroup
                  title={`📥 Rückgabe erwartet (${ret.length})`}
                  accent="#34d399"
                  items={ret}
                  onOpen={onOpen}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaGroup({
  title,
  accent,
  items,
  onOpen,
}: {
  title: string;
  accent: string;
  items: Booking[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
      <div className="text-xs font-semibold mb-2" style={{ color: accent }}>
        {title}
      </div>
      <div className="space-y-2">
        {items.map((b) => {
          const st = statusStyle(b.status);
          return (
            <button
              key={b.id}
              onClick={() => onOpen(b.id)}
              className="w-full flex flex-wrap items-center gap-2 text-left rounded-lg px-3 py-2 transition hover:brightness-125"
              style={{ background: C.panel, border: `1px solid ${C.border}` }}
            >
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
                style={{ background: st.bg }}
              >
                {st.label}
              </span>
              <span className="text-sm text-slate-200">
                {b.delivery_mode === 'abholung' ? '🤝' : '📦'}{' '}
                {b.is_test && <span className="text-pink-400 font-semibold">[TEST] </span>}
                <strong>{b.product_name ?? 'Buchung'}</strong>
              </span>
              <span className="text-sm text-slate-400">· {b.customer_name ?? 'Gast'}</span>
              <span className="text-xs text-slate-500 ml-auto">
                Miete {fmtPeriod(b)}
                {b.shipping_method === 'express' && (
                  <span className="ml-2 text-amber-400">Express</span>
                )}
                {b.tracking_number && <span className="ml-2 text-cyan-400">Tracking ✓</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Notiz-Modal
// ============================================================

function NoteModal({
  date,
  notes,
  holidayName,
  onClose,
  onChanged,
}: {
  date: string;
  notes: CalendarNote[];
  holidayName: string | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const dObj = dObjOf(date);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addNote() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/calendar-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Speichern fehlgeschlagen');
      }
      setDraft('');
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/calendar-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Speichern fehlgeschlagen');
      }
      setEditId(null);
      setEditText('');
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setBusy(false);
    }
  }

  async function deleteNote(id: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/calendar-notes?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Löschen fehlgeschlagen');
      }
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    background: C.panel,
    border: `1px solid ${C.border}`,
    color: '#e2e8f0',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl overflow-hidden"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3" style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
          <h2 className="font-semibold text-slate-100">
            Notizen — {WEEKDAYS[(dObj.getDay() + 6) % 7]}, {pad(dObj.getDate())}.{' '}
            {MONTHS[dObj.getMonth()]} {dObj.getFullYear()}
          </h2>
          {holidayName && <p className="text-xs text-red-300 mt-0.5">{holidayName}</p>}
        </div>

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {err && (
            <div
              className="mb-3 rounded px-3 py-2 text-sm text-red-200"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)' }}
            >
              {err}
            </div>
          )}

          {notes.length === 0 ? (
            <p className="text-sm text-slate-500 mb-4">Noch keine Notizen für diesen Tag.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg px-3 py-2"
                  style={{
                    background: 'rgba(245,158,11,0.13)',
                    border: '1px solid rgba(245,158,11,0.35)',
                  }}
                >
                  {editId === n.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        className="w-full text-base rounded px-2 py-1.5"
                        style={inputStyle}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(n.id)}
                          disabled={busy}
                          className="px-3 py-1 text-sm rounded bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"
                        >
                          Speichern
                        </button>
                        <button
                          onClick={() => {
                            setEditId(null);
                            setEditText('');
                          }}
                          className="px-3 py-1 text-sm rounded text-slate-200"
                          style={{ background: '#1e293b', border: `1px solid ${C.border}` }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm whitespace-pre-wrap flex-1" style={{ color: '#fde68a' }}>
                        {n.text}
                      </p>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setEditId(n.id);
                            setEditText(n.text);
                          }}
                          className="text-xs text-slate-400 hover:text-slate-100 px-1"
                          title="Bearbeiten"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteNote(n.id)}
                          disabled={busy}
                          className="text-xs text-red-400 hover:text-red-300 px-1 disabled:opacity-50"
                          title="Löschen"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <label className="block text-xs font-semibold text-slate-400 mb-1">Neue Notiz</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="z. B. Kamera-Wartung, Urlaub, Sondertermin …"
            className="w-full text-base rounded px-2 py-1.5"
            style={inputStyle}
          />
        </div>

        <div
          className="px-5 py-3 flex justify-between"
          style={{ background: C.panel, borderTop: `1px solid ${C.border}` }}
        >
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded text-slate-200"
            style={{ background: '#1e293b', border: `1px solid ${C.border}` }}
          >
            Schließen
          </button>
          <button
            onClick={addNote}
            disabled={busy || !draft.trim()}
            className="px-4 py-1.5 text-sm rounded bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            Notiz hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

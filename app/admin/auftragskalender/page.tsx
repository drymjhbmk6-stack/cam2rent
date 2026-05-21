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
// Konstanten / Helfer
// ============================================================

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  awaiting_payment: { bg: '#7c3aed', label: 'Zahlung offen' },
  confirmed: { bg: '#0891b2', label: 'Bestätigt' },
  shipped: { bg: '#d97706', label: 'Versendet' },
  picked_up: { bg: '#ea580c', label: 'Abgeholt' },
  returned: { bg: '#64748b', label: 'Zurückgegeben' },
  completed: { bg: '#16a34a', label: 'Abgeschlossen' },
};

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
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
  const [month, setMonth] = useState(now.getMonth()); // 0-11
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

  // 42-Tage-Raster (6 Wochen, Montag-basiert)
  const gridStart = useMemo(() => {
    const first = `${year}-${pad(month + 1)}-01`;
    const dow = dObjOf(first).getDay(); // 0=So..6=Sa
    const offset = (dow + 6) % 7; // Montag = 0
    return addD(first, -offset);
  }, [year, month]);
  const gridEnd = useMemo(() => addD(gridStart, 41), [gridStart]);

  // Feiertage für alle vom Raster berührten Jahre
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

  return (
    <div className="ak-root min-h-screen bg-slate-100 text-slate-900 px-4 py-6 md:px-8">
      <div className="max-w-7xl mx-auto">
        <AdminBackLink href="/admin" label="Zurück zum Dashboard" />

        {/* Kopfzeile */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Auftragskalender</h1>
            <p className="text-sm text-slate-500 mt-1">
              Übersicht aller Aufträge — wann was raus muss und wann was zurückkommt.
            </p>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-slate-300">
            <button
              onClick={() => setView('monat')}
              className={`px-4 py-2 text-sm font-medium transition ${
                view === 'monat'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              📅 Monat
            </button>
            <button
              onClick={() => setView('agenda')}
              className={`px-4 py-2 text-sm font-medium transition ${
                view === 'agenda'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              ✓ To-do-Liste
            </button>
          </div>
        </div>

        {/* Steuerung */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              className="px-3 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-50 text-sm"
            >
              ‹ Zurück
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-50 text-sm"
            >
              Heute
            </button>
            <button
              onClick={goNext}
              className="px-3 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-50 text-sm"
            >
              Weiter ›
            </button>
            <span className="ml-2 text-lg font-semibold">
              {MONTHS[month]} {year}
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showTest}
              onChange={(e) => setShowTest(e.target.checked)}
              className="accent-cyan-600"
            />
            Test-Buchungen anzeigen
          </label>
        </div>

        {/* Kennzahlen */}
        <div className="flex flex-wrap gap-3 mb-5 text-sm">
          <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200">
            <strong>{stats.total}</strong> Aufträge im Monat
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200">
            📤 <strong>{stats.shipCount}</strong> Versand/Übergabe
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200">
            📥 <strong>{stats.returnCount}</strong> Rückgaben erwartet
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-100 border border-red-300 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-slate-400">Lädt …</div>
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
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-slate-500">
          {Object.entries(STATUS_STYLE).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded" style={{ background: v.bg }} />
              {v.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" />
            Sonn-/Feiertag
          </span>
          <span className="flex items-center gap-1.5">📦 Versand · 🤝 Abholung · 📤 raus · 📥 zurück · 📝 Notiz</span>
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
// Monatsansicht (Wochenzeilen mit Buchungsbalken)
// ============================================================

const HEADER_H = 46;
const LANE_H = 22;

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
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      {/* Wochentag-Kopf */}
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`px-2 py-2 text-xs font-semibold text-center ${
              i === 6 ? 'text-red-500' : 'text-slate-500'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {weeks.map((w) => {
        const weekStart = addD(gridStart, w * 7);
        const weekEnd = addD(weekStart, 6);

        const inWeek = bookings
          .filter((b) => b.rental_from <= weekEnd && b.rental_to >= weekStart)
          .sort(
            (a, b) =>
              a.rental_from.localeCompare(b.rental_from) ||
              b.rental_to.localeCompare(a.rental_to)
          );

        const lanes: Booking[][] = [];
        const placed = new Map<string, number>();
        for (const b of inWeek) {
          const start = b.rental_from < weekStart ? weekStart : b.rental_from;
          let lane = 0;
          while (true) {
            const laneArr = lanes[lane] ?? [];
            const conflict = laneArr.some((o) => {
              const oEnd = o.rental_to > weekEnd ? weekEnd : o.rental_to;
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

        const dayActions = (day: string) => {
          let ship = 0;
          let ret = 0;
          for (const b of bookings) {
            if (b.ship_date === day) ship++;
            if (b.return_date === day) ret++;
          }
          return { ship, ret };
        };

        return (
          <div
            key={w}
            className="relative border-b border-slate-200 last:border-b-0"
            style={{ minHeight: rowHeight }}
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
                const { ship, ret } = dayActions(day);
                const nCount = noteCount(day);
                return (
                  <button
                    key={d}
                    onClick={() => onDayClick(day)}
                    title="Klicken, um eine Notiz hinzuzufügen"
                    className={`text-left border-r border-slate-200 last:border-r-0 transition group ${
                      isSpecial
                        ? 'bg-red-50 hover:bg-red-100'
                        : isOtherMonth
                        ? 'bg-slate-50 hover:bg-slate-100'
                        : 'bg-white hover:bg-slate-50'
                    } ${isToday ? 'ring-2 ring-amber-400 ring-inset' : ''}`}
                  >
                    <div className="flex items-center justify-between px-1.5 pt-1">
                      <span
                        className={`text-xs font-semibold flex items-center justify-center ${
                          isToday
                            ? 'bg-amber-400 text-white rounded-full w-5 h-5'
                            : isOtherMonth
                            ? 'text-slate-300'
                            : isSpecial
                            ? 'text-red-500'
                            : 'text-slate-700'
                        }`}
                      >
                        {dObj.getDate()}
                      </span>
                      <span className="flex gap-1 items-center">
                        {nCount > 0 && (
                          <span
                            className="text-[10px] px-1 rounded bg-amber-100 text-amber-800 border border-amber-300"
                            title={`${nCount} Notiz(en)`}
                          >
                            📝{nCount}
                          </span>
                        )}
                        {ship > 0 && (
                          <span
                            className="text-[10px] px-1 rounded bg-amber-100 text-amber-700"
                            title={`${ship}× Versand/Übergabe`}
                          >
                            📤{ship}
                          </span>
                        )}
                        {ret > 0 && (
                          <span
                            className="text-[10px] px-1 rounded bg-emerald-100 text-emerald-700"
                            title={`${ret}× Rückgabe erwartet`}
                          >
                            📥{ret}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition">
                          +
                        </span>
                      </span>
                    </div>
                    {holiday && (
                      <div className="px-1.5 mt-0.5 text-[10px] leading-tight text-red-500 truncate">
                        {holiday}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Buchungsbalken */}
            {inWeek.map((b) => {
              const lane = placed.get(b.id) ?? 0;
              const startDay = b.rental_from < weekStart ? weekStart : b.rental_from;
              const endDay = b.rental_to > weekEnd ? weekEnd : b.rental_to;
              const startCol = Math.round(
                (dObjOf(startDay).getTime() - dObjOf(weekStart).getTime()) / 86400000
              );
              const endCol = Math.round(
                (dObjOf(endDay).getTime() - dObjOf(weekStart).getTime()) / 86400000
              );
              const span = Math.max(1, endCol - startCol + 1);
              const st = statusStyle(b.status);
              const roundLeft = b.rental_from >= weekStart;
              const roundRight = b.rental_to <= weekEnd;
              return (
                <button
                  key={b.id}
                  onClick={() => onOpen(b.id)}
                  title={`${b.product_name ?? 'Buchung'} · ${b.customer_name ?? 'Gast'}\nMiete ${fmtPeriod(b)} · ${st.label}\n${
                    b.delivery_mode === 'abholung' ? 'Abholung' : 'Versand'
                  }`}
                  className="absolute text-left px-1.5 text-[11px] leading-[18px] font-medium text-white truncate hover:brightness-110 shadow-sm transition"
                  style={{
                    left: `calc(${(startCol / 7) * 100}% + 2px)`,
                    width: `calc(${(span / 7) * 100}% - 4px)`,
                    top: HEADER_H + lane * LANE_H,
                    height: LANE_H - 3,
                    background: st.bg,
                    borderRadius: `${roundLeft ? 6 : 0}px ${roundRight ? 6 : 0}px ${
                      roundRight ? 6 : 0
                    }px ${roundLeft ? 6 : 0}px`,
                    border: b.is_test ? '1px dashed #f9a8d4' : 'none',
                  }}
                >
                  {b.delivery_mode === 'abholung' ? '🤝 ' : '📦 '}
                  {b.is_test ? '[TEST] ' : ''}
                  {b.product_name ?? 'Buchung'} · {b.customer_name ?? 'Gast'}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Agenda-Ansicht (To-do-Liste pro Tag)
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
      <div className="py-16 text-center text-slate-400 rounded-xl border border-slate-200 bg-white">
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
            className={`rounded-xl border overflow-hidden bg-white ${
              isToday ? 'border-amber-400' : 'border-slate-200'
            } ${isPast ? 'opacity-70' : ''}`}
          >
            <div
              className={`flex items-center justify-between px-4 py-2 text-sm font-semibold ${
                isToday
                  ? 'bg-amber-50 text-amber-800'
                  : isSunday || holiday
                  ? 'bg-red-50 text-red-700'
                  : 'bg-slate-50 text-slate-700'
              }`}
            >
              <span>
                {WEEKDAYS[(dObj.getDay() + 6) % 7]}, {pad(dObj.getDate())}.{' '}
                {MONTHS[dObj.getMonth()]}
                {isToday && ' — heute'}
                {holiday && (
                  <span className="ml-2 font-normal text-red-600">· {holiday}</span>
                )}
              </span>
              <button
                onClick={() => onDayClick(day)}
                className="text-xs font-medium px-2 py-1 rounded bg-white border border-slate-300 hover:bg-slate-50 text-slate-600"
              >
                + Notiz
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {dayNotes.length > 0 && (
                <div className="px-4 py-3">
                  <div className="text-xs font-semibold mb-2 text-amber-700">
                    📝 Notizen ({dayNotes.length})
                  </div>
                  <div className="space-y-1.5">
                    {dayNotes.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => onDayClick(day)}
                        className="w-full text-left rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100 transition whitespace-pre-wrap"
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
                  accent="text-amber-700"
                  items={ship}
                  onOpen={onOpen}
                />
              )}
              {ret.length > 0 && (
                <AgendaGroup
                  title={`📥 Rückgabe erwartet (${ret.length})`}
                  accent="text-emerald-700"
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
    <div className="px-4 py-3">
      <div className={`text-xs font-semibold mb-2 ${accent}`}>{title}</div>
      <div className="space-y-2">
        {items.map((b) => {
          const st = statusStyle(b.status);
          return (
            <button
              key={b.id}
              onClick={() => onOpen(b.id)}
              className="w-full flex flex-wrap items-center gap-2 text-left rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 transition"
            >
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
                style={{ background: st.bg }}
              >
                {st.label}
              </span>
              <span className="text-sm">
                {b.delivery_mode === 'abholung' ? '🤝' : '📦'}{' '}
                {b.is_test && (
                  <span className="text-pink-600 font-semibold">[TEST] </span>
                )}
                <strong>{b.product_name ?? 'Buchung'}</strong>
              </span>
              <span className="text-sm text-slate-500">
                · {b.customer_name ?? 'Gast'}
              </span>
              <span className="text-xs text-slate-400 ml-auto">
                Miete {fmtPeriod(b)}
                {b.shipping_method === 'express' && (
                  <span className="ml-2 text-amber-600">Express</span>
                )}
                {b.tracking_number && (
                  <span className="ml-2 text-cyan-600">Tracking ✓</span>
                )}
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="font-semibold text-slate-900">
            Notizen — {WEEKDAYS[(dObj.getDay() + 6) % 7]}, {pad(dObj.getDate())}.{' '}
            {MONTHS[dObj.getMonth()]} {dObj.getFullYear()}
          </h2>
          {holidayName && (
            <p className="text-xs text-red-600 mt-0.5">{holidayName}</p>
          )}
        </div>

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {err && (
            <div className="mb-3 rounded bg-red-100 border border-red-300 text-red-800 px-3 py-2 text-sm">
              {err}
            </div>
          )}

          {/* Vorhandene Notizen */}
          {notes.length === 0 ? (
            <p className="text-sm text-slate-400 mb-4">Noch keine Notizen für diesen Tag.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2"
                >
                  {editId === n.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        className="w-full text-base rounded border border-slate-300 px-2 py-1.5 text-slate-900"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(n.id)}
                          disabled={busy}
                          className="px-3 py-1 text-sm rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
                        >
                          Speichern
                        </button>
                        <button
                          onClick={() => {
                            setEditId(null);
                            setEditText('');
                          }}
                          className="px-3 py-1 text-sm rounded bg-white border border-slate-300 hover:bg-slate-50"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-amber-900 whitespace-pre-wrap flex-1">
                        {n.text}
                      </p>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setEditId(n.id);
                            setEditText(n.text);
                          }}
                          className="text-xs text-slate-500 hover:text-slate-800 px-1"
                          title="Bearbeiten"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteNote(n.id)}
                          disabled={busy}
                          className="text-xs text-red-500 hover:text-red-700 px-1 disabled:opacity-50"
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

          {/* Neue Notiz */}
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Neue Notiz
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="z. B. Kamera-Wartung, Urlaub, Sondertermin …"
            className="w-full text-base rounded border border-slate-300 px-2 py-1.5 text-slate-900"
          />
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded bg-white border border-slate-300 hover:bg-slate-100"
          >
            Schließen
          </button>
          <button
            onClick={addNote}
            disabled={busy || !draft.trim()}
            className="px-4 py-1.5 text-sm rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            Notiz hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

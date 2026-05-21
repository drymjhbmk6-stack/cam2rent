'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminBackLink from '@/components/admin/AdminBackLink';

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

type ViewMode = 'monat' | 'agenda';

// ============================================================
// Konstanten / Helfer
// ============================================================

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  awaiting_payment: { bg: '#7c3aed', label: 'Zahlung offen' },
  confirmed: { bg: '#0891b2', label: 'Bestätigt' },
  shipped: { bg: '#d97706', label: 'Versendet' },
  picked_up: { bg: '#ea580c', label: 'Abgeholt' },
  returned: { bg: '#475569', label: 'Zurückgegeben' },
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

function fmtDayShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(true);

  // View-Präferenz merken
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
    const dow = new Date(first + 'T12:00:00').getDay(); // 0=So..6=Sa
    const offset = (dow + 6) % 7; // Montag = 0
    return addD(first, -offset);
  }, [year, month]);

  const gridEnd = useMemo(() => addD(gridStart, 41), [gridStart]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/auftragskalender?from=${gridStart}&to=${gridEnd}`
      );
      if (!res.ok) throw new Error('Laden fehlgeschlagen');
      const json = await res.json();
      setBookings(Array.isArray(json.bookings) ? json.bookings : []);
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

  // Kennzahlen für den gewählten Monat
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

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white px-4 py-6 md:px-8">
      <div className="max-w-7xl mx-auto">
        <AdminBackLink href="/admin" label="Zurück zum Dashboard" />

        {/* Kopfzeile */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Auftragskalender</h1>
            <p className="text-sm text-gray-400 mt-1">
              Übersicht aller Aufträge — wann was raus muss und wann was zurückkommt.
            </p>
          </div>
          {/* Ansicht umschalten */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            <button
              onClick={() => setView('monat')}
              className={`px-4 py-2 text-sm font-medium transition ${
                view === 'monat'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-[#111827] text-gray-400 hover:text-white'
              }`}
            >
              📅 Monat
            </button>
            <button
              onClick={() => setView('agenda')}
              className={`px-4 py-2 text-sm font-medium transition ${
                view === 'agenda'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-[#111827] text-gray-400 hover:text-white'
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
              className="px-3 py-1.5 rounded bg-[#1f2937] hover:bg-[#374151] text-sm"
            >
              ‹ Zurück
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 rounded bg-[#1f2937] hover:bg-[#374151] text-sm"
            >
              Heute
            </button>
            <button
              onClick={goNext}
              className="px-3 py-1.5 rounded bg-[#1f2937] hover:bg-[#374151] text-sm"
            >
              Weiter ›
            </button>
            <span className="ml-2 text-lg font-semibold">
              {MONTHS[month]} {year}
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
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
          <span className="px-3 py-1.5 rounded-lg bg-[#111827] border border-gray-800">
            <strong>{stats.total}</strong> Aufträge im Monat
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-[#111827] border border-gray-800">
            📤 <strong>{stats.shipCount}</strong> Versand/Übergabe
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-[#111827] border border-gray-800">
            📥 <strong>{stats.returnCount}</strong> Rückgaben erwartet
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-gray-500">Lädt …</div>
        ) : view === 'monat' ? (
          <MonthView
            gridStart={gridStart}
            month={month}
            today={today}
            bookings={visibleBookings}
            onOpen={(id) => router.push(`/admin/buchungen/${id}`)}
          />
        ) : (
          <AgendaView
            monthFrom={monthFrom}
            monthTo={monthTo}
            today={today}
            bookings={visibleBookings}
            onOpen={(id) => router.push(`/admin/buchungen/${id}`)}
          />
        )}

        {/* Legende */}
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-gray-400">
          {Object.entries(STATUS_STYLE).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded"
                style={{ background: v.bg }}
              />
              {v.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">📦 Versand · 🤝 Abholung · 📤 raus · 📥 zurück</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Monatsansicht (Wochenzeilen mit Buchungsbalken)
// ============================================================

const HEADER_H = 30;
const LANE_H = 22;

function MonthView({
  gridStart,
  month,
  today,
  bookings,
  onOpen,
}: {
  gridStart: string;
  month: number;
  today: string;
  bookings: Booking[];
  onOpen: (id: string) => void;
}) {
  const weeks = [0, 1, 2, 3, 4, 5];

  return (
    <div className="rounded-xl overflow-hidden border border-gray-800">
      {/* Wochentag-Kopf */}
      <div className="grid grid-cols-7 bg-[#111827] border-b border-gray-800">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="px-2 py-2 text-xs font-semibold text-gray-400 text-center"
          >
            {w}
          </div>
        ))}
      </div>

      {weeks.map((w) => {
        const weekStart = addD(gridStart, w * 7);
        const weekEnd = addD(weekStart, 6);

        // Buchungen dieser Woche + Lane-Zuweisung
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
        const rowHeight = HEADER_H + Math.max(1, lanes.length) * LANE_H + 6;

        // Aktions-Marker pro Tag
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
            className="relative border-b border-gray-800 last:border-b-0"
            style={{ minHeight: rowHeight }}
          >
            {/* Hintergrund-Zellen */}
            <div className="grid grid-cols-7 absolute inset-0">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const day = addD(weekStart, d);
                const dObj = new Date(day + 'T12:00:00');
                const isOtherMonth = dObj.getMonth() !== month;
                const isToday = day === today;
                const { ship, ret } = dayActions(day);
                return (
                  <div
                    key={d}
                    className={`border-r border-gray-800 last:border-r-0 ${
                      isOtherMonth ? 'bg-[#0d0d0d]' : 'bg-[#0A0A0A]'
                    }`}
                  >
                    <div className="flex items-center justify-between px-1.5 pt-1">
                      <span
                        className={`text-xs font-medium ${
                          isToday
                            ? 'bg-yellow-500 text-black rounded-full w-5 h-5 flex items-center justify-center'
                            : isOtherMonth
                            ? 'text-gray-600'
                            : 'text-gray-300'
                        }`}
                      >
                        {dObj.getDate()}
                      </span>
                      <span className="flex gap-1">
                        {ship > 0 && (
                          <span
                            className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300"
                            title={`${ship}× Versand/Übergabe`}
                          >
                            📤{ship}
                          </span>
                        )}
                        {ret > 0 && (
                          <span
                            className="text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-300"
                            title={`${ret}× Rückgabe erwartet`}
                          >
                            📥{ret}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Buchungsbalken */}
            {inWeek.map((b) => {
              const lane = placed.get(b.id) ?? 0;
              const startDay = b.rental_from < weekStart ? weekStart : b.rental_from;
              const endDay = b.rental_to > weekEnd ? weekEnd : b.rental_to;
              const startCol = Math.round(
                (new Date(startDay + 'T12:00:00').getTime() -
                  new Date(weekStart + 'T12:00:00').getTime()) /
                  86400000
              );
              const endCol = Math.round(
                (new Date(endDay + 'T12:00:00').getTime() -
                  new Date(weekStart + 'T12:00:00').getTime()) /
                  86400000
              );
              const span = Math.max(1, endCol - startCol + 1);
              const st = statusStyle(b.status);
              const roundLeft = b.rental_from >= weekStart;
              const roundRight = b.rental_to <= weekEnd;
              return (
                <button
                  key={b.id}
                  onClick={() => onOpen(b.id)}
                  title={`${b.product_name ?? 'Buchung'} · ${
                    b.customer_name ?? 'Gast'
                  }\n${fmtPeriod(b)} · ${st.label}`}
                  className="absolute text-left px-1.5 text-[11px] leading-[18px] font-medium text-white truncate hover:brightness-125 transition"
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
  onOpen,
}: {
  monthFrom: string;
  monthTo: string;
  today: string;
  bookings: Booking[];
  onOpen: (id: string) => void;
}) {
  // Tage des Monats mit Aktionen sammeln
  const days: { day: string; ship: Booking[]; ret: Booking[] }[] = [];
  let cur = monthFrom;
  while (cur <= monthTo) {
    const ship = bookings.filter((b) => b.ship_date === cur);
    const ret = bookings.filter((b) => b.return_date === cur);
    if (ship.length > 0 || ret.length > 0) {
      days.push({ day: cur, ship, ret });
    }
    cur = addD(cur, 1);
  }

  if (days.length === 0) {
    return (
      <div className="py-16 text-center text-gray-500 rounded-xl border border-gray-800">
        Keine anstehenden Aufgaben in diesem Monat.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map(({ day, ship, ret }) => {
        const dObj = new Date(day + 'T12:00:00');
        const isToday = day === today;
        const isPast = day < today;
        return (
          <div
            key={day}
            className={`rounded-xl border overflow-hidden ${
              isToday
                ? 'border-yellow-500/60'
                : isPast
                ? 'border-gray-800 opacity-60'
                : 'border-gray-800'
            }`}
          >
            <div
              className={`px-4 py-2 text-sm font-semibold ${
                isToday ? 'bg-yellow-500/15 text-yellow-300' : 'bg-[#111827] text-gray-300'
              }`}
            >
              {WEEKDAYS[(dObj.getDay() + 6) % 7]}, {pad(dObj.getDate())}.{' '}
              {MONTHS[dObj.getMonth()]}
              {isToday && ' — heute'}
            </div>
            <div className="divide-y divide-gray-800">
              {ship.length > 0 && (
                <AgendaGroup
                  title={`📤 Raus / Übergabe (${ship.length})`}
                  accent="text-amber-300"
                  items={ship}
                  onOpen={onOpen}
                />
              )}
              {ret.length > 0 && (
                <AgendaGroup
                  title={`📥 Rückgabe erwartet (${ret.length})`}
                  accent="text-emerald-300"
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
              className="w-full flex flex-wrap items-center gap-2 text-left rounded-lg bg-[#111827] hover:bg-[#1c2531] border border-gray-800 px-3 py-2 transition"
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
                  <span className="text-pink-400 font-semibold">[TEST] </span>
                )}
                <strong>{b.product_name ?? 'Buchung'}</strong>
              </span>
              <span className="text-sm text-gray-400">
                · {b.customer_name ?? 'Gast'}
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                Miete {fmtPeriod(b)}
                {b.shipping_method === 'express' && (
                  <span className="ml-2 text-amber-400">Express</span>
                )}
                {b.tracking_number && (
                  <span className="ml-2 text-cyan-400">Tracking ✓</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

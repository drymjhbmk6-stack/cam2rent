'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayInfo {
  date: string;
  status: 'available' | 'partial' | 'booked' | 'blocked' | 'past';
  available: number;
  total: number;
}

interface AvailabilityData {
  days: DayInfo[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Color config per status */
const STATUS_CONFIG: Record<DayInfo['status'], { bg: string; text: string; label: string }> = {
  available: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Verfügbar' },
  partial:   { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Teilweise verfügbar' },
  booked:    { bg: 'bg-red-100',     text: 'text-red-600',     label: 'Ausgebucht' },
  blocked:   { bg: 'bg-gray-200',    text: 'text-gray-400',    label: 'Gesperrt' },
  past:      { bg: 'bg-gray-100',    text: 'text-gray-300',    label: 'Vergangen' },
};

const STATUS_DOT: Record<DayInfo['status'], string> = {
  available: 'bg-emerald-500',
  partial:   'bg-amber-500',
  booked:    'bg-red-500',
  blocked:   'bg-gray-400',
  past:      'bg-gray-300',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AvailabilityCalendar({ productId }: { productId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const cache = useRef<Record<string, AvailabilityData>>({});

  // Fetch a given month, with caching
  const fetchMonth = useCallback(
    async (y: number, m: number) => {
      const key = formatMonth(y, m);
      if (cache.current[key]) return cache.current[key];

      const res = await fetch(`/api/availability/${productId}?month=${key}`);
      if (!res.ok) return null;
      const json: AvailabilityData = await res.json();
      cache.current[key] = json;
      return json;
    },
    [productId]
  );

  // Load current month + prefetch next
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchMonth(year, month).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });

    // Prefetch next month
    const nextM = month === 11 ? 0 : month + 1;
    const nextY = month === 11 ? year + 1 : year;
    fetchMonth(nextY, nextM);

    return () => { cancelled = true; };
  }, [year, month, fetchMonth]);

  // Navigation handlers
  const goPrev = () => {
    // Don't go before current month
    const nowMonth = now.getMonth();
    const nowYear = now.getFullYear();
    if (year === nowYear && month === nowMonth) return;
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const goNext = () => {
    // Allow up to 6 months ahead
    const maxDate = new Date(now.getFullYear(), now.getMonth() + 6, 1);
    const next = new Date(year, month + 1, 1);
    if (next > maxDate) return;
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  // Build calendar grid
  // First day of month: getDay() returns 0=Sun,1=Mon...6=Sat -> convert to Mo=0
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Mo-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map day data by date string
  const dayMap = new Map<string, DayInfo>();
  if (data?.days) {
    for (const d of data.days) dayMap.set(d.date, d);
  }

  const isPrevDisabled = year === now.getFullYear() && month === now.getMonth();
  const maxNext = new Date(now.getFullYear(), now.getMonth() + 6, 1);
  const isNextDisabled = new Date(year, month + 1, 1) > maxNext;

  return (
    <div className="bg-white rounded-card shadow-card p-5 sm:p-6">
      {/* Header: month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={isPrevDisabled}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Vorheriger Monat"
        >
          <svg className="w-5 h-5 text-brand-steel" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h3 className="font-heading font-bold text-brand-black text-base sm:text-lg">
          {MONTH_NAMES[month]} {year}
        </h3>

        <button
          type="button"
          onClick={goNext}
          disabled={isNextDisabled}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Nächster Monat"
        >
          <svg className="w-5 h-5 text-brand-steel" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="text-center text-xs font-heading font-semibold text-brand-muted uppercase tracking-wider py-1"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for offset */}
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const dateStr = `${formatMonth(year, month)}-${String(dayNum).padStart(2, '0')}`;
          const info = dayMap.get(dateStr);

          if (loading || !info) {
            return (
              <div
                key={dayNum}
                className="aspect-square rounded-lg bg-gray-50 flex items-center justify-center"
              >
                <span className="text-xs text-gray-300">{dayNum}</span>
              </div>
            );
          }

          const cfg = STATUS_CONFIG[info.status];
          return (
            <div
              key={dayNum}
              className={`aspect-square rounded-lg ${cfg.bg} flex flex-col items-center justify-center transition-colors relative group`}
              title={`${dateStr}: ${info.available}/${info.total} verfügbar`}
            >
              <span className={`text-sm font-heading font-semibold ${cfg.text}`}>
                {dayNum}
              </span>
              {info.status !== 'past' && info.status !== 'blocked' && (
                <span className={`text-[9px] font-body ${cfg.text} opacity-70 leading-none`}>
                  {info.available}/{info.total}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-brand-border flex flex-wrap gap-x-4 gap-y-1.5">
        {(['available', 'partial', 'booked', 'blocked'] as const).map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />
            <span className="text-xs font-body text-brand-steel">{STATUS_CONFIG[status].label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

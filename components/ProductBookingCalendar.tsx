'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { isBlockedEndDateForShipping, getShippingBlockReason } from '@/lib/german-holidays';

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

type DeliveryMode = 'versand' | 'abholung';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function formatDate(year: number, month: number, day: number): string {
  return `${formatMonth(year, month)}-${String(day).padStart(2, '0')}`;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductBookingCalendar({
  productId,
  productSlug,
  available: productAvailable,
}: {
  productId: string;
  productSlug: string;
  available: boolean;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const cache = useRef<Record<string, AvailabilityData>>({});

  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('versand');
  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Fetch month data (mit delivery_mode für Puffertage)
  const fetchMonth = useCallback(
    async (y: number, m: number) => {
      const key = `${formatMonth(y, m)}_${deliveryMode}`;
      if (cache.current[key]) return cache.current[key];
      const res = await fetch(`/api/availability/${productId}?month=${formatMonth(y, m)}&delivery_mode=${deliveryMode}`);
      if (!res.ok) return null;
      const json: AvailabilityData = await res.json();
      cache.current[key] = json;
      return json;
    },
    [productId, deliveryMode]
  );

  // Cache leeren wenn delivery_mode wechselt
  useEffect(() => {
    cache.current = {};
  }, [deliveryMode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMonth(year, month).then((result) => {
      if (!cancelled) { setData(result); setLoading(false); }
    });
    // Prefetch next month
    const nextM = month === 11 ? 0 : month + 1;
    const nextY = month === 11 ? year + 1 : year;
    fetchMonth(nextY, nextM);
    return () => { cancelled = true; };
  }, [year, month, fetchMonth]);

  // Navigation
  const isPrevDisabled = year === now.getFullYear() && month === now.getMonth();
  const maxNext = new Date(now.getFullYear(), now.getMonth() + 6, 1);
  const isNextDisabled = new Date(year, month + 1, 1) > maxNext;

  const goPrev = () => {
    if (isPrevDisabled) return;
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const goNext = () => {
    if (isNextDisabled) return;
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  // Calendar grid
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dayMap = new Map<string, DayInfo>();
  if (data?.days) {
    for (const d of data.days) dayMap.set(d.date, d);
  }

  // Check if a day is selectable
  const isChoosingEnd = !!rangeFrom && !rangeTo;

  function isDaySelectable(dateStr: string, info: DayInfo | undefined): boolean {
    if (!info) return false;
    const effectiveStatus = info.status === 'partial' ? 'available' : info.status;
    if (effectiveStatus !== 'available') return false;
    const minDaysAhead = deliveryMode === 'abholung' ? 2 : 3;
    const minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + minDaysAhead);
    const dayDate = parseDate(dateStr);
    if (dayDate < minDate) return false;
    // Versand-Enddatum: gesperrt wenn Folgetag Sonn-/Feiertag
    if (deliveryMode === 'versand' && isChoosingEnd) {
      if (isBlockedEndDateForShipping(dayDate)) return false;
    }
    return true;
  }

  // Handle day click
  function handleDayClick(dateStr: string) {
    if (!rangeFrom || rangeTo) {
      // Start new selection
      setRangeFrom(dateStr);
      setRangeTo(null);
    } else {
      // Set end date
      if (dateStr < rangeFrom) {
        setRangeFrom(dateStr);
        setRangeTo(null);
      } else {
        setRangeTo(dateStr);
      }
    }
  }

  // Check if day is in range
  function isInRange(dateStr: string): boolean {
    if (!rangeFrom) return false;
    const end = rangeTo || hoverDate;
    if (!end) return dateStr === rangeFrom;
    if (end < rangeFrom) return false;
    return dateStr >= rangeFrom && dateStr <= end;
  }

  function isRangeStart(dateStr: string): boolean {
    return dateStr === rangeFrom;
  }

  function isRangeEnd(dateStr: string): boolean {
    return dateStr === (rangeTo || (hoverDate && !rangeTo && rangeFrom && hoverDate >= rangeFrom ? hoverDate : null));
  }

  // Reset range when delivery mode changes
  useEffect(() => {
    setRangeFrom(null);
    setRangeTo(null);
  }, [deliveryMode]);

  const rentalDays = rangeFrom && rangeTo ? daysBetween(rangeFrom, rangeTo) : 0;

  // Get display status (partial → available)
  function getDisplayStatus(info: DayInfo): 'available' | 'booked' | 'blocked' | 'past' {
    if (info.status === 'partial') return 'available';
    return info.status as 'available' | 'booked' | 'blocked' | 'past';
  }

  const STATUS_CONFIG = {
    available: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'Verfügbar' },
    booked:    { bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-600 dark:text-red-400',         label: 'Ausgebucht' },
    blocked:   { bg: 'bg-gray-200 dark:bg-gray-700',           text: 'text-gray-400 dark:text-gray-500',       label: 'Gesperrt' },
    past:      { bg: 'bg-gray-100 dark:bg-gray-800',           text: 'text-gray-300 dark:text-gray-600',       label: 'Vergangen' },
  };

  const STATUS_DOT = {
    available: 'bg-emerald-500',
    booked:    'bg-red-500',
    blocked:   'bg-gray-400',
  };

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-card shadow-card dark:shadow-gray-900/50 p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={isPrevDisabled}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Vorheriger Monat"
          >
            <svg className="w-4 h-4 text-brand-steel dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="font-heading font-bold text-brand-black dark:text-gray-100 text-sm">
            {MONTH_NAMES[month]} {year}
          </h3>
          <button
            type="button"
            onClick={goNext}
            disabled={isNextDisabled}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Nächster Monat"
          >
            <svg className="w-4 h-4 text-brand-steel dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-0.5">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-center text-[10px] font-heading font-semibold text-brand-muted dark:text-gray-500 uppercase py-1">
              {wd}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dateStr = formatDate(year, month, dayNum);
            const info = dayMap.get(dateStr);

            if (loading || !info) {
              return (
                <div key={dayNum} className="aspect-square rounded-md bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                  <span className="text-[11px] text-gray-300 dark:text-gray-600">{dayNum}</span>
                </div>
              );
            }

            const displayStatus = getDisplayStatus(info);
            const selectable = isDaySelectable(dateStr, info);
            const inRange = isInRange(dateStr);
            const isStart = isRangeStart(dateStr);
            const isEnd = isRangeEnd(dateStr);
            const cfg = STATUS_CONFIG[displayStatus];

            const dayDate = parseDate(dateStr);
            const blockReason = deliveryMode === 'versand' && isChoosingEnd && !selectable
              ? getShippingBlockReason(dayDate, true)
              : null;

            let bgClass = cfg.bg;
            let textClass = cfg.text;
            let cursor = 'cursor-default';
            let ringClass = '';

            if (selectable) {
              cursor = 'cursor-pointer';
              if (inRange) {
                bgClass = 'bg-accent-blue/20 dark:bg-accent-blue/30';
                textClass = 'text-accent-blue dark:text-blue-300';
              }
              if (isStart || isEnd) {
                bgClass = 'bg-accent-blue';
                textClass = 'text-white';
                ringClass = 'ring-2 ring-accent-blue ring-offset-1 dark:ring-offset-gray-800';
              }
            } else if (blockReason) {
              bgClass = 'bg-gray-100 dark:bg-gray-700';
              textClass = 'text-gray-400 dark:text-gray-500';
            }

            const tooltip = blockReason
              ?? (displayStatus === 'available' ? 'Verfügbar' : cfg.label);

            return (
              <div key={dayNum} className="relative group">
                <button
                  type="button"
                  disabled={!selectable}
                  onClick={() => selectable && handleDayClick(dateStr)}
                  onMouseEnter={() => {
                    if (selectable && rangeFrom && !rangeTo) setHoverDate(dateStr);
                  }}
                  onMouseLeave={() => setHoverDate(null)}
                  className={`w-full aspect-square rounded-md ${bgClass} ${textClass} ${cursor} ${ringClass} flex items-center justify-center transition-all disabled:cursor-default`}
                  title={tooltip}
                >
                  <span className="text-[11px] font-heading font-semibold">{dayNum}</span>
                </button>
                {blockReason && (
                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md text-[10px] font-body whitespace-nowrap z-50 pointer-events-none"
                    style={{ background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155' }}>
                    {blockReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 pt-2 border-t border-brand-border dark:border-gray-700 flex flex-wrap gap-x-3 gap-y-1">
          {(['available', 'booked', 'blocked'] as const).map((status) => (
            <div key={status} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
              <span className="text-[10px] font-body text-brand-steel dark:text-gray-400">{STATUS_CONFIG[status].label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery mode selection */}
      <div className="flex rounded-[10px] overflow-hidden border border-brand-border dark:border-gray-700">
        <button
          type="button"
          onClick={() => setDeliveryMode('versand')}
          className={`flex-1 py-2.5 text-xs font-heading font-semibold transition-colors ${
            deliveryMode === 'versand'
              ? 'bg-brand-black dark:bg-accent-blue text-white'
              : 'bg-white dark:bg-gray-800 text-brand-steel dark:text-gray-400 hover:bg-brand-bg dark:hover:bg-gray-700'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Versand
          </span>
        </button>
        <button
          type="button"
          onClick={() => setDeliveryMode('abholung')}
          className={`flex-1 py-2.5 text-xs font-heading font-semibold transition-colors ${
            deliveryMode === 'abholung'
              ? 'bg-brand-black dark:bg-accent-blue text-white'
              : 'bg-white dark:bg-gray-800 text-brand-steel dark:text-gray-400 hover:bg-brand-bg dark:hover:bg-gray-700'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Abholung
          </span>
        </button>
      </div>

      {/* Selected range info + CTA */}
      {rangeFrom && rangeTo && (
        <div className="bg-accent-blue-soft dark:bg-accent-blue/10 border border-accent-blue/20 rounded-[10px] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-body text-accent-blue/70 dark:text-blue-300/70">Mietdauer</span>
            <span className="text-xs font-heading font-bold text-accent-blue dark:text-blue-300">
              {rentalDays} {rentalDays === 1 ? 'Tag' : 'Tage'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-body text-accent-blue/70 dark:text-blue-300/70 mb-3">
            <span>{parseDate(rangeFrom).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
            <span>→</span>
            <span>{parseDate(rangeTo).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
          </div>
          <Link
            href={`/kameras/${productSlug}/buchen?from=${rangeFrom}&to=${rangeTo}&delivery=${deliveryMode}`}
            className="block w-full text-center px-4 py-2.5 bg-brand-black dark:bg-accent-blue text-white font-heading font-bold text-sm rounded-[10px] hover:bg-brand-dark dark:hover:bg-blue-600 transition-colors"
          >
            Jetzt mieten
          </Link>
        </div>
      )}

      {/* Hint when no range selected */}
      {!rangeFrom && productAvailable && (
        <p className="text-[10px] font-body text-brand-muted dark:text-gray-500 text-center">
          Wähle Start- und Enddatum im Kalender
        </p>
      )}
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  status: string;
  type: 'post' | 'reel';
  href?: string;
}

interface ContentCalendarProps {
  events: CalendarEvent[];
  onDayClick?: (date: string) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7);
}

function getCalendarStart(year: number, month: number): Date {
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay() || 7;
  const start = new Date(firstDay);
  start.setDate(1 - (dayOfWeek - 1));
  return start;
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const STATUS_BG: Record<string, string> = {
  planned:        'bg-slate-700/80 border-slate-600',
  generating:     'bg-amber-900/60 border-amber-700',
  generated:      'bg-cyan-900/60 border-cyan-700',
  reviewed:       'bg-emerald-900/50 border-emerald-700',
  published:      'bg-emerald-800/80 border-emerald-600',
  skipped:        'bg-slate-800/50 border-slate-700 opacity-40',
  failed:         'bg-red-900/60 border-red-700',
  pending_review: 'bg-amber-900/60 border-amber-700',
  approved:       'bg-cyan-900/60 border-cyan-700',
  scheduled:      'bg-blue-900/60 border-blue-700',
  draft:          'bg-slate-700/80 border-slate-600',
  rendering:      'bg-purple-900/60 border-purple-700',
  rendered:       'bg-cyan-900/50 border-cyan-700',
};

const TYPE_BORDER: Record<string, string> = {
  post: 'border-l-cyan-400',
  reel: 'border-l-purple-400',
};

export default function ContentCalendar({ events, onDayClick, onEventClick }: ContentCalendarProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    for (const date in map) {
      map[date].sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [events]);

  const calendarWeeks = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const start = getCalendarStart(year, month);
    const weeks: Date[][] = [];
    const cur = new Date(start);
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
      if (cur.getMonth() !== month && w >= 4) break;
    }
    return weeks;
  }, [currentMonth]);

  const todayStr = toDateStr(today);
  const currentMonthNum = currentMonth.getMonth();
  const monthLabel = currentMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  return (
    <div className="select-none">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-lg flex items-center justify-center"
          >
            &lsaquo;
          </button>
          <span className="text-base font-bold text-white px-2 min-w-[160px] text-center capitalize">
            {monthLabel}
          </span>
          <button
            onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-lg flex items-center justify-center"
          >
            &rsaquo;
          </button>
        </div>
        <button
          onClick={() => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
          className="text-xs text-cyan-400 hover:text-cyan-300 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-cyan-700 transition-colors"
        >
          Heute
        </button>
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/40">
        {/* Header row */}
        <div className="grid border-b border-slate-800 bg-slate-900/60" style={{ gridTemplateColumns: '2rem repeat(7, 1fr)' }}>
          <div className="py-2 text-[10px] text-slate-600 text-center">KW</div>
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
            <div key={d} className="py-2 text-[11px] text-slate-500 text-center font-medium">{d}</div>
          ))}
        </div>

        {/* Weeks */}
        {calendarWeeks.map((week, wi) => {
          const kw = getWeekNumber(week[0]);
          return (
            <div
              key={wi}
              className="grid border-t border-slate-800/50"
              style={{ gridTemplateColumns: '2rem repeat(7, 1fr)' }}
            >
              {/* KW */}
              <div className="py-1 text-[10px] text-slate-600 text-center border-r border-slate-800/50 pt-2">
                {kw}
              </div>

              {/* Days */}
              {week.map((day, di) => {
                const dateStr = toDateStr(day);
                const isToday = dateStr === todayStr;
                const isCurrentMonth = day.getMonth() === currentMonthNum;
                const dayEvents = eventsByDate[dateStr] ?? [];
                const MAX = 3;
                const visible = dayEvents.slice(0, MAX);
                const overflow = dayEvents.length - MAX;

                return (
                  <div
                    key={di}
                    onClick={() => isCurrentMonth && onDayClick?.(dateStr)}
                    className={[
                      'min-h-[80px] border-l border-slate-800/40 p-0.5 transition-colors',
                      isToday ? 'bg-cyan-950/25' : '',
                      isCurrentMonth && onDayClick ? 'cursor-pointer hover:bg-slate-800/20' : '',
                      !isCurrentMonth ? 'opacity-35' : '',
                    ].join(' ')}
                  >
                    {/* Day number */}
                    <div className={[
                      'text-right text-[11px] font-semibold px-1 mb-0.5 leading-tight',
                      isToday
                        ? 'text-cyan-400'
                        : isCurrentMonth ? 'text-slate-400' : 'text-slate-600',
                    ].join(' ')}>
                      {isToday ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500 text-black text-[10px] font-bold">
                          {day.getDate()}
                        </span>
                      ) : (
                        day.getDate()
                      )}
                    </div>

                    {/* Events */}
                    <div className="space-y-0.5">
                      {visible.map(ev => (
                        <div
                          key={ev.id}
                          onClick={e => { e.stopPropagation(); onEventClick?.(ev); }}
                          className={[
                            'rounded px-1 py-0.5 cursor-pointer border border-l-2 transition-opacity hover:opacity-75',
                            STATUS_BG[ev.status] ?? 'bg-slate-700/80 border-slate-600',
                            TYPE_BORDER[ev.type] ?? 'border-l-slate-400',
                          ].join(' ')}
                          title={`${ev.time} — ${ev.title}`}
                        >
                          <p className="text-[9px] text-slate-400 leading-none">{ev.time}</p>
                          <p className="text-[10px] text-slate-100 leading-tight truncate">{ev.title}</p>
                        </div>
                      ))}
                      {overflow > 0 && (
                        <p className="text-[9px] text-slate-500 pl-1 leading-none">+{overflow}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legende */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded border border-slate-600 border-l-2 border-l-cyan-400 bg-slate-700/80" />
          <span className="text-[10px] text-slate-500">Post</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded border border-slate-600 border-l-2 border-l-purple-400 bg-slate-700/80" />
          <span className="text-[10px] text-slate-500">Reel</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded border border-emerald-600 bg-emerald-800/80" />
          <span className="text-[10px] text-slate-500">Veröffentlicht</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded border border-cyan-700 bg-cyan-900/60" />
          <span className="text-[10px] text-slate-500">Bereit</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded border border-slate-600 bg-slate-700/80" />
          <span className="text-[10px] text-slate-500">Geplant</span>
        </div>
      </div>
    </div>
  );
}

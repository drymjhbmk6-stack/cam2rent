'use client';

import { useState, useCallback, useEffect } from 'react';

type PeriodType = 'monat' | 'quartal' | 'jahr' | 'benutzerdefiniert';

interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  onChange: (range: DateRange) => void;
  initialPeriod?: PeriodType;
}

function getMonthRange(date: Date): DateRange {
  const y = date.getFullYear();
  const m = date.getMonth();
  return {
    from: new Date(y, m, 1).toISOString().split('T')[0],
    to: new Date(y, m + 1, 0).toISOString().split('T')[0],
  };
}

function getQuarterRange(date: Date): DateRange {
  const y = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3);
  return {
    from: new Date(y, q * 3, 1).toISOString().split('T')[0],
    to: new Date(y, q * 3 + 3, 0).toISOString().split('T')[0],
  };
}

function getYearRange(date: Date): DateRange {
  const y = date.getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function DateRangePicker({ onChange, initialPeriod = 'monat' }: DateRangePickerProps) {
  const [periodType, setPeriodType] = useState<PeriodType>(initialPeriod);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const computeRange = useCallback((): DateRange | null => {
    const now = new Date();
    switch (periodType) {
      case 'monat': return getMonthRange(now);
      case 'quartal': return getQuarterRange(now);
      case 'jahr': return getYearRange(now);
      case 'benutzerdefiniert':
        if (customFrom && customTo) return { from: customFrom, to: customTo };
        return null;
    }
  }, [periodType, customFrom, customTo]);

  useEffect(() => {
    const range = computeRange();
    if (range) onChange(range);
  }, [computeRange, onChange]);

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <select
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as PeriodType)}
          style={{ ...inputStyle, cursor: 'pointer', minWidth: 180 }}
        >
          <option value="monat">Aktueller Monat</option>
          <option value="quartal">Aktuelles Quartal</option>
          <option value="jahr">Aktuelles Jahr</option>
          <option value="benutzerdefiniert">Benutzerdefiniert</option>
        </select>
      </div>
      {periodType === 'benutzerdefiniert' && (
        <>
          <div>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={inputStyle}
            />
          </div>
          <span style={{ color: '#64748b' }}>bis</span>
          <div>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={inputStyle}
            />
          </div>
        </>
      )}
    </div>
  );
}

export type { DateRange, PeriodType };

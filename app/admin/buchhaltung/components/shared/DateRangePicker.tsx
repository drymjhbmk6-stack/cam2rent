'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePersistentState } from '@/lib/use-persistent-state';

type PeriodType = 'monat' | 'quartal' | 'jahr' | 'benutzerdefiniert';

interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  onChange: (range: DateRange) => void;
  initialPeriod?: PeriodType;
  /**
   * Wenn gesetzt, merkt sich der Picker den gewählten Zeitraum (Periode +
   * benutzerdefinierte Daten) pro Gerät und stellt ihn beim nächsten Öffnen
   * wieder her. Ohne Key = bisheriges Verhalten (nicht gespeichert).
   */
  persistKey?: string;
}

/**
 * Hooks dürfen nicht bedingt aufgerufen werden → beide Varianten laufen immer,
 * zurückgegeben wird nur die passende. Die inaktive Variante wird nie über
 * ihren Setter verändert und schreibt daher nichts in localStorage.
 */
function useMaybePersistent<T>(
  key: string | undefined,
  def: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const persisted = usePersistentState<T>(key ?? '__daterange_disabled__', def);
  const plain = useState<T>(def);
  return key ? persisted : plain;
}

// WICHTIG: NICHT ueber .toISOString() formatieren. new Date(y, m, d) erzeugt
// lokale Mitternacht; in Berlin (Sommerzeit UTC+2) ist das 22:00 UTC des
// Vortags → .toISOString().split('T')[0] schiebt das Datum um einen Tag zurueck.
// Folge: der letzte Monats-/Quartalstag fiel immer raus, eine Zahlung vom
// 31.05. landete ausserhalb des "Aktueller Monat"-Zeitraums. Stattdessen
// direkt aus den lokalen Datum-Komponenten bauen.
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonthRange(date: Date): DateRange {
  const y = date.getFullYear();
  const m = date.getMonth();
  return {
    from: toLocalDateStr(new Date(y, m, 1)),
    to: toLocalDateStr(new Date(y, m + 1, 0)),
  };
}

function getQuarterRange(date: Date): DateRange {
  const y = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3);
  return {
    from: toLocalDateStr(new Date(y, q * 3, 1)),
    to: toLocalDateStr(new Date(y, q * 3 + 3, 0)),
  };
}

function getYearRange(date: Date): DateRange {
  const y = date.getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function DateRangePicker({ onChange, initialPeriod = 'monat', persistKey }: DateRangePickerProps) {
  const [periodType, setPeriodType] = useMaybePersistent<PeriodType>(persistKey ? `${persistKey}:period` : undefined, initialPeriod);
  const [customFrom, setCustomFrom] = useMaybePersistent<string>(persistKey ? `${persistKey}:from` : undefined, '');
  const [customTo, setCustomTo] = useMaybePersistent<string>(persistKey ? `${persistKey}:to` : undefined, '');

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

  // Bei `persistKey` lädt usePersistentState den gemerkten Zeitraum ERST nach dem
  // Mount nach. Ohne Gate würde `onChange` zuerst mit dem Default und dann mit
  // dem gemerkten Wert feuern → der Konsument stößt ZWEI Fetches an, die
  // konkurrieren (Stale-Response-Race: die langsamere Default-Antwort kann die
  // richtige überschreiben). Deshalb feuert `onChange` bei gesetztem persistKey
  // erst, wenn der gemerkte Wert angewandt ist (ein Tick nach Mount) → genau
  // EIN Fetch mit dem finalen Zeitraum. Ohne persistKey: Verhalten unverändert.
  const [ready, setReady] = useState(!persistKey);
  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (!ready) return;
    const range = computeRange();
    if (range) onChange(range);
  }, [ready, computeRange, onChange]);

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

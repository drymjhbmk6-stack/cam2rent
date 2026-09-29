import { describe, it, expect } from 'vitest';
import {
  normalizeVacationConfig,
  vacationBlockingDay,
  vacationOverlappingSpan,
} from '../vacation-mode';

describe('normalizeVacationConfig', () => {
  it('liest Objekt, JSON-String und Legacy-Array', () => {
    const p = [{ id: 'a', from: '2026-10-10', to: '2026-10-20' }];
    expect(normalizeVacationConfig({ periods: p }).periods).toHaveLength(1);
    expect(normalizeVacationConfig(JSON.stringify({ periods: p })).periods).toHaveLength(1);
    expect(normalizeVacationConfig(p).periods).toHaveLength(1);
    expect(normalizeVacationConfig(null).periods).toEqual([]);
    expect(normalizeVacationConfig('kaputt').periods).toEqual([]);
  });
  it('verwirft ungültige Daten, tauscht vertauschte, füllt leeres Ende', () => {
    const r = normalizeVacationConfig({
      periods: [
        { from: '2026-02-30', to: '2026-03-01' },
        { from: '2026-10-20', to: '2026-10-10' },
        { from: '2026-11-01' },
      ],
    }).periods;
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ from: '2026-10-10', to: '2026-10-20' });
    expect(r[1]).toMatchObject({ from: '2026-11-01', to: '2026-11-01' });
  });
});

describe('vacationBlockingDay', () => {
  const periods = [{ id: 'a', from: '2026-10-10', to: '2026-10-20' }];
  it('sperrt den Urlaub plus Puffer davor/danach', () => {
    // before=2 (Versand vorher), after=2 (Rückgabe nachher)
    expect(vacationBlockingDay('2026-10-07', periods, 2, 2)).toBeNull();
    expect(vacationBlockingDay('2026-10-08', periods, 2, 2)).not.toBeNull();
    expect(vacationBlockingDay('2026-10-15', periods, 2, 2)).not.toBeNull();
    expect(vacationBlockingDay('2026-10-22', periods, 2, 2)).not.toBeNull();
    expect(vacationBlockingDay('2026-10-23', periods, 2, 2)).toBeNull();
  });
});

describe('vacationOverlappingSpan', () => {
  const periods = [{ id: 'a', from: '2026-10-10', to: '2026-10-20' }];
  it('erkennt Überschneidung der Logistik-Spanne', () => {
    expect(vacationOverlappingSpan('2026-10-01', '2026-10-09', periods)).toBeNull();
    expect(vacationOverlappingSpan('2026-10-01', '2026-10-10', periods)).not.toBeNull();
    expect(vacationOverlappingSpan('2026-10-20', '2026-10-25', periods)).not.toBeNull();
    expect(vacationOverlappingSpan('2026-10-21', '2026-10-25', periods)).toBeNull();
  });
});

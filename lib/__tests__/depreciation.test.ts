import { describe, it, expect } from 'vitest';
import {
  monthlyDepreciationRate,
  monthsBetween,
  computeCurrentValue,
  wasDepreciatedInMonth,
  pendingDepreciationMonths,
  isFullyDepreciated,
  type DepreciableAsset,
} from '../depreciation';

function asset(overrides: Partial<DepreciableAsset> = {}): DepreciableAsset {
  return {
    purchase_price: 1200,
    purchase_date: '2024-01-15',
    useful_life_months: 36,
    depreciation_method: 'linear',
    residual_value: 0,
    current_value: 1200,
    last_depreciation_at: null,
    ...overrides,
  };
}

describe('monthlyDepreciationRate', () => {
  it('linear: (kaufpreis - restwert) / monate', () => {
    const a = asset({ purchase_price: 1200, useful_life_months: 36, residual_value: 0 });
    expect(monthlyDepreciationRate(a)).toBe(33.33);
  });

  it('linear mit Restwert: zieht Restwert ab', () => {
    const a = asset({ purchase_price: 1000, useful_life_months: 24, residual_value: 200 });
    expect(monthlyDepreciationRate(a)).toBe(33.33);
  });

  it('immediate: 0 (sofort abgeschrieben)', () => {
    const a = asset({ depreciation_method: 'immediate' });
    expect(monthlyDepreciationRate(a)).toBe(0);
  });

  it('none: 0 (kein Wertverlust)', () => {
    const a = asset({ depreciation_method: 'none' });
    expect(monthlyDepreciationRate(a)).toBe(0);
  });

  it('useful_life_months=0 -> 0 (Division-by-zero-Schutz)', () => {
    const a = asset({ useful_life_months: 0 });
    expect(monthlyDepreciationRate(a)).toBe(0);
  });

  it('Restwert > Kaufpreis (Edge) -> 0', () => {
    const a = asset({ purchase_price: 100, residual_value: 200 });
    expect(monthlyDepreciationRate(a)).toBe(0);
  });

  it('residual_value=null wird wie 0 behandelt', () => {
    const a = asset({ purchase_price: 600, useful_life_months: 12, residual_value: null });
    expect(monthlyDepreciationRate(a)).toBe(50);
  });
});

describe('monthsBetween', () => {
  it('gleicher Monat -> 0', () => {
    expect(monthsBetween('2026-05-01', '2026-05-15')).toBe(0);
  });

  it('exakt 1 Monat (gleicher Tag)', () => {
    expect(monthsBetween('2026-04-15', '2026-05-15')).toBe(1);
  });

  it('1 Tag vor Monatsgrenze -> 0', () => {
    expect(monthsBetween('2026-04-15', '2026-05-14')).toBe(0);
  });

  it('1 Tag nach Monatsgrenze -> 1', () => {
    expect(monthsBetween('2026-04-15', '2026-05-16')).toBe(1);
  });

  it('Jahresuebergreifend 13 Monate', () => {
    expect(monthsBetween('2024-01-15', '2025-02-15')).toBe(13);
  });

  it('to vor from -> 0 (clamp)', () => {
    expect(monthsBetween('2026-05-01', '2024-01-01')).toBe(0);
  });

  it('Ungueltige Daten -> 0', () => {
    expect(monthsBetween('not-a-date', '2026-05-01')).toBe(0);
    expect(monthsBetween('2026-05-01', 'invalid')).toBe(0);
  });
});

describe('computeCurrentValue', () => {
  it('immediate -> Restwert', () => {
    const a = asset({ depreciation_method: 'immediate', residual_value: 50 });
    expect(computeCurrentValue(a)).toBe(50);
  });

  it('immediate ohne Restwert -> 0', () => {
    const a = asset({ depreciation_method: 'immediate', residual_value: null });
    expect(computeCurrentValue(a)).toBe(0);
  });

  it('none -> bleibt Kaufpreis', () => {
    const a = asset({ depreciation_method: 'none', purchase_price: 999 });
    expect(computeCurrentValue(a)).toBe(999);
  });

  it('linear: nach 0 Monaten -> voller Kaufpreis', () => {
    const a = asset({ purchase_price: 1200, purchase_date: '2026-05-01' });
    expect(computeCurrentValue(a, new Date('2026-05-15'))).toBe(1200);
  });

  it('linear: nach 12 Monaten von 36 -> 1/3 abgeschrieben', () => {
    const a = asset({
      purchase_price: 1200,
      purchase_date: '2025-05-01',
      useful_life_months: 36,
      residual_value: 0,
    });
    // Rate = 33.33/Monat, 12*33.33 = 399.96 abgeschrieben
    // 1200 - 399.96 = 800.04
    expect(computeCurrentValue(a, new Date('2026-05-01'))).toBeCloseTo(800.04, 1);
  });

  it('linear: nach Nutzungsdauer -> Restwert (Floor)', () => {
    const a = asset({
      purchase_price: 1200,
      purchase_date: '2020-01-01',
      useful_life_months: 36,
      residual_value: 100,
    });
    expect(computeCurrentValue(a, new Date('2026-05-01'))).toBe(100);
  });

  it('linear: Restwert wird nie unterschritten', () => {
    const a = asset({
      purchase_price: 1200,
      purchase_date: '2010-01-01',
      useful_life_months: 36,
      residual_value: 200,
    });
    expect(computeCurrentValue(a, new Date('2026-05-01'))).toBe(200);
  });
});

describe('wasDepreciatedInMonth', () => {
  it('null last_depreciation_at -> false', () => {
    const a = asset({ last_depreciation_at: null });
    expect(wasDepreciatedInMonth(a, '2026-05')).toBe(false);
  });

  it('gleicher Monat -> true', () => {
    const a = asset({ last_depreciation_at: '2026-05-15T10:00:00Z' });
    expect(wasDepreciatedInMonth(a, '2026-05')).toBe(true);
  });

  it('anderer Monat -> false', () => {
    const a = asset({ last_depreciation_at: '2026-04-30T23:59:59Z' });
    expect(wasDepreciatedInMonth(a, '2026-05')).toBe(false);
  });
});

describe('pendingDepreciationMonths', () => {
  it('non-linear -> leer', () => {
    const a = asset({ depreciation_method: 'immediate' });
    expect(pendingDepreciationMonths(a, new Date('2026-05-01'))).toEqual([]);
  });

  it('frisch gekauft, 0 Monate vergangen -> nur Anschaffungs-Monat', () => {
    const a = asset({ purchase_date: '2026-05-01', last_depreciation_at: null });
    const result = pendingDepreciationMonths(a, new Date('2026-05-15'));
    expect(result).toEqual(['2026-05']);
  });

  it('letzte AfA war Vormonat -> ein offener Monat', () => {
    const a = asset({
      purchase_date: '2024-01-15',
      last_depreciation_at: '2026-04-15T00:00:00Z',
    });
    expect(pendingDepreciationMonths(a, new Date('2026-05-15'))).toEqual(['2026-05']);
  });

  it('letzte AfA war 3 Monate her -> 3 offene Monate', () => {
    const a = asset({
      purchase_date: '2024-01-15',
      last_depreciation_at: '2026-02-15T00:00:00Z',
    });
    expect(pendingDepreciationMonths(a, new Date('2026-05-15'))).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
    ]);
  });

  it('guard: bei extrem altem Asset capped auf 240 Monate', () => {
    const a = asset({
      purchase_date: '2000-01-01',
      last_depreciation_at: null,
    });
    const result = pendingDepreciationMonths(a, new Date('2026-05-15'));
    expect(result.length).toBeLessThanOrEqual(240);
  });
});

describe('isFullyDepreciated', () => {
  it('Buchwert exakt am Restwert -> true', () => {
    const a = asset({ current_value: 100, residual_value: 100 });
    expect(isFullyDepreciated(a)).toBe(true);
  });

  it('Buchwert 1 Cent unter Restwert + 1 Cent Toleranz -> true', () => {
    const a = asset({ current_value: 99.99, residual_value: 100 });
    expect(isFullyDepreciated(a)).toBe(true);
  });

  it('Buchwert 1 Euro ueber Restwert -> false', () => {
    const a = asset({ current_value: 101, residual_value: 100 });
    expect(isFullyDepreciated(a)).toBe(false);
  });

  it('residual_value=null wird wie 0 behandelt', () => {
    const a = asset({ current_value: 0, residual_value: null });
    expect(isFullyDepreciated(a)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  groupByPeriod,
  periodGroupKey,
  groupPaymentIntentId,
  distributeAmount,
  type PeriodGroupable,
} from '../cart-period-groups';

/** Minimaler Warenkorb-Eintrag mit Kennung, um Gruppen-Inhalte zu prüfen. */
type Item = PeriodGroupable & { name: string };
const item = (
  name: string,
  rentalFrom: string,
  rentalTo: string,
  haftung: Item['haftung'] = 'none',
): Item => ({ name, rentalFrom, rentalTo, haftung });

describe('groupByPeriod', () => {
  it('trennt zwei Kameras mit unterschiedlichem Zeitraum (der gemeldete Kundenfall)', () => {
    const groups = groupByPeriod([
      item('Kamera A', '2026-09-01', '2026-09-05'),
      item('Kamera B', '2026-09-10', '2026-09-14'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].rentalFrom).toBe('2026-09-01');
    expect(groups[0].rentalTo).toBe('2026-09-05');
    expect(groups[1].rentalFrom).toBe('2026-09-10');
    expect(groups[1].rentalTo).toBe('2026-09-14');
  });

  it('fasst gleichen Zeitraum + gleiche Haftung zu EINER Gruppe zusammen', () => {
    const groups = groupByPeriod([
      item('Kamera A', '2026-09-01', '2026-09-05', 'standard'),
      item('Kamera B', '2026-09-01', '2026-09-05', 'standard'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.name)).toEqual(['Kamera A', 'Kamera B']);
    expect(groups[0].haftung).toBe('standard');
  });

  it('trennt gleichen Zeitraum bei unterschiedlicher Haftung', () => {
    // bookings.haftung ist EINE Spalte — sonst traegt die Buchung nur die
    // Haftung des ersten Items, waehrend price_haftung die Summe beider ist.
    const groups = groupByPeriod([
      item('Kamera A', '2026-09-01', '2026-09-05', 'premium'),
      item('Kamera B', '2026-09-01', '2026-09-05', 'none'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].haftung).toBe('premium');
    expect(groups[1].haftung).toBe('none');
  });

  it('behaelt die Reihenfolge des ersten Auftretens (Gruppe 0 bleibt stabil)', () => {
    const groups = groupByPeriod([
      item('B', '2026-10-10', '2026-10-12'),
      item('A', '2026-09-01', '2026-09-05'),
      item('B2', '2026-10-10', '2026-10-12'),
    ]);
    expect(groups.map((g) => g.rentalFrom)).toEqual(['2026-10-10', '2026-09-01']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['B', 'B2']);
  });

  it('liefert bei leerem Warenkorb keine Gruppen', () => {
    expect(groupByPeriod([])).toEqual([]);
  });

  it('behandelt fehlende Haftung wie "none"', () => {
    const a = { rentalFrom: '2026-09-01', rentalTo: '2026-09-05' } as unknown as PeriodGroupable;
    const b = item('B', '2026-09-01', '2026-09-05', 'none');
    expect(periodGroupKey(a)).toBe(periodGroupKey(b));
    expect(groupByPeriod([a, b])).toHaveLength(1);
  });
});

describe('groupPaymentIntentId', () => {
  it('laesst Gruppe 0 die echte Stripe-ID tragen und suffixt den Rest', () => {
    expect(groupPaymentIntentId('pi_123', 0)).toBe('pi_123');
    expect(groupPaymentIntentId('pi_123', 1)).toBe('pi_123_g2');
    expect(groupPaymentIntentId('pi_123', 2)).toBe('pi_123_g3');
  });
});

describe('distributeAmount', () => {
  it('verteilt proportional zu den Gewichten', () => {
    expect(distributeAmount(100, [3, 1])).toEqual([75, 25]);
  });

  it('haelt die Summe exakt — Rundungsrest landet in der letzten Gruppe', () => {
    const parts = distributeAmount(100, [1, 1, 1]);
    expect(parts).toHaveLength(3);
    expect(parts.reduce((s, p) => s + p, 0)).toBeCloseTo(100, 10);
    expect(parts[0]).toBe(33.33);
    expect(parts[2]).toBe(33.34);
  });

  it('haelt die Summe auch bei krummen Betraegen', () => {
    for (const total of [12.99, 249.9, 1000.01, 7.77]) {
      for (const weights of [[1, 2], [5, 3, 2], [1, 1, 1, 1]]) {
        const parts = distributeAmount(total, weights);
        expect(parts.reduce((s, p) => s + p, 0)).toBeCloseTo(total, 10);
      }
    }
  });

  it('verteilt bei Gewichtssumme 0 gleichmaessig statt durch 0 zu teilen', () => {
    const parts = distributeAmount(30, [0, 0, 0]);
    expect(parts.reduce((s, p) => s + p, 0)).toBeCloseTo(30, 10);
  });

  it('gibt bei einer Gruppe den vollen Betrag', () => {
    expect(distributeAmount(49.9, [1])).toEqual([49.9]);
    expect(distributeAmount(0, [])).toEqual([]);
  });
});

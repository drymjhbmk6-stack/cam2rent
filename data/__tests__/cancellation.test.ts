import { describe, it, expect } from 'vitest';
import {
  CANCELLATION_TIERS,
  refundRateForDays,
  computeCancellationRefund,
  daysUntilRentalStart,
  getRefundPercentage,
  getCancellationEligibility,
  isSelfServiceCancellable,
  getCancellationInfo,
  effectiveCancelDate,
} from '@/data/cancellation';

// Fester Referenztag als reines Datums-Parse (UTC-Mitternacht), damit die
// Tagesdifferenz unabhängig von der Testrechner-Zeitzone stabil bleibt.
const NOW = new Date('2026-05-15');

/** Datum n Kalendertage nach NOW als YYYY-MM-DD. */
function daysAhead(n: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('CANCELLATION_TIERS — Staffel gemäß AGB § 15 Abs. 1', () => {
  it('ist eine einzige, absteigend sortierte Quelle der Wahrheit', () => {
    expect(CANCELLATION_TIERS).toEqual([
      { minDaysBefore: 8, refundRate: 1.0 },
      { minDaysBefore: 3, refundRate: 0.5 },
      { minDaysBefore: 0, refundRate: 0.1 },
    ]);
  });
});

describe('refundRateForDays — Grenzfälle', () => {
  it.each([
    [8, 1.0], // > 7 Tage → 100 %
    [7, 0.5], // Grenzfall: genau 7 Tage → 50 %
    [6, 0.5], // 3–7 Tage → 50 %
    [3, 0.5], // Grenzfall: genau 3 Tage → 50 %
    [2, 0.1], // Grenzfall: genau 2 Tage → 10 %
    [1, 0.1], // < 3 Tage → 10 %
    [0, 0.1], // Mietbeginn heute → 10 %
    [-1, 0.0], // Miete hat begonnen → keine Erstattung
  ])('bei %i Tagen vor Mietbeginn → Rate %f', (days, rate) => {
    expect(refundRateForDays(days)).toBe(rate);
  });
});

describe('getRefundPercentage — über echte Kalenderdaten', () => {
  it.each([
    [8, 1.0],
    [7, 0.5],
    [6, 0.5],
    [3, 0.5],
    [2, 0.1],
    [1, 0.1],
    [0, 0.1],
  ])('Mietbeginn in %i Tagen → Rate %f', (n, rate) => {
    expect(getRefundPercentage(daysAhead(n), null, NOW)).toBe(rate);
  });
});

describe('computeCancellationRefund — Versandkosten separat (§ 15 Abs. 5)', () => {
  it('100 % (> 7 Tage): voller Betrag inkl. Versand', () => {
    const r = computeCancellationRefund({ priceTotal: 100, shippingPrice: 10, daysUntilStart: 8 });
    expect(r).toMatchObject({ refundRate: 1.0, gradedRefund: 90, shippingRefund: 10, refundTotal: 100 });
  });

  it('50 % (3–7 Tage): halber Mietanteil, aber Versand VOLL erstattet', () => {
    const r = computeCancellationRefund({ priceTotal: 100, shippingPrice: 10, daysUntilStart: 7 });
    expect(r).toMatchObject({ refundRate: 0.5, gradedRefund: 45, shippingRefund: 10, refundTotal: 55 });
  });

  it('10 % (< 3 Tage): 10 % Mietanteil, Versand VOLL erstattet', () => {
    const r = computeCancellationRefund({ priceTotal: 100, shippingPrice: 10, daysUntilStart: 2 });
    expect(r).toMatchObject({ refundRate: 0.1, gradedRefund: 9, shippingRefund: 10, refundTotal: 19 });
  });

  it('bereits versendet: Versandkosten sind verbraucht → keine Versanderstattung', () => {
    const r = computeCancellationRefund({
      priceTotal: 100,
      shippingPrice: 10,
      daysUntilStart: 7,
      alreadyShipped: true,
    });
    expect(r).toMatchObject({ gradedRefund: 45, shippingRefund: 0, refundTotal: 45 });
  });

  it('ohne Versandkosten (Abholung): Staffel wirkt auf den vollen Betrag', () => {
    const r = computeCancellationRefund({ priceTotal: 80, shippingPrice: 0, daysUntilStart: 2 });
    expect(r).toMatchObject({ gradedRefund: 8, shippingRefund: 0, refundTotal: 8 });
  });

  it('rundet auf Cent (§ 15 auf krummen Beträgen)', () => {
    const r = computeCancellationRefund({ priceTotal: 49.99, shippingPrice: 4.99, daysUntilStart: 2 });
    // gradedBase = 45.00 → 4.50; shipping voll 4.99 → total 9.49
    expect(r.gradedRefund).toBe(4.5);
    expect(r.shippingRefund).toBe(4.99);
    expect(r.refundTotal).toBe(9.49);
  });
});

describe('getCancellationEligibility — Selbstservice nur > 7 Tage', () => {
  it.each([
    [8, 'allowed'],
    [7, 'email_only'], // 7 Tage sind NICHT mehr kostenlos
    [3, 'email_only'],
    [2, 'email_only'], // < 3 Tage weiterhin stornierbar (per E-Mail, 10 %)
    [0, 'email_only'],
  ])('Mietbeginn in %i Tagen (confirmed) → %s', (n, expected) => {
    expect(getCancellationEligibility(daysAhead(n), 'confirmed', null, NOW)).toBe(expected);
  });

  it('Miete hat begonnen → not_possible', () => {
    expect(getCancellationEligibility(daysAhead(-1), 'confirmed', null, NOW)).toBe('not_possible');
  });

  it('nicht bestätigte Buchung → not_possible', () => {
    expect(getCancellationEligibility(daysAhead(10), 'awaiting_payment', null, NOW)).toBe('not_possible');
  });

  it('isSelfServiceCancellable nur bei > 7 Tagen true', () => {
    expect(isSelfServiceCancellable(daysAhead(8), 'confirmed', null, NOW)).toBe(true);
    expect(isSelfServiceCancellable(daysAhead(7), 'confirmed', null, NOW)).toBe(false);
  });
});

describe('getCancellationInfo — Anzeige-Prozente', () => {
  it('> 7 Tage → 100 %, kostenlos', () => {
    const info = getCancellationInfo(daysAhead(10), 'confirmed', null, NOW);
    expect(info.refundPercentage).toBe(100);
    expect(info.label).toBe('Kostenlose Stornierung');
  });

  it('3–7 Tage → 50 %', () => {
    const info = getCancellationInfo(daysAhead(5), 'confirmed', null, NOW);
    expect(info.refundPercentage).toBe(50);
    expect(info.label).toContain('50 %');
  });

  it('< 3 Tage → 10 % (nicht mehr "keine Erstattung")', () => {
    const info = getCancellationInfo(daysAhead(2), 'confirmed', null, NOW);
    expect(info.refundPercentage).toBe(10);
    expect(info.label).toContain('90 %');
  });

  it('Miete begonnen → 0 %', () => {
    const info = getCancellationInfo(daysAhead(-1), 'confirmed', null, NOW);
    expect(info.refundPercentage).toBe(0);
  });
});

describe('effectiveCancelDate / Anker — Verlegung öffnet kein neues Fenster', () => {
  it('ohne Anker gilt rental_from', () => {
    expect(effectiveCancelDate('2026-06-20', null)).toBe('2026-06-20');
  });

  it('mit früherem Anker gewinnt der Anker (ursprünglicher Mietbeginn)', () => {
    expect(effectiveCancelDate('2026-06-20', '2026-05-20')).toBe('2026-05-20');
  });

  it('Verlegung nach hinten: Storno rechnet weiter gegen den Ur-Termin', () => {
    // Ursprünglich 05-20 (5 Tage vor NOW-basiertem Fenster), verlegt auf 06-20.
    const anchor = daysAhead(5); // maßgeblich
    const movedTo = daysAhead(36); // neuer Termin
    expect(daysUntilRentalStart(movedTo, anchor, NOW)).toBe(5);
    expect(getRefundPercentage(movedTo, anchor, NOW)).toBe(0.5); // NICHT 100 %
  });
});

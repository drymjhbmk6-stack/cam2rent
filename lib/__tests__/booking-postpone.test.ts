import { describe, it, expect } from 'vitest';
import { freezeAnchor, computePostponeTo, isoAddDays } from '@/lib/booking-postpone-utils';
import { getRefundPercentage, daysUntilRentalStart } from '@/data/cancellation';

describe('freezeAnchor — Storno-Anker friert den Ur-Termin ein (AGB § 15 Abs. 2)', () => {
  it('erste Verlegung ohne Anker → alter rental_from wird zum Anker', () => {
    expect(freezeAnchor(null, '2026-05-10')).toBe('2026-05-10');
    expect(freezeAnchor(undefined, '2026-05-10')).toBe('2026-05-10');
    expect(freezeAnchor('', '2026-05-10')).toBe('2026-05-10');
  });

  it('Verlegung nach HINTEN behält den früheren Anker', () => {
    // Ur-Termin 10.05 war schon eingefroren; erneutes Verlegen von 20.06.
    expect(freezeAnchor('2026-05-10', '2026-06-20')).toBe('2026-05-10');
  });

  it('Verlegung nach VORN: früheres Datum gewinnt', () => {
    expect(freezeAnchor('2026-05-10', '2026-05-03')).toBe('2026-05-03');
  });

  it('ignoriert Zeitanteil (nur Datum)', () => {
    expect(freezeAnchor('2026-05-10T09:00:00Z', '2026-06-20')).toBe('2026-05-10');
  });
});

describe('computePostponeTo / isoAddDays — Dauer bleibt gleich', () => {
  it('gleiche Mietdauer beim Verschieben', () => {
    expect(computePostponeTo('2026-06-20', 7)).toBe('2026-06-26'); // 7 Tage inkl.
    expect(computePostponeTo('2026-06-20', 1)).toBe('2026-06-20'); // 1 Tag
  });
  it('isoAddDays über Monatsgrenze', () => {
    expect(isoAddDays('2026-05-30', 3)).toBe('2026-06-02');
  });
});

describe('Verlegung öffnet KEIN neues kostenloses Storno-Fenster', () => {
  // Referenztag als reines Datums-Parse → zeitzonenstabil.
  const NOW = new Date('2026-05-15');
  const daysAhead = (n: number) => {
    const d = new Date(NOW);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  it('Kunde bucht in 2 Tagen, verlegt weit nach hinten, storniert → 10 % (nicht 100 %)', () => {
    // Ursprünglicher Mietbeginn in 2 Tagen (→ < 3-Tage-Stufe, 10 %).
    const originalFrom = daysAhead(2);
    // Missbrauchsversuch: Verlegung 40 Tage nach hinten würde ohne Anker das
    // kostenlose > 7-Tage-Fenster (100 %) neu öffnen.
    const movedTo = daysAhead(42);
    const frozenAnchor = freezeAnchor(originalFrom, originalFrom); // eingefroren bei Verlegung

    // Storno „heute": gegen den neuen Termin wären es +42 Tage → naiv 100 %.
    expect(getRefundPercentage(movedTo, null, NOW)).toBe(1.0);
    // Mit Anker wird gegen den Ur-Termin (2 Tage) gerechnet → 10 %.
    expect(daysUntilRentalStart(movedTo, frozenAnchor, NOW)).toBe(2);
    expect(getRefundPercentage(movedTo, frozenAnchor, NOW)).toBe(0.1);
  });

  it('Kunde bucht in 5 Tagen, verlegt weit nach hinten, storniert → 50 % (nicht 100 %)', () => {
    const originalFrom = daysAhead(5);
    const movedTo = daysAhead(60);
    const frozenAnchor = freezeAnchor(originalFrom, originalFrom);
    expect(getRefundPercentage(movedTo, frozenAnchor, NOW)).toBe(0.5); // 3–7-Tage-Stufe
  });
});

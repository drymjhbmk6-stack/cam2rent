import { describe, it, expect } from 'vitest';
import {
  computeEffectiveBookingSpan,
  isoAddDays,
  markerForDay,
  DEFAULT_BUFFER,
  type BookingLogisticsInput,
  type BufferDays,
} from '../booking-buffer';

/** Versand 2/2, Abholung 0/1 — der Customer-Default. */
const BUF: BufferDays = DEFAULT_BUFFER;

/** Basis: Miete 10.–15.04., Versand → geplant 08.04. bis 17.04. */
function booking(over: Partial<BookingLogisticsInput> = {}): BookingLogisticsInput {
  return {
    rental_from: '2026-04-10',
    rental_to: '2026-04-15',
    delivery_mode: 'versand',
    status: 'confirmed',
    ...over,
  };
}

const TODAY = '2026-04-12'; // mitten in der Miete, damit "overdue" nicht greift

describe('isoAddDays', () => {
  it('addiert und subtrahiert Tage', () => {
    expect(isoAddDays('2026-04-10', -2)).toBe('2026-04-08');
    expect(isoAddDays('2026-04-10', 5)).toBe('2026-04-15');
  });

  it('ist DST-immun ueber die Winterzeit-Umstellung (26.10.2026)', () => {
    // 26.10. ist ein 25-Stunden-Tag in Berlin — ms-Arithmetik kippt hier.
    expect(isoAddDays('2026-10-26', -2)).toBe('2026-10-24');
    expect(isoAddDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('ist DST-immun ueber die Sommerzeit-Umstellung (29.03.2026)', () => {
    expect(isoAddDays('2026-03-29', -2)).toBe('2026-03-27');
    expect(isoAddDays('2026-03-27', 2)).toBe('2026-03-29');
  });
});

describe('computeEffectiveBookingSpan — ohne Ist-Daten', () => {
  it('verhaelt sich exakt wie die reine Puffer-Rechnung', () => {
    const r = computeEffectiveBookingSpan(booking(), BUF, { today: TODAY });
    expect(r.plannedStart).toBe('2026-04-08');
    expect(r.plannedEnd).toBe('2026-04-17');
    expect(r.start).toBe('2026-04-08');
    expect(r.end).toBe('2026-04-17');
    expect(r.markers).toEqual([]);
    expect(r.actualDispatchDate).toBeNull();
  });

  it('respektiert die manuellen Override-Termine', () => {
    const r = computeEffectiveBookingSpan(
      booking({ ship_date_override: '2026-04-05', return_due_date_override: '2026-04-20' }),
      BUF,
      { today: TODAY },
    );
    expect(r.plannedStart).toBe('2026-04-05');
    expect(r.plannedEnd).toBe('2026-04-20');
    expect(r.start).toBe('2026-04-05');
    expect(r.end).toBe('2026-04-20');
  });

  it('nutzt die Abholung-Puffer bei delivery_mode=abholung', () => {
    const r = computeEffectiveBookingSpan(
      booking({ delivery_mode: 'abholung' }),
      BUF,
      { today: TODAY },
    );
    expect(r.plannedStart).toBe('2026-04-10'); // abholung_before = 0
    expect(r.plannedEnd).toBe('2026-04-16'); // abholung_after = 1
  });
});

describe('Regel 1 — zu frueh abgegeben', () => {
  it('dehnt den Block nach vorne aus und setzt einen early-dispatch-Marker', () => {
    const r = computeEffectiveBookingSpan(
      booking({ actual_dispatch_at: '2026-04-06T09:30:00Z' }),
      BUF,
      { today: TODAY },
    );
    expect(r.start).toBe('2026-04-06'); // statt 08.04.
    expect(r.plannedStart).toBe('2026-04-08'); // Plan bleibt erhalten
    expect(r.end).toBe('2026-04-17'); // Ende unveraendert
    expect(r.markers).toContainEqual({
      kind: 'early-dispatch',
      from: '2026-04-06',
      to: '2026-04-07',
    });
  });
});

describe('Regel 2 — zu spaet abgegeben', () => {
  it('laesst die Spanne UNVERAENDERT und markiert nur den Ist-Tag', () => {
    const r = computeEffectiveBookingSpan(
      booking({ actual_dispatch_at: '2026-04-09T14:00:00Z' }),
      BUF,
      { today: TODAY },
    );
    // Kern-Invariante: nie verkuerzen — der 08.04. bleibt blockiert.
    expect(r.start).toBe('2026-04-08');
    expect(r.markers).toContainEqual({
      kind: 'late-dispatch',
      from: '2026-04-09',
      to: '2026-04-09',
    });
    expect(r.markers.find((m) => m.kind === 'early-dispatch')).toBeUndefined();
  });
});

describe('Regel 3 — Fruehzustellung beim Kunden', () => {
  it('markiert die Tage bis Mietbeginn, ohne die Spanne zu aendern', () => {
    const r = computeEffectiveBookingSpan(
      booking({ actual_delivery_at: '2026-04-08T11:00:00Z' }),
      BUF,
      { today: TODAY },
    );
    expect(r.start).toBe('2026-04-08');
    expect(r.end).toBe('2026-04-17');
    expect(r.markers).toContainEqual({
      kind: 'early-delivery',
      from: '2026-04-08',
      to: '2026-04-09',
    });
  });

  it('markiert nichts, wenn puenktlich am Mietbeginn zugestellt', () => {
    const r = computeEffectiveBookingSpan(
      booking({ actual_delivery_at: '2026-04-10T11:00:00Z' }),
      BUF,
      { today: TODAY },
    );
    expect(r.markers.find((m) => m.kind === 'early-delivery')).toBeUndefined();
  });
});

describe('Regel 4 — Rueckpaket frueher eingetroffen', () => {
  it('gibt NICHTS frei, solange die Pruefung offen ist', () => {
    const r = computeEffectiveBookingSpan(
      booking({ status: 'delivered', actual_return_at: '2026-04-16T08:00:00Z' }),
      BUF,
      { today: '2026-04-16' },
    );
    expect(r.end).toBe('2026-04-17'); // Soll-Ende bleibt stehen
    expect(r.markers).toContainEqual({
      kind: 'early-return',
      from: '2026-04-16',
      to: '2026-04-17',
    });
  });

  it('setzt keinen early-return-Marker mehr, wenn die Buchung abgeschlossen ist', () => {
    const r = computeEffectiveBookingSpan(
      booking({ status: 'completed', actual_return_at: '2026-04-16T08:00:00Z' }),
      BUF,
      { today: '2026-04-16' },
    );
    expect(r.markers.find((m) => m.kind === 'early-return')).toBeUndefined();
  });

  it('faellt auf return_arrived_at zurueck, wenn actual_return_at fehlt', () => {
    const r = computeEffectiveBookingSpan(
      booking({ status: 'delivered', return_arrived_at: '2026-04-16T08:00:00Z' }),
      BUF,
      { today: '2026-04-16' },
    );
    expect(r.actualReturnDate).toBe('2026-04-16');
  });

  it('dehnt aus, wenn das Rueckpaket SPAETER als geplant eintrifft', () => {
    const r = computeEffectiveBookingSpan(
      booking({ status: 'delivered', actual_return_at: '2026-04-19T08:00:00Z' }),
      BUF,
      { today: '2026-04-19' },
    );
    expect(r.end).toBe('2026-04-19');
  });
});

describe('Regel 5 — ueberfaellige Rueckgabe', () => {
  it('dehnt den Block rollierend bis heute aus', () => {
    const r = computeEffectiveBookingSpan(
      booking({ status: 'delivered' }),
      BUF,
      { today: '2026-04-21' },
    );
    expect(r.end).toBe('2026-04-21');
    expect(r.markers).toContainEqual({
      kind: 'overdue-return',
      from: '2026-04-18',
      to: '2026-04-21',
    });
  });

  it('greift nicht, wenn die Buchung nicht mehr reserviert', () => {
    const r = computeEffectiveBookingSpan(
      booking({ status: 'completed' }),
      BUF,
      { today: '2026-04-21' },
    );
    expect(r.end).toBe('2026-04-17');
    expect(r.markers).toEqual([]);
  });

  it('laesst sich per applyOverdue=false abschalten', () => {
    const r = computeEffectiveBookingSpan(
      booking({ status: 'delivered' }),
      BUF,
      { today: '2026-04-21', applyOverdue: false },
    );
    expect(r.end).toBe('2026-04-17');
    expect(r.markers.find((m) => m.kind === 'overdue-return')).toBeUndefined();
  });

  it('greift nicht, sobald das Rueckpaket eingetroffen ist', () => {
    const r = computeEffectiveBookingSpan(
      booking({ status: 'delivered', actual_return_at: '2026-04-17T10:00:00Z' }),
      BUF,
      { today: '2026-04-21' },
    );
    expect(r.markers.find((m) => m.kind === 'overdue-return')).toBeUndefined();
  });
});

describe('Kombinationen und Randfaelle', () => {
  it('Override und Ist-Abgabe gleichzeitig: das frueheste Datum gewinnt', () => {
    const r = computeEffectiveBookingSpan(
      booking({ ship_date_override: '2026-04-07', actual_dispatch_at: '2026-04-04T10:00:00Z' }),
      BUF,
      { today: TODAY },
    );
    expect(r.plannedStart).toBe('2026-04-07');
    expect(r.start).toBe('2026-04-04');
  });

  it('Override frueher als die Ist-Abgabe: Spanne bleibt beim Override', () => {
    const r = computeEffectiveBookingSpan(
      booking({ ship_date_override: '2026-04-03', actual_dispatch_at: '2026-04-06T10:00:00Z' }),
      BUF,
      { today: TODAY },
    );
    expect(r.start).toBe('2026-04-03');
  });

  it('akzeptiert reine Datums-Strings ohne Uhrzeit', () => {
    const r = computeEffectiveBookingSpan(
      booking({ actual_dispatch_at: '2026-04-06' }),
      BUF,
      { today: TODAY },
    );
    expect(r.actualDispatchDate).toBe('2026-04-06');
    expect(r.start).toBe('2026-04-06');
  });

  it('ignoriert unparsbare Zeitstempel', () => {
    const r = computeEffectiveBookingSpan(
      booking({ actual_dispatch_at: 'kaputt' }),
      BUF,
      { today: TODAY },
    );
    expect(r.actualDispatchDate).toBeNull();
    expect(r.start).toBe('2026-04-08');
  });

  it('rechnet Zeitstempel kurz nach Mitternacht auf den Berliner Tag um', () => {
    // 00:30 Berlin am 07.04. (Sommerzeit) = 22:30 UTC am 06.04.
    const r = computeEffectiveBookingSpan(
      booking({ actual_dispatch_at: '2026-04-06T22:30:00Z' }),
      BUF,
      { today: TODAY },
    );
    expect(r.actualDispatchDate).toBe('2026-04-07');
  });

  it('funktioniert ueber die Winterzeit-Umstellung hinweg', () => {
    const r = computeEffectiveBookingSpan(
      { rental_from: '2026-10-26', rental_to: '2026-10-30', delivery_mode: 'versand', status: 'confirmed' },
      BUF,
      { today: '2026-10-26' },
    );
    expect(r.plannedStart).toBe('2026-10-24');
    expect(r.plannedEnd).toBe('2026-11-01');
  });
});

describe('markerForDay', () => {
  it('findet den Marker, der einen Tag abdeckt', () => {
    const { markers } = computeEffectiveBookingSpan(
      booking({ actual_dispatch_at: '2026-04-06T09:00:00Z' }),
      BUF,
      { today: TODAY },
    );
    expect(markerForDay(markers, '2026-04-07')?.kind).toBe('early-dispatch');
    expect(markerForDay(markers, '2026-04-09')).toBeNull();
  });

  it('filtert nach Marker-Art', () => {
    const { markers } = computeEffectiveBookingSpan(
      booking({ actual_dispatch_at: '2026-04-06T09:00:00Z' }),
      BUF,
      { today: TODAY },
    );
    expect(markerForDay(markers, '2026-04-07', ['late-dispatch'])).toBeNull();
  });
});

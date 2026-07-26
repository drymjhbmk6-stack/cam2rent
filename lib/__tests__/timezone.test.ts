import { describe, it, expect } from 'vitest';
import {
  getBerlinOffsetString,
  getBerlinDateString,
  getBerlinDayStartISO,
  getBerlinHour,
  getBerlinDateKey,
  utcToBerlinLocalInput,
  berlinLocalInputToUTC,
  calendarDaysBetween,
  berlinDaysUntil,
  BERLIN_TZ,
} from '../timezone';

describe('getBerlinOffsetString', () => {
  it('Sommer (DST aktiv) -> +02:00', () => {
    // 2026-07-15 ist garantiert in DST (Sommerzeit Mar-Oct)
    expect(getBerlinOffsetString(new Date('2026-07-15T12:00:00Z'))).toBe('+02:00');
  });

  it('Winter (Standard) -> +01:00', () => {
    // 2026-01-15 ist garantiert nicht in DST
    expect(getBerlinOffsetString(new Date('2026-01-15T12:00:00Z'))).toBe('+01:00');
  });
});

describe('getBerlinDateString', () => {
  it('Mitternacht UTC im Sommer -> entspricht 02:00 Berlin selber Tag', () => {
    expect(getBerlinDateString(new Date('2026-07-15T00:00:00Z'))).toBe('2026-07-15');
  });

  it('22:00 UTC im Sommer -> 00:00 Berlin = naechster Tag', () => {
    expect(getBerlinDateString(new Date('2026-07-14T22:00:00Z'))).toBe('2026-07-15');
  });

  it('21:59 UTC im Sommer -> 23:59 Berlin = gleicher Tag', () => {
    expect(getBerlinDateString(new Date('2026-07-14T21:59:00Z'))).toBe('2026-07-14');
  });

  it('23:00 UTC im Winter -> 00:00 Berlin = naechster Tag', () => {
    expect(getBerlinDateString(new Date('2026-01-14T23:00:00Z'))).toBe('2026-01-15');
  });
});

describe('getBerlinDayStartISO', () => {
  it('Sommer: 22:00 UTC -> Tagesstart heute Berlin = 22:00 UTC', () => {
    // 22:00 UTC = 00:00 Berlin am naechsten Tag (Sommer +02:00)
    // Tagesstart 2026-07-15 in Berlin = 2026-07-14T22:00:00Z
    const iso = getBerlinDayStartISO(new Date('2026-07-14T22:00:00Z'));
    expect(iso).toBe('2026-07-14T22:00:00.000Z');
  });

  it('Winter: 23:00 UTC -> Tagesstart in UTC um 23:00', () => {
    // 23:00 UTC = 00:00 Berlin am naechsten Tag (Winter +01:00)
    const iso = getBerlinDayStartISO(new Date('2026-01-14T23:00:00Z'));
    expect(iso).toBe('2026-01-14T23:00:00.000Z');
  });
});

describe('getBerlinHour', () => {
  it('22:30 UTC im Sommer -> 00:30 Berlin = Stunde 0', () => {
    expect(getBerlinHour('2026-07-14T22:30:00Z')).toBe(0);
  });

  it('06:00 UTC im Sommer -> 08:00 Berlin', () => {
    expect(getBerlinHour('2026-07-15T06:00:00Z')).toBe(8);
  });

  it('23:00 UTC im Winter -> 00:00 Berlin', () => {
    expect(getBerlinHour('2026-01-14T23:00:00Z')).toBe(0);
  });

  it('akzeptiert Date-Objekt', () => {
    expect(getBerlinHour(new Date('2026-07-15T10:00:00Z'))).toBe(12);
  });
});

describe('getBerlinDateKey', () => {
  it('21:00 UTC Sommer -> 23:00 Berlin = selber Tag', () => {
    expect(getBerlinDateKey('2026-07-14T21:00:00Z')).toBe('2026-07-14');
  });

  it('23:00 UTC Sommer -> 01:00 Berlin naechster Tag', () => {
    expect(getBerlinDateKey('2026-07-14T23:00:00Z')).toBe('2026-07-15');
  });
});

describe('utcToBerlinLocalInput', () => {
  it('Sommer: 16:02 UTC -> 18:02 Berlin', () => {
    expect(utcToBerlinLocalInput('2026-07-15T16:02:00Z')).toBe('2026-07-15T18:02');
  });

  it('Winter: 09:30 UTC -> 10:30 Berlin', () => {
    expect(utcToBerlinLocalInput('2026-01-15T09:30:00Z')).toBe('2026-01-15T10:30');
  });

  it('null/undefined -> leerer String', () => {
    expect(utcToBerlinLocalInput(null)).toBe('');
    expect(utcToBerlinLocalInput(undefined)).toBe('');
    expect(utcToBerlinLocalInput('')).toBe('');
  });

  it('Ungueltiger Input -> leerer String', () => {
    expect(utcToBerlinLocalInput('not-a-date')).toBe('');
  });
});

describe('berlinLocalInputToUTC', () => {
  it('null/leer -> null', () => {
    expect(berlinLocalInputToUTC(null)).toBeNull();
    expect(berlinLocalInputToUTC(undefined)).toBeNull();
    expect(berlinLocalInputToUTC('')).toBeNull();
  });

  it('Round-trip Sommer: utc -> local -> utc gleich', () => {
    const orig = '2026-07-15T16:02:00.000Z';
    const local = utcToBerlinLocalInput(orig);
    const back = berlinLocalInputToUTC(local);
    expect(back).toBe(orig);
  });

  it('Round-trip Winter: utc -> local -> utc gleich', () => {
    const orig = '2026-01-15T09:30:00.000Z';
    const local = utcToBerlinLocalInput(orig);
    const back = berlinLocalInputToUTC(local);
    expect(back).toBe(orig);
  });

  it('Ungueltiger Input -> null', () => {
    expect(berlinLocalInputToUTC('not-a-time')).toBeNull();
  });
});

describe('BERLIN_TZ', () => {
  it('ist die benannte Konstante Europe/Berlin', () => {
    expect(BERLIN_TZ).toBe('Europe/Berlin');
  });
});

describe('calendarDaysBetween — DST-immun (Kalendertage, keine ms-Division)', () => {
  it('einfache Differenz', () => {
    expect(calendarDaysBetween('2026-05-04', '2026-05-11')).toBe(7);
    expect(calendarDaysBetween('2026-05-11', '2026-05-04')).toBe(-7);
    expect(calendarDaysBetween('2026-05-04', '2026-05-04')).toBe(0);
  });

  it('spannt den 29.03. (23-Stunden-Tag, Spring-Forward) → volle Kalendertage', () => {
    // Eine ms-Division über Berlin-Local-Timestamps ergäbe hier 6,96 → floor 6.
    expect(calendarDaysBetween('2026-03-25', '2026-04-01')).toBe(7);
  });

  it('spannt den 25.10. (25-Stunden-Tag, Fall-Back) → volle Kalendertage', () => {
    expect(calendarDaysBetween('2026-10-22', '2026-10-29')).toBe(7);
  });

  it('akzeptiert auch längere ISO-Strings (nur Datumsteil zählt)', () => {
    expect(calendarDaysBetween('2026-05-04T23:59:59Z', '2026-05-11T00:00:00Z')).toBe(7);
  });
});

describe('berlinDaysUntil — Instant → Berliner Kalendertag → Differenz', () => {
  it('04.05. 00:30 Berlin (= 03.05. 22:30 UTC), Ziel 11.05. → 7 (nicht 8)', () => {
    expect(berlinDaysUntil('2026-05-11', new Date('2026-05-03T22:30:00Z'))).toBe(7);
  });
  it('04.05. 23:30 Berlin (= 04.05. 21:30 UTC), Ziel 11.05. → 7', () => {
    expect(berlinDaysUntil('2026-05-11', new Date('2026-05-04T21:30:00Z'))).toBe(7);
  });
  it('05.05. 00:30 Berlin (= 04.05. 22:30 UTC), Ziel 11.05. → 6', () => {
    expect(berlinDaysUntil('2026-05-11', new Date('2026-05-04T22:30:00Z'))).toBe(6);
  });
  it('DST Herbst: 25.10. 00:30 Berlin (= 24.10. 22:30 UTC, +02:00), Ziel 01.11. → 7', () => {
    expect(berlinDaysUntil('2026-11-01', new Date('2026-10-24T22:30:00Z'))).toBe(7);
  });
  it('DST Frühling: 29.03. 00:30 Berlin (= 28.03. 23:30 UTC, +01:00), Ziel 05.04. → 7', () => {
    expect(berlinDaysUntil('2026-04-05', new Date('2026-03-28T23:30:00Z'))).toBe(7);
  });
});

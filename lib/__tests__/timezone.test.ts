import { describe, it, expect } from 'vitest';
import {
  getBerlinOffsetString,
  getBerlinDateString,
  getBerlinDayStartISO,
  getBerlinHour,
  getBerlinDateKey,
  utcToBerlinLocalInput,
  berlinLocalInputToUTC,
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

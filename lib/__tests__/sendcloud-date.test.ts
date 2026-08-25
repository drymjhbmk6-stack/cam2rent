import { describe, it, expect } from 'vitest';
import { parseSendcloudDate } from '../sendcloud-tracking';

describe('parseSendcloudDate', () => {
  it('parst das Sendcloud-Standardformat DD-MM-YYYY HH:mm:ss als Berlin-Zeit', () => {
    // 14.04.2026 10:30 Berlin (Sommerzeit, +02:00) = 08:30 UTC
    expect(parseSendcloudDate('14-04-2026 10:30:00')).toBe('2026-04-14T08:30:00.000Z');
  });

  it('nutzt den korrekten Offset im Winter (+01:00)', () => {
    expect(parseSendcloudDate('14-01-2026 10:30:00')).toBe('2026-01-14T09:30:00.000Z');
  });

  it('verwechselt Tag und Monat nicht', () => {
    // 03-04 muss der 3. APRIL sein, nicht der 4. Maerz.
    expect(parseSendcloudDate('03-04-2026 12:00:00')?.slice(0, 10)).toBe('2026-04-03');
  });

  it('uebernimmt echte ISO-Strings mit Offset unveraendert', () => {
    expect(parseSendcloudDate('2026-04-14T08:30:00Z')).toBe('2026-04-14T08:30:00.000Z');
    expect(parseSendcloudDate('2026-04-14T10:30:00+02:00')).toBe('2026-04-14T08:30:00.000Z');
  });

  it('interpretiert ISO ohne Offset als Berlin-Zeit', () => {
    expect(parseSendcloudDate('2026-04-14T10:30:00')).toBe('2026-04-14T08:30:00.000Z');
  });

  it('liefert null bei leeren oder unparsbaren Werten', () => {
    expect(parseSendcloudDate(undefined)).toBeNull();
    expect(parseSendcloudDate(null)).toBeNull();
    expect(parseSendcloudDate('')).toBeNull();
    expect(parseSendcloudDate('   ')).toBeNull();
    expect(parseSendcloudDate('irgendwas')).toBeNull();
  });
});

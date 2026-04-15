import { describe, it, expect } from 'vitest';

/**
 * Mahnstufen-Logik: Bestimmt die fällige Mahnstufe basierend auf
 * Tagen seit Fälligkeit, aktueller Stufe und Konfiguration.
 */
function getDueDunningLevel(
  daysOverdue: number,
  currentLevel: number,
  config: { days: [number, number, number] } = { days: [14, 28, 42] }
): number {
  if (currentLevel >= 3) return 0; // Max Stufe erreicht
  if (currentLevel === 0 && daysOverdue >= config.days[0]) return 1;
  if (currentLevel === 1 && daysOverdue >= config.days[1]) return 2;
  if (currentLevel === 2 && daysOverdue >= config.days[2]) return 3;
  return 0; // Noch nicht fällig
}

describe('Mahnstufen-Logik', () => {
  describe('mit Standard-Fristen (14/28/42 Tage)', () => {
    it('sollte Stufe 0 bleiben bei 5 Tagen Überfälligkeit', () => {
      expect(getDueDunningLevel(5, 0)).toBe(0);
    });

    it('sollte Stufe 1 fällig sein bei 15 Tagen, keine bestehende Mahnung', () => {
      expect(getDueDunningLevel(15, 0)).toBe(1);
    });

    it('sollte Stufe 1 fällig sein bei genau 14 Tagen', () => {
      expect(getDueDunningLevel(14, 0)).toBe(1);
    });

    it('sollte Stufe 2 fällig sein bei 30 Tagen, Stufe 1 versendet', () => {
      expect(getDueDunningLevel(30, 1)).toBe(2);
    });

    it('sollte Stufe 2 NICHT fällig sein bei 20 Tagen, Stufe 1 versendet', () => {
      expect(getDueDunningLevel(20, 1)).toBe(0);
    });

    it('sollte Stufe 3 fällig sein bei 45 Tagen, Stufe 2 versendet', () => {
      expect(getDueDunningLevel(45, 2)).toBe(3);
    });

    it('sollte Stufe 3 fällig sein bei genau 42 Tagen', () => {
      expect(getDueDunningLevel(42, 2)).toBe(3);
    });

    it('sollte keine weitere Mahnung bei Stufe 3', () => {
      expect(getDueDunningLevel(100, 3)).toBe(0);
    });

    it('sollte keine Mahnung bei 0 Tagen Überfälligkeit', () => {
      expect(getDueDunningLevel(0, 0)).toBe(0);
    });
  });

  describe('mit benutzerdefinierten Fristen', () => {
    const customConfig = { days: [7, 14, 21] as [number, number, number] };

    it('sollte Stufe 1 bei 7 Tagen fällig sein', () => {
      expect(getDueDunningLevel(7, 0, customConfig)).toBe(1);
    });

    it('sollte Stufe 2 bei 14 Tagen fällig sein', () => {
      expect(getDueDunningLevel(14, 1, customConfig)).toBe(2);
    });

    it('sollte Stufe 3 bei 21 Tagen fällig sein', () => {
      expect(getDueDunningLevel(21, 2, customConfig)).toBe(3);
    });

    it('sollte Stufe 1 NICHT bei 6 Tagen fällig sein', () => {
      expect(getDueDunningLevel(6, 0, customConfig)).toBe(0);
    });
  });
});

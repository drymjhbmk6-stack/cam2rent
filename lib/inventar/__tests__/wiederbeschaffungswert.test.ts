import { describe, it, expect } from 'vitest';
import {
  computeWBW,
  explainWBW,
  type InventarUnitForWbw,
  type WbwConfig,
} from '../wiederbeschaffungswert';

const CFG: WbwConfig = { floor_percent: 40, useful_life_months: 36 };

function unit(overrides: Partial<InventarUnitForWbw> = {}): InventarUnitForWbw {
  return {
    wbw_manuell_gesetzt: false,
    wiederbeschaffungswert: null,
    kaufpreis_netto: null,
    kaufdatum: null,
    ...overrides,
  };
}

describe('computeWBW — Entscheidungsbaum', () => {
  describe('1) Override hat Vorrang', () => {
    it('manueller Wert ueberschreibt Kaufpreis-Berechnung', () => {
      const u = unit({
        wbw_manuell_gesetzt: true,
        wiederbeschaffungswert: 250,
        kaufpreis_netto: 500,
        kaufdatum: '2020-01-01',
      });
      expect(computeWBW(u, CFG, new Date('2026-05-08'))).toBe(250);
    });

    it('Override-Wert wird auf 2 Nachkommastellen gerundet', () => {
      const u = unit({ wbw_manuell_gesetzt: true, wiederbeschaffungswert: 199.999 });
      expect(computeWBW(u, CFG)).toBe(200);
    });

    it('Override aber wert=null faellt durch zur Berechnung', () => {
      const u = unit({
        wbw_manuell_gesetzt: true,
        wiederbeschaffungswert: null,
        kaufpreis_netto: 1000,
        kaufdatum: '2026-05-01',
      });
      expect(computeWBW(u, CFG, new Date('2026-05-01'))).toBe(1000);
    });
  });

  describe('2) Kein Kaufpreis -> null', () => {
    it('Pfad-B-Stueck (kein Beleg) liefert null', () => {
      expect(computeWBW(unit(), CFG)).toBeNull();
    });

    it('liefert null auch wenn kaufdatum gesetzt aber kein Preis', () => {
      const u = unit({ kaufdatum: '2024-01-01' });
      expect(computeWBW(u, CFG)).toBeNull();
    });
  });

  describe('3) Lineare Wertminderung', () => {
    it('direkt nach Kauf -> voller Kaufpreis', () => {
      const u = unit({ kaufpreis_netto: 1000, kaufdatum: '2026-05-01' });
      expect(computeWBW(u, CFG, new Date('2026-05-15'))).toBe(1000);
    });

    it('genau in der Mitte (18 von 36 Monaten) -> Mittelwert', () => {
      const u = unit({ kaufpreis_netto: 1000, kaufdatum: '2024-11-01' });
      // 18 Monate elapsed bis 2026-05-01: 1000 - (1000 - 400) * 0.5 = 700
      expect(computeWBW(u, CFG, new Date('2026-05-01'))).toBe(700);
    });

    it('useful_life erreicht -> Floor (40%)', () => {
      const u = unit({ kaufpreis_netto: 1000, kaufdatum: '2023-04-01' });
      // 37 Monate elapsed -> Floor = 0.4 * 1000 = 400
      expect(computeWBW(u, CFG, new Date('2026-05-01'))).toBe(400);
    });

    it('lange nach useful_life -> bleibt Floor (kein weiterer Verfall)', () => {
      const u = unit({ kaufpreis_netto: 1000, kaufdatum: '2018-01-01' });
      expect(computeWBW(u, CFG, new Date('2026-05-01'))).toBe(400);
    });

    it('Floor 0% -> faellt auf 0 nach useful_life', () => {
      const u = unit({ kaufpreis_netto: 1000, kaufdatum: '2023-04-01' });
      const cfg: WbwConfig = { floor_percent: 0, useful_life_months: 36 };
      expect(computeWBW(u, cfg, new Date('2026-05-01'))).toBe(0);
    });

    it('Floor 100% -> kein Wertverlust', () => {
      const u = unit({ kaufpreis_netto: 1000, kaufdatum: '2020-01-01' });
      const cfg: WbwConfig = { floor_percent: 100, useful_life_months: 36 };
      expect(computeWBW(u, cfg, new Date('2026-05-01'))).toBe(1000);
    });

    it('kaufdatum in der Zukunft -> 0 Monate elapsed, voller Preis', () => {
      const u = unit({ kaufpreis_netto: 500, kaufdatum: '2027-01-01' });
      expect(computeWBW(u, CFG, new Date('2026-05-01'))).toBe(500);
    });

    it('Kaufpreis ohne Datum -> voller Kaufpreis (konservativ)', () => {
      const u = unit({ kaufpreis_netto: 750, kaufdatum: null });
      expect(computeWBW(u, CFG)).toBe(750);
    });

    it('Rundung auf 2 Nachkommastellen', () => {
      const u = unit({ kaufpreis_netto: 333.33, kaufdatum: '2025-05-01' });
      // 12 Monate elapsed: 333.33 - (333.33 - 133.332) * (12/36)
      const result = computeWBW(u, CFG, new Date('2026-05-01'));
      expect(Number.isFinite(result)).toBe(true);
      // Rundung: max 2 Nachkommastellen
      expect(result).toBe(Math.round((result ?? 0) * 100) / 100);
    });

    it('useful_life=1 (extrem kurz)', () => {
      const u = unit({ kaufpreis_netto: 1000, kaufdatum: '2026-04-01' });
      const cfg: WbwConfig = { floor_percent: 40, useful_life_months: 1 };
      expect(computeWBW(u, cfg, new Date('2026-05-01'))).toBe(400);
    });
  });
});

describe('explainWBW — gibt Source mit', () => {
  it('Override -> source=manual', () => {
    const u = unit({ wbw_manuell_gesetzt: true, wiederbeschaffungswert: 250 });
    expect(explainWBW(u, CFG).source).toBe('manual');
  });

  it('Kein Preis -> source=no-price + value=null', () => {
    const r = explainWBW(unit(), CFG);
    expect(r.source).toBe('no-price');
    expect(r.value).toBeNull();
  });

  it('Kein Datum -> source=fresh', () => {
    const u = unit({ kaufpreis_netto: 500, kaufdatum: null });
    expect(explainWBW(u, CFG).source).toBe('fresh');
  });

  it('Mitten in Nutzungsdauer -> source=computed mit monthsElapsed', () => {
    const u = unit({ kaufpreis_netto: 1000, kaufdatum: '2024-11-01' });
    const r = explainWBW(u, CFG, new Date('2026-05-01'));
    expect(r.source).toBe('computed');
    expect(r.monthsElapsed).toBe(18);
  });

  it('Nach Nutzungsdauer -> source=floor', () => {
    const u = unit({ kaufpreis_netto: 1000, kaufdatum: '2020-01-01' });
    const r = explainWBW(u, CFG, new Date('2026-05-01'));
    expect(r.source).toBe('floor');
  });
});

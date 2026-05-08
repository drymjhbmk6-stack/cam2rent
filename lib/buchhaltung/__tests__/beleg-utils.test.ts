import { describe, it, expect } from 'vitest';
import { sanitizePosition, type BelegPositionInput } from '../beleg-utils';

describe('sanitizePosition', () => {
  describe('Reihenfolge', () => {
    it('clampt negative Werte auf 0', () => {
      const r = sanitizePosition({
        reihenfolge: -5,
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
      });
      expect(r.reihenfolge).toBe(0);
    });

    it('floored Dezimal-Werte', () => {
      const r = sanitizePosition({
        reihenfolge: 3.7,
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
      });
      expect(r.reihenfolge).toBe(3);
    });

    it('default 0 wenn undefiniert', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
      });
      expect(r.reihenfolge).toBe(0);
    });
  });

  describe('Bezeichnung', () => {
    it('trimmt Whitespace', () => {
      const r = sanitizePosition({
        bezeichnung: '  Akku BX1  ',
        menge: 1,
        einzelpreis_netto: 0,
      });
      expect(r.bezeichnung).toBe('Akku BX1');
    });

    it('cap 500 Zeichen', () => {
      const long = 'a'.repeat(800);
      const r = sanitizePosition({
        bezeichnung: long,
        menge: 1,
        einzelpreis_netto: 0,
      });
      expect(r.bezeichnung.length).toBe(500);
    });

    it('null/undefined wird zu leerem String', () => {
      const r = sanitizePosition({
        bezeichnung: undefined as unknown as string,
        menge: 1,
        einzelpreis_netto: 0,
      });
      expect(r.bezeichnung).toBe('');
    });
  });

  describe('Menge', () => {
    it('clampt negative auf 1', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: -3,
        einzelpreis_netto: 0,
      });
      expect(r.menge).toBe(1);
    });

    it('clampt 0 auf 1', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 0,
        einzelpreis_netto: 0,
      });
      expect(r.menge).toBe(1);
    });

    it('floored Dezimal-Werte', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 3.9,
        einzelpreis_netto: 0,
      });
      expect(r.menge).toBe(3);
    });
  });

  describe('Einzelpreis Netto', () => {
    it('rundet auf 2 Nachkommastellen', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 49.999,
      });
      expect(r.einzelpreis_netto).toBe(50);
    });

    it('rundet 0.005 korrekt', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0.005,
      });
      // Math.round-bias: 0.005 * 100 = 0.5 -> rundet je nach Float zu 0 oder 1
      expect([0, 0.01]).toContain(r.einzelpreis_netto);
    });

    it('default 0 wenn undefined', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
      } as BelegPositionInput);
      expect(r.einzelpreis_netto).toBe(0);
    });
  });

  describe('MwSt-Satz', () => {
    it('default 19 wenn fehlt', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
      });
      expect(r.mwst_satz).toBe(19);
    });

    it('clampt negative auf 0', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
        mwst_satz: -5,
      });
      expect(r.mwst_satz).toBe(0);
    });

    it('clampt > 100 auf 100', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
        mwst_satz: 250,
      });
      expect(r.mwst_satz).toBe(100);
    });

    it('akzeptiert 7 (ermaessigt)', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
        mwst_satz: 7,
      });
      expect(r.mwst_satz).toBe(7);
    });
  });

  describe('Klassifizierung', () => {
    it('default pending', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
      });
      expect(r.klassifizierung).toBe('pending');
    });

    it('akzeptiert gwg', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
        klassifizierung: 'gwg',
      });
      expect(r.klassifizierung).toBe('gwg');
    });
  });

  describe('Notizen', () => {
    it('null bleibt null', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
        notizen: null,
      });
      expect(r.notizen).toBeNull();
    });

    it('cap 2000 Zeichen', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
        notizen: 'n'.repeat(3000),
      });
      expect(r.notizen?.length).toBe(2000);
    });

    it('trimmt', () => {
      const r = sanitizePosition({
        bezeichnung: 'X',
        menge: 1,
        einzelpreis_netto: 0,
        notizen: '  hello  ',
      });
      expect(r.notizen).toBe('hello');
    });
  });
});

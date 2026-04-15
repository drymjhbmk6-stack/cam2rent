import { describe, it, expect } from 'vitest';
import { calculateTax, getTaxFooterText, getTaxModeLabel } from '../tax';

describe('calculateTax', () => {
  describe('Kleinunternehmer', () => {
    it('sollte Brutto = Netto setzen, Steuer = 0', () => {
      const result = calculateTax(100, 'kleinunternehmer');
      expect(result.net).toBe(100);
      expect(result.tax).toBe(0);
      expect(result.gross).toBe(100);
      expect(result.taxMode).toBe('kleinunternehmer');
      expect(result.taxRate).toBe(0);
    });

    it('sollte bei 0 € korrekt sein', () => {
      const result = calculateTax(0, 'kleinunternehmer');
      expect(result.net).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.gross).toBe(0);
    });

    it('sollte bei kleinen Beträgen korrekt sein', () => {
      const result = calculateTax(0.01, 'kleinunternehmer');
      expect(result.net).toBe(0.01);
      expect(result.tax).toBe(0);
      expect(result.gross).toBe(0.01);
    });

    it('sollte bei großen Beträgen korrekt sein', () => {
      const result = calculateTax(10000, 'kleinunternehmer');
      expect(result.net).toBe(10000);
      expect(result.tax).toBe(0);
      expect(result.gross).toBe(10000);
    });
  });

  describe('Regelbesteuerung — Brutto-Eingabe', () => {
    it('sollte 119 € brutto korrekt zerlegen (19%)', () => {
      const result = calculateTax(119, 'regelbesteuerung', 19, 'gross');
      expect(result.net).toBe(100);
      expect(result.tax).toBe(19);
      expect(result.gross).toBe(119);
      expect(result.taxMode).toBe('regelbesteuerung');
      expect(result.taxRate).toBe(19);
    });

    it('sollte 0 € korrekt berechnen', () => {
      const result = calculateTax(0, 'regelbesteuerung', 19, 'gross');
      expect(result.net).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.gross).toBe(0);
    });

    it('sollte Rundung korrekt handhaben (33,33 € brutto)', () => {
      const result = calculateTax(33.33, 'regelbesteuerung', 19, 'gross');
      expect(result.net).toBe(28.01);
      expect(result.tax).toBe(5.32);
      expect(result.gross).toBe(33.33);
      // Netto + Steuer = Brutto
      expect(result.net + result.tax).toBe(33.33);
    });

    it('sollte bei 7% Steuersatz funktionieren', () => {
      const result = calculateTax(107, 'regelbesteuerung', 7, 'gross');
      expect(result.net).toBe(100);
      expect(result.tax).toBe(7);
      expect(result.taxRate).toBe(7);
    });

    it('sollte bei sehr kleinen Beträgen korrekt runden', () => {
      const result = calculateTax(0.01, 'regelbesteuerung', 19, 'gross');
      expect(result.net).toBe(0.01);
      expect(result.tax).toBe(0);
      expect(result.net + result.tax).toBe(0.01);
    });

    it('sollte bei 10.000 € korrekt sein', () => {
      const result = calculateTax(10000, 'regelbesteuerung', 19, 'gross');
      expect(result.net).toBe(8403.36);
      expect(result.tax).toBe(1596.64);
      expect(result.net + result.tax).toBe(10000);
    });
  });

  describe('Regelbesteuerung — Netto-Eingabe', () => {
    it('sollte 100 € netto korrekt berechnen (19%)', () => {
      const result = calculateTax(100, 'regelbesteuerung', 19, 'net');
      expect(result.net).toBe(100);
      expect(result.tax).toBe(19);
      expect(result.gross).toBe(119);
    });

    it('sollte 0 € netto korrekt berechnen', () => {
      const result = calculateTax(0, 'regelbesteuerung', 19, 'net');
      expect(result.net).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.gross).toBe(0);
    });

    it('sollte Default-Rate 19% verwenden', () => {
      const result = calculateTax(100, 'regelbesteuerung');
      // Default ist gross, 19%
      expect(result.taxRate).toBe(19);
    });
  });
});

describe('getTaxFooterText', () => {
  it('sollte §19-Hinweis für Kleinunternehmer zurückgeben', () => {
    expect(getTaxFooterText('kleinunternehmer')).toContain('§ 19 UStG');
  });

  it('sollte leeren String für Regelbesteuerung zurückgeben', () => {
    expect(getTaxFooterText('regelbesteuerung')).toBe('');
  });
});

describe('getTaxModeLabel', () => {
  it('sollte korrekte Labels zurückgeben', () => {
    expect(getTaxModeLabel('kleinunternehmer')).toContain('Kleinunternehmer');
    expect(getTaxModeLabel('regelbesteuerung')).toContain('Regelbesteuerung');
  });
});

import { describe, it, expect } from 'vitest';
import { reconcileOcrLineAmount } from '../ocr-reconcile';

describe('reconcileOcrLineAmount', () => {
  it('behaelt Menge x Einzelpreis wenn sie zum line_total_net passen', () => {
    const r = reconcileOcrLineAmount({ quantity: 744, unit_price_net: 0.01344, line_total_net: 10.0 });
    expect(r.menge).toBe(744);
    expect(r.einzelpreis_netto).toBe(0.01344);
  });

  it('faellt auf menge=1 + line_total_net zurueck wenn eine Klammer-Zahl faelschlich als quantity gelandet ist', () => {
    // "Discount ($10.00 across 18 prices)" — Claude haette theoretisch die
    // 18 als quantity uebernehmen koennen, obwohl der echte Betrag -10 ist.
    const r = reconcileOcrLineAmount({ quantity: 18, unit_price_net: -10, line_total_net: -10 });
    expect(r.menge).toBe(1);
    expect(r.einzelpreis_netto).toBe(-10);
  });

  it('behaelt einfache 1x-Positionen unveraendert', () => {
    const r = reconcileOcrLineAmount({ quantity: 1, unit_price_net: 25, line_total_net: 25 });
    expect(r.menge).toBe(1);
    expect(r.einzelpreis_netto).toBe(25);
  });

  it('vertraut dem line_total_net, wenn quantity*unit_price_net weit abweicht', () => {
    const r = reconcileOcrLineAmount({ quantity: 250, unit_price_net: -1, line_total_net: -0.25 });
    expect(r.menge).toBe(1);
    expect(r.einzelpreis_netto).toBe(-0.25);
  });

  it('laesst Menge/Einzelpreis unangetastet wenn line_total_net schlicht nicht befuellt wurde (0 trotz echtem Betrag)', () => {
    const r = reconcileOcrLineAmount({ quantity: 3, unit_price_net: 12.99, line_total_net: 0 });
    expect(r.menge).toBe(3);
    expect(r.einzelpreis_netto).toBe(12.99);
  });

  it('toleriert kleine Rundungsdifferenzen (Cent-Ebene)', () => {
    const r = reconcileOcrLineAmount({ quantity: 3, unit_price_net: 8.333, line_total_net: 25.0 });
    // 3 * 8.333 = 24.999, Differenz 0.001 < Toleranz -> Menge bleibt erhalten
    expect(r.menge).toBe(3);
    expect(r.einzelpreis_netto).toBe(8.333);
  });

  it('ist stabil bei zwei tatsaechlich leeren Werten (0/0)', () => {
    const r = reconcileOcrLineAmount({ quantity: 1, unit_price_net: 0, line_total_net: 0 });
    expect(r.menge).toBe(1);
    expect(r.einzelpreis_netto).toBe(0);
  });

  it('fällt auf quantity=1 zurueck wenn quantity ungueltig/0 ist', () => {
    const r = reconcileOcrLineAmount({ quantity: 0, unit_price_net: 5, line_total_net: 5 });
    expect(r.menge).toBe(1);
    expect(r.einzelpreis_netto).toBe(5);
  });
});

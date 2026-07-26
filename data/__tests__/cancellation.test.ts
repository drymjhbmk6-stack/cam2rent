import { describe, it, expect } from 'vitest';
import {
  CANCELLATION_TIERS,
  refundRateForDays,
  computeCancellationRefund,
  daysUntilRentalStart,
  getRefundPercentage,
  getCancellationEligibility,
  isSelfServiceCancellable,
  getCancellationInfo,
  effectiveCancelDate,
  computeCancellationSuggestion,
  refundBelowSuggestion,
} from '@/data/cancellation';

// Fester Referenztag als reines Datums-Parse (UTC-Mitternacht), damit die
// Tagesdifferenz unabhängig von der Testrechner-Zeitzone stabil bleibt.
const NOW = new Date('2026-05-15');

/** Datum n Kalendertage nach NOW als YYYY-MM-DD. */
function daysAhead(n: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('CANCELLATION_TIERS — Staffel gemäß AGB § 15 Abs. 1', () => {
  it('ist eine einzige, absteigend sortierte Quelle der Wahrheit', () => {
    expect(CANCELLATION_TIERS).toEqual([
      { minDaysBefore: 8, refundRate: 1.0 },
      { minDaysBefore: 3, refundRate: 0.5 },
      { minDaysBefore: 0, refundRate: 0.1 },
    ]);
  });
});

describe('refundRateForDays — Grenzfälle', () => {
  it.each([
    [8, 1.0], // > 7 Tage → 100 %
    [7, 0.5], // Grenzfall: genau 7 Tage → 50 %
    [6, 0.5], // 3–7 Tage → 50 %
    [3, 0.5], // Grenzfall: genau 3 Tage → 50 %
    [2, 0.1], // Grenzfall: genau 2 Tage → 10 %
    [1, 0.1], // < 3 Tage → 10 %
    [0, 0.1], // Mietbeginn heute → 10 %
    [-1, 0.1], // Anker in der Vergangenheit → schlechteste Stufe (10 %); 0 % greift separat über rentalFrom
    [-40, 0.1], // Anker lange vorbei → weiterhin 10 % (verlegte Buchung, Ur-Termin passé)
  ])('bei %i Tagen vor Anker → Rate %f', (days, rate) => {
    expect(refundRateForDays(days)).toBe(rate);
  });
});

describe('getRefundPercentage — über echte Kalenderdaten', () => {
  it.each([
    [8, 1.0],
    [7, 0.5],
    [6, 0.5],
    [3, 0.5],
    [2, 0.1],
    [1, 0.1],
    [0, 0.1],
  ])('Mietbeginn in %i Tagen → Rate %f', (n, rate) => {
    expect(getRefundPercentage(daysAhead(n), null, NOW)).toBe(rate);
  });
});

describe('computeCancellationRefund — Versandkosten separat (§ 15 Abs. 5)', () => {
  // anchorDate == rentalFrom (Nicht-Verlegung); Staffel gegen den Anker.
  const ref = (n: number, extra: Record<string, unknown> = {}) => ({
    anchorDate: daysAhead(n), rentalFrom: daysAhead(n), now: NOW, ...extra,
  });

  it('100 % (> 7 Tage): voller Betrag inkl. Versand', () => {
    const r = computeCancellationRefund({ priceTotal: 100, shippingPrice: 10, ...ref(8) });
    expect(r).toMatchObject({ refundRate: 1.0, gradedRefund: 90, shippingRefund: 10, refundTotal: 100 });
  });

  it('50 % (3–7 Tage): halber Mietanteil, aber Versand VOLL erstattet', () => {
    const r = computeCancellationRefund({ priceTotal: 100, shippingPrice: 10, ...ref(7) });
    expect(r).toMatchObject({ refundRate: 0.5, gradedRefund: 45, shippingRefund: 10, refundTotal: 55 });
  });

  it('10 % (< 3 Tage): 10 % Mietanteil, Versand VOLL erstattet', () => {
    const r = computeCancellationRefund({ priceTotal: 100, shippingPrice: 10, ...ref(2) });
    expect(r).toMatchObject({ refundRate: 0.1, gradedRefund: 9, shippingRefund: 10, refundTotal: 19 });
  });

  it('tatsächliche Miete läuft (rentalFrom in der Vergangenheit) → 0 %', () => {
    const r = computeCancellationRefund({
      priceTotal: 100, shippingPrice: 10,
      anchorDate: daysAhead(-1), rentalFrom: daysAhead(-1), now: NOW,
    });
    expect(r).toMatchObject({ refundRate: 0, gradedRefund: 0 });
  });

  it('bereits versendet: Versandkosten sind verbraucht → keine Versanderstattung', () => {
    const r = computeCancellationRefund({ priceTotal: 100, shippingPrice: 10, ...ref(7, { alreadyShipped: true }) });
    expect(r).toMatchObject({ gradedRefund: 45, shippingRefund: 0, refundTotal: 45 });
  });

  it('ohne Versandkosten (Abholung): Staffel wirkt auf den vollen Betrag', () => {
    const r = computeCancellationRefund({ priceTotal: 80, shippingPrice: 0, ...ref(2) });
    expect(r).toMatchObject({ gradedRefund: 8, shippingRefund: 0, refundTotal: 8 });
  });

  it('rundet auf Cent (§ 15 auf krummen Beträgen)', () => {
    const r = computeCancellationRefund({ priceTotal: 49.99, shippingPrice: 4.99, ...ref(2) });
    // gradedBase = 45.00 → 4.50; shipping voll 4.99 → total 9.49
    expect(r.gradedRefund).toBe(4.5);
    expect(r.shippingRefund).toBe(4.99);
    expect(r.refundTotal).toBe(9.49);
  });
});

describe('Verlegung: Anker maßgeblich, tatsächlicher Termin nur für "Miete läuft" (§ 15 Abs. 2)', () => {
  // KERNFALL: Buchung Ur-Termin ~5 Wochen her, verlegt in die Zukunft, storno heute.
  it('Ur-Termin vergangen, verlegt in die Zukunft, storno heute → 10 % (nicht 0 %, nicht 100 %)', () => {
    const anchor = daysAhead(-36);  // ursprünglicher Mietbeginn 36 Tage her
    const movedTo = daysAhead(5);   // verlegter Termin in 5 Tagen (Miete läuft NICHT)
    const r = computeCancellationRefund({
      priceTotal: 100, shippingPrice: 0, anchorDate: anchor, rentalFrom: movedTo, now: NOW,
    });
    expect(r.refundRate).toBe(0.1);   // schlechteste Staffelstufe gegen den Anker
    expect(r.refundTotal).toBe(10);
  });

  it('storno mehr als 7 Tage vor dem ANKER → 100 % (Verlegung ändert nichts)', () => {
    const anchor = daysAhead(20);   // Ur-Termin 20 Tage voraus
    const movedTo = daysAhead(60);  // weit nach hinten verlegt
    const r = computeCancellationRefund({
      priceTotal: 100, shippingPrice: 0, anchorDate: anchor, rentalFrom: movedTo, now: NOW,
    });
    expect(r.refundRate).toBe(1.0);
  });

  it('ohne rentalFrom (Nicht-Verlegung): Anker vergangen → 0 % (Miete gilt als begonnen)', () => {
    const r = computeCancellationRefund({ priceTotal: 100, anchorDate: daysAhead(-1), now: NOW });
    expect(r.refundRate).toBe(0);
  });

  it('Spec-Kernfall: Ur-Termin 10.05., verlegt auf 20.06., Storno am 15.06. → 10 %', () => {
    const r = computeCancellationRefund({
      priceTotal: 100,
      shippingPrice: 0,
      anchorDate: '2026-05-10',   // ursprünglicher Mietbeginn (eingefroren)
      rentalFrom: '2026-06-20',   // verlegter Termin (Miete läuft noch nicht)
      now: new Date('2026-06-15'),
    });
    expect(r.refundRate).toBe(0.1);
    expect(r.refundTotal).toBe(10);
  });

  it('Nicht-Verlegung verhält sich identisch zu Block 1 (Anker == start_date)', () => {
    // 5 Tage vor Start → 50 %, egal ob Anker explizit gleich rental_from
    const withAnchor = computeCancellationRefund({ priceTotal: 100, anchorDate: daysAhead(5), rentalFrom: daysAhead(5), now: NOW });
    const withoutAnchor = computeCancellationRefund({ priceTotal: 100, anchorDate: daysAhead(5), now: NOW });
    expect(withAnchor.refundRate).toBe(0.5);
    expect(withoutAnchor.refundRate).toBe(0.5);
  });
});

describe('getCancellationEligibility — Selbstservice nur > 7 Tage', () => {
  it.each([
    [8, 'allowed'],
    [7, 'email_only'], // 7 Tage sind NICHT mehr kostenlos
    [3, 'email_only'],
    [2, 'email_only'], // < 3 Tage weiterhin stornierbar (per E-Mail, 10 %)
    [0, 'email_only'],
  ])('Mietbeginn in %i Tagen (confirmed) → %s', (n, expected) => {
    expect(getCancellationEligibility(daysAhead(n), 'confirmed', null, NOW)).toBe(expected);
  });

  it('Miete hat begonnen → not_possible', () => {
    expect(getCancellationEligibility(daysAhead(-1), 'confirmed', null, NOW)).toBe('not_possible');
  });

  it('nicht bestätigte Buchung → not_possible', () => {
    expect(getCancellationEligibility(daysAhead(10), 'awaiting_payment', null, NOW)).toBe('not_possible');
  });

  it('isSelfServiceCancellable nur bei > 7 Tagen true', () => {
    expect(isSelfServiceCancellable(daysAhead(8), 'confirmed', null, NOW)).toBe(true);
    expect(isSelfServiceCancellable(daysAhead(7), 'confirmed', null, NOW)).toBe(false);
  });
});

describe('getCancellationInfo — Anzeige-Prozente', () => {
  it('> 7 Tage → 100 %, kostenlos', () => {
    const info = getCancellationInfo(daysAhead(10), 'confirmed', null, NOW);
    expect(info.refundPercentage).toBe(100);
    expect(info.label).toBe('Kostenlose Stornierung');
  });

  it('3–7 Tage → 50 %', () => {
    const info = getCancellationInfo(daysAhead(5), 'confirmed', null, NOW);
    expect(info.refundPercentage).toBe(50);
    expect(info.label).toContain('50 %');
  });

  it('< 3 Tage → 10 % (nicht mehr "keine Erstattung")', () => {
    const info = getCancellationInfo(daysAhead(2), 'confirmed', null, NOW);
    expect(info.refundPercentage).toBe(10);
    expect(info.label).toContain('90 %');
  });

  it('Miete begonnen → 0 %', () => {
    const info = getCancellationInfo(daysAhead(-1), 'confirmed', null, NOW);
    expect(info.refundPercentage).toBe(0);
  });
});

describe('effectiveCancelDate / Anker — Verlegung öffnet kein neues Fenster', () => {
  it('ohne Anker gilt rental_from', () => {
    expect(effectiveCancelDate('2026-06-20', null)).toBe('2026-06-20');
  });

  it('mit früherem Anker gewinnt der Anker (ursprünglicher Mietbeginn)', () => {
    expect(effectiveCancelDate('2026-06-20', '2026-05-20')).toBe('2026-05-20');
  });

  it('Verlegung nach hinten: Storno rechnet weiter gegen den Ur-Termin', () => {
    // Ursprünglich 05-20 (5 Tage vor NOW-basiertem Fenster), verlegt auf 06-20.
    const anchor = daysAhead(5); // maßgeblich
    const movedTo = daysAhead(36); // neuer Termin
    expect(daysUntilRentalStart(movedTo, anchor, NOW)).toBe(5);
    expect(getRefundPercentage(movedTo, anchor, NOW)).toBe(0.5); // NICHT 100 %
  });
});

describe('computeCancellationSuggestion — Admin-Storno-Vorschlag', () => {
  const NOW2 = new Date('2026-05-15');
  const ahead = (n: number) => {
    const d = new Date(NOW2);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  it.each([
    [10, 1.0], // > 7 Tage → 100 %
    [5, 0.5],  // 3–7 Tage → 50 %
    [2, 0.1],  // < 3 Tage → 10 %
  ])('Vorschlag deckt sich mit der Staffel je Stufe (%i Tage → %f)', (n, rate) => {
    const s = computeCancellationSuggestion({
      priceTotal: 93.99, shippingPrice: 4.99, rentalFrom: ahead(n),
      cancellationAnchorDate: null, reasonCategory: 'customer', now: NOW2,
    });
    // Staffel wirkt nur auf den storniablen Anteil (89,00 €), Versand voll.
    expect(s.refundRate).toBe(rate);
    expect(s.gradedRefund).toBeCloseTo(89 * rate, 2);
    expect(s.shippingRefund).toBe(4.99);
    expect(s.suggestedAmount).toBeCloseTo(89 * rate + 4.99, 2);
    // identisch zur zugrunde liegenden Erstattungs-Berechnung
    const r = computeCancellationRefund({ priceTotal: 93.99, shippingPrice: 4.99, anchorDate: ahead(n), rentalFrom: ahead(n), now: NOW2 });
    expect(s.suggestedAmount).toBe(r.refundTotal);
  });

  it('Beispiel aus der Spec: 3–7 Tage → 50 % von 89 € + 4,99 € Versand = 49,49 €', () => {
    const s = computeCancellationSuggestion({
      priceTotal: 93.99, shippingPrice: 4.99, rentalFrom: ahead(5),
      cancellationAnchorDate: null, reasonCategory: 'customer', now: NOW2,
    });
    expect(s.suggestedAmount).toBe(49.49);
  });

  it('verlegte Buchung: Vorschlag basiert auf ANKER, nicht auf verlegtem Start', () => {
    const anchor = ahead(2);   // Ur-Termin in 2 Tagen → 10 %
    const movedTo = ahead(40); // verlegt weit nach hinten
    const s = computeCancellationSuggestion({
      priceTotal: 100, shippingPrice: 0, rentalFrom: movedTo,
      cancellationAnchorDate: anchor, reasonCategory: 'customer', now: NOW2,
    });
    expect(s.anchorDiffers).toBe(true);
    expect(s.anchorDate).toBe(anchor);
    expect(s.refundRate).toBe(0.1); // gegen Anker, nicht 100 %
    expect(s.suggestedAmount).toBe(10);
  });

  it('Grund "Vermieter-Verlegung" (§ 12 Abs. 5) → 100 % vorbelegt, nicht Staffel', () => {
    const s = computeCancellationSuggestion({
      priceTotal: 93.99, shippingPrice: 4.99, rentalFrom: ahead(2), // 2 Tage = eigentlich 10 %
      cancellationAnchorDate: null, reasonCategory: 'vermieter_verlegung', now: NOW2,
    });
    expect(s.fullRefundReason).toBe(true);
    expect(s.suggestedAmount).toBe(93.99); // voll, nicht 10 %
  });

  it('alle Voll-Erstattungs-Gründe belegen 100 % vor', () => {
    for (const cat of ['bereitstellung_unmoeglich', 'nichtannahme_48h', 'kontosperrung']) {
      const s = computeCancellationSuggestion({
        priceTotal: 50, rentalFrom: ahead(1), cancellationAnchorDate: null,
        reasonCategory: cat, now: NOW2,
      });
      expect(s.suggestedAmount).toBe(50);
    }
  });

  it('unbekannter Grund fällt auf "customer" (Staffel) zurück', () => {
    const s = computeCancellationSuggestion({
      priceTotal: 100, rentalFrom: ahead(10), cancellationAnchorDate: null,
      reasonCategory: 'irgendwas', now: NOW2,
    });
    expect(s.reasonCategory).toBe('customer');
    expect(s.suggestedAmount).toBe(100); // > 7 Tage
  });
});

describe('refundBelowSuggestion — Begründungspflicht-Gate', () => {
  it('Betrag UNTER Vorschlag → true (Begründung nötig, wird sonst abgelehnt)', () => {
    expect(refundBelowSuggestion(40, 49.49)).toBe(true);
  });
  it('Betrag ÜBER Vorschlag → false (geht ohne Begründung durch)', () => {
    expect(refundBelowSuggestion(60, 49.49)).toBe(false);
  });
  it('Betrag EXAKT auf Vorschlag → false (kein zusätzlicher Schritt)', () => {
    expect(refundBelowSuggestion(49.49, 49.49)).toBe(false);
  });
  it('Cent-Toleranz: 1 Cent Rundungsdifferenz zählt nicht als darunter', () => {
    expect(refundBelowSuggestion(49.489, 49.49)).toBe(false);
  });
});

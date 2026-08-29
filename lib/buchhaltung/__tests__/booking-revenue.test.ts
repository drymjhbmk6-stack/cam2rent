import { describe, it, expect } from 'vitest';
import {
  computeBookingRevenue,
  isBookingPaid,
  buildInvoicePaidMap,
  type BookingRevenueRow,
} from '../booking-revenue';

const base = (over: Partial<BookingRevenueRow> = {}): BookingRevenueRow => ({
  price_rental: 0,
  price_accessories: 0,
  price_haftung: 0,
  shipping_price: 0,
  price_total: 0,
  status: 'confirmed',
  payment_intent_id: 'pi_123',
  ...over,
});

describe('isBookingPaid', () => {
  it('erkennt Stripe-Buchungen als bezahlt', () => {
    expect(isBookingPaid({ payment_intent_id: 'pi_abc', status: 'confirmed' })).toBe(true);
  });
  it('erkennt offene Ueberweisung als unbezahlt', () => {
    expect(isBookingPaid({ payment_intent_id: 'MANUAL-UNPAID-C2R-1', status: 'confirmed' })).toBe(false);
  });
  it('erkennt PENDING als unbezahlt', () => {
    expect(isBookingPaid({ payment_intent_id: 'PENDING-C2R-1', status: 'confirmed' })).toBe(false);
  });
  it('awaiting_payment ist nie bezahlt', () => {
    expect(isBookingPaid({ payment_intent_id: 'pi_abc', status: 'awaiting_payment' })).toBe(false);
  });
  it('invoices-Zeile schlaegt den Prefix (bar bezahlter Manuell-Beleg)', () => {
    expect(isBookingPaid({ payment_intent_id: 'MANUAL-UNPAID-C2R-1', status: 'confirmed' }, true)).toBe(true);
  });
  it('bar bezahlte Manuell-Buchung ohne UNPAID-Marker zaehlt als bezahlt', () => {
    expect(isBookingPaid({ payment_intent_id: 'MANUAL-C2R-1', status: 'confirmed' })).toBe(true);
  });
});

describe('computeBookingRevenue — Normierung auf price_total', () => {
  it('laesst eine stimmige Buchung unveraendert', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 100, price_accessories: 20, price_haftung: 15, shipping_price: 5.99,
      price_total: 140.99,
    }));
    expect(rev.total).toBe(140.99);
    expect(rev.net.rental).toBe(100);
    expect(rev.net.haftung).toBe(15);
    expect(rev.discountTotal).toBe(0);
  });

  it('verrechnet einen Rabatt aus den Rabatt-Feldern anteilig auf Miete + Zubehoer', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 100, price_accessories: 100, price_haftung: 20,
      discount_amount: 40, price_total: 180,
    }));
    expect(rev.net.rental).toBe(80);
    expect(rev.net.accessories).toBe(80);
    expect(rev.net.haftung).toBe(20);
    expect(rev.total).toBe(180);
  });

  it('faengt eine Luecke ohne Rabatt-Feld ab (Fall C2R-2635-008)', () => {
    // Rechnung: 99 Miete + 20 Haftung, gezahlt 78,64 -> "Set-Bundle / Anpassung" 40,36
    const rev = computeBookingRevenue(base({
      price_rental: 99, price_haftung: 20, price_total: 78.64,
    }));
    expect(rev.total).toBe(78.64);
    expect(rev.net.rental).toBe(58.64);
    expect(rev.net.haftung).toBe(20);
    expect(rev.discountTotal).toBe(40.36);
  });

  it('faengt eine Luecke ohne Rabatt-Feld ab (Fall C2R-2631-005)', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 27, price_accessories: 5.9, price_total: 24.67,
    }));
    expect(rev.total).toBe(24.67);
    expect(rev.net.rental + rev.net.accessories).toBe(24.67);
    expect(rev.discountTotal).toBe(8.23);
  });

  it('greift auf Haftung/Versand zurueck, wenn Miete + Zubehoer nicht reichen', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 10, price_haftung: 20, shipping_price: 6, price_total: 6,
    }));
    expect(rev.total).toBe(6);
    expect(rev.net.rental).toBe(0);
    expect(rev.net.haftung).toBe(0);
    expect(rev.net.shipping).toBe(6);
  });

  it('bucht einen Aufpreis (manuelle Anpassung nach oben) mit', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 100, price_total: 120,
    }));
    expect(rev.total).toBe(120);
    expect(rev.net.rental).toBe(120);
  });

  it('normiert nicht, wenn price_total fehlt', () => {
    const rev = computeBookingRevenue(base({ price_rental: 50, price_total: null }));
    expect(rev.total).toBe(50);
  });

  it('haelt die Summe exakt (keine Rundungs-Cents)', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 33.33, price_accessories: 33.33, price_haftung: 33.34, price_total: 79.99,
    }));
    expect(rev.total).toBe(79.99);
  });
});

describe('computeBookingRevenue — Zufluss-Prinzip', () => {
  it('zaehlt awaiting_payment nicht', () => {
    const rev = computeBookingRevenue(base({ price_rental: 100, price_total: 100, status: 'awaiting_payment' }));
    expect(rev.counts).toBe(false);
    expect(rev.skipReason).toBe('unpaid');
    expect(rev.total).toBe(0);
  });

  it('zaehlt eine offene Ueberweisung nicht', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 100, price_total: 100, payment_intent_id: 'MANUAL-UNPAID-C2R-1',
    }));
    expect(rev.counts).toBe(false);
    expect(rev.total).toBe(0);
  });

  it('zaehlt sie, sobald die Rechnung als bezahlt gefuehrt wird', () => {
    const rev = computeBookingRevenue(
      base({ price_rental: 100, price_total: 100, payment_intent_id: 'MANUAL-UNPAID-C2R-1' }),
      { invoicePaid: true },
    );
    expect(rev.counts).toBe(true);
    expect(rev.total).toBe(100);
  });
});

describe('computeBookingRevenue — Storno', () => {
  it('zaehlt den dokumentierten Einbehalt', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 100, price_total: 100, status: 'cancelled',
      refund_amount: 10, refund_note: 'Storno-Rueckerstattung 10.00 EUR (succeeded)',
    }));
    expect(rev.kind).toBe('cancelled_retained');
    expect(rev.total).toBe(90);
  });

  it('zaehlt einen vollstaendig erstatteten Storno mit 0', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 100, price_total: 100, status: 'cancelled',
      refund_amount: 100, refund_note: 'Storno-Rueckerstattung 100.00 EUR (succeeded)',
    }));
    expect(rev.counts).toBe(false);
    expect(rev.total).toBe(0);
  });

  it('ignoriert Alt-Stornos ohne Doku (lieber zu wenig als erfunden)', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 100, price_total: 100, status: 'cancelled',
    }));
    expect(rev.counts).toBe(false);
    expect(rev.skipReason).toBe('cancelled');
  });

  it('ignoriert Stornos, wenn die refund-Migration fehlt', () => {
    const rev = computeBookingRevenue(
      base({ price_rental: 100, price_total: 100, status: 'cancelled', refund_amount: 10, refund_note: 'x' }),
      { hasRefundColumn: false },
    );
    expect(rev.counts).toBe(false);
  });
});

describe('computeBookingRevenue — Erstattung', () => {
  it('mindert das Einkommen im Wasserfall', () => {
    const rev = computeBookingRevenue(base({
      price_rental: 100, price_accessories: 20, price_haftung: 15, price_total: 135,
      refund_amount: 110,
    }));
    expect(rev.total).toBe(25);
    expect(rev.net.rental).toBe(0);
    expect(rev.net.accessories).toBe(10);
    expect(rev.net.haftung).toBe(15);
    expect(rev.refundTotal).toBe(110);
  });
});

describe('buildInvoicePaidMap', () => {
  it('markiert bezahlt sobald eine Rechnung bezahlt ist', () => {
    const map = buildInvoicePaidMap([
      { booking_id: 'A', payment_status: 'open', status: 'open' },
      { booking_id: 'A', payment_status: 'paid', status: 'paid' },
      { booking_id: 'B', payment_status: 'open', status: 'open' },
    ]);
    expect(map.get('A')).toBe(true);
    // Nur positive Signale — offen/unbekannt faellt auf den Prefix-Fallback.
    expect(map.get('B')).toBeUndefined();
    expect(map.get('C')).toBeUndefined();
  });

  it('leitet aus einer stornierten Rechnung KEIN "unbezahlt" ab', () => {
    // Eine Teilgutschrift storniert die Originalrechnung — die Buchung darf
    // deshalb nicht komplett aus der EÜR fallen.
    const map = buildInvoicePaidMap([
      { booking_id: 'A', payment_status: 'paid', status: 'cancelled' },
    ]);
    expect(map.has('A')).toBe(false);
    expect(computeBookingRevenue(
      base({ price_rental: 100, price_total: 100, payment_intent_id: 'pi_x' }),
      { invoicePaid: map.has('A') ? map.get('A') : null },
    ).total).toBe(100);
  });
});

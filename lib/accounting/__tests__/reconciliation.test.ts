import { describe, it, expect } from 'vitest';

/**
 * Stripe-Reconciliation Match-Logik.
 * Getestet wird die reine Match-Funktion, nicht der API-Call.
 */

interface StripeTransaction {
  id: string;
  stripe_payment_intent_id: string;
  amount: number;
  fee: number;
  net: number;
}

interface Booking {
  id: string;
  payment_intent_id: string;
  price_total: number;
  status: string;
}

function matchTransactions(
  transactions: StripeTransaction[],
  bookings: Booking[]
): {
  matched: Array<{ tx: StripeTransaction; booking: Booking }>;
  unmatchedStripe: StripeTransaction[];
  unmatchedBookings: Booking[];
} {
  const bookingByPi = new Map<string, Booking>();
  for (const b of bookings) {
    if (b.payment_intent_id) bookingByPi.set(b.payment_intent_id, b);
  }

  const matched: Array<{ tx: StripeTransaction; booking: Booking }> = [];
  const unmatchedStripe: StripeTransaction[] = [];
  const matchedPiIds = new Set<string>();

  for (const tx of transactions) {
    const booking = bookingByPi.get(tx.stripe_payment_intent_id);
    if (booking) {
      matched.push({ tx, booking });
      matchedPiIds.add(tx.stripe_payment_intent_id);
    } else {
      unmatchedStripe.push(tx);
    }
  }

  const unmatchedBookings = bookings.filter(
    b => b.payment_intent_id && !matchedPiIds.has(b.payment_intent_id)
  );

  return { matched, unmatchedStripe, unmatchedBookings };
}

describe('Stripe Reconciliation', () => {
  it('sollte Stripe-PI mit existierender Buchung matchen', () => {
    const transactions: StripeTransaction[] = [
      { id: 't1', stripe_payment_intent_id: 'pi_123', amount: 49.99, fee: 1.75, net: 48.24 },
    ];
    const bookings: Booking[] = [
      { id: 'BK-2026-00001', payment_intent_id: 'pi_123', price_total: 49.99, status: 'confirmed' },
    ];

    const result = matchTransactions(transactions, bookings);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].tx.id).toBe('t1');
    expect(result.matched[0].booking.id).toBe('BK-2026-00001');
    expect(result.unmatchedStripe).toHaveLength(0);
    expect(result.unmatchedBookings).toHaveLength(0);
  });

  it('sollte Stripe-PI ohne Buchung als unmatched_stripe markieren', () => {
    const transactions: StripeTransaction[] = [
      { id: 't1', stripe_payment_intent_id: 'pi_unknown', amount: 29.99, fee: 1.0, net: 28.99 },
    ];
    const bookings: Booking[] = [];

    const result = matchTransactions(transactions, bookings);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedStripe).toHaveLength(1);
    expect(result.unmatchedStripe[0].stripe_payment_intent_id).toBe('pi_unknown');
  });

  it('sollte Buchung ohne Stripe-PI als unmatched_booking markieren', () => {
    const transactions: StripeTransaction[] = [];
    const bookings: Booking[] = [
      { id: 'BK-2026-00002', payment_intent_id: 'pi_missing', price_total: 59.99, status: 'confirmed' },
    ];

    const result = matchTransactions(transactions, bookings);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedBookings).toHaveLength(1);
  });

  it('sollte Gebühren korrekt berechnen', () => {
    const tx: StripeTransaction = { id: 't1', stripe_payment_intent_id: 'pi_1', amount: 100, fee: 3.20, net: 96.80 };
    expect(tx.amount - tx.fee).toBeCloseTo(tx.net, 2);
  });

  it('sollte mehrere Transaktionen korrekt matchen', () => {
    const transactions: StripeTransaction[] = [
      { id: 't1', stripe_payment_intent_id: 'pi_1', amount: 49.99, fee: 1.5, net: 48.49 },
      { id: 't2', stripe_payment_intent_id: 'pi_2', amount: 79.99, fee: 2.5, net: 77.49 },
      { id: 't3', stripe_payment_intent_id: 'pi_orphan', amount: 19.99, fee: 0.8, net: 19.19 },
    ];
    const bookings: Booking[] = [
      { id: 'BK-1', payment_intent_id: 'pi_1', price_total: 49.99, status: 'confirmed' },
      { id: 'BK-2', payment_intent_id: 'pi_2', price_total: 79.99, status: 'confirmed' },
      { id: 'BK-3', payment_intent_id: 'pi_gone', price_total: 39.99, status: 'confirmed' },
    ];

    const result = matchTransactions(transactions, bookings);
    expect(result.matched).toHaveLength(2);
    expect(result.unmatchedStripe).toHaveLength(1);
    expect(result.unmatchedStripe[0].stripe_payment_intent_id).toBe('pi_orphan');
    expect(result.unmatchedBookings).toHaveLength(1);
    expect(result.unmatchedBookings[0].id).toBe('BK-3');
  });

  it('sollte Buchungen ohne payment_intent_id ignorieren', () => {
    const transactions: StripeTransaction[] = [];
    const bookings: Booking[] = [
      { id: 'BK-manual', payment_intent_id: '', price_total: 99.99, status: 'confirmed' },
    ];

    const result = matchTransactions(transactions, bookings);
    expect(result.unmatchedBookings).toHaveLength(0);
  });
});

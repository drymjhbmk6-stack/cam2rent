-- Teilerstattungen / Fehlbuchungen sauber in EÜR + DATEV abziehen.
-- Stand 2026-05-18. Idempotent.
--
-- bookings.refund_amount  : Summe aller Rückerstattungen auf diese Buchung (EUR).
--                           Wird in EÜR + DATEV vom Einkommen abgezogen
--                           (analog discount_amount, aber semantisch "Erstattung").
-- bookings.refund_note    : Freitext-Audit, append-only (timestamped).
-- stripe_transactions.reconciliation_note
--                         : Kommentar bei Fehlbuchung/Erstattung einer
--                           nicht zugeordneten Stripe-Zahlung.
--
-- Hinweis: stripe_transactions.match_status='refunded' ist im bestehenden
-- CHECK-Constraint bereits zulässig (matched|unmatched|manual|refunded) —
-- kein Constraint-Change nötig.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_note TEXT;

ALTER TABLE stripe_transactions ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;

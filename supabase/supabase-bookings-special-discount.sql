-- Sonderkondition (Kunden-Rabatt) — separater Rabattbetrag pro Buchung.
-- Idempotent, additiv. KEINE neue Tabelle — erweitert die bestehende `bookings`.
-- Liegt neben discount_amount / duration_discount / loyalty_discount /
-- early_bird_discount.
--
-- Wird serverseitig aus profiles.special_discount_* aufgeloest und gesetzt von
-- confirm-cart (pro Periode skaliert), confirm-booking (aus Stripe-Metadata)
-- und stripe-webhook (Race/Fallback). Greift die Sonderkondition, werden die
-- anderen Auto-Rabatt-Felder auf 0 geschrieben (sie wird exklusiv angewendet).
-- Default 0 = keine Sonderkondition → unveraendertes Verhalten fuer Altbuchungen.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS special_discount NUMERIC DEFAULT 0;

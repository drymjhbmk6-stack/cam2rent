-- Frühbucherrabatt (Early-Bird) — separater Rabattbetrag pro Buchung.
-- Idempotent, additiv. KEINE neue Tabelle — erweitert die bestehende `bookings`.
-- Liegt neben discount_amount / duration_discount / loyalty_discount.
--
-- Wird gesetzt von confirm-cart (pro Periode skaliert), confirm-booking
-- (aus Stripe-Metadata) und stripe-webhook (Race/Fallback). Quelle der Stufen:
-- admin_config.early_bird_discounts (gepflegt unter /admin/rabatte).
-- Default 0 = kein Frühbucherrabatt → unveraendertes Verhalten fuer Altbuchungen.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS early_bird_discount NUMERIC DEFAULT 0;

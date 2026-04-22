-- ==============================================================
-- Payment-Link-Support + konfigurierbare Storno-Fristen
-- ==============================================================
-- Idempotent.

-- ── Stripe Payment Link ID auf bookings ────────────────────────────────────
-- payment_intent_id bleibt fuer die klassischen PaymentIntent-IDs reserviert
-- (Checkout Sessions, Direkt-Zahlung). Payment Links haben eigene IDs (plink_*)
-- und werden bei Storno separat deaktiviert.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_link_id TEXT;
CREATE INDEX IF NOT EXISTS bookings_payment_link_idx ON bookings (stripe_payment_link_id);

-- ── Default-Setting fuer Storno-Fristen ────────────────────────────────────
-- Wird ausgewertet vom Cron /api/cron/awaiting-payment-cancel.
-- Wert in Stunden. Admin kann das spaeter im UI anpassen.
INSERT INTO admin_settings (key, value)
VALUES (
  'awaiting_payment_cancel_hours',
  jsonb_build_object(
    'versand', 48,     -- Bei Versand: 48h vor Mietbeginn storno wenn unbezahlt
    'abholung', 24     -- Bei Abholung: 24h vor Mietbeginn storno wenn unbezahlt
  )
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

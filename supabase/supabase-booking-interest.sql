-- Buchungsinteresse-Telemetrie (Stand 2026-05-22)
--
-- Anonyme Erfassung, welche Kamera + welches Zubehoer + welcher Mietzeitraum
-- im Buchungs-Wizard konfiguriert wurde. Ein Eintrag pro erreichter
-- Zusammenfassung (Step 4) — KEINE Kundendaten (keine user_id, keine E-Mail,
-- keine IP). Dient ausschliesslich der Nachfrage-Analyse im Admin.
--
-- Genutzt von:
--   - POST /api/booking-interest        (Kunden-Side, beim Erreichen der Zusammenfassung)
--   - GET  /api/admin/booking-interest  (Admin-Auswertung "Was wird nachgefragt")
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS booking_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT,
  product_name TEXT,
  set_id TEXT,
  set_name TEXT,
  -- [{ id, name, qty }] — leeres Array wenn kein Zubehoer gewaehlt.
  accessories JSONB NOT NULL DEFAULT '[]'::jsonb,
  rental_from DATE,
  rental_to DATE,
  rental_days INTEGER,
  delivery_mode TEXT,
  haftung TEXT,
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_interest_created
  ON booking_interest(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_interest_product
  ON booking_interest(product_id);

-- RLS: nur service-role darf lesen/schreiben (Endpoints nutzen Service-Client).
ALTER TABLE booking_interest ENABLE ROW LEVEL SECURITY;

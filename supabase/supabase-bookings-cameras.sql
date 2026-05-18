-- ============================================================
-- Multi-Kamera pro Buchung: strukturierte Kamera-Liste
-- Erstellt: 2026-05-18
-- ============================================================
--
-- Eine Buchung kann beliebig viele Kameras enthalten, auch
-- verschiedene Modelle. Bisher trug `bookings.unit_id` nur EINE
-- Kamera, `product_name` war ein Komma-String, `product_id` einzeln.
--
-- Neue Spalte `cameras` haelt EINEN Eintrag pro physischer Kamera:
--   [{ "product_id": "...", "product_name": "...", "unit_id": "uuid"|null }]
--
-- Rueckwaerts-kompatibel: `unit_id` bleibt = cameras[0].unit_id,
-- `product_id`/`product_name` unveraendert. Ist `cameras` NULL,
-- leitet der Code es zur Laufzeit aus product_name/unit_id ab.
--
-- Idempotent.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cameras jsonb;

COMMENT ON COLUMN bookings.cameras IS
  'Pro physischer Kamera ein Eintrag {product_id,product_name,unit_id|null}. NULL = Legacy (aus product_name/unit_id ableiten).';

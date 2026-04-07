-- Migration: Zubehör-Produktzuordnung + Puffer-Tage
-- Ausführen in Supabase SQL Editor

-- 1. Zubehör: Welche Produkte sind kompatibel (leer = alle)
ALTER TABLE accessories
  ADD COLUMN IF NOT EXISTS compatible_product_ids TEXT[] DEFAULT '{}';

COMMENT ON COLUMN accessories.compatible_product_ids IS
  'Leeres Array = universal (passt zu allen Kameras). Gefüllt = nur für diese Produkt-IDs.';

-- 2. Puffer-Tage Einstellung (in admin_settings)
-- Wird als JSON gespeichert:
-- {
--   "versand_before": 2,
--   "versand_after": 2,
--   "abholung_before": 0,
--   "abholung_after": 1
-- }
INSERT INTO admin_settings (key, value, updated_at)
VALUES (
  'booking_buffer_days',
  '{"versand_before": 2, "versand_after": 2, "abholung_before": 0, "abholung_after": 1}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- 3. Index für schnelle Zubehör-Buchungsabfragen
-- Buchungen speichern accessories als TEXT[] — wir brauchen einen GIN-Index
-- für schnelle "welche Buchungen enthalten dieses Zubehör" Abfragen
CREATE INDEX IF NOT EXISTS idx_bookings_accessories
  ON bookings USING GIN (accessories);

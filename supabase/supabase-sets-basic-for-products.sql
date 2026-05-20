-- Basis-Set-Markierung pro Kamera (Stand 2026-05-20)
--
-- Ein Set kann "Basis-Set" fuer mehrere Kameras sein. Die Liste ist eine
-- Teilmenge von product_ids; das DB-Schema selbst erzwingt das nicht (sonst
-- haetten wir zirkulaere Updates beim Speichern). Das UI + die API validieren
-- die Subset-Eigenschaft beim Save.
--
-- Idempotent. Defensiver Code-Pfad in API + Admin-UI greift, falls die
-- Migration noch nicht durch ist (basic_for_product_ids wird dann als
-- leeres Array behandelt).

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS basic_for_product_ids TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_sets_basic_for_product_ids
  ON sets USING GIN (basic_for_product_ids);

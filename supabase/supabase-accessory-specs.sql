-- accessories.specs JSONB für kategorie-spezifische Daten
-- + Gewicht (für Versandgewicht), mAh (Akkus), GB (Speicher),
-- ND-Werte (Filter), Längen (Stative/Selfie-Sticks).
--
-- Idempotent — kann mehrfach ausgeführt werden.

ALTER TABLE public.accessories
  ADD COLUMN IF NOT EXISTS specs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.accessories.specs IS
  'Kategorie-spezifische Spezifikationen. Felder: weight_g (alle), mah (Akku), storage_gb (Speicher), nd_values text[] (Filter), length_min_cm + length_max_cm (Stative/Selfie-Sticks).';

-- Optional: Index falls wir spaeter nach bestimmten Specs filtern
-- (z.B. "alle Akkus mit > 1500 mAh"). Aktuell nicht aktiv.
-- CREATE INDEX IF NOT EXISTS idx_accessories_specs ON public.accessories USING GIN (specs);

-- Bilder pro Zubehoer-Bestandteil (optional, per Index zu included_parts).
-- included_parts bleibt unveraendert TEXT[] — alle bestehenden Konsumenten
-- (Packliste-PDF, Pack-Workflow, Scanner-Toast) sind nicht betroffen.
-- included_parts_images[i] = URL zum Bild von included_parts[i] ('' = keins).
-- Idempotent.
ALTER TABLE accessories
  ADD COLUMN IF NOT EXISTS included_parts_images TEXT[] DEFAULT '{}'::text[];

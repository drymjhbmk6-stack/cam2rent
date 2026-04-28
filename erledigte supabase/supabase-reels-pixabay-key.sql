-- supabase-reels-pixabay-key.sql
-- Phase 1.5 der Reels-Ueberarbeitung: Pixabay als zweite Stock-Footage-Quelle.
--
-- Ergaenzt das JSON-Setting `reels_settings` um den Key `pixabay_api_key`
-- (leer als Default). Solange leer, faellt der Multi-Source-Picker auf
-- Pexels-only zurueck — keine Verhaltens-Aenderung gegenueber Status quo.
--
-- Idempotent: nur ein Update wenn der Key noch fehlt.

UPDATE admin_settings
SET value = jsonb_set(
  CASE
    WHEN jsonb_typeof(value::jsonb) = 'object' THEN value::jsonb
    ELSE '{}'::jsonb
  END,
  '{pixabay_api_key}',
  '""',
  true
)
WHERE key = 'reels_settings'
  AND (
    jsonb_typeof(value::jsonb) IS DISTINCT FROM 'object'
    OR NOT (value::jsonb ? 'pixabay_api_key')
  );

-- Wenn `reels_settings`-Row noch gar nicht existiert: anlegen mit Default + leerem Pixabay-Key.
-- (Defensiv — die Hauptmigration `supabase-reels.sql` legt sie zwar an, aber falls jemand
-- mit komplett leerer admin_settings-Tabelle startet, soll diese Migration trotzdem laufen.)
INSERT INTO admin_settings (key, value)
SELECT 'reels_settings', '{"pixabay_api_key":""}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'reels_settings');

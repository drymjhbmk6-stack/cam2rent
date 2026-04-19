-- =====================================================================
-- Unabhaengige Bild-Positionierung pro Plattform
--
-- Facebook zeigt Timeline-Bilder oft mit eigenem Cropping, Instagram
-- erzwingt 1:1 im Feed. Der Admin will den Bildausschnitt pro Plattform
-- unabhaengig festlegen koennen.
--
-- Speichert CSS-object-position-Werte wie "50% 50%" (center), "0% 0%"
-- (links oben), "100% 50%" (rechts) usw. Default: "center center".
-- =====================================================================

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS fb_image_position TEXT NOT NULL DEFAULT 'center center',
  ADD COLUMN IF NOT EXISTS ig_image_position TEXT NOT NULL DEFAULT 'center center';

COMMENT ON COLUMN social_posts.fb_image_position IS 'CSS object-position fuer Facebook-Preview/Publish (z.B. "50% 50%")';
COMMENT ON COLUMN social_posts.ig_image_position IS 'CSS object-position fuer Instagram-Preview/Publish (z.B. "50% 50%")';

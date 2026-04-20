-- ────────────────────────────────────────────────────────────────────────────
-- Social-Posts: Permalink-Spalten hinzufuegen
-- ────────────────────────────────────────────────────────────────────────────
-- Die Meta Graph API gibt beim Veroeffentlichen nur eine nummerische Media-ID
-- zurueck (z.B. 18261316945294324). Instagram-URLs brauchen aber einen
-- Shortcode-basierten Permalink (z.B. https://www.instagram.com/p/DAbC_123xy/).
-- Wir speichern den Permalink direkt nach dem Publish in diesen Spalten.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS fb_permalink TEXT,
  ADD COLUMN IF NOT EXISTS ig_permalink TEXT;

-- ════════════════════════════════════════════════════════════════════════
-- Blog-Aufrufe: Mensch vs. Bot getrennt zaehlen
-- ════════════════════════════════════════════════════════════════════════
--
-- Hintergrund: blog_posts.view_count + blog_views erfassten bisher JEDEN
-- Server-Aufruf der Artikel-Seite (+1), ohne Bot-Filter — Suchmaschinen-
-- Crawler, KI-Crawler (GPTBot/ClaudeBot/PerplexityBot ...), Social-Vorschau-
-- Bots und Monitoring zaehlten als "Views" mit. Diese Migration ergaenzt eine
-- getrennte Bot-Zaehlung, ohne die Gesamt-Zahl zu veraendern:
--   - blog_posts.view_count      bleibt = Gesamt (Mensch + Bot)
--   - blog_posts.bot_view_count  = nur Bots → Mensch = view_count - bot_view_count
--   - blog_views.is_bot          = pro datiertem Aufruf-Event
--
-- Die Bot-Erkennung passiert im App-Code per User-Agent (lib/bot-detection.ts).
-- Idempotent: kann mehrfach ausgefuehrt werden. Bestandszahlen werden NICHT
-- rueckwirkend aufgeteilt — bot_view_count startet bei 0 und waechst vorwaerts.

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS bot_view_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE blog_views
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS blog_views_is_bot_idx
  ON blog_views (is_bot);

-- Atomarer Zaehler (vermeidet das racy read-modify-write des App-Codes).
-- view_count immer +1, bot_view_count nur bei Bots +1.
CREATE OR REPLACE FUNCTION increment_blog_view(p_post_id UUID, p_is_bot BOOLEAN)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE blog_posts
  SET view_count     = COALESCE(view_count, 0) + 1,
      bot_view_count = COALESCE(bot_view_count, 0) + (CASE WHEN p_is_bot THEN 1 ELSE 0 END)
  WHERE id = p_post_id;
$$;

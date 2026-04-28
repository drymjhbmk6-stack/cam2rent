-- ==============================================================
-- Reel-Musik-Bibliothek
-- ==============================================================
-- Idempotent. Voraussetzung: supabase-reels.sql ist schon gelaufen.

-- ── social_reel_music ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_reel_music (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,                 -- Public URL (Supabase Storage oder extern)
  storage_path TEXT,                 -- Pfad im Bucket falls upload (zum Loeschen)
  mood TEXT,                         -- 'upbeat' | 'calm' | 'cinematic' | 'driving' | 'neutral'
  duration_seconds INT,
  source TEXT,                       -- 'upload' | 'pixabay' | 'bensound' | ...
  attribution TEXT,                  -- "Music by XYZ" — falls Lizenz Credit verlangt
  is_default BOOLEAN NOT NULL DEFAULT FALSE,  -- Default-Track wenn keiner gewaehlt
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS social_reel_music_updated_at ON social_reel_music;
CREATE TRIGGER social_reel_music_updated_at
  BEFORE UPDATE ON social_reel_music
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_reels();

CREATE INDEX IF NOT EXISTS social_reel_music_mood_idx ON social_reel_music (mood);
CREATE INDEX IF NOT EXISTS social_reel_music_default_idx ON social_reel_music (is_default) WHERE is_default = TRUE;

ALTER TABLE social_reel_music ENABLE ROW LEVEL SECURITY;

-- ── music_id-Spalte auf social_reels ──────────────────────────────────────────
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS music_id UUID REFERENCES social_reel_music(id) ON DELETE SET NULL;
ALTER TABLE social_reels ADD COLUMN IF NOT EXISTS music_url TEXT;  -- Snapshot der URL beim Render

CREATE INDEX IF NOT EXISTS social_reels_music_id_idx ON social_reels (music_id);

-- ── Storage-Bucket Hinweis ───────────────────────────────────────────────────
-- Musik wird in den bestehenden Bucket "social-reels" unter Prefix "music/" gespeichert.
-- Kein separater Bucket noetig. Public ON ist Voraussetzung damit FFmpeg im
-- Render die URL ziehen kann.

COMMIT;

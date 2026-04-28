-- supabase-reel-segments.sql
-- Phase 3 der Reels-Ueberarbeitung: Pro-Szene-Persistierung fuer Re-Render-UI.
--
-- Speichert pro Reel die einzelnen Segment-Files (Intro/Body/CTA/Outro) als
-- Storage-Pfade + Metadaten. Damit kann der Admin spaeter eine einzelne Szene
-- austauschen, ohne das gesamte Reel neu zu generieren (KI-Tokens + Pexels-
-- Quota gespart).
--
-- Storage-Konvention (Bucket: social-reels):
--   {reel_id}/segments/seg-{index}-{kind}.mp4
--   {reel_id}/audio/voice-{index}.mp3      (nur wenn TTS aktiviert war)
--
-- Cleanup-Cron `/api/cron/reels-segment-cleanup` (Phase 3.4) loescht
-- segments/ + audio/ Unterordner fuer Reels mit status='published' und
-- published_at < now() - 30 days. Final video.mp4 + thumb.jpg bleiben.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS social_reel_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
  index INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('intro', 'body', 'cta', 'outro')),
  storage_path TEXT NOT NULL,
  duration_seconds NUMERIC NOT NULL,
  scene_data JSONB,            -- { text_overlay, search_query, voice_text, ... }
  source_clip_data JSONB,      -- { source, externalId, downloadUrl, width, height, attribution }
  has_voice BOOLEAN NOT NULL DEFAULT FALSE,
  voice_storage_path TEXT,     -- {reel_id}/audio/voice-{index}.mp3
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reel_id, index)
);

CREATE INDEX IF NOT EXISTS idx_social_reel_segments_reel_id
  ON social_reel_segments(reel_id);

CREATE INDEX IF NOT EXISTS idx_social_reel_segments_kind
  ON social_reel_segments(kind);

-- RLS: Nur Service-Role, identisch zum Pattern der anderen social_reel_* Tabellen
ALTER TABLE social_reel_segments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_reel_segments'
      AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON social_reel_segments
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Auto-update updated_at-Trigger (analog zu social_reels)
CREATE OR REPLACE FUNCTION social_reel_segments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_social_reel_segments_updated_at ON social_reel_segments;
CREATE TRIGGER trigger_social_reel_segments_updated_at
  BEFORE UPDATE ON social_reel_segments
  FOR EACH ROW
  EXECUTE FUNCTION social_reel_segments_set_updated_at();

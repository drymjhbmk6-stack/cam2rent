-- supabase-reels-motion-style.sql
-- Phase 2.2 der Reels-Ueberarbeitung: Ken-Burns-Effekt auf Stock-Clips.
--
-- Ergaenzt `social_reel_templates` um eine `motion_style`-Spalte mit drei
-- Modi:
--   'static'   — kein Effekt (alter Zustand).
--   'kenburns' — alle Body-Szenen mit zufaelligem Zoom/Pan (Reel-ID-Hash deterministisch).
--   'mixed'    — pro Szene zufaellig 'static' oder 'kenburns' (~50/50).
--
-- Default fuer neue Reels: 'kenburns'. Bestehende Templates kriegen den
-- Default-Wert automatisch (NOT NULL DEFAULT 'kenburns'). Wer den alten
-- Look will, kann das Template auf 'static' umstellen.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS und kein Drop bestehender Daten.

ALTER TABLE social_reel_templates
  ADD COLUMN IF NOT EXISTS motion_style TEXT NOT NULL DEFAULT 'kenburns';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_name = 'social_reel_templates'
      AND constraint_name = 'social_reel_templates_motion_style_check'
  ) THEN
    ALTER TABLE social_reel_templates
      ADD CONSTRAINT social_reel_templates_motion_style_check
      CHECK (motion_style IN ('static', 'kenburns', 'mixed'));
  END IF;
END $$;

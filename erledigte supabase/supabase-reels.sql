-- ==============================================================
-- Social Reels — Auto-generierte Kurzvideos für Facebook + Instagram
-- ==============================================================
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- Drei neue Tabellen:
--   - social_reels             Die fertigen/geplanten Reels (Video + Caption + Status)
--   - social_reel_templates    Vorlagen (Stock-Footage vs. Motion-Graphics)
--   - social_reel_plan         Redaktionsplan-Einträge für Reels (optional)
--
-- KEINE Änderungen an social_posts — Reels laufen in eigenem Flow.

-- ── Updated-At-Trigger (wiederverwenden wenn schon vorhanden) ───────────────
CREATE OR REPLACE FUNCTION set_updated_at_reels()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── social_reels ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  link_url TEXT,

  -- Video
  video_url TEXT,                    -- Public URL in Supabase Storage
  thumbnail_url TEXT,
  duration_seconds INT,
  template_type TEXT NOT NULL DEFAULT 'stock_footage' CHECK (template_type IN ('stock_footage', 'motion_graphics')),
  script_json JSONB,                 -- Vollständiges Skript (Szenen, Overlays, Musik-Mood, etc.)
  render_log TEXT,                   -- FFmpeg-Stderr bei Render-Fehler

  -- Targeting
  platforms TEXT[] NOT NULL DEFAULT '{facebook,instagram}',
  fb_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
  ig_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,

  -- Publish-Ergebnis
  fb_reel_id TEXT,
  ig_reel_id TEXT,
  fb_permalink TEXT,
  ig_permalink TEXT,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'rendering', 'rendered', 'pending_review', 'approved', 'scheduled', 'publishing', 'published', 'partial', 'failed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_by TEXT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,

  -- Metadaten
  source_type TEXT,                  -- 'manual', 'blog_publish', 'product_added', 'plan_entry', 'template'
  source_id TEXT,
  template_id UUID,                  -- FK gesetzt nach social_reel_templates-Erstellung
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ai_prompt TEXT,
  is_test BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS social_reels_updated_at ON social_reels;
CREATE TRIGGER social_reels_updated_at
  BEFORE UPDATE ON social_reels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_reels();

CREATE INDEX IF NOT EXISTS social_reels_status_idx ON social_reels (status);
CREATE INDEX IF NOT EXISTS social_reels_scheduled_idx ON social_reels (scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS social_reels_created_idx ON social_reels (created_at DESC);
CREATE INDEX IF NOT EXISTS social_reels_is_test_idx ON social_reels (is_test);

ALTER TABLE social_reels ENABLE ROW LEVEL SECURITY;

-- ── social_reel_templates ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_reel_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL DEFAULT 'stock_footage' CHECK (template_type IN ('stock_footage', 'motion_graphics')),

  -- KI-Prompts
  script_prompt TEXT NOT NULL,       -- Prompt für Claude (generiert Szenen + Caption)
  default_duration INT NOT NULL DEFAULT 20,
  default_hashtags TEXT[] NOT NULL DEFAULT '{}',

  -- Stil-Parameter (nur für motion_graphics relevant)
  bg_color_from TEXT DEFAULT '#3B82F6',
  bg_color_to TEXT DEFAULT '#1E40AF',

  -- Trigger (analog social_templates)
  trigger_type TEXT,                 -- 'manual', 'blog_publish', 'product_added', 'voucher_created'

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS social_reel_templates_updated_at ON social_reel_templates;
CREATE TRIGGER social_reel_templates_updated_at
  BEFORE UPDATE ON social_reel_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_reels();

ALTER TABLE social_reel_templates ENABLE ROW LEVEL SECURITY;

-- FK nachträglich (erst jetzt existiert die Tabelle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'social_reels_template_id_fkey' AND table_name = 'social_reels'
  ) THEN
    ALTER TABLE social_reels
      ADD CONSTRAINT social_reels_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES social_reel_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── social_reel_plan (Redaktionsplan) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_reel_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL DEFAULT '10:00:00',
  topic TEXT NOT NULL,
  angle TEXT,                        -- Konkrete Story-Winkel ("Unboxing", "Top-3-Tipps", …)
  keywords TEXT[] NOT NULL DEFAULT '{}',
  template_id UUID REFERENCES social_reel_templates(id) ON DELETE SET NULL,
  reel_id UUID REFERENCES social_reels(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'generating', 'generated', 'reviewed', 'published', 'skipped', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS social_reel_plan_updated_at ON social_reel_plan;
CREATE TRIGGER social_reel_plan_updated_at
  BEFORE UPDATE ON social_reel_plan
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_reels();

CREATE INDEX IF NOT EXISTS social_reel_plan_date_idx ON social_reel_plan (scheduled_date);
CREATE INDEX IF NOT EXISTS social_reel_plan_status_idx ON social_reel_plan (status);

ALTER TABLE social_reel_plan ENABLE ROW LEVEL SECURITY;

-- ── Storage-Bucket ──────────────────────────────────────────────────────────
-- Bucket "social-reels" muss manuell in Supabase-Dashboard angelegt werden
-- (Public: ON, damit Meta Graph API auf die Video-URL zugreifen kann).
--
-- Max File-Size: 100 MB, MIME: video/mp4

-- ── Seed-Templates ──────────────────────────────────────────────────────────
INSERT INTO social_reel_templates (name, description, template_type, script_prompt, default_duration, default_hashtags, trigger_type, is_active)
VALUES
(
  'Produkt-Spotlight (Stock-Footage)',
  '20-Sekunden-Reel mit dynamischen Action-Clips, Kamera-Highlight und CTA. Für einzelne Kameras.',
  'stock_footage',
  'Schreibe ein 20-Sekunden-Reel-Skript für die Action-Cam "{product_name}" von cam2rent.de. Struktur: (1) Hook 2s mit aufmerksamkeitsstarker Frage oder Aussage, (2) 3 Szenen à 4-5s zu passenden Aktivitäten (z.B. {keywords}), (3) CTA-Frame 3s mit Preis und URL. Zielgruppe: Action-Sport-Enthusiasten in DACH. Ton: energisch, kurz, unter 8 Worte pro Text-Overlay. Musik-Mood: upbeat.',
  20,
  ARRAY['actioncam', 'cam2rent', 'kameraverleih']::TEXT[],
  'manual',
  TRUE
),
(
  'Angebot/Rabatt (Motion-Graphics)',
  'Schlichtes 15-Sekunden-Motion-Graphics-Reel für Aktionen und Rabatt-Codes.',
  'motion_graphics',
  'Schreibe ein 15-Sekunden-Motion-Graphics-Skript für die cam2rent.de-Aktion "{topic}". 3 Szenen: (1) Hook "Spar jetzt!" 3s, (2) Details (Rabatt-Höhe, Code, Gültigkeit) 9s, (3) CTA "Jetzt sichern · cam2rent.de" 3s. Ton: klar, direkt, max 6 Worte pro Frame.',
  15,
  ARRAY['cam2rent', 'angebot', 'rabatt']::TEXT[],
  'manual',
  TRUE
),
(
  'Saison-Tipp (Stock-Footage)',
  'Saisonales Reel (Sommer/Winter/Frühling/Herbst) mit Action-Clips und Tipp-Text.',
  'stock_footage',
  'Schreibe ein 25-Sekunden-Reel für die aktuelle Saison zum Thema "{topic}". Struktur: (1) Hook 3s als Frage an die Zielgruppe, (2) 4 Szenen à 5s mit konkreten Tipps oder Szenen (Keywords: {keywords}), (3) CTA 2s "Kamera mieten bei cam2rent.de". Ton: freundlich, praktisch, keine Superlative.',
  25,
  ARRAY['cam2rent', 'tipps']::TEXT[],
  'manual',
  TRUE
),
(
  'Ankuendigung (Motion-Graphics)',
  'Schlichtes 15-Sekunden-Reel für Ankündigungen (neue Kamera, Service-Update, News). Reine Motion-Graphics, keine Stock-Clips.',
  'motion_graphics',
  'Schreibe ein 15-Sekunden-Motion-Graphics-Skript für die cam2rent.de-Ankündigung "{topic}". Struktur: (1) Aufmerksamkeits-Hook 2s ("Neu bei cam2rent" oder ähnlich), (2) 3 Szenen à 3-4s die die Ankündigung in klaren Sätzen erklären (was ist neu, für wen, ab wann), (3) CTA 3s mit konkreter nächster Aktion ("Jetzt entdecken auf cam2rent.de"). Ton: freundlich-informativ, kein Marketing-Superlativ. Max 7 Worte pro Text-Overlay. Keywords: {keywords}.',
  15,
  ARRAY['cam2rent', 'ankuendigung', 'news']::TEXT[],
  'manual',
  TRUE
)
ON CONFLICT DO NOTHING;

-- ── Admin-Setting: Reels-Konfiguration ──────────────────────────────────────
INSERT INTO admin_settings (key, value)
VALUES ('reels_settings', jsonb_build_object(
  'auto_generate', false,
  'auto_mode', 'semi',
  'preview_required', true,
  'default_template_id', null,
  'pexels_api_key', '',
  'default_music_url', '',
  'max_duration', 30
))
ON CONFLICT (key) DO NOTHING;

COMMIT;

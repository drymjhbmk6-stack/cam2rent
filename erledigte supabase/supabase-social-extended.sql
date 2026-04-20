-- ────────────────────────────────────────────────────────────────────────────
-- Social-Media-Modul: Erweiterung um Themenpool, Serien, Redaktionsplan
-- (analog zum Blog-System — blog_auto_topics, blog_series, blog_schedule)
-- ────────────────────────────────────────────────────────────────────────────
-- Ergänzt die bestehende supabase-social.sql (social_accounts, social_posts,
-- social_templates, social_schedule [rekursiv], social_insights).
--
-- NEU:
--   social_topics          — Themenpool (wie blog_auto_topics)
--   social_series          — Mehrteilige Serien
--   social_series_parts    — Einzelne Teile einer Serie
--   social_editorial_plan  — Konkreter Redaktionsplan (wie blog_schedule)
--
-- Die bestehende social_schedule bleibt für WIEDERKEHRENDE Regeln
-- (z.B. "jeden Mo 9:00 KI-Post"). social_editorial_plan ist für KONKRETE
-- Termine mit festem Datum.

-- ──────────────────────────────────────────────────────────────────────────
-- Themenpool (analog blog_auto_topics)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_topics (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  topic         TEXT         NOT NULL,
  angle         TEXT,                                        -- Was genau gesagt werden soll
  keywords      TEXT[]       NOT NULL DEFAULT '{}',
  category      TEXT,                                        -- produkt/tipp/inspiration/aktion/bts/community/ankuendigung
  platforms     TEXT[]       NOT NULL DEFAULT '{facebook,instagram}',
  with_image    BOOLEAN      NOT NULL DEFAULT true,
  used          BOOLEAN      NOT NULL DEFAULT false,
  used_at       TIMESTAMPTZ,
  used_post_id  UUID         REFERENCES social_posts(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_topics_open_idx ON social_topics (created_at DESC) WHERE used = false;

-- ──────────────────────────────────────────────────────────────────────────
-- Serien (analog blog_series)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_series (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT         NOT NULL,
  description     TEXT         DEFAULT '',
  platforms       TEXT[]       NOT NULL DEFAULT '{facebook,instagram}',
  total_parts     INT          NOT NULL DEFAULT 3,
  generated_parts INT          NOT NULL DEFAULT 0,
  status          TEXT         NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_series_parts (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id    UUID         NOT NULL REFERENCES social_series(id) ON DELETE CASCADE,
  part_number  INT          NOT NULL,
  topic        TEXT         NOT NULL,
  angle        TEXT,
  keywords     TEXT[]       NOT NULL DEFAULT '{}',
  post_id      UUID         REFERENCES social_posts(id) ON DELETE SET NULL,
  used         BOOLEAN      NOT NULL DEFAULT false,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (series_id, part_number)
);

CREATE INDEX IF NOT EXISTS social_series_parts_series_idx ON social_series_parts (series_id, part_number);

-- ──────────────────────────────────────────────────────────────────────────
-- Redaktionsplan (analog blog_schedule)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_editorial_plan (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           UUID         REFERENCES social_posts(id) ON DELETE SET NULL,

  -- Inhalt (Ausgangsmaterial für KI-Generierung)
  topic             TEXT         NOT NULL,
  angle             TEXT,                                    -- Kernaussage
  prompt            TEXT,                                    -- Ausführlicher KI-Prompt (überschreibt Auto-Prompt)
  keywords          TEXT[]       NOT NULL DEFAULT '{}',
  category          TEXT,
  template_id       UUID         REFERENCES social_templates(id) ON DELETE SET NULL,

  -- Serien-Verknüpfung (optional)
  series_id         UUID         REFERENCES social_series(id) ON DELETE SET NULL,
  series_part_id    UUID         REFERENCES social_series_parts(id) ON DELETE SET NULL,

  -- Zielplattformen
  platforms         TEXT[]       NOT NULL DEFAULT '{facebook,instagram}',
  with_image        BOOLEAN      NOT NULL DEFAULT true,

  -- Zeitplanung
  scheduled_date    DATE         NOT NULL,
  scheduled_time    TIME         NOT NULL DEFAULT '10:00',
  sort_order        INT          NOT NULL DEFAULT 0,

  -- Workflow-Status
  status            TEXT         NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'generating', 'generated', 'reviewed', 'published', 'skipped', 'failed')),
  reviewed          BOOLEAN      NOT NULL DEFAULT false,
  reviewed_at       TIMESTAMPTZ,
  generated_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  error_message     TEXT,

  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_editorial_plan_date_idx ON social_editorial_plan (scheduled_date, scheduled_time);
CREATE INDEX IF NOT EXISTS social_editorial_plan_status_idx ON social_editorial_plan (status) WHERE status IN ('planned', 'generated', 'reviewed');
CREATE INDEX IF NOT EXISTS social_editorial_plan_generating_idx ON social_editorial_plan (generated_at) WHERE status = 'generating';

-- ──────────────────────────────────────────────────────────────────────────
-- Triggers für updated_at (nutzen bestehenden set_updated_at aus supabase-social.sql)
-- ──────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS social_series_updated_at ON social_series;
CREATE TRIGGER social_series_updated_at
  BEFORE UPDATE ON social_series
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS social_editorial_plan_updated_at ON social_editorial_plan;
CREATE TRIGGER social_editorial_plan_updated_at
  BEFORE UPDATE ON social_editorial_plan
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE social_topics           ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_series           ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_series_parts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_editorial_plan   ENABLE ROW LEVEL SECURITY;

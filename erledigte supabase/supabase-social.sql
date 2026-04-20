-- ────────────────────────────────────────────────────────────────────────────
-- Social-Media-Modul: Automatische Posts auf Facebook + Instagram
-- ────────────────────────────────────────────────────────────────────────────
-- Organisches Posting über die Meta Graph API (keine bezahlten Ads).
-- Ein Post kann nach FB, IG oder beide (Cross-Post) veröffentlicht werden.
-- Token werden lang-lebig (60 Tage) gespeichert und periodisch refreshed.
--
-- Ausführen in Supabase SQL Editor.

-- ──────────────────────────────────────────────────────────────────────────
-- Verknüpfte Konten (FB-Page + IG-Business-Account)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_accounts (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  platform           TEXT         NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  external_id        TEXT         NOT NULL,                 -- FB-Page-ID oder IG-Business-ID
  name               TEXT         NOT NULL,                 -- z.B. "Cam2Rent"
  username           TEXT,                                   -- nur IG
  picture_url        TEXT,
  access_token       TEXT         NOT NULL,                 -- Long-Lived Token (60 Tage)
  token_expires_at   TIMESTAMPTZ,                            -- Auto-Refresh wenn < 7 Tage
  linked_account_id  UUID         REFERENCES social_accounts(id) ON DELETE SET NULL,
                                                             -- FB-Page → IG-Account Zuordnung
  is_active          BOOLEAN      NOT NULL DEFAULT true,
  last_used_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS social_accounts_active_idx
  ON social_accounts (is_active) WHERE is_active = true;

-- ──────────────────────────────────────────────────────────────────────────
-- Posts (Entwurf / geplant / veröffentlicht / fehlgeschlagen)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_posts (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Inhalte
  caption            TEXT         NOT NULL DEFAULT '',
  hashtags           TEXT[]       NOT NULL DEFAULT '{}',
  media_urls         TEXT[]       NOT NULL DEFAULT '{}',     -- 1-10 Bilder (IG Carousel), Videos
  media_type         TEXT         NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'carousel', 'video', 'reel', 'story', 'text')),
  link_url           TEXT,                                    -- Link im FB-Post (IG ignoriert)

  -- Plattform-Verteilung
  platforms          TEXT[]       NOT NULL DEFAULT '{}',     -- ['facebook', 'instagram']
  fb_account_id      UUID         REFERENCES social_accounts(id) ON DELETE SET NULL,
  ig_account_id      UUID         REFERENCES social_accounts(id) ON DELETE SET NULL,

  -- Externe Post-IDs (für Insights + Delete)
  fb_post_id         TEXT,
  ig_post_id         TEXT,

  -- Status & Zeitplanung
  status             TEXT         NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'partial')),
  scheduled_at       TIMESTAMPTZ,
  published_at       TIMESTAMPTZ,
  error_message      TEXT,
  retry_count        INT          NOT NULL DEFAULT 0,

  -- Herkunft (Auto-Trigger oder manuell)
  source_type        TEXT         NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'auto_blog', 'auto_product', 'auto_set', 'auto_voucher', 'auto_seasonal', 'auto_schedule')),
  source_id          TEXT,                                    -- z.B. blog_post.id, product.id
  template_id        UUID,                                    -- FK unten

  -- KI-Generierung
  ai_generated       BOOLEAN      NOT NULL DEFAULT false,
  ai_prompt          TEXT,
  ai_model           TEXT,

  -- Metadaten
  created_by         TEXT,                                    -- 'admin' oder 'system'
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_posts_status_idx ON social_posts (status);
CREATE INDEX IF NOT EXISTS social_posts_scheduled_idx ON social_posts (scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS social_posts_published_idx ON social_posts (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS social_posts_source_idx ON social_posts (source_type, source_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Vorlagen (KI-Prompts für verschiedene Post-Anlässe)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_templates (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT         NOT NULL,                   -- z.B. "Neue Kamera im Katalog"
  description        TEXT,
  trigger_type       TEXT         NOT NULL CHECK (trigger_type IN ('manual', 'blog_publish', 'product_added', 'set_added', 'voucher_created', 'seasonal', 'scheduled')),
  platforms          TEXT[]       NOT NULL DEFAULT '{facebook,instagram}',
  media_type         TEXT         NOT NULL DEFAULT 'image',

  -- KI-Prompts (Claude)
  caption_prompt     TEXT         NOT NULL,                   -- Claude-Prompt für Text
  image_prompt       TEXT,                                     -- DALL-E-Prompt (optional)

  -- Default-Hashtags
  default_hashtags   TEXT[]       NOT NULL DEFAULT '{}',

  -- Aktiv?
  is_active          BOOLEAN      NOT NULL DEFAULT true,

  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- FK nachträglich wegen Reihenfolge
ALTER TABLE social_posts
  DROP CONSTRAINT IF EXISTS social_posts_template_id_fkey,
  ADD CONSTRAINT social_posts_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES social_templates(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- Redaktionsplan (wiederkehrende Posts wie "Jeden Montag 9:00 Produkt-Spotlight")
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_schedule (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT         NOT NULL,
  template_id        UUID         REFERENCES social_templates(id) ON DELETE CASCADE,

  -- Zeit-Pattern (cron-artig)
  frequency          TEXT         NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week        INT          CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=So, 6=Sa
  day_of_month       INT          CHECK (day_of_month BETWEEN 1 AND 31),
  hour_of_day        INT          NOT NULL DEFAULT 9 CHECK (hour_of_day BETWEEN 0 AND 23),
  minute             INT          NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59),

  -- Kontext für KI-Generierung (z.B. Kategorie zum Rotieren)
  context_json       JSONB        DEFAULT '{}'::jsonb,

  is_active          BOOLEAN      NOT NULL DEFAULT true,
  last_run_at        TIMESTAMPTZ,
  next_run_at        TIMESTAMPTZ,

  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_schedule_next_run_idx
  ON social_schedule (next_run_at) WHERE is_active = true;

-- ──────────────────────────────────────────────────────────────────────────
-- Insights (Reach, Likes, Kommentare pro Post)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_insights (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id            UUID         NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform           TEXT         NOT NULL CHECK (platform IN ('facebook', 'instagram')),

  reach              INT          NOT NULL DEFAULT 0,
  impressions        INT          NOT NULL DEFAULT 0,
  likes              INT          NOT NULL DEFAULT 0,
  comments           INT          NOT NULL DEFAULT 0,
  shares             INT          NOT NULL DEFAULT 0,
  saves              INT          NOT NULL DEFAULT 0,
  clicks             INT          NOT NULL DEFAULT 0,
  engagement_rate    NUMERIC(5,2),

  fetched_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (post_id, platform)
);

CREATE INDEX IF NOT EXISTS social_insights_post_idx ON social_insights (post_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Auto-Update updated_at
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS social_accounts_updated_at ON social_accounts;
CREATE TRIGGER social_accounts_updated_at
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS social_posts_updated_at ON social_posts;
CREATE TRIGGER social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS social_templates_updated_at ON social_templates;
CREATE TRIGGER social_templates_updated_at
  BEFORE UPDATE ON social_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS social_schedule_updated_at ON social_schedule;
CREATE TRIGGER social_schedule_updated_at
  BEFORE UPDATE ON social_schedule
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- RLS: Alle Tabellen nur Service-Role (API + Admin)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_insights ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- Seed: Standard-Vorlagen
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO social_templates (name, description, trigger_type, platforms, media_type, caption_prompt, default_hashtags)
VALUES
  (
    'Neuer Blogartikel',
    'Automatisch bei Blog-Veröffentlichung',
    'blog_publish',
    ARRAY['facebook', 'instagram'],
    'image',
    'Schreibe einen Instagram-/Facebook-Post (max 200 Wörter) zum Blogartikel "{title}". Auszug: {excerpt}. Stil: locker, einladend, mit Emoji. Am Ende: "Link in der Bio / Kommentare" + CTA. KEINE Hashtags im Text — die kommen separat.',
    ARRAY['#actioncam', '#kameramieten', '#cam2rent', '#gopro', '#outdoor']
  ),
  (
    'Neue Kamera im Katalog',
    'Produkt-Spotlight bei neuem Produkt',
    'product_added',
    ARRAY['facebook', 'instagram'],
    'image',
    'Schreibe einen begeisterten Social-Media-Post zur neuen Kamera "{product_name}" ({brand}). Highlights: {highlights}. Preis ab {price_per_day}€/Tag. Stil: enthusiastisch, mit 2-3 Emoji, kurz und knackig. Am Ende CTA zum Mieten.',
    ARRAY['#neuekamera', '#actioncam', '#kameramieten', '#cam2rent']
  ),
  (
    'Neues Set verfügbar',
    'Set-Ankündigung bei neuem Set',
    'set_added',
    ARRAY['facebook', 'instagram'],
    'image',
    'Schreibe einen Post zum neuen Set "{set_name}". Enthält: {includes}. Perfekt für: {use_case}. Stil: action-orientiert, mit 2 Emoji. CTA zum Mieten.',
    ARRAY['#kameraset', '#actionset', '#cam2rent', '#outdoorgear']
  ),
  (
    'Gutschein-Aktion',
    'Bei neuem öffentlichen Gutschein',
    'voucher_created',
    ARRAY['facebook', 'instagram'],
    'image',
    'Schreibe einen werbewirksamen Post zur Aktion: {voucher_code} — {voucher_description}. Gültig bis {valid_until}. Stil: spannend, FOMO, mit 2-3 Emoji. CTA: Code an der Kasse eingeben.',
    ARRAY['#aktion', '#rabatt', '#cam2rent', '#kameramieten']
  ),
  (
    'Sommer-Kampagne',
    'Saisonaler Post im Sommer',
    'seasonal',
    ARRAY['facebook', 'instagram'],
    'image',
    'Schreibe einen inspirierenden Sommer-Post über Abenteuer mit Action-Cams. Themen: Reisen, Wassersport, Festival, Camping. Stil: lebensfroh, mit 3-4 Emoji. CTA zum Mieten.',
    ARRAY['#sommer', '#abenteuer', '#actioncam', '#reisen', '#cam2rent']
  ),
  (
    'Winter-Kampagne',
    'Saisonaler Post im Winter',
    'seasonal',
    ARRAY['facebook', 'instagram'],
    'image',
    'Schreibe einen energiegeladenen Winter-Post über Skifahren, Snowboarden und Winterabenteuer mit Action-Cams. Stil: dynamisch, mit 3 Emoji. CTA zum Mieten.',
    ARRAY['#winter', '#ski', '#snowboard', '#actioncam', '#cam2rent']
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- Blog-Serien: Erweiterung fuer zusammenhaengende Artikelserien
-- Ausfuehren in Supabase SQL Editor NACH blog-tables.sql
-- ============================================================

-- Blog-Serien (Serie = Gruppe zusammenhaengender Artikel)
CREATE TABLE IF NOT EXISTS blog_series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL,
  tone TEXT DEFAULT 'informativ',
  target_length TEXT DEFAULT 'mittel',
  total_parts INT NOT NULL DEFAULT 3,
  generated_parts INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Serien-Teile (einzelne Themen innerhalb einer Serie)
CREATE TABLE IF NOT EXISTS blog_series_parts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES blog_series(id) ON DELETE CASCADE,
  part_number INT NOT NULL,
  topic TEXT NOT NULL,
  keywords TEXT[],
  post_id UUID REFERENCES blog_posts(id) ON DELETE SET NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(series_id, part_number)
);

-- Spalte fuer Serien-Zuordnung in blog_posts
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES blog_series(id) ON DELETE SET NULL;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS series_part INT;

-- Indizes
CREATE INDEX IF NOT EXISTS idx_blog_series_status ON blog_series(status);
CREATE INDEX IF NOT EXISTS idx_blog_series_parts_series ON blog_series_parts(series_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_series ON blog_posts(series_id) WHERE series_id IS NOT NULL;

-- ============================================================
-- Blog Redaktionsplan: Erweiterung
-- Ausfuehren in Supabase SQL Editor
-- ============================================================

-- Redaktionsplan-Eintraege
CREATE TABLE IF NOT EXISTS blog_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES blog_posts(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  keywords TEXT[],
  category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL,
  tone TEXT DEFAULT 'informativ',
  target_length TEXT DEFAULT 'mittel',
  scheduled_date DATE NOT NULL,
  scheduled_time TIME DEFAULT '09:00',
  sort_order INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'generating', 'generated', 'reviewed', 'published', 'skipped')),
  reviewed BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Spalte fuer Redaktionsplan-Zuordnung in blog_posts
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES blog_schedule(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_blog_schedule_date ON blog_schedule(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_blog_schedule_status ON blog_schedule(status);

-- =====================================================================
-- cam2rent Analytics: page_views Tabelle
-- Diese SQL-Befehle im Supabase SQL-Editor ausführen
-- =====================================================================

-- 1. Tabelle anlegen
CREATE TABLE IF NOT EXISTS public.page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
  browser TEXT,
  os TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indizes für Performance
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON public.page_views (path);
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON public.page_views (session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor_id ON public.page_views (visitor_id);

-- 3. Row Level Security aktivieren
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- 4. INSERT erlaubt für alle (anonymes Tracking)
CREATE POLICY "Allow anonymous inserts" ON public.page_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 5. SELECT nur für Service Role (Admin API nutzt Service Role Key)
--    Normale User können keine Tracking-Daten lesen
CREATE POLICY "Block public selects" ON public.page_views
  FOR SELECT USING (false);

-- 6. Realtime aktivieren
ALTER PUBLICATION supabase_realtime ADD TABLE public.page_views;

-- 7. Automatisches Löschen nach 90 Tagen (pg_cron - optional)
-- SELECT cron.schedule('cleanup-page-views', '0 3 * * *',
--   'DELETE FROM public.page_views WHERE created_at < NOW() - INTERVAL ''90 days''');

-- =====================================================================
-- FERTIG. Jetzt die Next.js-App deployen und Tracking testen.
-- =====================================================================

-- ════════════════════════════════════════════════════════════════════════
-- blog_views — zeitgestempelte, anonyme Blog-Aufruf-Events
-- ════════════════════════════════════════════════════════════════════════
--
-- Hintergrund: Echte Blog-Aufrufe werden bereits als kumulativer Zaehler in
-- `blog_posts.view_count` gefuehrt (serverseitig hochgezaehlt in
-- app/blog/[slug]/page.tsx, ohne Cookie-Consent — reine anonyme Statistik).
-- Die Statistik-Seite (/admin/analytics → Blog) las die Blog-Aufrufe aber aus
-- der `page_views`-Tabelle, die per § 25 TTDSG nur bei Cookie-Consent='all'
-- befuellt wird → fast leer, obwohl die Artikel real viele Aufrufe haben.
--
-- Diese Tabelle haelt pro Aufruf eine Event-Zeile MIT Zeitstempel, aber OHNE
-- Personenbezug (keine IP, kein visitor_id, kein Cookie). Damit werden die
-- Blog-Aufrufe zeitraum-bezogen (Heute / Dieses Jahr / Trend) korrekt und
-- consent-unabhaengig erfasst — gleiche Datenbasis wie `view_count`, nur
-- zusaetzlich datierbar.
--
-- Idempotent: kann mehrfach ausgefuehrt werden.

CREATE TABLE IF NOT EXISTS blog_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID,
  slug       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zeitraum-Aggregation (Heute / Dieses Jahr / Trend).
CREATE INDEX IF NOT EXISTS blog_views_created_at_idx
  ON blog_views (created_at);

-- Top-Artikel pro Zeitraum.
CREATE INDEX IF NOT EXISTS blog_views_slug_idx
  ON blog_views (slug);

-- RLS: nur Service-Role (alle Zugriffe laufen ueber API mit Service-Client).
ALTER TABLE blog_views ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blog_views'
      AND policyname = 'blog_views_service_role_all'
  ) THEN
    CREATE POLICY blog_views_service_role_all ON blog_views
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

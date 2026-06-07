-- ============================================================
-- Region (Bundesland) + Stadt pro Seitenaufruf
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- Ergänzt zur country-Spalte (ISO-2) zwei weitere Geo-Felder, gespeist aus
-- den Cloudflare-Headern `cf-region` (Region/Bundesland-Name, z.B. "Bavaria")
-- und `cf-ipcity` (Stadt, z.B. "Munich"). Der Track-Endpoint schreibt sie mit.
--
-- ⚠ Voraussetzung in Cloudflare: Managed Transform
--   „Add visitor location headers" aktivieren
--   (Dashboard → Rules → Transform Rules → Managed Transforms). Erst dann
--   senden die Cloudflare-Edges die Header cf-region / cf-region-code /
--   cf-ipcity mit. Ohne den Transform bleiben region/city NULL.
--
-- NULL = unbekannt (Header fehlte / Transform nicht aktiv).
-- ============================================================

ALTER TABLE page_views
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

-- Geo-Drilldown ist heute nur Deutschland-fokussiert → Index auf (country, region).
CREATE INDEX IF NOT EXISTS idx_page_views_country_region
  ON page_views (country, region);

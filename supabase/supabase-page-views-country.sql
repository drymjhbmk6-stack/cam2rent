-- ============================================================
-- Land pro Seitenaufruf (Geo-Statistik)
-- Idempotent: kann mehrfach ausgeführt werden.
--
-- Fügt page_views eine Spalte country hinzu (ISO-3166-1-alpha-2, z.B. "DE",
-- "AT", "CH"). Quelle ist der Cloudflare-Header `CF-IPCountry`, den der
-- Track-Endpoint beim Insert mitschreibt. Kein externer GeoIP-Dienst nötig,
-- weil cam2rent hinter Cloudflare läuft.
--
-- NULL = unbekannt (Header fehlte / Cloudflare nicht im Pfad / "XX"/"T1").
-- ============================================================

ALTER TABLE page_views
  ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS idx_page_views_country
  ON page_views (country);

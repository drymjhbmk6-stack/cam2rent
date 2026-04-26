-- supabase-reels-quality-metrics.sql
-- Phase 2.5 der Reels-Ueberarbeitung: Strukturierte Quality-Metriken pro Reel.
--
-- Schreibt Datei-Groesse, Bitrate, Quell-Aufloesungen, Stock-Source-Verteilung,
-- Render-Dauer, genutzte Schrift und motion_style in eine JSONB-Spalte.
--
-- Type-Shape (siehe lib/reels/orchestrator.ts → ReelQualityMetrics):
--   {
--     "file_size_bytes": number,
--     "duration_seconds": number,
--     "avg_bitrate_kbps": number,
--     "segment_count": number,
--     "source_resolutions": Array<{ index, width, height, source }>,
--     "stock_sources": { pexels: number, pixabay: number },
--     "render_duration_seconds": number,
--     "font_used": string,
--     "motion_style": "static" | "kenburns" | "mixed"
--   }
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE social_reels
  ADD COLUMN IF NOT EXISTS quality_metrics JSONB;

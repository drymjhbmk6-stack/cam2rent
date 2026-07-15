-- ============================================================
-- cam2rent – Schadensmeldung: beliebige Anhänge (Dokumente) + E-Mail-Verlauf
-- + Kunden-Freigabe pro Datei (Fotos & Anhänge sind standardmäßig intern).
-- Idempotent. Im Supabase SQL-Editor ausführen.
-- ============================================================

-- Zusätzliche Dokument-Anhänge pro Schadensmeldung (neben `photos`).
-- Shape je Eintrag:
--   { "path": "<bookingId>/<uuid>.pdf",
--     "filename": "Mailverlauf.pdf",
--     "mime": "application/pdf",
--     "source": "upload" | "email_history" }
ALTER TABLE damage_reports
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Explizit für den Kunden freigegebene Datei-Pfade (Fotos UND Anhänge).
-- Alles NICHT hier Aufgeführte ist rein intern und wird dem Kunden nie
-- mitgeschickt. Enthält storage-Pfade aus `photos` bzw. `attachments[].path`.
ALTER TABLE damage_reports
  ADD COLUMN IF NOT EXISTS customer_visible_paths JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Storage-Bucket für die Dokument-Anhänge (privat). Wird vom Upload-Endpoint
-- bei Bedarf automatisch angelegt (createBucket), daher hier nur als Hinweis /
-- Sanity-Check. Manuelles Anlegen ist NICHT nötig.
-- Storage → New Bucket → Name: "damage-attachments", Public: OFF,
--   MIME: application/pdf, image/jpeg, image/png, image/webp, text/plain
INSERT INTO storage.buckets (id, name, public)
VALUES ('damage-attachments', 'damage-attachments', false)
ON CONFLICT (id) DO NOTHING;

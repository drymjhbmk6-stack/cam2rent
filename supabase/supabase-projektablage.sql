-- ============================================================
-- Projektablage — private Datei-Ablage im Admin (Owner-only)
-- Idempotent: kann mehrfach ausgefuehrt werden.
--
-- Zweck: Projektstaende eines FREMDEN Nebenprojekts hochladen, durchsehen
-- und wieder herunterladen. Hat fachlich nichts mit dem Verleih zu tun —
-- nutzt nur die vorhandene Admin-Huelle + Supabase Storage.
--
-- Tabellen:
--   projekt_ablage_projekte  — ein Eintrag pro Projekt
--   projekt_ablage_staende   — Versionen (v1, v2, v3 ...) je Projekt
--   projekt_ablage_dateien   — eine Zeile pro Datei eines Standes
--
-- Wichtig zum Datenmodell:
--   Der ECHTE relative Pfad ('src/lib/foo.php') steht in `rel_pfad`.
--   Im Storage liegt die Datei unter einer reinen UUID
--   ('<projekt_id>/<stand_id>/<uuid>'). Dadurch ist Path-Traversal
--   konstruktiv unmoeglich, und Umlaute/Leerzeichen/ueberlange Pfade
--   koennen den Storage nicht stoeren.
--
--   Supabase `storage.list()` listet nur EINE Ebene pro Aufruf — ein tiefer
--   Projektbaum waere Dutzende Roundtrips. Deshalb ist die DB die Wahrheit
--   ueber den Dateibaum, der Storage nur das Blob-Lager.
--
-- Storage-Bucket: `projekt-ablage` (privat). Wird beim ersten Upload vom
-- Code automatisch angelegt; der INSERT unten ist nur ein Sanity-Fallback.
--
-- ACHTUNG nach dieser Migration: im Supabase-Dashboard unter
--   Storage -> Settings -> "Upload file size limit"
-- das Projekt-Limit erhoehen (Default 50 MB). Es uebersteuert jedes
-- Bucket-Limit — ohne diesen Schritt scheitert jeder grosse Upload mit 413.
-- ============================================================

CREATE TABLE IF NOT EXISTS projekt_ablage_projekte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  beschreibung TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projekt_ablage_staende (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projekt_id UUID NOT NULL REFERENCES projekt_ablage_projekte(id) ON DELETE CASCADE,
  version_nr INTEGER NOT NULL,
  notiz TEXT,
  -- 'uploading'   = Upload laeuft bzw. wurde abgebrochen (unvollstaendig)
  -- 'fertig'      = alle Dateien liegen im Storage
  -- 'abgebrochen' = vom Admin als unvollstaendig markiert
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'fertig', 'abgebrochen')),
  datei_anzahl INTEGER NOT NULL DEFAULT 0,
  bytes_gesamt BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  UNIQUE (projekt_id, version_nr)
);

CREATE TABLE IF NOT EXISTS projekt_ablage_dateien (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stand_id UUID NOT NULL REFERENCES projekt_ablage_staende(id) ON DELETE CASCADE,
  rel_pfad TEXT NOT NULL,
  groesse BIGINT NOT NULL DEFAULT 0,
  storage_pfad TEXT NOT NULL,
  hochgeladen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stand_id, rel_pfad)
);

CREATE INDEX IF NOT EXISTS idx_projekt_ablage_staende_projekt
  ON projekt_ablage_staende (projekt_id, version_nr DESC);

-- Aufraeumen unvollstaendiger Staende (Browser-Abbruch)
CREATE INDEX IF NOT EXISTS idx_projekt_ablage_staende_uploading
  ON projekt_ablage_staende (created_at)
  WHERE status = 'uploading';

CREATE INDEX IF NOT EXISTS idx_projekt_ablage_dateien_stand
  ON projekt_ablage_dateien (stand_id);

-- updated_at automatisch fortschreiben
CREATE OR REPLACE FUNCTION touch_projekt_ablage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projekt_ablage_projekte_updated_at ON projekt_ablage_projekte;
CREATE TRIGGER trg_projekt_ablage_projekte_updated_at
  BEFORE UPDATE ON projekt_ablage_projekte
  FOR EACH ROW
  EXECUTE FUNCTION touch_projekt_ablage_updated_at();

-- ============================================================
-- Sicherheit
--
-- RLS aktiv + KEINE Policy => nur service_role kommt heran (umgeht RLS).
-- Zusaetzlich explizites REVOKE fuer anon/authenticated: der anon-Key liegt
-- konstruktionsbedingt im Browser-Bundle, und ohne Entzug waere eine spaeter
-- versehentlich hinzugefuegte Policy sofort oeffentlich wirksam.
-- (Gleiche Haltung wie supabase-sec-02b-anon-revoke.sql)
-- ============================================================

ALTER TABLE projekt_ablage_projekte ENABLE ROW LEVEL SECURITY;
ALTER TABLE projekt_ablage_staende  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projekt_ablage_dateien  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON projekt_ablage_projekte FROM anon, authenticated;
REVOKE ALL ON projekt_ablage_staende  FROM anon, authenticated;
REVOKE ALL ON projekt_ablage_dateien  FROM anon, authenticated;

-- ============================================================
-- Storage-Bucket (Sanity-Fallback — der Code legt ihn sonst selbst an)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('projekt-ablage', 'projekt-ablage', FALSE, 1073741824)  -- 1 GB pro Datei
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Verifikation
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE tablename LIKE 'projekt_ablage%';
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'projekt-ablage';
--
-- Rollback (loescht ALLE hinterlegten Projektstaende — Storage-Objekte
-- muessen separat im Dashboard entfernt werden):
-- DROP TABLE IF EXISTS projekt_ablage_dateien;
-- DROP TABLE IF EXISTS projekt_ablage_staende;
-- DROP TABLE IF EXISTS projekt_ablage_projekte;
-- DROP FUNCTION IF EXISTS touch_projekt_ablage_updated_at();

-- ============================================================
-- Legal-Content-Management-System für cam2rent.de
-- Tabellen: legal_documents + legal_document_versions
-- Postgres-Funktion: publish_legal_version (atomare Versionierung)
-- Seed-Daten: agb, widerruf, haftungsausschluss, datenschutz, impressum
-- In Supabase SQL Editor ausführen
-- ============================================================

-- ─── Tabelle: legal_documents (Metadaten pro Dokumenttyp) ───────────────────

CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  current_version_id UUID,  -- FK wird unten per ALTER gesetzt
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_slug ON legal_documents(slug);

-- ─── Tabelle: legal_document_versions (Versionshistorie) ────────────────────

CREATE TABLE IF NOT EXISTS legal_document_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'markdown' CHECK (content_format IN ('markdown', 'html')),
  change_note TEXT,
  published_at TIMESTAMPTZ DEFAULT now(),
  published_by UUID REFERENCES auth.users(id),
  is_current BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_legal_versions_doc_version
  ON legal_document_versions(document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_legal_versions_current
  ON legal_document_versions(document_id) WHERE is_current = true;

-- FK: legal_documents.current_version_id → legal_document_versions
ALTER TABLE legal_documents
  ADD CONSTRAINT fk_legal_documents_current_version
  FOREIGN KEY (current_version_id) REFERENCES legal_document_versions(id);

-- ─── RLS-Policies ───────────────────────────────────────────────────────────

ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_document_versions ENABLE ROW LEVEL SECURITY;

-- Lesen: alle (anon + authenticated)
CREATE POLICY "legal_documents_select" ON legal_documents
  FOR SELECT USING (true);

CREATE POLICY "legal_versions_select" ON legal_document_versions
  FOR SELECT USING (true);

-- Schreiben: nur service_role (Admin-API nutzt service_role key)
-- Kein INSERT/UPDATE/DELETE für anon/authenticated → implizit denied

-- Alte Versionen sind unveränderlich: kein UPDATE/DELETE erlaubt für nicht-service-role
-- (service_role bypassed RLS ohnehin, aber für zusätzliche Sicherheit:)
CREATE POLICY "legal_versions_no_update" ON legal_document_versions
  FOR UPDATE USING (false);

CREATE POLICY "legal_versions_no_delete" ON legal_document_versions
  FOR DELETE USING (false);

-- ─── Funktion: publish_legal_version (atomare Versionierung) ────────────────

CREATE OR REPLACE FUNCTION publish_legal_version(
  p_document_id UUID,
  p_content TEXT,
  p_format TEXT DEFAULT 'markdown',
  p_change_note TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_version INT;
  v_new_id UUID;
BEGIN
  -- Nächste Versionsnummer berechnen
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version
    FROM legal_document_versions
    WHERE document_id = p_document_id;

  -- Bisherige aktuelle Version deaktivieren
  UPDATE legal_document_versions
    SET is_current = false
    WHERE document_id = p_document_id AND is_current = true;

  -- Neue Version einfügen
  INSERT INTO legal_document_versions (
    document_id, version_number, content, content_format,
    change_note, published_by, is_current, published_at
  )
  VALUES (
    p_document_id, v_next_version, p_content, p_format,
    p_change_note, p_user_id, true, now()
  )
  RETURNING id INTO v_new_id;

  -- current_version_id aktualisieren
  UPDATE legal_documents
    SET current_version_id = v_new_id,
        updated_at = now()
    WHERE id = p_document_id;

  RETURN v_new_id;
END;
$$;

-- ─── Seed-Daten ─────────────────────────────────────────────────────────────

INSERT INTO legal_documents (slug, title) VALUES
  ('agb', 'Allgemeine Geschäftsbedingungen'),
  ('widerruf', 'Widerrufsbelehrung'),
  ('haftungsausschluss', 'Haftungsbedingungen'),
  ('datenschutz', 'Datenschutzerklärung'),
  ('impressum', 'Impressum')
ON CONFLICT (slug) DO NOTHING;

-- Initiale Version 1 für jedes Dokument (Platzhalter)

DO $$
DECLARE
  doc RECORD;
  vid UUID;
BEGIN
  FOR doc IN
    SELECT id, slug, title FROM legal_documents
    WHERE current_version_id IS NULL
  LOOP
    SELECT publish_legal_version(
      doc.id,
      '# ' || doc.title || E'\n\nInhalt wird in Kürze eingepflegt.\n\n*Stand: ' || to_char(now(), 'DD.MM.YYYY') || '*',
      'markdown',
      'Initiale Version (Platzhalter)',
      NULL
    ) INTO vid;
  END LOOP;
END;
$$;

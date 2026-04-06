-- ============================================================
-- Aufgabe 11: Admin Audit-Log
-- Tabelle: admin_audit_log
-- ============================================================

-- 1. Tabelle erstellen
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID,
  admin_user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indizes
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON admin_audit_log (entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin_user_id ON admin_audit_log (admin_user_id);

-- 3. Einträge sind unveränderlich: UPDATE und DELETE verbieten
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit-Log-Einträge dürfen nicht geändert oder gelöscht werden.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_update ON admin_audit_log;
CREATE TRIGGER trg_prevent_audit_log_update
  BEFORE UPDATE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_prevent_audit_log_delete ON admin_audit_log;
CREATE TRIGGER trg_prevent_audit_log_delete
  BEFORE DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- 4. Automatisches Löschen von Einträgen älter als 2 Jahre
--    (pg_cron muss in Supabase aktiviert sein, sonst manuell ausführen)
-- SELECT cron.schedule(
--   'audit-log-cleanup',
--   '0 3 * * 0',  -- Jeden Sonntag um 03:00
--   $$DELETE FROM admin_audit_log WHERE created_at < NOW() - INTERVAL '2 years'$$
-- );

-- Alternativ: Manueller Cleanup-Befehl (regelmäßig ausführen)
-- DELETE FROM admin_audit_log WHERE created_at < NOW() - INTERVAL '2 years';

-- 5. RLS aktivieren (Service-Role umgeht RLS)
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Keine Policies = nur Service Role kann zugreifen

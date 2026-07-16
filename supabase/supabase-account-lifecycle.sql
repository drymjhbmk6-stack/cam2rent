-- Account-Lifecycle: Auto-Cleanup unverifizierter + inaktiver Kundenkonten
-- Idempotent, additiv. KEINE neue Tabelle.
--
-- Genutzt vom Cron /api/cron/account-cleanup:
--  * unverified_warning_sent_at → wann die "letzte Erinnerung" an ein noch
--    nicht verifiziertes Konto (verification_status IS NULL/'none') rausging.
--    48 h danach wird das Konto anonymisiert + der Profil-Eintrag entfernt.
--  * inactive_warning_sent_at   → wann die 1-Jahr-Inaktivitaets-Warnung rausging.
--    14 Tage danach wird das Konto DEAKTIVIERT (deactivated_at), NICHT geloescht.
--  * deactivated_at             → gesetzt = Konto inaktiv (raus aus aktiver
--    Kundenliste). Wird beim naechsten Login automatisch wieder geleert
--    (Reaktivierung in /api/customer-login-track).
--
-- WICHTIG: Alle drei Spalten sind service-role-only. Sie stehen bewusst NICHT
-- im column-level GRANT UPDATE aus supabase-profiles-rls-column-level.sql →
-- ein Kunde kann sie ueber den Browser-Client NICHT selbst setzen/loeschen.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unverified_warning_sent_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS inactive_warning_sent_at   TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at             TIMESTAMPTZ;

-- Partielle Indizes: nur die wenigen markierten Zeilen sind fuer den Cron/Filter
-- relevant, der Rest bleibt unindiziert (schlank).
CREATE INDEX IF NOT EXISTS idx_profiles_deactivated_at
  ON profiles (deactivated_at) WHERE deactivated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_unverified_warning
  ON profiles (unverified_warning_sent_at) WHERE unverified_warning_sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_inactive_warning
  ON profiles (inactive_warning_sent_at) WHERE inactive_warning_sent_at IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- Eingehende E-Mails pro Mitarbeiter-Postfach
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotent. Baut auf supabase-inbound-email.sql auf.
--
-- Jeder Mitarbeiter bekommt eine eigene cam2rent-Adresse (typisch ein Alias
-- des Support-Postfachs). Eine eingehende E-Mail wird ueber das An-Feld dem
-- passenden Mitarbeiterkonto zugeordnet; der Mitarbeiter sieht in
-- /admin/nachrichten nur seine eigenen + unzugeordnete Konversationen,
-- der Owner sieht alle.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Mitarbeiter-Postfach-Adresse ──────────────────────────────────────────
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS inbox_address TEXT;

-- Eine Adresse darf nur einem Mitarbeiter gehoeren (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_inbox_address
  ON admin_users (lower(inbox_address)) WHERE inbox_address IS NOT NULL;

-- ─── Zuordnung der Konversation ────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS assigned_admin_user_id UUID
  REFERENCES admin_users(id) ON DELETE SET NULL;

-- cam2rent-seitige Adresse, auf der der Thread laeuft (fuer Reply-From + Anzeige).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS inbox_address TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_admin
  ON conversations (assigned_admin_user_id) WHERE assigned_admin_user_id IS NOT NULL;

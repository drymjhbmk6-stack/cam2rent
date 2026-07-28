-- ============================================================
-- Push-Benachrichtigungs-Einstellungen pro Mitarbeiter
-- Idempotent: kann mehrfach ausgefuehrt werden.
--
-- Neue Spalte `push_prefs JSONB` auf admin_users:
--   Form: { "muted": ["new_review", "blog_ready", ...] }
--   `muted` = Liste der Notification-Typen, die dieser Mitarbeiter NICHT als
--   Push auf sein Geraet bekommen will. Leer / fehlend = ALLE Pushes an, die
--   die Permission des Mitarbeiters ohnehin erlaubt (Backward-Compat: neue
--   Typen sind standardmaessig AN).
--
-- Der Permission-Filter bleibt die harte Grenze (siehe lib/push.ts +
-- lib/notification-types.ts). `muted` verengt nur zusaetzlich pro Person.
-- ============================================================

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS push_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

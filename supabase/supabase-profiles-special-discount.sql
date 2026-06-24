-- Sonderkonditionen pro Kunde — individueller Prozent-Rabatt, vom Admin im
-- Kunden-Bereich (/admin/kunden/[id]) gesetzt. Greift automatisch im Checkout
-- und ERSETZT dort die anderen Auto-Rabatte (Aktion/Mengen-/Frühbucher-/
-- Treuerabatt). Idempotent, additiv. KEINE neue Tabelle.
--
-- WICHTIG (Sicherheit): Diese Spalten werden NICHT in den
-- `GRANT UPDATE … TO authenticated` aus supabase-profiles-rls-column-level.sql
-- aufgenommen → bleiben service-role-only. Der Kunde kann sich also keinen
-- Rabatt selbst setzen. SELECT der eigenen Profil-Zeile bleibt erlaubt
-- (Checkout-Anzeige liest den eigenen %-Satz).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS special_discount_percent INTEGER,
  ADD COLUMN IF NOT EXISTS special_discount_reason TEXT,
  ADD COLUMN IF NOT EXISTS special_discount_valid_until DATE,
  ADD COLUMN IF NOT EXISTS special_discount_set_by TEXT,
  ADD COLUMN IF NOT EXISTS special_discount_set_at TIMESTAMPTZ;

-- Plausibilitaet: 0–100 % (NULL = keine Sonderkondition)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_special_discount_percent_chk'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_special_discount_percent_chk
      CHECK (special_discount_percent IS NULL OR (special_discount_percent >= 0 AND special_discount_percent <= 100));
  END IF;
END $$;

-- Tester-Konto-Flag fuer Profile (Live-Seite-Test-Buchungen).
--
-- Verwendung: Wenn `profiles.is_tester = true`, dann:
--  - Buchungen dieses Users werden mit `bookings.is_test = true` gespeichert
--    und sind damit aus Reports/EUeR/DATEV ausgefiltert.
--  - Stripe-PaymentIntents werden mit den Test-Stripe-Keys erzeugt
--    (unabhaengig vom globalen environment_mode), echte Karten/PayPal
--    schlagen also fehl — Test-Karten 4242... funktionieren.
--  - Verifizierungs-Pflicht wird uebersprungen.
--  - E-Mails kriegen Subject-Prefix "[TEST]".
--
-- Idempotent — kann mehrfach ausgefuehrt werden.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_tester BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_tester IS
  'Tester-Konto: Buchungen mit is_test=true, Stripe-Test-Keys, kein Verification-Gate, [TEST]-Prefix in Mails.';

-- Optional Index fuer schnelle Tester-Lookups (in der Praxis fast nie noetig,
-- weil Profile typischerweise per id selektiert werden).
-- CREATE INDEX IF NOT EXISTS idx_profiles_is_tester ON public.profiles (is_tester) WHERE is_tester = true;

-- ==============================================================
-- Payment-Link-Support + Storno-Deadline-Regeln
-- ==============================================================
-- Idempotent.

-- ── Stripe Payment Link ID auf bookings ────────────────────────────────────
-- payment_intent_id bleibt fuer die klassischen PaymentIntent-IDs reserviert
-- (Checkout Sessions, Direkt-Zahlung). Payment Links haben eigene IDs (plink_*)
-- und werden bei Storno separat deaktiviert.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_link_id TEXT;
CREATE INDEX IF NOT EXISTS bookings_payment_link_idx ON bookings (stripe_payment_link_id);

-- ── notes-Spalte sicherstellen ──────────────────────────────────────────────
-- Manche aeltere bookings-Tabellen haben kein notes-Feld. Wir nutzen es fuer
-- Admin-sichtbare Hinweise (Stornierungsgrund, Zahlungslink-Info, etc.).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;

-- PostgREST-Schema-Cache invalidieren, damit die neuen Spalten sofort verfuegbar sind.
NOTIFY pgrst, 'reload schema';

-- ── Deadline-Regeln fuer Auto-Storno unbezahlter Buchungen ──────────────────
-- Setting-Struktur:
--   {
--     versand: { days_before_rental: 3, cutoff_hour_berlin: 18 },
--     abholung: { days_before_rental: 1, cutoff_hour_berlin: 18 }
--   }
--
-- Bedeutung: Deadline = (rental_from - days_before_rental Tage) um cutoff_hour Berlin.
--
-- Beispiel Versand (Default 3 Tage, 18:00):
--   rental_from = 2026-04-25 (Fr)
--   → Deadline = 2026-04-22 (Di) 18:00 Berlin
--   → 2 volle Tage (Mi + Do) fuer Versand-Vorbereitung
--
-- Beispiel Abholung (Default 1 Tag, 18:00):
--   rental_from = 2026-04-25 (Fr)
--   → Deadline = 2026-04-24 (Do) 18:00 Berlin
INSERT INTO admin_settings (key, value)
VALUES (
  'awaiting_payment_cancel_rules',
  jsonb_build_object(
    'versand', jsonb_build_object('days_before_rental', 3, 'cutoff_hour_berlin', 18),
    'abholung', jsonb_build_object('days_before_rental', 1, 'cutoff_hour_berlin', 18)
  )
)
ON CONFLICT (key) DO NOTHING;

-- Altes Setting (hours-basiert) laesst sich nicht sauber konvertieren,
-- bleibt unangetastet. Neue Code-Version nutzt nur noch das neue Setting.

COMMIT;

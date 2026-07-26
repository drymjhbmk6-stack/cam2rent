-- ============================================================
-- Storno-Dokumentation (cancellation_record) auf bookings
-- Erstellt: 2026-07-26
-- ============================================================
--
-- AGB § 15: der Admin-Storno rechnet mit der Staffel als VORSCHLAG. Für den
-- Streitfall wird pro Stornierung nachvollziehbar dokumentiert, dass nach AGB
-- abgerechnet wurde: vorgeschlagener Betrag, tatsächlich erstatteter Betrag,
-- ob unter dem Vorschlag (begründungspflichtig), Begründung, Grund-Kategorie,
-- Anker-Datum, ausführender Admin, Zeitstempel.
--
-- Ein JSONB-Feld (statt vieler Einzelspalten). Shape:
-- {
--   "reason_category": "customer" | "vermieter_verlegung" | ...,
--   "anchor_date": "2026-05-10",
--   "rental_from": "2026-06-20",
--   "anchor_differs": true,
--   "days_until_start": 5,
--   "suggested_amount": 49.49,
--   "refunded_amount": 49.49,
--   "below_suggestion": false,
--   "justification": null,
--   "recorded_by": "Admin-Name",
--   "recorded_at": "2026-07-26T10:00:00.000Z"
-- }
--
-- Idempotent. Additiv. refund_amount/refund_note (Betrag/Notiz) bleiben separat.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_record JSONB;

COMMENT ON COLUMN bookings.cancellation_record IS
  'Storno-Dokumentation (AGB § 15): vorgeschlagener vs. erstatteter Betrag, Abweichung, Begründung, Grund-Kategorie, Anker-Datum, Admin, Zeitstempel.';

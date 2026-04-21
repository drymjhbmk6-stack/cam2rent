-- ────────────────────────────────────────────────────────────────────────────
-- Verzögerte Verifizierung (Express-Signup)
-- ────────────────────────────────────────────────────────────────────────────
-- Hintergrund: Für Neukunden soll es möglich sein, direkt im Checkout ein
-- Konto anzulegen und sofort zu bezahlen, OHNE dass der Ausweis vorher
-- geprüft ist. Die Verifizierung wird dann VOR dem physischen Versand
-- durchgeführt — nicht mehr vor der Zahlung. Das senkt den Drop-Off für
-- Neukunden erheblich, ohne rechtliche Anforderungen zu verletzen
-- (Ausweisprüfung bleibt Pflicht vor Übergabe der Kamera).
--
-- Neue Spalten auf `bookings`:
--   verification_required (bool)      Ob diese Buchung eine Verifizierung braucht
--   verification_gate_passed_at       Zeitpunkt der Freigabe durch Admin
--
-- Diese Migration ist idempotent (IF NOT EXISTS) und rueckwaerts-kompatibel:
-- Bestehende Buchungen bekommen verification_required=FALSE, weil fuer sie
-- die Verifizierung bereits vor der Zahlung erfolgt ist.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_gate_passed_at TIMESTAMPTZ;

-- Index fuer den Versand-Filter: Buchungen die noch auf Ausweis warten.
-- Partial-Index ist effizienter, weil die grosse Mehrheit der Buchungen
-- verification_required=FALSE haben wird.
CREATE INDEX IF NOT EXISTS idx_bookings_verification_pending
  ON bookings (rental_from)
  WHERE verification_required = TRUE
    AND verification_gate_passed_at IS NULL;

-- Index fuer den Auto-Storno-Cron (findet faellige unverifizierte Buchungen)
CREATE INDEX IF NOT EXISTS idx_bookings_verification_rental_from
  ON bookings (rental_from)
  WHERE verification_required = TRUE;

COMMENT ON COLUMN bookings.verification_required IS
  'TRUE wenn Ausweis-Check noch fehlt. Wird bei Express-Signup-Buchungen gesetzt.';
COMMENT ON COLUMN bookings.verification_gate_passed_at IS
  'Zeitpunkt an dem Admin den Versand freigegeben hat (Ausweis ok).';

-- Paketgewicht fuer den Versand-Workflow.
--
-- Der Packer/Kontrolleur erfasst beim Packen das ungefaehre Paketgewicht
-- (vorbefuellt aus den hinterlegten Einzelgewichten von Kamera + Zubehoer).
-- Dieser Wert befuellt spaeter das Sendcloud-Versandetikett vor.
--
-- Idempotent. Defensiver Code-Fallback existiert: fehlt die Spalte, laeuft
-- der Pack-Flow weiter (Gewicht wird dann nur nicht persistiert).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pack_weight_kg NUMERIC NULL;

COMMENT ON COLUMN bookings.pack_weight_kg IS
  'Beim Packen erfasstes ungefaehres Paketgewicht in kg. Befuellt das Versandetikett vor. NULL = noch nicht erfasst.';

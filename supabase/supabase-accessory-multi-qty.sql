-- ─────────────────────────────────────────────────────────────────────────────
-- Zubehör: Mehrfach-Buchung (Stepper statt Checkbox)
-- ─────────────────────────────────────────────────────────────────────────────
-- Ermöglicht es, dasselbe Zubehör (z.B. Extra Akku) mehrmals pro Buchung zu
-- mieten. Der Admin aktiviert das pro Zubehörteil via allow_multi_qty.
--
-- Datenmodell:
--   accessories.allow_multi_qty        → Flag "Mehrfach-Auswahl erlauben"
--   accessories.max_qty_per_booking    → Optional: Hardcap pro Buchung
--                                        (NULL = nur Lagerbestand zählt)
--   bookings.accessory_items           → Neue Wahrheit: [{accessory_id, qty}]
--                                        "accessories: string[]" bleibt erhalten
--                                        als Liste eindeutiger IDs (Legacy-View)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE accessories
  ADD COLUMN IF NOT EXISTS allow_multi_qty BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE accessories
  ADD COLUMN IF NOT EXISTS max_qty_per_booking INT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS accessory_items JSONB NULL;

-- Kommentare (Self-Documenting)
COMMENT ON COLUMN accessories.allow_multi_qty IS
  'Wenn true: Kunde kann im Buchungsflow per Stepper >1 Stueck buchen.';
COMMENT ON COLUMN accessories.max_qty_per_booking IS
  'Optional: Obergrenze pro Buchung. NULL = nur Lagerbestand zaehlt.';
COMMENT ON COLUMN bookings.accessory_items IS
  'Zubehoer mit Stueckzahl: [{accessory_id: string, qty: int}]. Authoritative Quelle, accessories(text[]) bleibt als Legacy-View mit unique IDs erhalten.';

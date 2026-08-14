-- Verknüpfte Bestellungen — gemeinsamer Versand/Retoure (idempotent, additiv)
--
-- Zwei (oder mehr) Buchungen desselben Kunden, die in EINEM Paket verschickt
-- werden, können verknüpft werden. Alle Buchungen mit derselben
-- shipment_group_id gelten als "ein Versand-Verbund":
--   - Trackingnummer (Hin + Retoure) wird auf alle Mitglieder übertragen,
--     sobald sie bei EINEM Mitglied gesetzt wird (manuell ODER via
--     Sendcloud-Etikett-Erstellung).
--   - Statuswechsel entlang der Versand-/Abhol-Kette (preparing_shipment /
--     awaiting_pickup / shipped / delivered / picked_up) werden auf die
--     anderen Mitglieder übertragen — sie "wandern" im Dashboard-Aufgaben-
--     Widget gemeinsam weiter.
--
-- NULL = keine Verknüpfung (Standard, unverändertes Verhalten). Gesetzt über
-- POST/DELETE /api/admin/booking/[id]/link-shipment.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS shipment_group_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_shipment_group_id
  ON bookings (shipment_group_id)
  WHERE shipment_group_id IS NOT NULL;

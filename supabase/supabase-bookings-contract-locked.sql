-- Mietvertrag-Freigabe ("Alles okay") — sperrt den Vertrag gegen Zuruecksetzen.
-- Idempotent, additiv. NULL/false = nicht gesperrt (Default-Verhalten).
--
-- Wird gesetzt ueber POST /api/admin/booking/[id]/lock-contract { locked: true },
-- geprueft in POST /api/admin/booking/[id]/reset-contract (409 bei locked).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS contract_locked BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- Storno-Anker (cancellation_anchor_date) — Backfill + Garantie
-- Erstellt: 2026-07-26
-- ============================================================
--
-- AGB § 15 Abs. 2 / Vertrag § 15 Abs. 2: Stornofristen und Erstattungssätze
-- richten sich nach dem URSPRÜNGLICH gebuchten Mietbeginn, auch nach einer
-- Verlegung. `bookings.cancellation_anchor_date` friert diesen Termin ein.
--
-- Die Spalte wurde bereits nullable in `supabase-bookings-postpone.sql`
-- angelegt (und dort beim ersten Verlegen befüllt). Diese Migration macht den
-- Anker zu einer harten Invariante:
--
--   1. Backfill: bestehende Buchungen ohne Anker bekommen rental_from.
--   2. BEFORE-INSERT-Trigger: JEDE neue Buchung erhält automatisch
--      cancellation_anchor_date = rental_from, sofern nicht explizit gesetzt.
--      Das garantiert den Anker über ALLE Insert-Pfade (Direktbuchung,
--      Warenkorb, Webhook, manuelle Buchung, Verkauf, Schadensrechnung) —
--      ohne dass jeder Insert-Pfad die Spalte selbst setzen muss.
--   3. NOT NULL: die Spalte ist danach garantiert gefüllt.
--
-- Ein UPDATE (z. B. Verlegung/booking_edit) löst den Trigger NICHT aus — der
-- einmal gesetzte Anker bleibt erhalten (Verlegung friert ihn zusätzlich auf
-- MIN(rental_from, anchor) ein). rental_from ist per Invariante NOT NULL.
--
-- Idempotent. Additiv — kein Bestand gelöscht.
-- ============================================================

-- 1. Falls die Spalte noch nicht existiert (postpone-Migration nicht gelaufen).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_anchor_date DATE;

-- 2. Backfill: ursprünglicher Mietbeginn als Anker für Altbestände.
UPDATE bookings
   SET cancellation_anchor_date = rental_from
 WHERE cancellation_anchor_date IS NULL
   AND rental_from IS NOT NULL;

-- 3. Trigger: neue Buchungen bekommen den Anker automatisch.
CREATE OR REPLACE FUNCTION set_cancellation_anchor()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cancellation_anchor_date IS NULL THEN
    NEW.cancellation_anchor_date := NEW.rental_from;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_cancellation_anchor ON bookings;
CREATE TRIGGER trg_set_cancellation_anchor
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION set_cancellation_anchor();

-- 4. Harte Invariante. Läuft erst nach Backfill + Trigger; scheitert nur, wenn
--    eine Buchung ohne rental_from existiert (dürfte es per Invariante nicht).
ALTER TABLE bookings ALTER COLUMN cancellation_anchor_date SET NOT NULL;

COMMENT ON COLUMN bookings.cancellation_anchor_date IS
  'Eingefrorener Storno-Termin = ursprünglicher rental_from. Maßgeblich für Stornofristen/Erstattung (AGB § 15 Abs. 2). Wird beim Anlegen automatisch gesetzt (Trigger). Bei einer VERLEGUNG (§ 12) wird dieses Feld BEWUSST NICHT auf den neuen Termin mitgeschrieben — es bleibt der früheste je gesetzte Mietbeginn (MIN(rental_from, anchor)). Bei einer VERLÄNGERUNG (§ 13 Abs. 4) bleibt es ebenfalls unverändert. Eine Verlegung/Verlängerung öffnet damit kein neues kostenloses Storno-Fenster. NICHT beim Zeitraumwechsel "aufräumen".';

-- Verfuegbarkeits-Alerts — Detail-Aufschluesselung (Stand 2026-05-25)
--
-- Fuegt der Tabelle `availability_alerts` eine optionale `details`-Spalte (JSONB)
-- hinzu, damit der `basic_set_unavailable`-Alert mitliefert, WELCHE
-- Set-Bestandteile konkret ausgebucht waren (Name, benoetigte Menge, freie
-- Menge). Ohne diese Migration laeuft der Buchungs-Wizard + die Telemetrie
-- weiter (POST-Endpoint retryt ohne das Feld); die Admin-Seite zeigt dann
-- weiterhin nur den allgemeinen Hinweis ohne Detail-Liste.
--
-- Shape pro Eintrag:
--   { "unavailable_items":
--       [ { "accessory_id": "<uuid|text>",
--           "name": "Extra Akku Insta360 X5",
--           "needed": 2,
--           "remaining": 0 },
--         ... ] }
--
-- Idempotent.

ALTER TABLE availability_alerts
  ADD COLUMN IF NOT EXISTS details JSONB;

-- Belege: Bezahl-Datum-Default Backfill
--
-- Idempotent: kann mehrfach laufen, schreibt nur dort wo bezahl_datum NULL ist.
--
-- Hintergrund: ab dem Code-Stand 2026-05-09 wird bezahl_datum bei INSERT und
-- nach OCR automatisch auf beleg_datum gesetzt, wenn nicht explizit ein
-- anderer Wert mitkommt. Bestehende Belege (vor dem Stichtag) bleiben sonst
-- unbeendet auf NULL und tauchen in der Detail-Ansicht als "TT.mm.jjjj"
-- platzhalter auf.
--
-- Diese Migration setzt rueckwirkend: bezahl_datum = beleg_datum, ueberall
-- wo bezahl_datum NULL ist. Festgeschriebene Belege werden mit-bearbeitet,
-- weil das Bezahl-Datum reine Metadaten ist (kein Buchungs-Invariant) und
-- die Anzeige sonst dauerhaft leer bleibt.

UPDATE belege
   SET bezahl_datum = beleg_datum
 WHERE bezahl_datum IS NULL
   AND beleg_datum IS NOT NULL;

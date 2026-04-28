-- ─────────────────────────────────────────────────────────────────────────────
-- Zubehör: Wiederbeschaffungswert (Zeitwert) pro Accessory
-- ─────────────────────────────────────────────────────────────────────────────
-- Mietvertrag-PDF zeigt den Zeitwert als Obergrenze der Ersatzpflicht bei
-- Totalschaden/Verlust. Bisher gab es Zeitwerte nur fuer Kameras (aus der
-- assets-Tabelle mit AfA). Zubehoer wurde pauschal mit 0 € geführt — der
-- Kunde haftete rechtlich fuer 0 € Ersatz, was nicht realistisch ist.
--
-- Neue Spalte: accessories.replacement_value (Neupreis bzw. Wiederbeschaffungs-
-- preis). Admin pflegt den Wert einmal im Editor. Fuer Sets berechnet der
-- Mietvertrag die Summe aus den enthaltenen accessory_items × replacement_value.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE accessories
  ADD COLUMN IF NOT EXISTS replacement_value NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN accessories.replacement_value IS
  'Wiederbeschaffungswert (Neupreis) in EUR — Obergrenze der Ersatzpflicht bei Totalschaden/Verlust. Wird im Mietvertrag-PDF als Zeitwert pro Zubehoer und in der Set-Summe verwendet.';

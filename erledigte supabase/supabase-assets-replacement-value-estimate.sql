-- assets.replacement_value_estimate: tatsaechlicher Wiederbeschaffungswert
-- (was du faktisch ausgeben musst, um Ersatz zu kaufen).
--
-- Hintergrund: GWG werden in den Buchwerten sofort auf 0 abgeschrieben
-- (asset.current_value=0). Bei Verlust ist der Buchwert aber nicht der
-- echte Schaden — du musst trotzdem ein Ersatzgeraet kaufen. Diese Spalte
-- haelt den realen Marktwert getrennt vom steuerlichen Buchwert.
--
-- Wird beim GWG-Anlegen automatisch auf den Kaufpreis gesetzt. Bei
-- regulaerer linearer AfA bleibt sie NULL (dann zieht der Code current_value
-- als Default).
--
-- Wirkt sich aus auf:
--   - Mietvertrags-Wiederbeschaffungswert (Tabelle in Section "Mietgegenstaende")
--   - Schadens-Vorschlag im AccessoryDamageModal (suggested_wbw)
--
-- Idempotent.

ALTER TABLE assets ADD COLUMN IF NOT EXISTS replacement_value_estimate NUMERIC NULL;

COMMENT ON COLUMN assets.replacement_value_estimate IS
  'Tatsaechlicher Wiederbeschaffungswert in EUR (unabhaengig vom steuerlichen Buchwert). NULL = current_value als Default verwenden. Bei GWG-Sofortabschreibung typisch = purchase_price.';

-- ============================================================
-- Daten-Migration: Bestehende accessories auf accessory_units umstellen
-- Erstellt: 2026-04-28
-- ============================================================
--
-- Voraussetzung: supabase-accessory-units.sql wurde ausgefuehrt.
--
-- Erzeugt fuer jede accessories-Row mit available_qty > 0 entsprechend
-- viele accessory_units-Eintraege mit konservativem Default-Kaufdatum.
--
-- Idempotent: Setzt accessories.migrated_to_units = TRUE.
-- Bei erneutem Lauf werden nur noch nicht-migrierte Rows verarbeitet.
--
-- Was diese Migration NICHT macht:
--   - Es werden KEINE assets-Rows angelegt. Der Admin pflegt Kaufpreis,
--     Marktpreis und Wiederbeschaffungswert spaeter pro Exemplar in der
--     UI nach. Bis dahin faellt der Vertrags-WBW-Floor auf product.deposit
--     (genauso wie es heute fuer Kameras ohne assets-Row der Fall ist).
--   - Der exemplar_code-Generator nutzt die bestehende accessory.id (Slug)
--     als Prefix + 3-stellige laufende Nummer, z.B. "gopro-akku-001".
--     Der Admin kann den Code spaeter pro Exemplar manuell umbenennen.
-- ============================================================

DO $$
DECLARE
  acc RECORD;
  i INT;
  v_code TEXT;
BEGIN
  FOR acc IN
    SELECT id, name, available_qty
    FROM accessories
    WHERE migrated_to_units = FALSE
      AND COALESCE(available_qty, 0) > 0
  LOOP
    FOR i IN 1..acc.available_qty LOOP
      v_code := acc.id || '-' || LPAD(i::TEXT, 3, '0');

      INSERT INTO accessory_units (
        accessory_id,
        exemplar_code,
        purchased_at,
        status,
        notes
      ) VALUES (
        acc.id,
        v_code,
        CURRENT_DATE - INTERVAL '18 months',
        'available',
        'Auto-migriert aus available_qty. Kaufdatum bitte pruefen.'
      )
      ON CONFLICT (accessory_id, exemplar_code) DO NOTHING;
    END LOOP;

    UPDATE accessories
      SET migrated_to_units = TRUE
      WHERE id = acc.id;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- Statistik-Output: Visuelle Pruefung im SQL-Editor
-- ────────────────────────────────────────────────────────────────
--
-- Zeigt pro Zubehoer:
--   - alte available_qty (Quelle)
--   - Anzahl erzeugter Exemplare
--   - Davon im Status 'available'
--
-- Sollte fuer jede migrierte Row gelten: legacy_qty == units_created
-- == units_available (sofern die Migration alleinstehend lief).

SELECT
  a.id   AS accessory_id,
  a.name,
  a.available_qty AS legacy_qty,
  COUNT(u.id)                                            AS units_created,
  COUNT(u.id) FILTER (WHERE u.status = 'available')      AS units_available,
  MIN(u.purchased_at)                                    AS oldest_purchase_date
FROM accessories a
LEFT JOIN accessory_units u ON u.accessory_id = a.id
WHERE a.migrated_to_units = TRUE
GROUP BY a.id, a.name, a.available_qty
ORDER BY a.id;

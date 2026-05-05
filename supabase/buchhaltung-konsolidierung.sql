-- ════════════════════════════════════════════════════════════════════
-- Buchhaltungs- + Inventar-Konsolidierung — Schema (Session A, Schritt 1)
-- ════════════════════════════════════════════════════════════════════
-- Erstellt: 2026-05-05
--
-- Diese Migration legt 11 neue Tabellen an, ohne Altdaten anzufassen.
-- Alte Tabellen (purchases, purchase_items, purchase_attachments, expenses,
-- product_units, accessory_units, accessories, suppliers) bleiben bis zur
-- separaten Drop-Migration nach erfolgreicher Daten-Migration unberuehrt.
--
-- Reihenfolge:
--   1. lieferanten
--   2. produkte
--   3. belege
--   4. beleg_positionen   (ohne folgekosten_asset_id FK)
--   5. assets             (FK auf beleg_positionen)
--   6. ALTER beleg_positionen → folgekosten_asset_id FK
--   7. inventar_units
--   8. inventar_verknuepfung
--   9. afa_buchungen
--  10. beleg_anhaenge
--  11. migration_audit
--  12. beleg_nummer_counter + naechste_beleg_nummer()
--
-- Idempotent (IF NOT EXISTS, DROP IF EXISTS bei Triggern/Policies).
-- Kann mehrfach ausgefuehrt werden.
-- ════════════════════════════════════════════════════════════════════

-- updated_at-Trigger-Funktion (existiert ggf. schon aus suppliers-Migration,
-- aber CREATE OR REPLACE ist safe).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ────────────────────────────────────────────────────────────────────
-- 1. lieferanten
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lieferanten (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  adresse     TEXT,
  ust_id      TEXT,
  email       TEXT,
  notizen     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lieferanten_name ON lieferanten(name);

DROP TRIGGER IF EXISTS trg_lieferanten_updated_at ON lieferanten;
CREATE TRIGGER trg_lieferanten_updated_at
  BEFORE UPDATE ON lieferanten
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE lieferanten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lieferanten service role" ON lieferanten;
CREATE POLICY "lieferanten service role" ON lieferanten
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 2. produkte (Stammdaten fuer Inventar-Typen)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produkte (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  marke           TEXT,
  modell          TEXT,
  default_wbw     DECIMAL(10,2),
  ist_vermietbar  BOOLEAN NOT NULL DEFAULT TRUE,
  bild_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produkte_name ON produkte(name);

ALTER TABLE produkte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "produkte service role" ON produkte;
CREATE POLICY "produkte service role" ON produkte
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 3. belege (Eingangstuer fuer alle Ausgaben)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS belege (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beleg_nr                    TEXT UNIQUE NOT NULL,
  interne_beleg_no            TEXT UNIQUE,
  lieferant_id                UUID REFERENCES lieferanten(id) ON DELETE RESTRICT,
  beleg_datum                 DATE NOT NULL,
  bezahl_datum                DATE,
  rechnungsnummer_lieferant   TEXT,
  summe_netto                 DECIMAL(12,2) NOT NULL DEFAULT 0,
  summe_brutto                DECIMAL(12,2) NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL DEFAULT 'offen'
                                CHECK (status IN ('offen','teilweise','klassifiziert','festgeschrieben')),
  quelle                      TEXT NOT NULL
                                CHECK (quelle IN ('upload','manuell','stripe_sync','migration')),
  ist_eigenbeleg              BOOLEAN NOT NULL DEFAULT FALSE,
  eigenbeleg_grund            TEXT,
  notizen                     TEXT,
  is_test                     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  festgeschrieben_at          TIMESTAMPTZ,
  CONSTRAINT belege_eigenbeleg_grund_check CHECK (
    ist_eigenbeleg = FALSE OR (ist_eigenbeleg = TRUE AND eigenbeleg_grund IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_belege_lieferant ON belege(lieferant_id);
CREATE INDEX IF NOT EXISTS idx_belege_datum     ON belege(beleg_datum DESC);
CREATE INDEX IF NOT EXISTS idx_belege_status    ON belege(status);
CREATE INDEX IF NOT EXISTS idx_belege_is_test   ON belege(is_test) WHERE is_test = TRUE;

DROP TRIGGER IF EXISTS trg_belege_updated_at ON belege;
CREATE TRIGGER trg_belege_updated_at
  BEFORE UPDATE ON belege
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE belege ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "belege service role" ON belege;
CREATE POLICY "belege service role" ON belege
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 4. beleg_positionen (ohne folgekosten_asset_id FK — kommt nach assets)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beleg_positionen (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beleg_id                UUID NOT NULL REFERENCES belege(id) ON DELETE CASCADE,
  reihenfolge             INT NOT NULL DEFAULT 0,
  bezeichnung             TEXT NOT NULL,
  menge                   INT NOT NULL DEFAULT 1 CHECK (menge > 0),
  einzelpreis_netto       DECIMAL(12,2) NOT NULL,
  mwst_satz               DECIMAL(4,2) NOT NULL DEFAULT 19.00,
  gesamt_netto            DECIMAL(12,2) GENERATED ALWAYS AS
                            (menge * einzelpreis_netto) STORED,
  gesamt_brutto           DECIMAL(12,2) GENERATED ALWAYS AS
                            (menge * einzelpreis_netto * (1 + mwst_satz/100)) STORED,
  klassifizierung         TEXT NOT NULL DEFAULT 'pending'
                            CHECK (klassifizierung IN ('pending','afa','gwg','ausgabe','ignoriert')),
  kategorie               TEXT,
  folgekosten_asset_id    UUID,                         -- FK kommt unten via ALTER
  ki_vorschlag            JSONB,
  locked                  BOOLEAN NOT NULL DEFAULT FALSE,
  notizen                 TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beleg_positionen_beleg
  ON beleg_positionen(beleg_id);
CREATE INDEX IF NOT EXISTS idx_beleg_positionen_klassifizierung
  ON beleg_positionen(klassifizierung);
CREATE INDEX IF NOT EXISTS idx_beleg_positionen_folgekosten
  ON beleg_positionen(folgekosten_asset_id) WHERE folgekosten_asset_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_beleg_positionen_updated_at ON beleg_positionen;
CREATE TRIGGER trg_beleg_positionen_updated_at
  BEFORE UPDATE ON beleg_positionen
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE beleg_positionen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "beleg_positionen service role" ON beleg_positionen;
CREATE POLICY "beleg_positionen service role" ON beleg_positionen
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 5. assets (auto-erzeugt aus beleg_positionen)
-- ────────────────────────────────────────────────────────────────────
-- Hinweis: Bestehende `assets`-Tabelle aus alter Welt wird in der
-- Drop-Migration entweder umstrukturiert oder ersetzt. Hier legen wir
-- bewusst eine NEUE Tabelle `assets_neu` an und benennen sie nach
-- erfolgreicher Daten-Migration um. Bis dahin ko-existieren beide.
--
-- Strategie: NEUE Tabelle heisst hier `assets_neu`, alte bleibt bis
-- Drop-Migration `assets`. Die Daten-Migration legt Eintraege in
-- `assets_neu` an, am Ende der Drop-Migration wird `assets` gedroppt
-- und `assets_neu` zu `assets` umbenannt.

CREATE TABLE IF NOT EXISTS assets_neu (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beleg_position_id           UUID NOT NULL REFERENCES beleg_positionen(id) ON DELETE CASCADE,
  bezeichnung                 TEXT NOT NULL,
  art                         TEXT NOT NULL DEFAULT 'sonstiges'
                                CHECK (art IN ('kamera','zubehoer','buero','werkzeug','sonstiges')),
  anschaffungsdatum           DATE NOT NULL,
  anschaffungskosten_netto    DECIMAL(12,2) NOT NULL,
  afa_methode                 TEXT NOT NULL CHECK (afa_methode IN ('linear','sofort_gwg','keine')),
  nutzungsdauer_monate        INT,
  aktueller_buchwert          DECIMAL(12,2) NOT NULL,
  restwert                    DECIMAL(12,2) NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL DEFAULT 'aktiv'
                                CHECK (status IN ('aktiv','verkauft','ausgemustert','verloren')),
  notizen                     TEXT,
  is_test                     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_neu_beleg_position ON assets_neu(beleg_position_id);
CREATE INDEX IF NOT EXISTS idx_assets_neu_status         ON assets_neu(status);
CREATE INDEX IF NOT EXISTS idx_assets_neu_methode        ON assets_neu(afa_methode);
CREATE INDEX IF NOT EXISTS idx_assets_neu_is_test        ON assets_neu(is_test) WHERE is_test = TRUE;

DROP TRIGGER IF EXISTS trg_assets_neu_updated_at ON assets_neu;
CREATE TRIGGER trg_assets_neu_updated_at
  BEFORE UPDATE ON assets_neu
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE assets_neu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assets_neu service role" ON assets_neu;
CREATE POLICY "assets_neu service role" ON assets_neu
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 6. ALTER beleg_positionen → folgekosten_asset_id FK auf assets_neu
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'beleg_positionen_folgekosten_asset_id_fkey'
      AND conrelid = 'beleg_positionen'::regclass
  ) THEN
    ALTER TABLE beleg_positionen
      ADD CONSTRAINT beleg_positionen_folgekosten_asset_id_fkey
      FOREIGN KEY (folgekosten_asset_id) REFERENCES assets_neu(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────
-- 7. inventar_units (alles physische in einer Tabelle)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventar_units (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bezeichnung                 TEXT NOT NULL,
  typ                         TEXT NOT NULL
                                CHECK (typ IN ('kamera','zubehoer','verbrauch')),
  tracking_mode               TEXT NOT NULL
                                CHECK (tracking_mode IN ('individual','bulk')),
  produkt_id                  UUID REFERENCES produkte(id) ON DELETE SET NULL,
  seriennummer                TEXT,
  inventar_code               TEXT UNIQUE,
  bestand                     INT,
  kaufpreis_netto             DECIMAL(10,2),
  kaufdatum                   DATE,
  wiederbeschaffungswert      DECIMAL(10,2),
  wbw_manuell_gesetzt         BOOLEAN NOT NULL DEFAULT FALSE,
  status                      TEXT NOT NULL DEFAULT 'verfuegbar'
                                CHECK (status IN ('verfuegbar','vermietet','wartung','defekt','ausgemustert')),
  qr_code_url                 TEXT,
  beleg_status                TEXT NOT NULL DEFAULT 'verknuepft'
                                CHECK (beleg_status IN ('verknuepft','beleg_fehlt')),
  notizen                     TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventar_units_tracking_check CHECK (
    (tracking_mode = 'individual' AND bestand IS NULL) OR
    (tracking_mode = 'bulk' AND bestand IS NOT NULL AND bestand >= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_inventar_units_typ          ON inventar_units(typ);
CREATE INDEX IF NOT EXISTS idx_inventar_units_status       ON inventar_units(status);
CREATE INDEX IF NOT EXISTS idx_inventar_units_beleg_status ON inventar_units(beleg_status);
CREATE INDEX IF NOT EXISTS idx_inventar_units_produkt      ON inventar_units(produkt_id);

DROP TRIGGER IF EXISTS trg_inventar_units_updated_at ON inventar_units;
CREATE TRIGGER trg_inventar_units_updated_at
  BEFORE UPDATE ON inventar_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE inventar_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventar_units service role" ON inventar_units;
CREATE POLICY "inventar_units service role" ON inventar_units
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 8. inventar_verknuepfung (Bruecke Beleg ↔ Inventar)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventar_verknuepfung (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beleg_position_id   UUID NOT NULL REFERENCES beleg_positionen(id) ON DELETE CASCADE,
  inventar_unit_id    UUID NOT NULL REFERENCES inventar_units(id) ON DELETE CASCADE,
  stueck_anteil       INT NOT NULL DEFAULT 1 CHECK (stueck_anteil > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventar_verknuepfung_unique UNIQUE (beleg_position_id, inventar_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_verkn_position ON inventar_verknuepfung(beleg_position_id);
CREATE INDEX IF NOT EXISTS idx_inv_verkn_unit     ON inventar_verknuepfung(inventar_unit_id);

ALTER TABLE inventar_verknuepfung ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventar_verknuepfung service role" ON inventar_verknuepfung;
CREATE POLICY "inventar_verknuepfung service role" ON inventar_verknuepfung
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 9. afa_buchungen
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afa_buchungen (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            UUID NOT NULL REFERENCES assets_neu(id) ON DELETE CASCADE,
  buchungsdatum       DATE NOT NULL,
  afa_betrag          DECIMAL(10,2) NOT NULL,
  buchwert_nach       DECIMAL(12,2) NOT NULL,
  typ                 TEXT NOT NULL DEFAULT 'monatlich'
                        CHECK (typ IN ('monatlich','jaehrlich','sonderafa','sofort')),
  notizen             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_afa_buchungen_asset
  ON afa_buchungen(asset_id);
CREATE INDEX IF NOT EXISTS idx_afa_buchungen_datum
  ON afa_buchungen(buchungsdatum DESC);

ALTER TABLE afa_buchungen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "afa_buchungen service role" ON afa_buchungen;
CREATE POLICY "afa_buchungen service role" ON afa_buchungen
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 10. beleg_anhaenge
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beleg_anhaenge (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beleg_id      UUID NOT NULL REFERENCES belege(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  dateiname     TEXT NOT NULL,
  typ           TEXT NOT NULL DEFAULT 'rechnung'
                  CHECK (typ IN ('rechnung','quittung','lieferschein','sonstiges')),
  size_bytes    BIGINT,
  mime_type     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beleg_anhaenge_beleg ON beleg_anhaenge(beleg_id);

ALTER TABLE beleg_anhaenge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "beleg_anhaenge service role" ON beleg_anhaenge;
CREATE POLICY "beleg_anhaenge service role" ON beleg_anhaenge
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 11. migration_audit
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migration_audit (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alte_tabelle        TEXT NOT NULL,
  alte_id             TEXT NOT NULL,
  neue_tabelle        TEXT NOT NULL,
  neue_id             UUID NOT NULL,
  migration_datum     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notizen             TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_alt ON migration_audit(alte_tabelle, alte_id);
CREATE INDEX IF NOT EXISTS idx_audit_neu ON migration_audit(neue_tabelle, neue_id);

ALTER TABLE migration_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "migration_audit service role" ON migration_audit;
CREATE POLICY "migration_audit service role" ON migration_audit
  FOR ALL USING (true) WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────
-- 12. beleg_nummer_counter + naechste_beleg_nummer()
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beleg_nummer_counter (
  jahr            INT PRIMARY KEY,
  letzte_nummer   INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE beleg_nummer_counter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "beleg_nummer_counter service role" ON beleg_nummer_counter;
CREATE POLICY "beleg_nummer_counter service role" ON beleg_nummer_counter
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION naechste_beleg_nummer(p_jahr INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_neue_nummer INT;
BEGIN
  INSERT INTO beleg_nummer_counter (jahr, letzte_nummer)
  VALUES (p_jahr, 1)
  ON CONFLICT (jahr) DO UPDATE
    SET letzte_nummer = beleg_nummer_counter.letzte_nummer + 1,
        updated_at = NOW()
  RETURNING letzte_nummer INTO v_neue_nummer;

  RETURN 'EK-' || p_jahr || '-' || LPAD(v_neue_nummer::TEXT, 6, '0');
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Fertig. Naechster Schritt: Daten-Migration via
--   npx tsx scripts/migrate-buchhaltung.ts --dry-run
--   npx tsx scripts/migrate-buchhaltung.ts --confirm
-- ════════════════════════════════════════════════════════════════════

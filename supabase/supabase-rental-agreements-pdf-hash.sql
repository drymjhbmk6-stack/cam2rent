-- ════════════════════════════════════════════════════════════════════════
-- Integritäts-Hash der gespeicherten Vertrags-PDF-Datei
-- ════════════════════════════════════════════════════════════════════════
--
-- Mietvertrag § 22 Abs. 2 (der gespeicherte Vertragstext wird ausgeliefert) +
-- Beweiswert der Signatur (PDF-Struktur Punkt 10): beim Ausliefern muss sich
-- belegen lassen, dass die gelieferte Datei byte-identisch mit dem bei
-- Vertragsschluss gespeicherten Original ist.
--
-- `contract_hash` (bereits vorhanden) bindet den logischen Vertragstext +
-- Signaturdaten. `pdf_sha256` bindet zusätzlich die konkreten DATEI-Bytes des
-- gespeicherten PDFs → Manipulation/Beschädigung im Storage wird erkennbar.
--
-- Idempotent + additiv. Bestandsverträge ohne Hash (NULL) werden beim
-- Ausliefern ohne Byte-Verifikation bedient (kein Vergleichswert vorhanden).

ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS pdf_sha256 TEXT;

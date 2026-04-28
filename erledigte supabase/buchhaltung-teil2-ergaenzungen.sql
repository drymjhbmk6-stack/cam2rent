-- ============================================================================
-- cam2rent Buchhaltung Teil 2 — Ergänzungs-Migration
-- Erstellt: 2026-04-15
--
-- Fehlende Spalten aus Teil 1 + Erweiterungen für Mahnwesen + Stripe-Fees
-- ============================================================================

-- ─── 1. invoices: Fehlende Spalten für Zahlungsverfolgung ──────────────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'open'
    CHECK (payment_status IN ('open', 'paid', 'overdue', 'cancelled', 'partial'));

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_notes TEXT;

-- due_date und payment_method existieren bereits aus Teil 1,
-- hier nur zur Sicherheit:
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Index für Zahlungsstatus
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);


-- ─── 2. expenses: Source-Tracking für Stripe-Gebühren ──────────────────────

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source_type TEXT;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Unique-Index: Pro Quelle nur ein Expense (Idempotenz für Stripe-Fees)
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_source
  ON expenses(source_type, source_id) WHERE source_type IS NOT NULL;


-- ─── 3. dunning_notices: Ergänzungen für Text + Frist ──────────────────────

ALTER TABLE dunning_notices
  ADD COLUMN IF NOT EXISTS custom_text TEXT;

ALTER TABLE dunning_notices
  ADD COLUMN IF NOT EXISTS new_due_date DATE;


-- ─── 4. Mahn-Text-Defaults in admin_settings ──────────────────────────────

INSERT INTO admin_settings (key, value)
VALUES
  ('accounting_dunning_text_1', 'Hallo {kunde},

wir möchten dich freundlich daran erinnern, dass die Rechnung {rechnungsnr} über {betrag} seit {faellig_seit_tagen} Tagen fällig ist.

Bitte überweise den Betrag bis zum {neue_frist} auf unser Konto.

Falls du die Zahlung bereits getätigt hast, betrachte diese Erinnerung bitte als gegenstandslos.

Viele Grüße,
cam2rent'),
  ('accounting_dunning_text_2', 'Hallo {kunde},

trotz unserer Zahlungserinnerung konnten wir leider keinen Zahlungseingang für die Rechnung {rechnungsnr} über {betrag} feststellen.

Wir bitten dich, den offenen Betrag zuzüglich einer Mahngebühr von {mahngebuehr} bis zum {neue_frist} zu begleichen.

Sollte die Zahlung bereits unterwegs sein, danken wir dir und bitten um kurze Rückmeldung.

Viele Grüße,
cam2rent'),
  ('accounting_dunning_text_3', 'Hallo {kunde},

wir müssen dich leider ein letztes Mal auf die ausstehende Zahlung der Rechnung {rechnungsnr} hinweisen. Der offene Betrag von {betrag} zuzüglich {mahngebuehr} Mahngebühr ist seit {faellig_seit_tagen} Tagen überfällig.

Wir bitten dich dringend, die Zahlung bis zum {neue_frist} vorzunehmen. Andernfalls sehen wir uns gezwungen, weitere Schritte einzuleiten.

Viele Grüße,
cam2rent')
ON CONFLICT (key) DO NOTHING;


-- ─── 5. DATEV Ausgaben-Konten Defaults ─────────────────────────────────────

INSERT INTO admin_settings (key, value)
VALUES
  ('datev_expense_accounts', '{
    "stripe_fees": "4970",
    "shipping": "4910",
    "software": "4940",
    "hardware": "0480",
    "marketing": "4980",
    "office": "4930",
    "travel": "4670",
    "insurance": "4360",
    "legal": "4950",
    "other": "4900"
  }')
ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- FERTIG — Bitte in Supabase SQL Editor ausführen
-- ============================================================================

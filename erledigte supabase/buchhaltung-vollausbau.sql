-- ============================================================================
-- cam2rent Buchhaltung Vollausbau — Migration
-- Erstellt: 2026-04-15
--
-- Neue Tabellen: credit_notes, dunning_notices, stripe_transactions,
--                expenses, export_log, accounting_audit_log
-- ALTER: invoices (tax_mode, tax_rate, due_date, status, payment_method)
-- ============================================================================

-- ─── 1. invoices erweitern ──────────────────────────────────────────────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_mode TEXT NOT NULL DEFAULT 'kleinunternehmer'
    CHECK (tax_mode IN ('kleinunternehmer', 'regelbesteuerung'));

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'paid'
    CHECK (status IN ('paid', 'open', 'overdue', 'cancelled', 'partially_paid'));

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index für Status-Filterung
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);


-- ─── 2. credit_notes (Gutschriften) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_note_number TEXT UNIQUE NOT NULL,
  invoice_id UUID REFERENCES invoices(id) NOT NULL,
  booking_id TEXT NOT NULL,

  -- Beträge
  net_amount DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  gross_amount DECIMAL(10,2) NOT NULL,

  -- Steuer zum Erstellungszeitpunkt
  tax_mode TEXT NOT NULL DEFAULT 'kleinunternehmer'
    CHECK (tax_mode IN ('kleinunternehmer', 'regelbesteuerung')),
  tax_rate DECIMAL(5,2) DEFAULT 0,

  -- Grund
  reason TEXT NOT NULL,
  reason_category TEXT CHECK (reason_category IN (
    'cancellation', 'complaint', 'goodwill', 'correction', 'other'
  )),

  -- Workflow-Status
  status TEXT DEFAULT 'pending_review' CHECK (status IN (
    'pending_review', 'approved', 'sent', 'rejected'
  )),

  -- PDF
  pdf_url TEXT,

  -- Stripe-Refund
  stripe_refund_id TEXT,
  refund_status TEXT DEFAULT 'not_applicable' CHECK (refund_status IN (
    'pending', 'succeeded', 'failed', 'not_applicable'
  )),

  -- Metadaten
  notes TEXT,
  created_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_booking ON credit_notes(booking_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_created ON credit_notes(created_at);


-- ─── 3. dunning_notices (Mahnwesen) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dunning_notices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id) NOT NULL,

  -- Mahnstufe 1-3
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),

  -- Mahngebühr
  fee_amount DECIMAL(10,2) DEFAULT 0,

  -- PDF
  pdf_url TEXT,

  -- Versand
  sent_at TIMESTAMPTZ,
  sent_to_email TEXT,

  -- Workflow
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'paid', 'escalated'
  )),

  -- Metadaten
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dunning_invoice ON dunning_notices(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dunning_status ON dunning_notices(status);
CREATE INDEX IF NOT EXISTS idx_dunning_level ON dunning_notices(level);


-- ─── 4. stripe_transactions (Stripe-Abgleich Cache) ────────────────────────

CREATE TABLE IF NOT EXISTS stripe_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  stripe_charge_id TEXT,

  -- Beträge (in EUR, Cent → Euro konvertiert)
  amount DECIMAL(10,2) NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  net DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',

  -- Stripe-Status
  status TEXT NOT NULL,
  payment_method TEXT,

  -- Verknüpfung
  booking_id TEXT,
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN (
    'matched', 'unmatched', 'manual', 'refunded'
  )),

  -- Zeitstempel
  stripe_created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_tx_booking ON stripe_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_stripe_tx_match ON stripe_transactions(match_status);
CREATE INDEX IF NOT EXISTS idx_stripe_tx_created ON stripe_transactions(stripe_created_at);


-- ─── 5. expenses (Ausgaben für EÜR) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL,

  category TEXT NOT NULL CHECK (category IN (
    'stripe_fees', 'shipping', 'software', 'hardware', 'marketing',
    'office', 'travel', 'insurance', 'legal', 'other'
  )),

  description TEXT NOT NULL,
  vendor TEXT,

  -- Beträge
  net_amount DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  gross_amount DECIMAL(10,2) NOT NULL,

  -- Beleg
  receipt_url TEXT,

  -- Zahlung
  payment_method TEXT,

  -- Metadaten
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);


-- ─── 6. export_log (Export-Historie) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS export_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  export_type TEXT NOT NULL CHECK (export_type IN (
    'datev', 'euer', 'umsatzliste', 'rechnungen_zip', 'ustva'
  )),
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2),
  exported_by TEXT NOT NULL,
  exported_at TIMESTAMPTZ DEFAULT NOW(),
  file_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_export_log_type ON export_log(export_type);
CREATE INDEX IF NOT EXISTS idx_export_log_date ON export_log(exported_at);


-- ─── 7. Buchhaltungs-Einstellungen Defaults ────────────────────────────────
-- (werden über admin_settings gespeichert, hier nur Defaults einfügen
--  falls noch nicht vorhanden)

INSERT INTO admin_settings (key, value)
VALUES
  ('accounting_dunning_days_1', '14'),
  ('accounting_dunning_days_2', '28'),
  ('accounting_dunning_days_3', '42'),
  ('accounting_dunning_fee_1', '0'),
  ('accounting_dunning_fee_2', '5'),
  ('accounting_dunning_fee_3', '10'),
  ('accounting_payment_terms_days', '14'),
  ('accounting_invoice_footer', 'Vielen Dank für deine Buchung bei cam2rent!')
ON CONFLICT (key) DO NOTHING;


-- ─── 8. Rechnungsnummern-Sequenz (lückenlos) ───────────────────────────────

-- Gutschrift-Nummern-Sequenz pro Jahr
CREATE SEQUENCE IF NOT EXISTS credit_note_seq_2026 START 1;

-- Funktion: Nächste Gutschriftnummer generieren
CREATE OR REPLACE FUNCTION next_credit_note_number(p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER)
RETURNS TEXT AS $$
DECLARE
  seq_name TEXT;
  next_val BIGINT;
BEGIN
  seq_name := 'credit_note_seq_' || p_year;

  -- Sequenz erstellen falls noch nicht vorhanden
  BEGIN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXCEPTION WHEN duplicate_table THEN
    -- Sequenz existiert bereits
    NULL;
  END;

  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;
  RETURN 'GS-' || p_year || '-' || LPAD(next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;


-- ─── 9. RLS Policies ───────────────────────────────────────────────────────
-- (Service-Role-basiert wie restliche Admin-Tabellen)

ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;

-- Service Role hat vollen Zugriff (wie bei anderen Admin-Tabellen)
CREATE POLICY "Service role full access" ON credit_notes
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON dunning_notices
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON stripe_transactions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON expenses
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON export_log
  FOR ALL USING (auth.role() = 'service_role');


-- ============================================================================
-- FERTIG — Bitte in Supabase SQL Editor ausführen
-- ============================================================================

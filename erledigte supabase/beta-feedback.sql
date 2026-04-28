-- Beta-Feedback Tabelle
CREATE TABLE IF NOT EXISTS beta_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tester_name TEXT,
  tester_email TEXT,
  wants_gutschein BOOLEAN DEFAULT false,
  answers JSONB DEFAULT '{}',
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

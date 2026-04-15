import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { calculateTax, type TaxMode } from '@/lib/accounting/tax';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  // Nur pending_review darf bearbeitet werden
  const { data: existing } = await supabase
    .from('credit_notes')
    .select('status, tax_mode, tax_rate')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Gutschrift nicht gefunden.' }, { status: 404 });
  }

  if (existing.status !== 'pending_review') {
    return NextResponse.json({ error: 'Nur Entwürfe können bearbeitet werden.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.reason !== undefined) updates.reason = body.reason;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.reason_category !== undefined) updates.reason_category = body.reason_category;

  if (body.gross_amount !== undefined) {
    const taxCalc = calculateTax(
      body.gross_amount,
      existing.tax_mode as TaxMode,
      existing.tax_rate || 19,
      'gross'
    );
    updates.net_amount = taxCalc.net;
    updates.tax_amount = taxCalc.tax;
    updates.gross_amount = taxCalc.gross;
  }

  const { error } = await supabase
    .from('credit_notes')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

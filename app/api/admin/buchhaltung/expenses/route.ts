import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('is_test', false)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ expenses: data || [] });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const body = await req.json();
  const { expense_date, category, description, vendor, net_amount, tax_amount, gross_amount, notes, source_type, source_id, asset_id, purchase_id } = body;

  if (!expense_date || !category || !description || !gross_amount) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen.' }, { status: 400 });
  }

  // Optionale Verknuepfung: source_type whitelist (Schutz gegen freie Eingabe)
  const allowedSourceTypes = ['manual', 'purchase_item', 'product_unit_expense', 'accessory_unit_expense', 'stripe_fee'];
  const cleanSourceType = typeof source_type === 'string' && allowedSourceTypes.includes(source_type) ? source_type : null;
  const cleanSourceId = cleanSourceType && typeof source_id === 'string' && source_id.trim() ? source_id.trim() : null;
  const cleanPurchaseId = typeof purchase_id === 'string' && purchase_id.trim() ? purchase_id.trim() : null;

  const supabase = createServiceClient();

  const testMode = await isTestMode();
  const baseInsert = {
    expense_date,
    category,
    description,
    vendor: vendor || null,
    net_amount: net_amount || gross_amount,
    tax_amount: tax_amount || 0,
    gross_amount,
    notes: notes || null,
    source_type: cleanSourceType,
    source_id: cleanSourceId,
    asset_id: typeof asset_id === 'string' && asset_id.trim() ? asset_id.trim() : null,
    is_test: testMode,
  };

  // Defensiver Insert: Wenn Migration `expenses.purchase_id` noch nicht durch
  // ist, retry ohne die Spalte — Beleg-Verknuepfung geht dann verloren, der
  // Rest funktioniert.
  let { data, error } = await supabase
    .from('expenses')
    .insert({ ...baseInsert, purchase_id: cleanPurchaseId })
    .select()
    .single();

  if (error && /purchase_id/i.test(error.message)) {
    ({ data, error } = await supabase
      .from('expenses')
      .insert(baseInsert)
      .select()
      .single());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'expense.create',
    entityType: 'expense',
    entityId: data.id,
    entityLabel: description,
    changes: { category, gross_amount },
    request: req,
  });

  return NextResponse.json({ expense: data });
}

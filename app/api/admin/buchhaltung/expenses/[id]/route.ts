import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkAdminAuth } from '@/lib/admin-auth';
import { logAudit } from '@/lib/audit';
import { requireDeleteReason } from '@/lib/delete-reason';

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

  const updates: Record<string, unknown> = {};
  if (body.expense_date !== undefined) updates.expense_date = body.expense_date;
  if (body.category !== undefined) updates.category = body.category;
  if (body.description !== undefined) updates.description = body.description;
  if (body.vendor !== undefined) updates.vendor = body.vendor || null;
  if (body.gross_amount !== undefined) updates.gross_amount = body.gross_amount;
  if (body.net_amount !== undefined) updates.net_amount = body.net_amount;
  if (body.tax_amount !== undefined) updates.tax_amount = body.tax_amount;

  const { error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'expense.update',
    entityType: 'expense',
    entityId: id,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const reasonCheck = await requireDeleteReason(req);
  if (!reasonCheck.ok) {
    return NextResponse.json({ error: reasonCheck.error }, { status: 400 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  // Soft-Delete
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: 'expense.delete',
    entityType: 'expense',
    entityId: id,
    changes: { reason: reasonCheck.reason },
    request: req,
  });

  return NextResponse.json({ ok: true });
}

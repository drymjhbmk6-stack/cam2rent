import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * PUT    /api/admin/coupons/[id]  → Gutschein aktualisieren
 * DELETE /api/admin/coupons/[id]  → Gutschein löschen
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  const updateData: Record<string, unknown> = {};

  if (body.code !== undefined) updateData.code = body.code.trim().toUpperCase();
  if (body.type !== undefined) updateData.type = body.type;
  if (body.value !== undefined) updateData.value = parseFloat(body.value) || 0;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.target_type !== undefined) updateData.target_type = body.target_type;
  if (body.target_id !== undefined) updateData.target_id = body.target_id || null;
  if (body.target_group_id !== undefined) updateData.target_group_id = body.target_group_id || null;
  if (body.target_name !== undefined) updateData.target_name = body.target_name || null;
  if (body.target_user_email !== undefined) updateData.target_user_email = body.target_user_email || null;
  if (body.once_per_customer !== undefined) updateData.once_per_customer = body.once_per_customer;
  if (body.not_combinable !== undefined) updateData.not_combinable = body.not_combinable;
  if (body.valid_from !== undefined) updateData.valid_from = body.valid_from || null;
  if (body.valid_until !== undefined) updateData.valid_until = body.valid_until || null;
  if (body.max_uses !== undefined) updateData.max_uses = body.max_uses ? parseInt(body.max_uses) : null;
  if (body.min_order_value !== undefined) updateData.min_order_value = body.min_order_value ? parseFloat(body.min_order_value) : null;
  if (body.active !== undefined) updateData.active = body.active;

  const { error } = await supabase
    .from('coupons')
    .update(updateData)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

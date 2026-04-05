import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH  /api/admin/purchases/:id  → Einkauf aktualisieren
 * DELETE /api/admin/purchases/:id  → Einkauf löschen
 */

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  const allowed = ['supplier_id', 'order_date', 'status', 'invoice_number', 'invoice_url', 'total_amount', 'notes'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      updates[key] = typeof body[key] === 'string' ? body[key].trim() || null : body[key];
    }
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('purchases')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchase: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();

  // purchase_items are deleted via ON DELETE CASCADE
  const { error } = await supabase.from('purchases').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

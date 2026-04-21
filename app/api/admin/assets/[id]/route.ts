import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { computeCurrentValue } from '@/lib/depreciation';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/assets/:id  — Detail inkl. AfA-Historie
 * PATCH /api/admin/assets/:id — Update (Name, Nutzungsdauer, Status, Verknuepfungen)
 * DELETE /api/admin/assets/:id — nur wenn keine AfA-Buchungen vorhanden
 */

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();

  const { data: asset, error } = await supabase
    .from('assets')
    .select('*, supplier:suppliers(id, name), purchase:purchases(id, invoice_number, invoice_storage_path, order_date), unit:unit_id(id, serial_number, label, status)')
    .eq('id', id)
    .single();

  if (error || !asset) {
    return NextResponse.json({ error: 'Asset nicht gefunden' }, { status: 404 });
  }

  // AfA-Historie aus expenses
  const { data: depreciationHistory } = await supabase
    .from('expenses')
    .select('id, expense_date, gross_amount, notes, source_id')
    .eq('asset_id', id)
    .eq('category', 'depreciation')
    .order('expense_date', { ascending: false });

  const computed = computeCurrentValue({
    purchase_price: Number(asset.purchase_price),
    purchase_date: asset.purchase_date,
    useful_life_months: Number(asset.useful_life_months),
    depreciation_method: asset.depreciation_method,
    residual_value: Number(asset.residual_value ?? 0),
    current_value: Number(asset.current_value),
    last_depreciation_at: asset.last_depreciation_at,
  });

  return NextResponse.json({
    asset,
    depreciation_history: depreciationHistory ?? [],
    computed_current_value: computed,
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const allowed = [
    'name', 'description', 'serial_number', 'manufacturer', 'model',
    'useful_life_months', 'depreciation_method', 'residual_value',
    'current_value', 'status', 'disposed_at', 'disposal_proceeds',
    'product_id', 'unit_id', 'notes',
  ];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('assets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();

  // Pruefen ob AfA-Buchungen existieren
  const { count: depCount } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('asset_id', id)
    .eq('category', 'depreciation');

  if ((depCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Asset kann nicht geloescht werden, es existieren AfA-Buchungen. Bitte stattdessen "Veraeussern" nutzen.' },
      { status: 409 },
    );
  }

  const { error } = await supabase.from('assets').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * PUT    /api/admin/accessories/[id]  → Zubehörteil aktualisieren
 * DELETE /api/admin/accessories/[id]  → Zubehörteil löschen
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createServiceClient();

  const maxQty = typeof body.max_qty_per_booking === 'number' && body.max_qty_per_booking > 0
    ? Math.floor(body.max_qty_per_booking) : null;
  const replacementValue = (() => {
    const n = parseFloat(String(body.replacement_value ?? ''));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  const { error } = await supabase
    .from('accessories')
    .update({
      name: body.name,
      category: body.category,
      description: body.description ?? null,
      pricing_mode: body.pricing_mode,
      price: parseFloat(body.price) || 0,
      available_qty: parseInt(body.available_qty) || 1,
      available: body.available,
      image_url: body.image_url ?? null,
      compatible_product_ids: body.compatible_product_ids ?? [],
      internal: body.internal ?? false,
      upgrade_group: body.upgrade_group || null,
      is_upgrade_base: body.is_upgrade_base ?? false,
      allow_multi_qty: body.allow_multi_qty ?? false,
      max_qty_per_booking: maxQty,
      replacement_value: replacementValue,
    })
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
  const { error } = await supabase.from('accessories').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET  /api/admin/accessories     → alle Zubehörteile
 * POST /api/admin/accessories     → neues Zubehörteil anlegen
 */

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('accessories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accessories: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, category, description, pricing_mode, price, available_qty, available, image_url, compatible_product_ids, internal, upgrade_group, is_upgrade_base, allow_multi_qty, max_qty_per_booking, replacement_value } = body;

  if (!name || !category) {
    return NextResponse.json({ error: 'name und category erforderlich.' }, { status: 400 });
  }

  // ID aus Name generieren (slug-artig)
  const id = name.toLowerCase()
    .replace(/[äöüß]/g, (c: string) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] ?? c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    + '-' + Date.now().toString(36);

  const supabase = createServiceClient();

  // Höchste sort_order ermitteln
  const { data: last } = await supabase
    .from('accessories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (last?.sort_order ?? 0) + 1;

  const maxQty = typeof max_qty_per_booking === 'number' && max_qty_per_booking > 0
    ? Math.floor(max_qty_per_booking) : null;
  const replacementValue = (() => {
    const n = parseFloat(String(replacement_value ?? ''));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  const { data, error } = await supabase
    .from('accessories')
    .insert({ id, name, category, description: description ?? null, pricing_mode: pricing_mode ?? 'perDay', price: parseFloat(price) || 0, available_qty: parseInt(available_qty) || 1, available: available ?? true, image_url: image_url ?? null, sort_order, compatible_product_ids: compatible_product_ids ?? [], internal: internal ?? false, upgrade_group: upgrade_group || null, is_upgrade_base: is_upgrade_base ?? false, allow_multi_qty: allow_multi_qty ?? false, max_qty_per_booking: maxQty, replacement_value: replacementValue })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accessory: data });
}

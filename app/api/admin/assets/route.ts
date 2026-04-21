import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { isTestMode } from '@/lib/env-mode';

/**
 * GET /api/admin/assets
 *   ?kind=rental_camera&status=active&purchase_id=<uuid>
 *
 * POST /api/admin/assets
 *   Legt manuell ein Asset an (fuer Nachtrag von Bestand).
 */

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const kind = searchParams.get('kind');
  const status = searchParams.get('status');
  const purchaseId = searchParams.get('purchase_id');
  const unitId = searchParams.get('unit_id');
  const includeTest = searchParams.get('include_test') === '1';

  const supabase = createServiceClient();
  let q = supabase
    .from('assets')
    .select('*, supplier:suppliers(id, name), purchase:purchases(id, invoice_number, invoice_storage_path, order_date)')
    .order('purchase_date', { ascending: false });

  if (kind) q = q.eq('kind', kind);
  if (status) q = q.eq('status', status);
  if (purchaseId) q = q.eq('purchase_id', purchaseId);
  if (unitId) q = q.eq('unit_id', unitId);
  if (!includeTest) q = q.eq('is_test', false);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assets: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();
  const testMode = await isTestMode();

  const required = ['kind', 'name', 'purchase_price', 'purchase_date'];
  for (const k of required) {
    if (!body[k] && body[k] !== 0) return NextResponse.json({ error: `${k} ist Pflicht` }, { status: 400 });
  }

  const purchasePrice = Number(body.purchase_price);
  // Restwert: default 30 % vom Kaufpreis (realistischer Gebrauchtwert fuer
  // Vermietgeraete, stellt sicher dass der Zeitwert im Vertrag nie auf 0 faellt).
  const residualValue = body.residual_value != null && Number(body.residual_value) >= 0
    ? Number(body.residual_value)
    : Math.round(purchasePrice * 0.3 * 100) / 100;

  const { data, error } = await supabase
    .from('assets')
    .insert({
      kind: body.kind,
      name: String(body.name).trim(),
      description: body.description ?? null,
      serial_number: body.serial_number ?? null,
      manufacturer: body.manufacturer ?? null,
      model: body.model ?? null,
      purchase_price: purchasePrice,
      purchase_date: body.purchase_date,
      supplier_id: body.supplier_id ?? null,
      purchase_id: body.purchase_id ?? null,
      useful_life_months: Number(body.useful_life_months) > 0 ? Number(body.useful_life_months) : 36,
      depreciation_method: body.depreciation_method ?? 'linear',
      residual_value: residualValue,
      current_value: Number(body.current_value) > 0 ? Number(body.current_value) : purchasePrice,
      product_id: body.product_id ?? null,
      unit_id: body.unit_id ?? null,
      status: body.status ?? 'active',
      notes: body.notes ?? null,
      is_test: testMode,
    })
    .select()
    .single();

  if (error) {
    console.error('[assets POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ asset: data }, { status: 201 });
}

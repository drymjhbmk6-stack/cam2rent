import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET  /api/admin/purchases         → alle Einkäufe (optional ?supplierId=)
 * POST /api/admin/purchases         → neuen Einkauf anlegen
 */

export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get('supplierId');
  const supabase = createServiceClient();

  let query = supabase
    .from('purchases')
    .select('*, supplier:suppliers(id, name), purchase_items(*)')
    .order('order_date', { ascending: false });

  if (supplierId) {
    query = query.eq('supplier_id', supplierId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchases: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { supplier_id, order_date, status, invoice_number, total_amount, notes, items } = body;

  if (!supplier_id || !order_date) {
    return NextResponse.json({ error: 'Lieferant und Datum sind erforderlich.' }, { status: 400 });
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Mindestens eine Position ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Insert purchase
  const { data: purchase, error: pErr } = await supabase
    .from('purchases')
    .insert({
      supplier_id,
      order_date,
      status: status || 'ordered',
      invoice_number: invoice_number?.trim() || null,
      invoice_url: null,
      total_amount: total_amount ?? null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // Insert items
  const rows = items.map((it: { product_name: string; quantity?: number; unit_price: number }) => ({
    purchase_id: purchase.id,
    product_name: it.product_name.trim(),
    quantity: it.quantity ?? 1,
    unit_price: it.unit_price,
  }));

  const { error: iErr } = await supabase.from('purchase_items').insert(rows);
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  return NextResponse.json({ purchase }, { status: 201 });
}

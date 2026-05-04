import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

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

  // Anhaenge in einem Bulk-Query laden und per Map auf Purchases mappen.
  // Defensiv: Wenn Migration noch nicht durch ist, einfach leere Anhaenge.
  const purchases = data ?? [];
  const ids = purchases.map((p) => p.id);
  const attachmentsByPurchase: Record<string, unknown[]> = {};
  if (ids.length > 0) {
    const { data: attachments, error: aErr } = await supabase
      .from('purchase_attachments')
      .select('id, purchase_id, storage_path, filename, mime_type, size_bytes, kind, created_at')
      .in('purchase_id', ids)
      .order('created_at', { ascending: true });
    if (!aErr && attachments) {
      for (const a of attachments) {
        const key = a.purchase_id as string;
        if (!attachmentsByPurchase[key]) attachmentsByPurchase[key] = [];
        attachmentsByPurchase[key].push(a);
      }
    }
  }

  const enriched = purchases.map((p) => ({
    ...p,
    attachments: attachmentsByPurchase[p.id] ?? [],
  }));

  return NextResponse.json({ purchases: enriched });
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

  await logAudit({
    action: 'purchase.create',
    entityType: 'purchase',
    entityId: purchase?.id,
    entityLabel: invoice_number || undefined,
    changes: { supplier_id, order_date, item_count: rows.length },
    request: req,
  });

  return NextResponse.json({ purchase }, { status: 201 });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET    /api/admin/waitlist             → alle Warteliste-Einträge
 * DELETE /api/admin/waitlist?id=...      → einzelnen Eintrag löschen
 *
 * Die Route ist durch die Admin-Middleware geschützt (admin_token Cookie).
 */

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('waitlist_subscriptions')
    .select('id, product_id, email, source, use_case, created_at, notified_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin/waitlist] GET failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Produktnamen auflösen (aus admin_config.products) — einmaliger Lookup
  let productMap: Record<string, { name: string }> = {};
  try {
    const { data: cfg } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'products')
      .single();
    const products = (cfg?.value ?? {}) as Record<string, { id: string; name?: string }>;
    productMap = Object.fromEntries(
      Object.entries(products).map(([id, p]) => [id, { name: p.name ?? id }]),
    );
  } catch {
    // best-effort
  }

  const entries = (data ?? []).map((row) => ({
    ...row,
    product_name: productMap[row.product_id]?.name ?? row.product_id,
  }));

  return NextResponse.json({ entries });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('waitlist_subscriptions')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET    /api/admin/suppliers/:id  → Lieferant mit Einkäufen
 * PATCH  /api/admin/suppliers/:id  → Lieferant aktualisieren
 * DELETE /api/admin/suppliers/:id  → Lieferant löschen (nur ohne Einkäufe)
 */

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: 'Lieferant nicht gefunden.' }, { status: 404 });

  const { data: purchases } = await supabase
    .from('purchases')
    .select('*, purchase_items(*)')
    .eq('supplier_id', id)
    .order('order_date', { ascending: false });

  return NextResponse.json({ supplier, purchases: purchases ?? [] });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  const allowed = ['name', 'contact_person', 'email', 'phone', 'website', 'supplier_number', 'notes'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = typeof body[key] === 'string' ? body[key].trim() || null : body[key];
  }
  // name must not be empty
  if ('name' in updates && !updates.name) {
    return NextResponse.json({ error: 'Name darf nicht leer sein.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supplier: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = createServiceClient();

  // Check for linked purchases
  const { count } = await supabase
    .from('purchases')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Lieferant hat ${count} Einkäufe und kann nicht gelöscht werden.` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

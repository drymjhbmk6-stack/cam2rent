import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET  /api/admin/product-units?product_id=xxx  → Units für ein Produkt
 * GET  /api/admin/product-units                  → Alle Units
 * POST /api/admin/product-units                  → Neue Unit anlegen
 * PUT  /api/admin/product-units                  → Unit aktualisieren
 * DELETE /api/admin/product-units?id=xxx         → Unit löschen
 */

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('product_id');
  const supabase = createServiceClient();

  let query = supabase
    .from('product_units')
    .select('*')
    .order('created_at', { ascending: true });

  if (productId) {
    query = query.eq('product_id', productId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ units: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { product_id, serial_number, label, status, notes, purchased_at } = body;

  if (!product_id || !serial_number) {
    return NextResponse.json(
      { error: 'product_id und serial_number sind erforderlich.' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('product_units')
    .insert({
      product_id,
      serial_number: serial_number.trim(),
      label: label?.trim() || null,
      status: status || 'available',
      notes: notes?.trim() || null,
      purchased_at: purchased_at || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Seriennummer existiert bereits für dieses Produkt.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ unit: data }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, serial_number, label, status, notes, purchased_at } = body;

  if (!id) {
    return NextResponse.json({ error: 'id ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (serial_number !== undefined) updates.serial_number = serial_number.trim();
  if (label !== undefined) updates.label = label?.trim() || null;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes?.trim() || null;
  if (purchased_at !== undefined) updates.purchased_at = purchased_at || null;

  const { data, error } = await supabase
    .from('product_units')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Seriennummer existiert bereits für dieses Produkt.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ unit: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Prüfe ob Unit in aktiven Buchungen zugeordnet ist
  const { data: activeBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('unit_id', id)
    .in('status', ['confirmed', 'shipped', 'active'])
    .limit(1);

  if (activeBookings && activeBookings.length > 0) {
    return NextResponse.json(
      { error: 'Diese Kamera ist einer aktiven Buchung zugeordnet und kann nicht gelöscht werden.' },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from('product_units')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

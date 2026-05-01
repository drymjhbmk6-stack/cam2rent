import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';

/**
 * GET    /api/admin/product-units?product_id=xxx  → Units fuer ein Produkt
 * GET    /api/admin/product-units                  → Alle Units
 * POST   /api/admin/product-units                  → Neue Unit anlegen + automatisch Asset
 * PUT    /api/admin/product-units                  → Unit aktualisieren (NUR status + notes)
 * DELETE /api/admin/product-units?id=xxx           → Unit loeschen
 *
 * Beim Anlegen sind label, serial_number, purchased_at und purchase_price
 * Pflicht. label muss global UNIQUE sein (wird fuer QR-Code-URLs genutzt).
 * Nach Anlage sind label/serial_number/purchased_at/purchase_price unveraenderlich.
 * Nur status + notes sind nachtraeglich aenderbar (PUT).
 */

const DEFAULT_USEFUL_LIFE_MONTHS = 36;
const DEFAULT_RESIDUAL_PERCENT = 0.3;

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
  const {
    product_id,
    serial_number,
    label,
    status,
    notes,
    purchased_at,
    purchase_price,
  } = body as {
    product_id?: string;
    serial_number?: string;
    label?: string;
    status?: string;
    notes?: string;
    purchased_at?: string;
    purchase_price?: number | string;
  };

  // Pflichtfeld-Validierung
  if (!product_id) {
    return NextResponse.json({ error: 'product_id ist erforderlich.' }, { status: 400 });
  }
  if (!serial_number || !serial_number.trim()) {
    return NextResponse.json({ error: 'Seriennummer ist erforderlich.' }, { status: 400 });
  }
  if (!label || !label.trim()) {
    return NextResponse.json({ error: 'Bezeichnung ist erforderlich.' }, { status: 400 });
  }
  if (!purchased_at) {
    return NextResponse.json({ error: 'Kaufdatum ist erforderlich.' }, { status: 400 });
  }

  const purchasePriceNum = Number(purchase_price);
  if (!Number.isFinite(purchasePriceNum) || purchasePriceNum <= 0) {
    return NextResponse.json(
      { error: 'Kaufpreis muss eine positive Zahl sein.' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // 1. Unit anlegen
  const { data: unit, error: unitError } = await supabase
    .from('product_units')
    .insert({
      product_id,
      serial_number: serial_number.trim(),
      label: label.trim(),
      status: status || 'available',
      notes: notes?.trim() || null,
      purchased_at,
    })
    .select()
    .single();

  if (unitError) {
    if (unitError.code === '23505') {
      // 23505 = unique violation — kann sowohl Seriennummer (per Produkt) als auch
      // Label (global) treffen. Fehler-Detail lesbar zurueckgeben.
      const msg = (unitError.message || '').toLowerCase();
      if (msg.includes('label')) {
        return NextResponse.json(
          { error: 'Diese Bezeichnung ist bereits vergeben. Waehle eine andere.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Seriennummer existiert bereits fuer dieses Produkt.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: unitError.message }, { status: 500 });
  }

  // 2. Asset automatisch anlegen (Wiederbeschaffungswert + Nutzungsdauer)
  // Restwert = 30 % vom Kaufpreis (Floor gegen 0-EUR-Wertverfall, siehe CLAUDE.md)
  const residualValue = Math.round(purchasePriceNum * DEFAULT_RESIDUAL_PERCENT * 100) / 100;
  const isTest = await isTestMode();

  const { error: assetError } = await supabase.from('assets').insert({
    kind: 'rental_camera',
    name: label.trim(),
    serial_number: serial_number.trim(),
    purchase_price: purchasePriceNum,
    purchase_date: purchased_at,
    useful_life_months: DEFAULT_USEFUL_LIFE_MONTHS,
    depreciation_method: 'linear',
    residual_value: residualValue,
    current_value: purchasePriceNum, // Startwert = Kaufpreis, AfA-Cron senkt monatlich
    unit_id: unit.id,
    status: 'active',
    is_test: isTest,
  });

  if (assetError) {
    // Non-fatal: Unit bleibt erhalten, Asset kann manuell nachgetragen werden.
    console.error('[product-units POST] Asset-Anlage fehlgeschlagen:', assetError);
  }

  await logAudit({
    action: 'product_unit.create',
    entityType: 'product_unit',
    entityId: unit.id,
    entityLabel: label.trim(),
    changes: { product_id, label: label.trim(), purchase_price: purchasePriceNum },
    request: req,
  });

  return NextResponse.json({ unit, assetCreated: !assetError }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, status, notes, label } = body as {
    id?: string;
    status?: string;
    notes?: string;
    label?: string;
    // Hinweis: serial_number, purchased_at und purchase_price werden bewusst
    // NICHT mehr akzeptiert (immutable nach Anlage). label darf nachtraeglich
    // geaendert werden (Tippfehler / Migration aus Auto-Codes), aendert aber
    // die QR-URL — der Aufrufer muss die User-Warnung selbst zeigen.
  };

  if (!id) {
    return NextResponse.json({ error: 'id ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes?.trim() || null;
  if (label !== undefined) {
    const trimmed = label.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Bezeichnung darf nicht leer sein.' }, { status: 400 });
    }
    updates.label = trimmed;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'Keine erlaubten Aenderungen. Aenderbar sind nur status, notes und label.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('product_units')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Diese Bezeichnung ist bereits vergeben. Waehle eine andere.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Asset-Name mit der neuen Bezeichnung mitziehen (kosmetisch — der Anlagen-
  // Eintrag zeigt sonst noch den alten Namen).
  if (label !== undefined && data?.id) {
    await supabase.from('assets').update({ name: data.label }).eq('unit_id', data.id);
  }

  await logAudit({
    action: 'product_unit.update',
    entityType: 'product_unit',
    entityId: id,
    entityLabel: data?.label ?? data?.serial_number,
    changes: updates,
    request: req,
  });

  return NextResponse.json({ unit: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id ist erforderlich.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Prufe ob Unit in aktiven Buchungen zugeordnet ist
  const { data: activeBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('unit_id', id)
    .in('status', ['confirmed', 'shipped', 'active'])
    .limit(1);

  if (activeBookings && activeBookings.length > 0) {
    return NextResponse.json(
      { error: 'Diese Kamera ist einer aktiven Buchung zugeordnet und kann nicht geloescht werden.' },
      { status: 409 }
    );
  }

  // Verknuepftes Asset ebenfalls loeschen (Cascade)
  await supabase.from('assets').delete().eq('unit_id', id);

  const { error } = await supabase
    .from('product_units')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    action: 'product_unit.delete',
    entityType: 'product_unit',
    entityId: id,
    request: req,
  });

  return NextResponse.json({ success: true });
}

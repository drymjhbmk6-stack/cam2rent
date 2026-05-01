import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { syncAccessoryQty } from '@/lib/sync-accessory-qty';
import { logAudit } from '@/lib/audit';
import { isTestMode } from '@/lib/env-mode';

/**
 * GET    /api/admin/accessory-units?accessory_id=xxx → Exemplare fuer ein Zubehoer
 * GET    /api/admin/accessory-units                  → Alle Exemplare
 * POST   /api/admin/accessory-units                  → Neues Exemplar + automatisch Asset
 * PUT    /api/admin/accessory-units                  → Nur status + notes aenderbar
 * DELETE /api/admin/accessory-units?id=xxx           → Exemplar loeschen
 *
 * Permission: 'katalog' (siehe middleware.ts).
 *
 * Pflichtfelder bei POST: accessory_id, exemplar_code (Bezeichnung), purchased_at, purchase_price
 * Optionale Felder: serial_number (Hersteller-S/N), notes
 *
 * Nach Anlage sind exemplar_code/serial_number/purchased_at/purchase_price unveraenderlich.
 * Nur status + notes sind via PUT aenderbar (analog product_units).
 */

const VALID_STATUSES = ['available', 'rented', 'maintenance', 'damaged', 'lost', 'retired'] as const;
type AccessoryUnitStatus = (typeof VALID_STATUSES)[number];

const DEFAULT_USEFUL_LIFE_MONTHS = 36;
const DEFAULT_RESIDUAL_PERCENT = 0.3;

function isValidStatus(s: unknown): s is AccessoryUnitStatus {
  return typeof s === 'string' && (VALID_STATUSES as readonly string[]).includes(s);
}

export async function GET(req: NextRequest) {
  const accessoryId = req.nextUrl.searchParams.get('accessory_id');
  const supabase = createServiceClient();

  let query = supabase
    .from('accessory_units')
    .select('*')
    .order('purchased_at', { ascending: true, nullsFirst: false })
    .order('exemplar_code', { ascending: true });

  if (accessoryId) {
    query = query.eq('accessory_id', accessoryId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ units: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    accessory_id,
    exemplar_code,
    serial_number,
    status,
    notes,
    purchased_at,
    purchase_price,
  } = body as {
    accessory_id?: string;
    exemplar_code?: string;
    serial_number?: string;
    status?: string;
    notes?: string;
    purchased_at?: string;
    purchase_price?: number | string;
  };

  // Pflichtfeld-Validierung
  if (!accessory_id || typeof accessory_id !== 'string') {
    return NextResponse.json({ error: 'accessory_id ist erforderlich.' }, { status: 400 });
  }
  if (!exemplar_code || !exemplar_code.trim()) {
    return NextResponse.json({ error: 'Bezeichnung ist erforderlich.' }, { status: 400 });
  }
  if (!purchased_at) {
    return NextResponse.json({ error: 'Kaufdatum ist erforderlich.' }, { status: 400 });
  }
  const priceNum = Number(purchase_price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return NextResponse.json(
      { error: 'Kaufpreis muss eine positive Zahl sein.' },
      { status: 400 }
    );
  }
  if (status !== undefined && !isValidStatus(status)) {
    return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
  }

  const finalCode = exemplar_code.trim();
  const finalSerial = typeof serial_number === 'string' && serial_number.trim()
    ? serial_number.trim()
    : null;

  const supabase = createServiceClient();

  // 1. Unit anlegen
  const { data: unit, error: unitError } = await supabase
    .from('accessory_units')
    .insert({
      accessory_id,
      exemplar_code: finalCode,
      serial_number: finalSerial,
      status: status || 'available',
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      purchased_at,
    })
    .select()
    .single();

  if (unitError) {
    if (unitError.code === '23505') {
      return NextResponse.json(
        { error: `Bezeichnung "${finalCode}" existiert bereits. Waehle eine andere.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: unitError.message }, { status: 500 });
  }

  await syncAccessoryQty(supabase, accessory_id);

  // 2. Asset automatisch anlegen
  const residualValue = Math.round(priceNum * DEFAULT_RESIDUAL_PERCENT * 100) / 100;
  const isTest = await isTestMode();

  const { error: assetError } = await supabase.from('assets').insert({
    kind: 'rental_accessory',
    name: finalCode,
    serial_number: finalSerial,
    purchase_price: priceNum,
    purchase_date: purchased_at,
    useful_life_months: DEFAULT_USEFUL_LIFE_MONTHS,
    depreciation_method: 'linear',
    residual_value: residualValue,
    current_value: priceNum,
    accessory_unit_id: unit.id,
    status: 'active',
    is_test: isTest,
  });

  if (assetError) {
    // Non-fatal: Unit bleibt erhalten, Asset kann manuell nachgetragen werden.
    console.error('[accessory-units POST] Asset-Anlage fehlgeschlagen:', assetError);
  }

  await logAudit({
    action: 'accessory_unit.create',
    entityType: 'accessory_unit',
    entityId: unit?.id,
    entityLabel: finalCode,
    changes: { accessory_id, exemplar_code: finalCode, purchase_price: priceNum },
    request: req,
  });

  return NextResponse.json({ unit, assetCreated: !assetError }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, status, notes, exemplar_code } = body as {
    id?: string;
    status?: string;
    notes?: string;
    exemplar_code?: string;
    // serial_number, purchased_at, purchase_price werden bewusst NICHT mehr
    // akzeptiert (immutable nach Anlage). exemplar_code darf nachtraeglich
    // geaendert werden (Tippfehler / Migration aus Auto-Codes), aendert aber
    // die QR-URL — der Aufrufer muss die User-Warnung selbst zeigen.
  };

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id ist erforderlich.' }, { status: 400 });
  }
  if (status !== undefined && !isValidStatus(status)) {
    return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) {
    updates.notes = typeof notes === 'string' ? notes.trim() || null : null;
  }
  if (exemplar_code !== undefined) {
    const trimmed = typeof exemplar_code === 'string' ? exemplar_code.trim() : '';
    if (!trimmed) {
      return NextResponse.json({ error: 'Bezeichnung darf nicht leer sein.' }, { status: 400 });
    }
    updates.exemplar_code = trimmed;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'Keine erlaubten Aenderungen. Aenderbar sind nur status, notes und exemplar_code.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('accessory_units')
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

  // Bei Status-Aenderung qty resyncen
  if (status !== undefined && data?.accessory_id) {
    await syncAccessoryQty(supabase, data.accessory_id);
  }

  // Asset-Name mit neuer Bezeichnung mitziehen (kosmetisch)
  if (exemplar_code !== undefined && data?.id) {
    await supabase.from('assets').update({ name: data.exemplar_code }).eq('accessory_unit_id', data.id);
  }

  await logAudit({
    action: 'accessory_unit.update',
    entityType: 'accessory_unit',
    entityId: id,
    entityLabel: data?.exemplar_code,
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

  // Vorher accessory_id holen (fuer sync nach Delete)
  const { data: unit } = await supabase
    .from('accessory_units')
    .select('accessory_id')
    .eq('id', id)
    .single();

  // Pruefen ob Exemplar in einer aktiven Buchung steckt
  const { data: activeBookings } = await supabase
    .from('bookings')
    .select('id')
    .contains('accessory_unit_ids', [id])
    .in('status', [
      'confirmed',
      'shipped',
      'picked_up',
      'awaiting_payment',
      'pending_verification',
      'active',
    ])
    .limit(1);

  if (activeBookings && activeBookings.length > 0) {
    return NextResponse.json(
      {
        error:
          'Dieses Exemplar ist einer aktiven Buchung zugeordnet und kann nicht geloescht werden. Setze stattdessen den Status auf "ausgemustert".',
      },
      { status: 409 }
    );
  }

  // Verknuepftes Asset ebenfalls loeschen
  await supabase.from('assets').delete().eq('accessory_unit_id', id);

  const { error } = await supabase.from('accessory_units').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (unit?.accessory_id) {
    await syncAccessoryQty(supabase, unit.accessory_id);
  }

  await logAudit({
    action: 'accessory_unit.delete',
    entityType: 'accessory_unit',
    entityId: id,
    changes: { accessory_id: unit?.accessory_id },
    request: req,
  });

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { syncAccessoryQty } from '@/lib/sync-accessory-qty';
import { logAudit } from '@/lib/audit';

/**
 * GET    /api/admin/accessory-units?accessory_id=xxx → Exemplare fuer ein Zubehoer
 * GET    /api/admin/accessory-units                  → Alle Exemplare
 * POST   /api/admin/accessory-units                  → Neues Exemplar anlegen
 * PUT    /api/admin/accessory-units                  → Exemplar aktualisieren
 * DELETE /api/admin/accessory-units?id=xxx           → Exemplar loeschen
 *
 * Permission: 'katalog' (siehe middleware.ts).
 *
 * Nach jedem POST/PUT (mit Status-Change)/DELETE wird accessories.available_qty
 * automatisch auf COUNT(units WHERE status IN ('available','rented')) gesetzt --
 * damit bestehende Verfuegbarkeitslogik konsistent bleibt, bis Phase 2C den
 * Check direkt auf accessory_units umstellt.
 */

const VALID_STATUSES = ['available', 'rented', 'maintenance', 'damaged', 'lost', 'retired'] as const;
type AccessoryUnitStatus = (typeof VALID_STATUSES)[number];

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
  const { accessory_id, exemplar_code, status, notes, purchased_at } = body;

  if (!accessory_id || typeof accessory_id !== 'string') {
    return NextResponse.json({ error: 'accessory_id ist erforderlich.' }, { status: 400 });
  }

  if (status !== undefined && !isValidStatus(status)) {
    return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Wenn kein Code übergeben: <accessory_id>-<NextNumber> mit höchster bestehender Nummer + 1
  let finalCode = typeof exemplar_code === 'string' ? exemplar_code.trim() : '';
  if (!finalCode) {
    const { data: existing } = await supabase
      .from('accessory_units')
      .select('exemplar_code')
      .eq('accessory_id', accessory_id);

    let next = 1;
    if (existing && existing.length > 0) {
      const numbers = existing
        .map((u) => {
          const match = (u.exemplar_code as string).match(/(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((n) => !isNaN(n));
      next = Math.max(0, ...numbers) + 1;
    }
    finalCode = `${accessory_id}-${String(next).padStart(3, '0')}`;
  }

  const { data, error } = await supabase
    .from('accessory_units')
    .insert({
      accessory_id,
      exemplar_code: finalCode,
      status: status || 'available',
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      purchased_at: purchased_at || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Exemplar-Code "${finalCode}" existiert bereits für dieses Zubehör.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await syncAccessoryQty(supabase, accessory_id);

  await logAudit({
    action: 'accessory_unit.create',
    entityType: 'accessory_unit',
    entityId: data?.id,
    entityLabel: finalCode,
    changes: { accessory_id, status: status || 'available' },
    request: req,
  });

  return NextResponse.json({ unit: data }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const {
    id,
    exemplar_code,
    status,
    notes,
    purchased_at,
    retired_at,
    retirement_reason,
  } = body;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id ist erforderlich.' }, { status: 400 });
  }

  if (status !== undefined && !isValidStatus(status)) {
    return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (typeof exemplar_code === 'string') updates.exemplar_code = exemplar_code.trim();
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = typeof notes === 'string' ? notes.trim() || null : null;
  if (purchased_at !== undefined) updates.purchased_at = purchased_at || null;
  if (retired_at !== undefined) updates.retired_at = retired_at || null;
  if (retirement_reason !== undefined) {
    updates.retirement_reason =
      typeof retirement_reason === 'string' ? retirement_reason.trim() || null : null;
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
        { error: 'Exemplar-Code existiert bereits für dieses Zubehör.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bei Status-Aenderung: qty resyncen
  if (status !== undefined && data?.accessory_id) {
    await syncAccessoryQty(supabase, data.accessory_id);
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

  // Vorher accessory_id holen (für sync nach Delete)
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
          'Dieses Exemplar ist einer aktiven Buchung zugeordnet und kann nicht gelöscht werden. Setze stattdessen den Status auf "ausgemustert".',
      },
      { status: 409 }
    );
  }

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

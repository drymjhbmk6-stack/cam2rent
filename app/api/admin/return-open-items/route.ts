import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { releaseAccessoryUnitsFromBooking } from '@/lib/accessory-unit-assignment';
import { logAudit } from '@/lib/audit';
import { loadOpenItems, OPEN_ITEM_STATUSES, type OpenItemStatus } from '@/lib/return-open-items';

/**
 * Verwaltung der nicht zurückgegebenen Positionen einer Rückgabe.
 *
 * Permission: 'tagesgeschaeft' (siehe API_PATH_PERMISSIONS in middleware.ts).
 *
 * GET  ?status=open|received|charged|waived|all  → Liste inkl. Kunden-/Buchungsdaten
 * POST { id, action: 'received' | 'charged' | 'waived', notes? }
 *      'received' gibt die zurückgehaltenen Exemplare wieder frei.
 */

export const dynamic = 'force-dynamic';

interface BookingLite {
  id: string;
  product_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  rental_from: string | null;
  rental_to: string | null;
  delivery_mode: string | null;
}

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const raw = req.nextUrl.searchParams.get('status') ?? 'open';
  const status: OpenItemStatus | 'all' =
    raw === 'all' || (OPEN_ITEM_STATUSES as string[]).includes(raw)
      ? (raw as OpenItemStatus | 'all')
      : 'open';

  const { rows, migrationPending } = await loadOpenItems(supabase, { status });
  if (migrationPending) {
    return NextResponse.json({ items: [], migration_pending: true });
  }
  if (rows.length === 0) return NextResponse.json({ items: [] });

  // Buchungsdaten gebündelt nachladen (kein N+1).
  const bookingIds = [...new Set(rows.map((r) => r.booking_id))];
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, product_name, customer_name, customer_email, rental_from, rental_to, delivery_mode')
    .in('id', bookingIds);

  const byId = new Map<string, BookingLite>();
  for (const b of (bookings ?? []) as BookingLite[]) byId.set(b.id, b);

  return NextResponse.json({
    items: rows.map((r) => ({ ...r, booking: byId.get(r.booking_id) ?? null })),
  });
}

const VALID_ACTIONS = ['received', 'charged', 'waived'] as const;
type Action = (typeof VALID_ACTIONS)[number];

export async function POST(req: NextRequest) {
  let body: { id?: string; action?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Body.' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  const action = String(body.action ?? '') as Action;
  if (!id) return NextResponse.json({ error: 'id fehlt.' }, { status: 400 });
  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: row, error: fetchErr } = await supabase
    .from('booking_return_open_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) {
    // Fehlende Migration → klarer Hinweis statt 500.
    if (fetchErr.code === '42P01' || fetchErr.code === 'PGRST205') {
      return NextResponse.json(
        { error: 'Migration ausstehend: supabase/supabase-return-open-items.sql ausführen.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Position konnte nicht geladen werden.' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Position nicht gefunden.' }, { status: 404 });

  // Atomarer Flip: nur eine noch offene Position lässt sich abschliessen.
  // Bei Doppelklick gewinnt genau einer, der zweite bekommt 409.
  const { data: updated, error: updateErr } = await supabase
    .from('booking_return_open_items')
    .update({
      status: action,
      resolved_at: new Date().toISOString(),
      ...(typeof body.notes === 'string' && body.notes.trim()
        ? { notes: body.notes.trim().slice(0, 2000) }
        : {}),
    })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'Position ist bereits erledigt.' }, { status: 409 });
  }

  // 'received' = doch noch eingetroffen → die zurückgehaltenen Exemplare
  // wieder freigeben (setzt auch accessories.available_qty nach).
  const unitIds: string[] = Array.isArray(row.accessory_unit_ids)
    ? (row.accessory_unit_ids as string[]).filter(Boolean)
    : [];
  if (action === 'received' && unitIds.length > 0) {
    await releaseAccessoryUnitsFromBooking(row.booking_id as string, unitIds)
      .catch((err) => console.error('[return-open-items] release failed:', err));
  }

  await logAudit({
    action: 'return_open_item.resolve',
    entityType: 'booking',
    entityId: row.booking_id as string,
    changes: {
      open_item_id: id,
      label: row.label,
      qty: row.qty,
      resolution: row.resolution,
      new_status: action,
    },
    request: req,
  });

  return NextResponse.json({ success: true });
}
